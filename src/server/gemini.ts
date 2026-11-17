import { GoogleGenAI, Type } from '@google/genai';
import type { TranscriptSegment } from '../types';
import { prepareAudioForGemini } from './media';

export const DEFAULT_AI_MODEL = 'gemini-2.5-flash';

export function resolveModelFallbackList(preferredModel?: string): string[] {
  const primary = preferredModel?.trim() || DEFAULT_AI_MODEL;
  const list: string[] = [primary];

  if (primary.includes('pro')) {
    const proFallbacks = ['gemini-2.5-pro', 'gemini-1.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'];
    for (const m of proFallbacks) {
      if (!list.includes(m)) list.push(m);
    }
  } else {
    const flashFallbacks = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
    for (const m of flashFallbacks) {
      if (!list.includes(m)) list.push(m);
    }
  }

  return list;
}

function getAiClient(customApiKey?: string): GoogleGenAI {
  const apiKey = customApiKey?.trim() || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Nessuna GEMINI_API_KEY trovata. Configura GEMINI_API_KEY nel file .env.local oppure inserisci la tua chiave API personale di Google AI Studio nelle Impostazioni AI.'
    );
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
        msg.includes('429') ||
        msg.includes('not found') ||
        msg.includes('ResourceExhausted');
      if (!isTransient) {
        // If it's a specific auth failure, don't keep trying fallback models endlessly
        if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
          throw new Error('Chiave Gemini API non valida. Controlla la chiave inserita nelle impostazioni.');
        }
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
  model?: string;
  apiKey?: string;
}): Promise<{
  fullText: string;
  segments: TranscriptSegment[];
}> {
  const { mediaId, durationSeconds, languageHint, model, apiKey } = params;
  const ai = getAiClient(apiKey);
  const models = resolveModelFallbackList(model);
  const audioData = await prepareAudioForGemini(mediaId);

  const audioPart = {
    inlineData: {
      mimeType: audioData.mimeType,
      data: audioData.base64,
    },
  };

  // Step 1: Verbatim audio transcription
  const transcribePrompt = languageHint
    ? `Transcribe this audio verbatim with accurate punctuation and capitalization. Primary language hint: ${languageHint}. Return only the spoken transcript.`
    : 'Transcribe this audio verbatim with accurate punctuation and capitalization in its original spoken language. Return only the spoken transcript.';

  const transcribeResp = await withRetryAndModelFallback(
    (modelName) =>
      ai.models.generateContent({
        model: modelName,
        contents: {
          parts: [audioPart, { text: transcribePrompt }],
        },
      }),
    models
  );

  const fullText = (transcribeResp.text ?? '').trim();
  if (!fullText) {
    throw new Error('La trascrizione audio non ha restituito testo parlato.');
  }

  // Step 2: Align verbatim transcript into timed SRT subtitle cues
  try {
    const alignResp = await withRetryAndModelFallback(
      (modelName) =>
        ai.models.generateContent({
          model: modelName,
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
      models
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
  model?: string;
  apiKey?: string;
}): Promise<{
  fullText: string;
  segments: TranscriptSegment[];
}> {
  const { youtubeId, durationSeconds = 60, languageHint, model, apiKey } = params;
  const ai = getAiClient(apiKey);
  const models = resolveModelFallbackList(model);
  const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeId}`;

  const langNote = languageHint ? ` Primary spoken language hint: ${languageHint}.` : '';
  const response = await withRetryAndModelFallback(
    (modelName) =>
      ai.models.generateContent({
        model: modelName,
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
    models
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
