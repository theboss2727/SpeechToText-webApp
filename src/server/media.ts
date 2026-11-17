import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Ytdl, CaptionFormat } from '@distube/ytdl-core';
import { Innertube } from 'youtubei.js';
import type { StreamMode, TranscriptSegment } from '../types';
import { transcribeYoutubeUrlWithGemini } from './gemini';

export const MEDIA_DIR = '/tmp/ingage-media';

if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

export interface StoredMediaMeta {
  mediaId: string;
  title: string;
  author?: string;
  youtubeId?: string;
  sourceType: 'youtube' | 'local';
  durationSeconds: number;
  waveformPeaks: number[];
  filePath: string;
  createdAt: string;
}

export interface YoutubeExtractResult {
  streamMode: StreamMode;
  streamNotice?: string;
  meta?: StoredMediaMeta;
  title: string;
  author?: string;
  youtubeId: string;
  durationSeconds: number;
  waveformPeaks: number[];
  captions: TranscriptSegment[];
  captionSource: 'youtube' | 'gemini' | 'none';
}

export function parseYoutubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const vParam = url.searchParams.get('v');
      if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) {
        return vParam;
      }

      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && ['shorts', 'embed', 'live', 'v'].includes(parts[0])) {
        if (/^[a-zA-Z0-9_-]{11}$/.test(parts[1])) {
          return parts[1];
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function getMediaFilePath(mediaId: string): string | null {
  const safeId = mediaId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) return null;
  const mp3Path = path.join(MEDIA_DIR, `${safeId}.mp3`);
  return fs.existsSync(mp3Path) ? mp3Path : null;
}

export function getMediaMeta(mediaId: string): StoredMediaMeta | null {
  const safeId = mediaId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) return null;
  const metaPath = path.join(MEDIA_DIR, `${safeId}.json`);
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as StoredMediaMeta;
  } catch {
    return null;
  }
}

function saveMediaMeta(meta: StoredMediaMeta): void {
  const metaPath = path.join(MEDIA_DIR, `${meta.mediaId}.json`);
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}

export async function probeAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);

    let out = '';
    proc.stdout.on('data', (chunk) => {
      out += chunk.toString();
    });
    proc.on('close', () => {
      const parsed = parseFloat(out.trim());
      resolve(Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : 0);
    });
    proc.on('error', () => resolve(0));
  });
}

export async function computeWaveformPeaks(filePath: string, barCount = 120): Promise<number[]> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', [
      '-v',
      'error',
      '-i',
      filePath,
      '-ac',
      '1',
      '-ar',
      '4000',
      '-f',
      'u8',
      'pipe:1',
    ]);

    const chunks: Buffer[] = [];
    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    proc.on('close', (code) => {
      if (code !== 0 || chunks.length === 0) {
        resolve(Array.from({ length: barCount }, () => 0.25));
        return;
      }

      const pcm = Buffer.concat(chunks);
      if (pcm.length < barCount) {
        resolve(Array.from({ length: barCount }, () => 0.25));
        return;
      }

      const blockSize = Math.floor(pcm.length / barCount);
      const rawPeaks: number[] = [];
      let maxVal = 0.001;

      for (let i = 0; i < barCount; i++) {
        const start = i * blockSize;
        const end = Math.min(pcm.length, start + blockSize);
        let peak = 0;
        const stride = Math.max(1, Math.floor((end - start) / 64));
        for (let j = start; j < end; j += stride) {
          const amp = Math.abs(pcm[j] - 128) / 128;
          if (amp > peak) peak = amp;
        }
        if (peak > maxVal) maxVal = peak;
        rawPeaks.push(peak);
      }

      const normalized = rawPeaks.map((v) =>
        Number(Math.max(0.08, Math.min(1, v / maxVal)).toFixed(3))
      );
      resolve(normalized);
    });
    proc.on('error', () => resolve(Array.from({ length: barCount }, () => 0.25)));
  });
}

