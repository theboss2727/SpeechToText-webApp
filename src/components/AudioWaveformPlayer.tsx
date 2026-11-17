import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  Loader2,
  Mic,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  RotateCw,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { formatClockTime } from '../utils/srt';
import { ExtractMediaResponse, StreamMode, TranscriptSegment } from '../types';

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement | string,
        options: {
          videoId: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (event: { target: YTPlayerInstance }) => void;
            onStateChange?: (event: { data: number; target: YTPlayerInstance }) => void;
          };
        }
      ) => YTPlayerInstance;
      PlayerState?: {
        PLAYING: number;
        PAUSED: number;
        ENDED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  mute: () => void;
  unMute: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
}

interface AudioWaveformPlayerProps {
  audioUrl?: string;
  downloadUrl?: string;
  youtubeId?: string;
  streamMode: StreamMode;
  streamNotice?: string;
  title: string;
  author?: string;
  sourceType: 'youtube' | 'local';
  durationSeconds: number;
  waveformPeaks: number[];
  segments: TranscriptSegment[];
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  onActiveSegmentChange?: (segmentIndex: number) => void;
  externalSeekTime?: number | null;
  onClearExternalSeek?: () => void;
  onCapturedMp3?: (media: ExtractMediaResponse) => void;
}

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5];

