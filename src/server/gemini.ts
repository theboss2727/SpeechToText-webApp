import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { TranscriptSegment } from '../types';
import { prepareAudioForGemini } from './media';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY non configurata sul server. Verifica il pannello Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetryAndModelFallback<T>(
  fn: (modelName: string) => Promise<T>,
  models: string[]
): Promise<T> {
  let lastError: unknown;
  for (const model of models) {
    try {
      return await fn(model);
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('high demand') ||
        msg.includes('429');
      if (!isTransient) {
        throw err;
      }
      await sleep(500);
    }
  }
  throw lastError;
}

function deterministicSegmentFallback(fullText: string, durationSeconds: number): TranscriptSegment[] {
  const sentences = fullText
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const totalWords = Math.max(1, fullText.split(/\s+/).filter(Boolean).length);
  const safeDuration = Math.max(sentences.length * 2, durationSeconds || sentences.length * 3.5);

  let cursor = 0;
  return sentences.map((sentence, idx) => {
    const words = Math.max(1, sentence.split(/\s+/).filter(Boolean).length);
    const sliceDur = (words / totalWords) * safeDuration;
    const startSec = Number(cursor.toFixed(2));
    cursor += sliceDur;
    const endSec = Number(Math.min(safeDuration, cursor).toFixed(2));
    return {
      id: `seg-${idx + 1}`,
      startSec,
      endSec: Math.max(startSec + 0.5, endSec),
      text: sentence,
    };
  });
}

export async function transcribeAndSegmentAudio(params: {
  mediaId: string;
  durationSeconds: number;
  languageHint?: string;
}): Promise<{
  fullText: string;
  segments: TranscriptSegment[];
}> {
  const { mediaId, durationSeconds, languageHint } = params;
  const ai = getAiClient();
  const audioData = await prepareAudioForGemini(mediaId);

  const audioPart = {
    inlineData: {
      mimeType: audioData.mimeType,
      data: audioData.base64,
    },
  };

  // Step 1: Verbatim audio transcription with gemini-3.5-transcribe (fallback to gemini-4-hydrogen / gemini-3.1-flash-lite if 503)
  const transcribePrompt = languageHint
    ? `Transcribe this audio verbatim with accurate punctuation and capitalization. Primary language hint: ${languageHint}. Return only the spoken transcript.`
    : 'Transcribe this audio verbatim with accurate punctuation and capitalization in its original spoken language. Return only the spoken transcript.';

  const transcribeResp = await withRetryAndModelFallback(
    (model) =>
      ai.models.generateContent({
        model,
        contents: {
          parts: [audioPart, { text: transcribePrompt }],
        },
      }),
    ['gemini-3.5-transcribe', 'gemini-4-hydrogen', 'gemini-3.1-flash-lite']
  );

  const fullText = (transcribeResp.text ?? '').trim();
  if (!fullText) {
    throw new Error('La trascrizione audio non ha restituito testo parlato.');
  }

  // Step 2: Align verbatim transcript into timed SRT subtitle cues
  try {
    const alignResp = await withRetryAndModelFallback(
      (model) =>
        ai.models.generateContent({
          model,
          contents: {
            parts: [
              audioPart,
              {
                text:
                  `Total audio duration is ${durationSeconds.toFixed(2)} seconds.\n` +
                  `Verbatim transcript:\n"""\n${fullText}\n"""\n\n` +
                  `Split this exact transcript into natural spoken subtitle cues (roughly 5–14 words per cue) with accurate startSec and endSec timestamps matching the audio. Do not alter or omit words from the verbatim transcript.`,
              },
            ],
          },
          config: {
            ...(model === 'gemini-4-hydrogen'
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  startSec: {
                    type: Type.NUMBER,
                    description: 'Start timestamp of this subtitle cue in seconds.',
                  },
                  endSec: {
                    type: Type.NUMBER,
                    description: 'End timestamp of this subtitle cue in seconds.',
                  },
                  text: {
                    type: Type.STRING,
                    description: 'Exact spoken text for this cue.',
                  },
                },
                required: ['startSec', 'endSec', 'text'],
              },
            },
          },
        }),
      ['gemini-4-hydrogen', 'gemini-3.1-flash-lite']
    );

    const parsed = JSON.parse((alignResp.text ?? '[]').trim()) as Array<{
      startSec: number;
      endSec: number;
      text: string;
    }>;

    if (Array.isArray(parsed) && parsed.length > 0) {
      const segments: TranscriptSegment[] = parsed
        .filter((item) => item && typeof item.text === 'string' && item.text.trim().length > 0)
        .map((item, idx) => {
          const start = Math.max(0, Number(item.startSec) || 0);
          const end = Math.max(
            start + 0.5,
            Math.min(durationSeconds || start + 6, Number(item.endSec) || start + 3)
          );
          return {
            id: `gem-seg-${idx + 1}`,
            startSec: Number(start.toFixed(2)),
            endSec: Number(end.toFixed(2)),
            text: item.text.trim(),
          };
        });

      if (segments.length > 0) {
        return { fullText, segments };
      }
    }
  } catch (alignErr) {
    console.warn('Allineamento temporale AI non riuscito, applico segmentazione proporzionale:', alignErr);
  }

  return { fullText, segments: deterministicSegmentFallback(fullText, durationSeconds) };
}