async function transcodeStreamToMp3(inputStream: Readable, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-y',
      '-v',
      'error',
      '-i',
      'pipe:0',
      '-vn',
      '-acodec',
      'libmp3lame',
      '-ab',
      '128k',
      '-ar',
      '44100',
      outputPath,
    ]);

    let errLog = '';
    ffmpeg.stderr.on('data', (d) => {
      errLog += d.toString();
    });

    ffmpeg.on('error', (err) => reject(err));
    ffmpeg.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        resolve();
      } else {
        reject(new Error(errLog || `ffmpeg exited with code ${code}`));
      }
    });

    inputStream.on('error', (err) => {
      ffmpeg.kill('SIGKILL');
      reject(err);
    });

    inputStream.pipe(ffmpeg.stdin);
  });
}

export async function transcodeFileToMp3(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-y',
      '-v',
      'error',
      '-i',
      inputPath,
      '-vn',
      '-acodec',
      'libmp3lame',
      '-ab',
      '128k',
      '-ar',
      '44100',
      outputPath,
    ]);

    let errLog = '';
    ffmpeg.stderr.on('data', (d) => {
      errLog += d.toString();
    });

    ffmpeg.on('error', (err) => reject(err));
    ffmpeg.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        resolve();
      } else {
        reject(new Error(errLog || `ffmpeg conversion failed with code ${code}`));
      }
    });
  });
}

export async function prepareAudioForGemini(mediaId: string): Promise<{ base64: string; mimeType: string }> {
  const mp3Path = getMediaFilePath(mediaId);
  if (!mp3Path) {
    throw new Error('File audio non trovato sul server.');
  }

  const geminiPath = path.join(MEDIA_DIR, `${mediaId}.gemini.mp3`);
  if (!fs.existsSync(geminiPath)) {
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-v',
        'error',
        '-i',
        mp3Path,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-ab',
        '32k',
        geminiPath,
      ]);
      let errLog = '';
      ffmpeg.stderr.on('data', (d) => {
        errLog += d.toString();
      });
      ffmpeg.on('close', (code) => {
        if (code === 0 && fs.existsSync(geminiPath)) resolve();
        else reject(new Error(errLog || 'Compressione audio per trascrizione fallita.'));
      });
      ffmpeg.on('error', reject);
    });
  }

  const bytes = fs.readFileSync(geminiPath);
  return {
    base64: bytes.toString('base64'),
    mimeType: 'audio/mp3',
  };
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function parseTimestampSec(raw: string): number {
  const clean = raw.trim().replace(',', '.');
  if (clean.endsWith('s')) {
    return parseFloat(clean.slice(0, -1)) || 0;
  }
  const parts = clean.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parseFloat(clean) || 0;
}

function parseVttCaptions(vttText: string): TranscriptSegment[] {
  const normalized = vttText.replace(/\r\n/g, '\n').replace(/^WEBVTT[\s\S]*?\n\n/, '');
  const blocks = normalized.split(/\n{2,}/);
  const segments: TranscriptSegment[] = [];

  blocks.forEach((block, idx) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const arrowLine = lines.findIndex((l) => l.includes('-->'));
    if (arrowLine === -1) return;

    const [startRaw, endRaw] = lines[arrowLine].split('-->');
    const startSec = Number(parseTimestampSec(startRaw).toFixed(2));
    const endSec = Number(Math.max(startSec + 0.5, parseTimestampSec(endRaw.split(/\s+/)[0])).toFixed(2));
    const text = decodeHtmlEntities(
      lines
        .slice(arrowLine + 1)
        .join(' ')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    );

    if (text) {
      segments.push({
        id: `yt-cap-${idx + 1}`,
        startSec,
        endSec,
        text,
      });
    }
  });

  return segments;
}

