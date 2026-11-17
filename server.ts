import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import {
  MEDIA_DIR,
  extractYoutubeAudio,
  getMediaFilePath,
  getMediaMeta,
  processUploadedAudio,
} from './src/server/media';
import {
  transcribeAndSegmentAudio,
  transcribeYoutubeUrlWithGemini,
} from './src/server/gemini';

const PORT = Number(process.env.PORT) || 3000;
const UPLOAD_TMP_DIR = path.join(os.tmpdir(), 'ingage-uploads');

if (!fs.existsSync(UPLOAD_TMP_DIR)) {
  fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true });
}

const upload = multer({
  dest: UPLOAD_TMP_DIR,
  limits: {
    fileSize: 120 * 1024 * 1024, // 120 MB max upload
  },
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Extract audio or stream + timed transcript directly from a YouTube URL
  app.post('/api/youtube/extract', async (req, res) => {
    try {
      const { url, language, cookie, model, apiKey } = req.body as {
        url?: string;
        language?: string;
        cookie?: string;
        model?: string;
        apiKey?: string;
      };
      if (!url || typeof url !== 'string') {
        res.status(400).json({ error: 'Inserisci un URL YouTube valido.' });
        return;
      }

      const effectiveApiKey =
        apiKey || (req.headers['x-gemini-api-key'] as string | undefined);

      const result = await extractYoutubeAudio(url, language || 'it', cookie, {
        model,
        apiKey: effectiveApiKey,
      });

      if (result.streamMode === 'mp3' && result.meta) {
        res.json({
          mediaId: result.meta.mediaId,
          title: result.title,
          author: result.author,
          youtubeId: result.youtubeId,
          sourceType: 'youtube',
          streamMode: 'mp3',
          durationSeconds: result.durationSeconds,
          audioUrl: `/api/media/${result.meta.mediaId}`,
          downloadUrl: `/api/media/${result.meta.mediaId}?download=1`,
          waveformPeaks: result.waveformPeaks,
          captions: result.captions,
          captionSource: result.captionSource,
        });
        return;
      }

      res.json({
        title: result.title,
        author: result.author,
        youtubeId: result.youtubeId,
        sourceType: 'youtube',
        streamMode: 'youtube_iframe',
        streamNotice: result.streamNotice,
        durationSeconds: result.durationSeconds,
        waveformPeaks: result.waveformPeaks,
        captions: result.captions,
        captionSource: result.captionSource,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Errore durante estrazione audio da YouTube.';
      res.status(422).json({ error: message });
    }
  });

  // Upload local audio/video (or captured stream audio) and extract normalized MP3
  app.post('/api/upload/audio', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'Nessun file audio o video ricevuto.' });
        return;
      }

      const meta = await processUploadedAudio(req.file.path, req.file.originalname);

      res.json({
        mediaId: meta.mediaId,
        title: meta.title,
        sourceType: meta.sourceType,
        streamMode: 'mp3',
        durationSeconds: meta.durationSeconds,
        audioUrl: `/api/media/${meta.mediaId}`,
        downloadUrl: `/api/media/${meta.mediaId}?download=1`,
        waveformPeaks: meta.waveformPeaks,
        captions: [],
        captionSource: 'none',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Errore elaborazione file locale.';
      res.status(422).json({ error: message });
    }
  });

  // Serve or download extracted MP3 audio with Range support
  app.get('/api/media/:mediaId', (req, res) => {
    const { mediaId } = req.params;
    const filePath = getMediaFilePath(mediaId);
    if (!filePath) {
      res.status(404).json({ error: 'Audio non trovato o scaduto. Ricarica o ri-estrai il file.' });
      return;
    }

    const meta = getMediaMeta(mediaId);
    if (req.query.download === '1') {
      const safeFilename =
        (meta?.title || 'ingage_audio')
          .replace(/[^\p{L}\p{N}\s_-]/gu, '')
          .trim()
          .replace(/\s+/g, '_') || 'ingage_audio';
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.mp3"`);
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.sendFile(path.resolve(filePath));
  });

  // Transcribe extracted/uploaded audio file OR direct YouTube URL with Gemini
  app.post('/api/transcribe', async (req, res) => {
    try {
      const { mediaId, youtubeId, durationSeconds, language, model, apiKey } = req.body as {
        mediaId?: string;
        youtubeId?: string;
        durationSeconds?: number;
        language?: string;
        model?: string;
        apiKey?: string;
      };

      const effectiveApiKey =
        apiKey || (req.headers['x-gemini-api-key'] as string | undefined);

      if (mediaId) {
        const meta = getMediaMeta(mediaId);
        const effectiveDuration = durationSeconds || meta?.durationSeconds || 30;
        const result = await transcribeAndSegmentAudio({
          mediaId,
          durationSeconds: effectiveDuration,
          languageHint: language,
          model,
          apiKey: effectiveApiKey,
        });
        res.json(result);
        return;
      }

      if (youtubeId) {
        const result = await transcribeYoutubeUrlWithGemini({
          youtubeId,
          durationSeconds,
          languageHint: language,
          model,
          apiKey: effectiveApiKey,
        });
        res.json(result);
        return;
      }

      res.status(400).json({ error: 'mediaId o youtubeId mancante per la trascrizione.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Errore durante la trascrizione AI.';
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  setInterval(() => {
    try {
      const now = Date.now();
      for (const file of fs.readdirSync(MEDIA_DIR)) {
        const full = path.join(MEDIA_DIR, file);
        const stat = fs.statSync(full);
        if (now - stat.mtimeMs > 12 * 3600 * 1000) {
          fs.unlinkSync(full);
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }, 60 * 60 * 1000);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ingage server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ingage server:', err);
  process.exit(1);
});