export async function transcribeYoutubeUrlWithGemini(params: {
  youtubeId: string;
  durationSeconds?: number;
  languageHint?: string;
}): Promise<{
  fullText: string;
  segments: TranscriptSegment[];
}> {
  const { youtubeId, durationSeconds = 60, languageHint } = params;
  const ai = getAiClient();
  const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeId}`;

  const langNote = languageHint ? ` Primary spoken language hint: ${languageHint}.` : '';
  const response = await withRetryAndModelFallback(
    (model) =>
      ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              {
                fileData: {
                  fileUri: youtubeUrl,
                },
              },
              {
                text:
                  `Listen carefully to all spoken dialogue/narration in this YouTube video and produce a verbatim transcript split into accurate timed subtitle cues (roughly 5–14 words per cue).` +
                  `${langNote} Return JSON array with startSec, endSec, and verbatim text.`,
              },
            ],
          },
        ],
        config: {
          ...(model === 'gemini-4-hydrogen'
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : {}),
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                startSec: {
                  type: Type.NUMBER,
                  description: 'Start timestamp in seconds.',
                },
                endSec: {
                  type: Type.NUMBER,
                  description: 'End timestamp in seconds.',
                },
                text: {
                  type: Type.STRING,
                  description: 'Verbatim spoken text in this segment.',
                },
              },
              required: ['startSec', 'endSec', 'text'],
            },
          },
        },
      }),
    ['gemini-4-hydrogen', 'gemini-3.1-flash-lite']
  );

  const parsed = JSON.parse((response.text ?? '[]').trim()) as Array<{
    startSec: number;
    endSec: number;
    text: string;
  }>;

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Impossibile trascrivere questo video YouTube automaticamente.');
  }

  const segments: TranscriptSegment[] = parsed
    .filter((item) => item && typeof item.text === 'string' && item.text.trim().length > 0)
    .map((item, idx) => {
      const start = Math.max(0, Number(item.startSec) || 0);
      const end = Math.max(
        start + 0.5,
        durationSeconds > 0
          ? Math.min(durationSeconds, Number(item.endSec) || start + 3)
          : Number(item.endSec) || start + 3
      );
      return {
        id: `yt-gem-${idx + 1}`,
        startSec: Number(start.toFixed(2)),
        endSec: Number(end.toFixed(2)),
        text: item.text.trim(),
      };
    });

  const fullText = segments.map((s) => s.text).join(' ').trim();
  if (!fullText) {
    throw new Error('Nessun parlato rilevato nel video YouTube.');
  }

  return { fullText, segments };
}