function parseTtmlCaptions(ttmlText: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const pRegex = /<(?:p|text)\b([^>]*)>([\s\S]*?)<\/(?:p|text)>/gi;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = pRegex.exec(ttmlText)) !== null) {
    const attrs = match[1];
    const beginMatch = attrs.match(/\b(?:begin|start)="([^"]+)"/i);
    const endMatch = attrs.match(/\bend="([^"]+)"/i);
    const durMatch = attrs.match(/\bdur="([^"]+)"/i);
    if (!beginMatch) continue;

    const startSec = Number(parseTimestampSec(beginMatch[1]).toFixed(2));
    let endSec = startSec + 2.5;
    if (endMatch) {
      endSec = parseTimestampSec(endMatch[1]);
    } else if (durMatch) {
      endSec = startSec + parseTimestampSec(durMatch[1]);
    }
    endSec = Number(Math.max(startSec + 0.5, endSec).toFixed(2));

    const inner = decodeHtmlEntities(
      match[2]
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    );

    if (inner) {
      segments.push({
        id: `yt-ttml-${++idx}`,
        startSec,
        endSec,
        text: inner,
      });
    }
  }

  return segments;
}

async function fetchPipedAndOembedFallback(
  videoId: string,
  preferredLang: string
): Promise<{
  oembedFound: boolean;
  title: string;
  author: string;
  durationSeconds: number;
  captions: TranscriptSegment[];
}> {
  let oembedFound = false;
  let title = `Video YouTube (${videoId})`;
  let author = 'YouTube';
  let durationSeconds = 0;
  let captions: TranscriptSegment[] = [];

  const oembedPromise = fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`
    )}&format=json`,
    { signal: AbortSignal.timeout(3500) }
  )
    .then(async (r) => (r.ok ? ((await r.json()) as { title?: string; author_name?: string }) : null))
    .catch(() => null);

  const pipedInstances = [
    'https://api.piped.private.coffee',
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.adminforge.de',
  ];

  const pipedPromise = Promise.any(
    pipedInstances.map(async (host) => {
      const resp = await fetch(`${host}/streams/${videoId}`, {
        signal: AbortSignal.timeout(3500),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as {
        title?: string;
        uploader?: string;
        duration?: number;
        subtitles?: Array<{
          url: string;
          mimeType?: string;
          code?: string;
          autoGenerated?: boolean;
        }>;
      };
      if (!data.title && (!data.subtitles || data.subtitles.length === 0)) {
        throw new Error('Empty Piped payload');
      }
      return data;
    })
  ).catch(() => null);

  const [oembed, piped] = await Promise.all([oembedPromise, pipedPromise]);

  if (oembed) {
    oembedFound = true;
    if (oembed.title) title = oembed.title;
    if (oembed.author_name) author = oembed.author_name;
  }

  if (piped) {
    if (piped.title) {
      title = piped.title;
      oembedFound = true;
    }
    if (piped.uploader) author = piped.uploader;
    if (typeof piped.duration === 'number' && piped.duration > 0) {
      durationSeconds = piped.duration;
    }

    if (Array.isArray(piped.subtitles) && piped.subtitles.length > 0) {
      const track =
        piped.subtitles.find((s) => s.code?.startsWith(preferredLang) && !s.autoGenerated) ||
        piped.subtitles.find((s) => s.code?.startsWith(preferredLang)) ||
        piped.subtitles.find((s) => !s.autoGenerated) ||
        piped.subtitles[0];

      if (track?.url) {
        try {
          const subResp = await fetch(track.url, { signal: AbortSignal.timeout(3500) });
          if (subResp.ok) {
            const subText = await subResp.text();
            if (
              subText.includes('<tt') ||
              subText.includes('<transcript') ||
              track.mimeType?.includes('ttml')
            ) {
              captions = parseTtmlCaptions(subText);
            } else {
              captions = parseVttCaptions(subText);
            }
          }
        } catch {
          // Optional subtitles
        }
      }
    }
  }

  return { oembedFound, title, author, durationSeconds, captions };
}

export async function extractYoutubeAudio(
  urlOrId: string,
  preferredLang = 'it',
  youtubeCookie?: string
): Promise<YoutubeExtractResult> {
  const videoId = parseYoutubeVideoId(urlOrId);
  if (!videoId) {
    throw new Error(
      'URL YouTube non valido. Inserisci un link completo (es. https://www.youtube.com/watch?v=...)'
    );
  }

  const mediaId = `yt_${videoId}_${crypto.randomBytes(4).toString('hex')}`;
  const outputPath = path.join(MEDIA_DIR, `${mediaId}.mp3`);

  let title = `Video YouTube (${videoId})`;
  let author = 'YouTube';
  let captions: TranscriptSegment[] = [];
  let hitBotBlock = false;

  const ytdlClient = new Ytdl({
    timeoutMs: 5000,
    ...(youtubeCookie?.trim()
      ? { cookie: youtubeCookie.trim() }
      : { clients: ['tv', 'web_embedded'] as const }),
  });

  // Strategy 1: @distube/ytdl-core direct audio extraction
  try {
    const info = await ytdlClient.getInfo(videoId, {
      signal: AbortSignal.timeout(5500),
    });
    title = info.videoDetails.title || title;
    author = info.videoDetails.author?.name || author;

    const tracks = info.captionTracks ?? [];
    if (tracks.length > 0) {
      const preferredTrack =
        tracks.find((t) => t.languageCode.startsWith(preferredLang) && !t.isAutoGenerated) ||
        tracks.find((t) => t.languageCode.startsWith(preferredLang)) ||
        tracks.find((t) => !t.isAutoGenerated) ||
        tracks[0];

      if (preferredTrack) {
        try {
          const vtt = await ytdlClient.getCaptions(info, {
            lang: preferredTrack.languageCode,
            format: CaptionFormat.Vtt,
          });
          captions = parseVttCaptions(vtt);
        } catch {
          // Optional captions
        }
      }
    }

    const audioStream = ytdlClient.download(info, {
      filter: [{ hasAudio: true, hasVideo: false }, { hasAudio: true }],
      quality: 'highestaudio',
    });

    await transcodeStreamToMp3(audioStream, outputPath);

    const durationSeconds = await probeAudioDuration(outputPath);
    const waveformPeaks = await computeWaveformPeaks(outputPath, 120);

    const meta: StoredMediaMeta = {
      mediaId,
      title,
      author,
      youtubeId: videoId,
      sourceType: 'youtube',
      durationSeconds,
      waveformPeaks,
      filePath: outputPath,
      createdAt: new Date().toISOString(),
    };
    saveMediaMeta(meta);

    return {
      streamMode: 'mp3',
      meta,
      title,
      author,
      youtubeId: videoId,
      durationSeconds,
      waveformPeaks,
      captions,
      captionSource: captions.length > 0 ? 'youtube' : 'none',
    };
  } catch (err) {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('bot') || msg.includes('login') || msg.includes('LOGIN_REQUIRED')) {
      hitBotBlock = true;
    }
  }

  // Strategy 2: youtubei.js Innertube fallback (skip if YouTube already flagged IP bot-block)
  if (!hitBotBlock) {
    try {
      const yt = await Innertube.create({ retrieve_player: true });
      const info = await yt.getInfo(videoId);
      title = info.basic_info.title || title;
      author = info.basic_info.author || author;

      if (captions.length === 0) {
        try {
          const transcriptData = await info.getTranscript();
          const segs = transcriptData?.transcript?.content?.body?.initial_segments;
          if (Array.isArray(segs)) {
            captions = segs
              .map((seg, idx): TranscriptSegment | null => {
                const startMs = Number(seg.start_ms ?? 0);
                const endMs = Number(seg.end_ms ?? startMs + 2000);
                const text = seg.snippet?.toString().trim() ?? '';
                if (!text) return null;
                return {
                  id: `yt-it-${idx + 1}`,
                  startSec: Number((startMs / 1000).toFixed(2)),
                  endSec: Number((endMs / 1000).toFixed(2)),
                  text,
                };
              })
              .filter((s): s is TranscriptSegment => s !== null);
          }
        } catch {
          // Optional captions
        }
      }

      const webStream = await info.download({
        type: 'audio',
        quality: 'best',
        format: 'any',
      });

      const nodeStream = Readable.fromWeb(
        webStream as unknown as import('node:stream/web').ReadableStream
      );
      await transcodeStreamToMp3(nodeStream, outputPath);

      const durationSeconds = await probeAudioDuration(outputPath);
      const waveformPeaks = await computeWaveformPeaks(outputPath, 120);

      const meta: StoredMediaMeta = {
        mediaId,
        title,
        author,
        youtubeId: videoId,
        sourceType: 'youtube',
        durationSeconds,
        waveformPeaks,
        filePath: outputPath,
        createdAt: new Date().toISOString(),
      };
      saveMediaMeta(meta);

      return {
        streamMode: 'mp3',
        meta,
        title,
        author,
        youtubeId: videoId,
        durationSeconds,
        waveformPeaks,
        captions,
        captionSource: captions.length > 0 ? 'youtube' : 'none',
      };
    } catch {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }
  }

  // Strategy 3: Cloud-IP resilient YouTube Stream + Captions/Gemini Transcription
  const fallback = await fetchPipedAndOembedFallback(videoId, preferredLang);
  if (!fallback.oembedFound && fallback.captions.length === 0) {
    throw new Error(
      'Video YouTube non trovato o privato. Verifica il link e assicurati che il video sia pubblico.'
    );
  }

  title = fallback.title;
  author = fallback.author;
  let durationSeconds = fallback.durationSeconds;
  captions = fallback.captions;
  let captionSource: 'youtube' | 'gemini' | 'none' = captions.length > 0 ? 'youtube' : 'none';
  let extraNotice = '';

  if (captions.length === 0) {
    try {
      const gemResult = await transcribeYoutubeUrlWithGemini({
        youtubeId: videoId,
        durationSeconds,
        languageHint: preferredLang === 'auto' ? undefined : preferredLang,
      });
      captions = gemResult.segments;
      captionSource = 'gemini';
      if (durationSeconds === 0 && captions.length > 0) {
        durationSeconds = Math.ceil(captions[captions.length - 1].endSec);
      }
    } catch {
      extraNotice =
        ' La trascrizione automatica iniziale non è ancora pronta (picco di traffico): premi "Rigenera Riferimento AI" nei Segmenti Audio oppure carica un file .SRT/.TXT.';
    }
  }

  return {
    streamMode: 'youtube_iframe',
    streamNotice:
      'YouTube ha limitato il download diretto MP3 dal server cloud. Lo stream YouTube è collegato direttamente al player del tuo browser; puoi usare "Cattura Audio in MP3" per salvare il file audio.' +
      extraNotice,
    title,
    author,
    youtubeId: videoId,
    durationSeconds,
    waveformPeaks: [],
    captions,
    captionSource,
  };
}

export async function processUploadedAudio(
  tempFilePath: string,
  originalFilename: string
): Promise<StoredMediaMeta> {
  const mediaId = `loc_${crypto.randomBytes(6).toString('hex')}`;
  const outputPath = path.join(MEDIA_DIR, `${mediaId}.mp3`);

  try {
    const ext = path.extname(originalFilename).toLowerCase();
    if (ext === '.mp3') {
      await pipeline(fs.createReadStream(tempFilePath), fs.createWriteStream(outputPath));
    } else {
      await transcodeFileToMp3(tempFilePath, outputPath);
    }

    const durationSeconds = await probeAudioDuration(outputPath);
    const waveformPeaks = await computeWaveformPeaks(outputPath, 120);
    const cleanTitle = path.basename(originalFilename, path.extname(originalFilename)) || 'Audio Locale';

    const meta: StoredMediaMeta = {
      mediaId,
      title: cleanTitle,
      sourceType: 'local',
      durationSeconds,
      waveformPeaks,
      filePath: outputPath,
      createdAt: new Date().toISOString(),
    };

    saveMediaMeta(meta);
    return meta;
  } finally {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}
