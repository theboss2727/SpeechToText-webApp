import React, { useRef, useState } from 'react';
import { FileAudio, Link2, Loader2, Upload } from 'lucide-react';
import {
  ExtractMediaResponse,
  TranscribeMediaResponse,
  TranscriptSegment,
} from '../types';
import { parseSubtitleFile } from '../utils/srt';

interface SourceIntakePanelProps {
  onMediaReady: (payload: {
    media: ExtractMediaResponse;
    segments: TranscriptSegment[];
    language: string;
  }) => void;
}

const LANGUAGES = [
  { code: 'it', label: 'Italiano' },
  { code: 'en', label: 'Inglese' },
  { code: 'es', label: 'Spagnolo' },
  { code: 'fr', label: 'Francese' },
  { code: 'de', label: 'Tedesco' },
  { code: 'auto', label: 'Rilevamento Automatico' },
];

export const SourceIntakePanel: React.FC<SourceIntakePanelProps> = ({ onMediaReady }) => {
  const [sourceTab, setSourceTab] = useState<'youtube' | 'local'>('youtube');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeCookie, setYoutubeCookie] = useState('');
  const [showAdvancedCookie, setShowAdvancedCookie] = useState(false);
  const [language, setLanguage] = useState('it');
  const [isLoading, setIsLoading] = useState(false);
  const [statusStep, setStatusStep] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [customSrtSegments, setCustomSrtSegments] = useState<TranscriptSegment[] | null>(null);
  const [customSrtName, setCustomSrtName] = useState<string | null>(null);

  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const srtInputRef = useRef<HTMLInputElement | null>(null);

  const runAiTranscription = async (
    media: ExtractMediaResponse,
    lang: string
  ): Promise<TranscriptSegment[]> => {
    setStatusStep('Trascrizione audio ad alta precisione e allineamento temporale...');
    const resp = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mediaId: media.mediaId,
        youtubeId: media.youtubeId,
        durationSeconds: media.durationSeconds,
        language: lang === 'auto' ? undefined : lang,
      }),
    });

    const data = (await resp.json()) as TranscribeMediaResponse & { error?: string };
    if (!resp.ok) {
      throw new Error(data.error || 'Errore nella trascrizione audio.');
    }
    return data.segments;
  };

  const handleYoutubeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeUrl.trim() || isLoading) return;

    setErrorMsg(null);
    setIsLoading(true);
    setStatusStep('Estrazione audio / stream dal link YouTube e preparazione riferimento...');

    try {
      const resp = await fetch('/api/youtube/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: youtubeUrl.trim(),
          language,
          cookie: youtubeCookie.trim() || undefined,
        }),
      });

      const data = (await resp.json()) as ExtractMediaResponse & { error?: string };
      if (!resp.ok) {
        throw new Error(data.error || 'Impossibile estrarre l’audio da questo link YouTube.');
      }

      let segments: TranscriptSegment[] = data.captions ?? [];
      if (customSrtSegments && customSrtSegments.length > 0) {
        segments = customSrtSegments;
      } else if (segments.length === 0 && data.streamMode === 'mp3') {
        segments = await runAiTranscription(data, language);
      }

      onMediaReady({ media: data, segments, language });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Errore imprevisto.');
    } finally {
      setIsLoading(false);
      setStatusStep('');
    }
  };

  const handleLocalFile = async (file: File) => {
    if (isLoading) return;
    setErrorMsg(null);
    setIsLoading(true);
    setStatusStep(`Caricamento ed estrazione traccia audio da "${file.name}"...`);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const resp = await fetch('/api/upload/audio', {
        method: 'POST',
        body: formData,
      });

      const data = (await resp.json()) as ExtractMediaResponse & { error?: string };
      if (!resp.ok) {
        throw new Error(data.error || 'Errore durante la lettura del file locale.');
      }

      let segments: TranscriptSegment[] = [];
      if (customSrtSegments && customSrtSegments.length > 0) {
        segments = customSrtSegments;
      } else {
        segments = await runAiTranscription(data, language);
      }

      onMediaReady({ media: data, segments, language });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Errore caricamento file locale.');
    } finally {
      setIsLoading(false);
      setStatusStep('');
    }
  };

  const handleSrtReferenceUpload = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseSubtitleFile(text);
      if (parsed.length === 0) {
        setErrorMsg('Il file sottotitoli selezionato non contiene segmenti validi.');
        return;
      }
      setCustomSrtSegments(parsed);
      setCustomSrtName(file.name);
      setErrorMsg(null);
    } catch {
      setErrorMsg('Impossibile leggere il file di riferimento SRT/VTT.');
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="text-balance text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-100">
          Nuova Sessione di Ascolto e Trascrizione
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          Estrai direttamente la traccia audio MP3 da un video YouTube oppure carica un file locale.
          Trascrivi ascoltando lo stream e verifica in tempo reale ogni discrepanza.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        {/* Source Selector & Language */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => {
                setSourceTab('youtube');
                setErrorMsg(null);
              }}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                sourceTab === 'youtube'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Link YouTube</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSourceTab('local');
                setErrorMsg(null);
              }}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                sourceTab === 'local'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Carica File Locale</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <label
              htmlFor="ingage-lang-select"
              className="text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              Lingua audio:
            </label>
            <select
              id="ingage-lang-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={isLoading}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* YouTube URL Form */}
        {sourceTab === 'youtube' ? (
          <form onSubmit={handleYoutubeSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="youtube-url-input"
                className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                URL Video YouTube
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  id="youtube-url-input"
                  type="url"
                  required
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  disabled={isLoading}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="h-11 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-900"
                />
                <button
                  type="submit"
                  disabled={isLoading || !youtubeUrl.trim()}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0 dark:bg-blue-500 dark:hover:bg-blue-600"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      <span>Estrazione in corso...</span>
                    </>
                  ) : (
                    <span>Estrai Audio e Avvia</span>
                  )}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  Supporta link standard, youtu.be, Shorts e Live con estrazione MP3 o stream
                  diretto sincronizzato.
                </span>
                <button
                  type="button"
                  onClick={() => setShowAdvancedCookie(!showAdvancedCookie)}
                  className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  {showAdvancedCookie ? 'Nascondi opzioni cookie' : 'Cookie YouTube (opzionale)'}
                </button>
              </div>

              {showAdvancedCookie && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60">
                  <label
                    htmlFor="yt-cookie-input"
                    className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Header Cookie YouTube (opzionale per forzare il download MP3 diretto su IP cloud)
                  </label>
                  <input
                    id="yt-cookie-input"
                    type="password"
                    value={youtubeCookie}
                    onChange={(e) => setYoutubeCookie(e.target.value)}
                    placeholder="Incolla cookie YouTube (es. SID=...; HSID=...)"
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              )}
            </div>
          </form>
        ) : (
          /* Local File Upload Dropzone */
          <div>
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*,video/*,.mp3,.wav,.m4a,.ogg,.webm,.mp4,.mov,.mkv,.flac"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleLocalFile(file);
              }}
            />

            <div
              role="button"
              tabIndex={0}
              onClick={() => !isLoading && audioInputRef.current?.click()}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !isLoading) {
                  e.preventDefault();
                  audioInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleLocalFile(file);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
                isDragging
                  ? 'border-blue-500 bg-blue-50/70 dark:border-blue-400 dark:bg-blue-950/30'
                  : 'border-slate-300 bg-slate-50/60 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950/40 dark:hover:border-slate-600'
              }`}
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                {isLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <FileAudio className="h-6 w-6" />
                )}
              </div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Trascina qui un file audio o video, oppure clicca per selezionarlo
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Formati supportati: MP3, WAV, M4A, OGG, FLAC, WebM, MP4, MOV (max 120 MB)
              </p>
            </div>
          </div>
        )}

        {/* Optional reference SRT/VTT/TXT override */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="text-xs text-slate-600 dark:text-slate-400">
            {customSrtName ? (
              <span>
                Riferimento personalizzato caricato:{' '}
                <strong className="text-slate-900 dark:text-slate-100">{customSrtName}</strong> (
                {customSrtSegments?.length ?? 0} segmenti)
              </span>
            ) : (
              <span>
                Opzionale: carica un file di riferimento (.srt, .vtt o .txt) invece della
                trascrizione automatica.
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={srtInputRef}
              type="file"
              accept=".srt,.vtt,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleSrtReferenceUpload(file);
              }}
            />
            {customSrtName && (
              <button
                type="button"
                onClick={() => {
                  setCustomSrtName(null);
                  setCustomSrtSegments(null);
                }}
                className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
              >
                Rimuovi file
              </button>
            )}
            <button
              type="button"
              disabled={isLoading}
              onClick={() => srtInputRef.current?.click()}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Carica .SRT / .TXT
            </button>
          </div>
        </div>

        {/* Loading Progress Status */}
        {isLoading && statusStep && (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-medium text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            <span>{statusStep}</span>
          </div>
        )}

        {/* Transparent Error Feedback */}
        {errorMsg && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs leading-relaxed text-red-800 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300"
          >
            <p className="font-semibold">Operazione non completata</p>
            <p className="mt-1">{errorMsg}</p>
            {sourceTab === 'youtube' && (
              <button
                type="button"
                onClick={() => setSourceTab('local')}
                className="mt-2 font-semibold underline hover:text-red-900 dark:hover:text-red-200"
              >
                Passa al caricamento di un file locale
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