let ytApiPromise: Promise<void> | null = null;
function loadYouTubeIframeApi(): Promise<void> {
  if (window.YT && window.YT.Player) {
    return Promise.resolve();
  }
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve) => {
    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevCallback?.();
      resolve();
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

export const AudioWaveformPlayer: React.FC<AudioWaveformPlayerProps> = ({
  audioUrl,
  downloadUrl,
  youtubeId,
  streamMode,
  streamNotice,
  title,
  author,
  sourceType,
  durationSeconds,
  waveformPeaks,
  segments,
  currentTime,
  onTimeUpdate,
  onActiveSegmentChange,
  externalSeekTime,
  onClearExternalSeek,
  onCapturedMp3,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [loopSegment, setLoopSegment] = useState(false);
  const [actualDuration, setActualDuration] = useState(durationSeconds);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isUploadingCapture, setIsUploadingCapture] = useState(false);

  const isYoutubeIframe = streamMode === 'youtube_iframe' && !audioUrl && Boolean(youtubeId);

  useEffect(() => {
    setActualDuration(durationSeconds);
  }, [durationSeconds]);

  useEffect(() => {
    setIsPlaying(false);
    setAudioError(null);
  }, [audioUrl, youtubeId, streamMode]);

  // Initialize YouTube IFrame Player when in youtube_iframe fallback mode
  useEffect(() => {
    if (!isYoutubeIframe || !youtubeId || !ytContainerRef.current) return;

    let cancelled = false;
    let pollTimer: number | undefined;

    loadYouTubeIframeApi().then(() => {
      if (cancelled || !ytContainerRef.current || !window.YT) return;

      // Clear previous mount node
      ytContainerRef.current.innerHTML = '';
      const mountEl = document.createElement('div');
      ytContainerRef.current.appendChild(mountEl);

      const player = new window.YT.Player(mountEl, {
        videoId: youtubeId,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onReady: (ev) => {
            if (cancelled) return;
            ytPlayerRef.current = ev.target;
            const dur = ev.target.getDuration();
            if (dur > 0) setActualDuration(dur);
          },
          onStateChange: (ev) => {
            if (cancelled) return;
            const state = ev.data;
            const playing = state === 1;
            setIsPlaying(playing);
            const dur = ev.target.getDuration();
            if (dur > 0) setActualDuration(dur);
          },
        },
      });

      ytPlayerRef.current = player;

      pollTimer = window.setInterval(() => {
        const p = ytPlayerRef.current;
        if (!p || typeof p.getCurrentTime !== 'function') return;
        const state = p.getPlayerState?.();
        if (state === 1) {
          const t = p.getCurrentTime();
          if (loopSegment) {
            const idx = segments.findIndex((s) => t >= s.startSec && t <= s.endSec);
            if (idx >= 0 && t >= segments[idx].endSec - 0.15) {
              p.seekTo(segments[idx].startSec, true);
              onTimeUpdate(segments[idx].startSec);
              return;
            }
          }
          onTimeUpdate(t);
        }
      }, 150);
    });

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      try {
        ytPlayerRef.current?.destroy();
      } catch {
        // Ignore cleanup errors
      }
      ytPlayerRef.current = null;
    };
  }, [isYoutubeIframe, youtubeId]);

  useEffect(() => {
    if (externalSeekTime === null || externalSeekTime === undefined) return;
    if (isYoutubeIframe && ytPlayerRef.current) {
      ytPlayerRef.current.seekTo(Math.max(0, externalSeekTime), true);
      onTimeUpdate(externalSeekTime);
      onClearExternalSeek?.();
    } else if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, externalSeekTime);
      onTimeUpdate(externalSeekTime);
      onClearExternalSeek?.();
    }
  }, [externalSeekTime, isYoutubeIframe, onClearExternalSeek, onTimeUpdate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft') {
        e.preventDefault();
        seekBy(-3);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') {
        e.preventDefault();
        seekBy(3);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const activeSegmentIndex = segments.findIndex(
    (s) => currentTime >= s.startSec && currentTime <= s.endSec
  );

  useEffect(() => {
    onActiveSegmentChange?.(activeSegmentIndex);
  }, [activeSegmentIndex, onActiveSegmentChange]);

  const togglePlay = () => {
    if (isYoutubeIframe && ytPlayerRef.current) {
      const state = ytPlayerRef.current.getPlayerState?.();
      if (state === 1) {
        ytPlayerRef.current.pauseVideo();
      } else {
        ytPlayerRef.current.playVideo();
      }
      return;
    }

    const el = audioRef.current;
    if (!el || !audioUrl) return;
    if (el.paused) {
      el.play().catch((err) => {
        setAudioError(err instanceof Error ? err.message : 'Impossibile avviare la riproduzione.');
      });
    } else {
      el.pause();
    }
  };

  const seekBy = (delta: number) => {
    if (isYoutubeIframe && ytPlayerRef.current) {
      const maxDur = ytPlayerRef.current.getDuration() || actualDuration || 0;
      const cur = ytPlayerRef.current.getCurrentTime() || 0;
      const next = Math.max(0, Math.min(maxDur, cur + delta));
      ytPlayerRef.current.seekTo(next, true);
      onTimeUpdate(next);
      return;
    }

    const el = audioRef.current;
    if (!el) return;
    const maxDur = el.duration || actualDuration || 0;
    const next = Math.max(0, Math.min(maxDur, el.currentTime + delta));
    el.currentTime = next;
    onTimeUpdate(next);
  };

  const seekToRatio = (ratio: number) => {
    if (isYoutubeIframe && ytPlayerRef.current) {
      const maxDur = ytPlayerRef.current.getDuration() || actualDuration || 0;
      const next = Math.max(0, Math.min(maxDur, ratio * maxDur));
      ytPlayerRef.current.seekTo(next, true);
      onTimeUpdate(next);
      return;
    }

    const el = audioRef.current;
    if (!el) return;
    const maxDur = el.duration || actualDuration || 0;
    const next = Math.max(0, Math.min(maxDur, ratio * maxDur));
    el.currentTime = next;
    onTimeUpdate(next);
  };

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    if (isYoutubeIframe && ytPlayerRef.current) {
      ytPlayerRef.current.setPlaybackRate(rate);
    }
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (isYoutubeIframe && ytPlayerRef.current) {
      if (next) ytPlayerRef.current.mute();
      else ytPlayerRef.current.unMute();
    }
    if (audioRef.current) {
      audioRef.current.muted = next;
    }
  };

  const handleTimeUpdate = () => {
    const el = audioRef.current;
    if (!el) return;
    const t = el.currentTime;

    if (loopSegment && activeSegmentIndex >= 0) {
      const seg = segments[activeSegmentIndex];
      if (t >= seg.endSec - 0.08) {
        el.currentTime = seg.startSec;
        onTimeUpdate(seg.startSec);
        return;
      }
    }

    onTimeUpdate(t);
  };

  // Browser tab audio capture -> convert directly to MP3 via server
  const handleToggleCaptureAudio = async () => {
    if (isCapturing) {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setIsCapturing(false);
      return;
    }

    setAudioError(null);
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      const audioTracks = displayStream.getAudioTracks();
      if (audioTracks.length === 0) {
        displayStream.getTracks().forEach((t) => t.stop());
        setAudioError(
          'Nessuna traccia audio rilevata nella condivisione. Seleziona questa scheda e attiva "Condividi audio scheda".'
        );
        return;
      }

      const audioOnlyStream = new MediaStream(audioTracks);
      streamRef.current = displayStream;
      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(audioOnlyStream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined,
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        displayStream.getTracks().forEach((t) => t.stop());
        if (chunks.length === 0) return;

        setIsUploadingCapture(true);
        try {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          const formData = new FormData();
          formData.append('file', blob, `${title || 'youtube_capture'}.webm`);

          const resp = await fetch('/api/upload/audio', {
            method: 'POST',
            body: formData,
          });
          const data = (await resp.json()) as ExtractMediaResponse & { error?: string };
          if (!resp.ok) {
            throw new Error(data.error || 'Conversione MP3 fallita.');
          }
          onCapturedMp3?.(data);
        } catch (err) {
          setAudioError(err instanceof Error ? err.message : 'Errore conversione MP3.');
        } finally {
          setIsUploadingCapture(false);
        }
      };

      recorderRef.current = recorder;
      recorder.start(250);
      setIsCapturing(true);

      // Auto-start playback while capturing
      ytPlayerRef.current?.seekTo(0, true);
      ytPlayerRef.current?.playVideo();
    } catch (err) {
      setAudioError(
        err instanceof Error
          ? err.message
          : 'Cattura audio scheda annullata o non supportata dal browser.'
      );
    }
  };

  const peaks = waveformPeaks.length > 0 ? waveformPeaks : Array.from({ length: 100 }, () => 0.3);
  const progressRatio = actualDuration > 0 ? Math.min(1, currentTime / actualDuration) : 0;
  const hasMedia = Boolean(audioUrl) || isYoutubeIframe;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onLoadedMetadata={(e) => {
            const dur = e.currentTarget.duration;
            if (Number.isFinite(dur) && dur > 0) {
              setActualDuration(dur);
            }
            e.currentTarget.playbackRate = playbackRate;
          }}
          onTimeUpdate={handleTimeUpdate}
          onError={() =>
            setAudioError(
              'Flusso audio non più disponibile nella cache temporanea. Ricarica il link o il file per ascoltare.'
            )
          }
        />
      )}

      {/* Header metadata row - clean unboxed text with middot separators */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>
              {sourceType === 'youtube'
                ? isYoutubeIframe
                  ? 'Stream YouTube Diretto'
                  : 'Audio MP3 Estratto da YouTube'
                : 'File Locale'}
            </span>
            {author && (
              <>
                <span aria-hidden="true">·</span>
                <span>{author}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {formatClockTime(currentTime)} / {formatClockTime(actualDuration)}
            </span>
            {activeSegmentIndex >= 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-blue-600 dark:text-blue-400">
                  Segmento {activeSegmentIndex + 1} di {segments.length}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isYoutubeIframe && (
            <button
              type="button"
              onClick={handleToggleCaptureAudio}
              disabled={isUploadingCapture}
              className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                isCapturing
                  ? 'border-red-500 bg-red-50 text-red-700 dark:border-red-500 dark:bg-red-950/60 dark:text-red-300'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {isUploadingCapture ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  <span>Conversione MP3...</span>
                </>
              ) : isCapturing ? (
                <>
                  <Square className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Ferma e Salva MP3</span>
                </>
              ) : (
                <>
                  <Mic className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Cattura Audio in MP3</span>
                </>
              )}
            </button>
          )}

          {downloadUrl && (
            <a
              href={downloadUrl}
              download
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Scarica MP3</span>
            </a>
          )}
        </div>
      </div>

      {streamNotice && isYoutubeIframe && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
          {streamNotice}
        </div>
      )}

      {audioError && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-300">
          {audioError}
        </div>
      )}

      {/* Embedded YouTube Player when in direct stream mode */}
      {isYoutubeIframe && (
        <div className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-black dark:border-slate-800">
          <div
            ref={ytContainerRef}
            className="h-48 w-full sm:h-56 [&>iframe]:h-full [&>iframe]:w-full"
          />
        </div>
      )}

      {/* Interactive Scrubber / Real Waveform */}
      <div
        role="slider"
        tabIndex={0}
        aria-label="Posizione riproduzione audio"
        aria-valuemin={0}
        aria-valuemax={Math.round(actualDuration)}
        aria-valuenow={Math.round(currentTime)}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          seekToRatio(ratio);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') seekBy(-3);
          if (e.key === 'ArrowRight') seekBy(3);
        }}
        className={`group relative flex cursor-pointer items-center gap-[2px] rounded-lg bg-slate-100/80 px-2.5 py-2 focus-visible:outline-2 focus-visible:outline-blue-600 dark:bg-slate-950/70 ${
          isYoutubeIframe ? 'h-8' : 'h-16'
        }`}
      >
        {isYoutubeIframe ? (
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              style={{ width: `${progressRatio * 100}%` }}
              className="h-full bg-blue-600 transition-all duration-150 dark:bg-blue-500"
            />
          </div>
        ) : (
          peaks.map((amp, index) => {
            const barRatio = index / peaks.length;
            const isPlayed = barRatio <= progressRatio;
            const heightPct = Math.max(14, Math.round(amp * 100));
            return (
              <div
                key={index}
                className="flex h-full flex-1 items-center justify-center"
              >
                <div
                  style={{ height: `${heightPct}%` }}
                  className={`w-full rounded-xs transition-colors duration-100 ${
                    isPlayed
                      ? 'bg-blue-600 dark:bg-blue-500'
                      : 'bg-slate-300 group-hover:bg-slate-400 dark:bg-slate-700 dark:group-hover:bg-slate-600'
                  }`}
                />
              </div>
            );
          })
        )}
      </div>

      {/* Studio Transport Controls */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => seekBy(-3)}
            disabled={!hasMedia}
            title="Indietro 3 secondi (Ctrl+Freccia Sinistra)"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-40 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="font-mono tabular-nums">-3s</span>
          </button>

          <button
            type="button"
            onClick={togglePlay}
            disabled={!hasMedia}
            title="Riproduci o Pausa (Ctrl+Spazio)"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-40 whitespace-nowrap shrink-0 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {isPlaying ? (
              <>
                <Pause className="h-4 w-4" aria-hidden="true" />
                <span>Pausa</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4" aria-hidden="true" />
                <span>Riproduci</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => seekBy(3)}
            disabled={!hasMedia}
            title="Avanti 3 secondi (Ctrl+Freccia Destra)"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-40 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <span className="font-mono tabular-nums">+3s</span>
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Velocità di riproduzione"
            className="flex items-center rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
          >
            {SPEED_OPTIONS.map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => handleSpeedChange(rate)}
                className={`rounded-md px-2.5 py-1 font-mono text-xs font-medium tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                  playbackRate === rate
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setLoopSegment(!loopSegment)}
            disabled={segments.length === 0}
            aria-pressed={loopSegment}
            title="Ripeti in loop il segmento corrente"
            className={`inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 ${
              loopSegment
                ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-300'
                : 'border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Loop Segmento</span>
          </button>

          <button
            type="button"
            onClick={toggleMute}
            aria-label={isMuted ? 'Riattiva audio' : 'Disattiva audio'}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </section>
  );
};
