import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookmarkCheck,
  CheckCircle2,
  Eye,
  EyeOff,
  FileDown,
  Loader2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import {
  LearningSession,
  ScoreBreakdown,
  TranscriptSegment,
  UserAiSettings,
  VerificationMode,
} from '../types';
import { formatClockTime } from '../utils/srt';
import { loadAiSettings } from '../utils/storage';
import { evaluateTranscription } from '../utils/verification';
import { AudioWaveformPlayer } from './AudioWaveformPlayer';

interface TranscriptionStudioProps {
  session: LearningSession;
  aiSettings?: UserAiSettings;
  onOpenAiSettings?: () => void;
  onUpdateSession: (updated: LearningSession) => void;
  onSaveAttempt: (score: ScoreBreakdown, practicedSec: number) => void;
  onOpenSrtModal: () => void;
}

export const TranscriptionStudio: React.FC<TranscriptionStudioProps> = ({
  session,
  aiSettings,
  onOpenAiSettings,
  onUpdateSession,
  onSaveAttempt,
  onOpenSrtModal,
}) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [externalSeekTime, setExternalSeekTime] = useState<number | null>(null);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(-1);
  const [showReference, setShowReference] = useState(false);
  const [isRetranscribing, setIsRetranscribing] = useState(false);
  const [retranscribeError, setRetranscribeError] = useState<string | null>(null);
  const [attemptSavedBanner, setAttemptSavedBanner] = useState(false);

  // Track active typing seconds for accurate WPM
  const typingStartRef = useRef<number | null>(null);
  const [elapsedTypingSec, setElapsedTypingSec] = useState(0);

  useEffect(() => {
    typingStartRef.current = null;
    setElapsedTypingSec(0);
    setCurrentTime(0);
    setAttemptSavedBanner(false);
    setRetranscribeError(null);
  }, [session.id]);

  const handleTextChange = (value: string) => {
    if (typingStartRef.current === null && value.trim().length > 0) {
      typingStartRef.current = Date.now();
    }
    if (typingStartRef.current !== null) {
      setElapsedTypingSec(Math.round((Date.now() - typingStartRef.current) / 1000));
    }

    const evaluation = evaluateTranscription({
      segments: session.referenceSegments,
      userText: value,
      strictPunctuation: session.strictPunctuation,
      mode: session.verificationMode,
      elapsedTypingSeconds:
        typingStartRef.current !== null
          ? Math.max(1, Math.round((Date.now() - typingStartRef.current) / 1000))
          : 0,
    });

    onUpdateSession({
      ...session,
      userText: value,
      latestScore: evaluation.score,
      updatedAt: new Date().toISOString(),
    });
  };

  const { tokens, score } = useMemo(
    () =>
      evaluateTranscription({
        segments: session.referenceSegments,
        userText: session.userText,
        strictPunctuation: session.strictPunctuation,
        mode: session.verificationMode,
        elapsedTypingSeconds: elapsedTypingSec,
      }),
    [
      session.referenceSegments,
      session.userText,
      session.strictPunctuation,
      session.verificationMode,
      elapsedTypingSec,
    ]
  );

  const discrepancyTokens = useMemo(
    () => tokens.filter((t) => t.kind !== 'match'),
    [tokens]
  );

  const handleModeChange = (mode: VerificationMode) => {
    const evaluation = evaluateTranscription({
      segments: session.referenceSegments,
      userText: session.userText,
      strictPunctuation: session.strictPunctuation,
      mode,
      elapsedTypingSeconds: elapsedTypingSec,
    });
    onUpdateSession({
      ...session,
      verificationMode: mode,
      latestScore: evaluation.score,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleStrictToggle = () => {
    const nextStrict = !session.strictPunctuation;
    const evaluation = evaluateTranscription({
      segments: session.referenceSegments,
      userText: session.userText,
      strictPunctuation: nextStrict,
      mode: session.verificationMode,
      elapsedTypingSeconds: elapsedTypingSec,
    });
    onUpdateSession({
      ...session,
      strictPunctuation: nextStrict,
      latestScore: evaluation.score,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleRetranscribe = async () => {
    if ((!session.mediaId && !session.youtubeId) || isRetranscribing) return;
    setIsRetranscribing(true);
    setRetranscribeError(null);
    const activeSettings = aiSettings || loadAiSettings();
    try {
      const resp = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeSettings.apiKey ? { 'x-gemini-api-key': activeSettings.apiKey } : {}),
        },
        body: JSON.stringify({
          mediaId: session.mediaId,
          youtubeId: session.youtubeId,
          durationSeconds: session.durationSeconds,
          language: session.language === 'auto' ? undefined : session.language,
          model: activeSettings.model,
          apiKey: activeSettings.apiKey || undefined,
        }),
      });
      const data = (await resp.json()) as {
        segments?: TranscriptSegment[];
        error?: string;
      };
      if (!resp.ok || !data.segments) {
        throw new Error(data.error || 'Impossibile rigenerare la trascrizione.');
      }

      const evaluation = evaluateTranscription({
        segments: data.segments,
        userText: session.userText,
        strictPunctuation: session.strictPunctuation,
        mode: session.verificationMode,
        elapsedTypingSeconds: elapsedTypingSec,
      });

      onUpdateSession({
        ...session,
        referenceSegments: data.segments,
        latestScore: evaluation.score,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      setRetranscribeError(err instanceof Error ? err.message : 'Errore trascrizione.');
    } finally {
      setIsRetranscribing(false);
    }
  };

  const handleRecordAttempt = () => {
    if (session.userText.trim().length === 0) return;
    onSaveAttempt(score, Math.max(15, elapsedTypingSec || Math.round(currentTime) || 30));
    setAttemptSavedBanner(true);
    setTimeout(() => setAttemptSavedBanner(false), 2600);
  };

  const toggleCompletionStatus = () => {
    onUpdateSession({
      ...session,
      status: session.status === 'completata' ? 'in_corso' : 'completata',
      updatedAt: new Date().toISOString(),
    });
  };

  const tierIcon =
    score.tier === 'Eccellente' ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
    ) : score.tier === 'Ottimo' || score.tier === 'Buono' ? (
      <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
    ) : (
      <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
    );

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      {/* Left / Main Interactive Stage (8 cols) */}
      <div className="space-y-6 xl:col-span-8">
        <AudioWaveformPlayer
          audioUrl={session.audioUrl}
          downloadUrl={session.downloadUrl}
          youtubeId={session.youtubeId}
          streamMode={session.streamMode || (session.audioUrl ? 'mp3' : 'youtube_iframe')}
          streamNotice={session.streamNotice}
          title={session.title}
          author={session.author}
          sourceType={session.sourceType}
          durationSeconds={session.durationSeconds}
          waveformPeaks={session.waveformPeaks}
          segments={session.referenceSegments}
          currentTime={currentTime}
          onTimeUpdate={setCurrentTime}
          onActiveSegmentChange={setActiveSegmentIndex}
          externalSeekTime={externalSeekTime}
          onClearExternalSeek={() => setExternalSeekTime(null)}
          onCapturedMp3={(captured) => {
            onUpdateSession({
              ...session,
              streamMode: 'mp3',
              streamNotice: undefined,
              mediaId: captured.mediaId,
              audioUrl: captured.audioUrl,
              downloadUrl: captured.downloadUrl,
              waveformPeaks: captured.waveformPeaks,
              durationSeconds: captured.durationSeconds || session.durationSeconds,
              updatedAt: new Date().toISOString(),
            });
          }}
        />

        {/* Dictation Editor & Real-time Verification Controls */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Inserimento Testo e Verifica in Tempo Reale
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Scorciatoie: <span className="font-mono">Ctrl+Spazio</span> Pausa/Play ·{' '}
                <span className="font-mono">Ctrl+← / →</span> ±3s
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => handleModeChange('progressive')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    session.verificationMode === 'progressive'
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  Progressiva
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('full')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    session.verificationMode === 'full'
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  Completa
                </button>
              </div>

              <button
                type="button"
                onClick={handleStrictToggle}
                aria-pressed={session.strictPunctuation}
                className={`h-8 rounded-lg border px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  session.strictPunctuation
                    ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-300'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {session.strictPunctuation ? 'Punteggiatura Rigorosa' : 'Ignora Punteggiatura'}
              </button>
            </div>
          </div>

          <textarea
            rows={6}
            value={session.userText}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="Avvia la riproduzione audio e scrivi qui ciò che ascolti. Ogni parola viene confrontata istantaneamente..."
            aria-label="Campo di inserimento trascrizione utente"
            className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50/70 p-4 text-[15px] leading-[1.65] text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-900"
          />

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="tabular-nums">
              {score.typedWordCount} parole inserite su {score.referenceWordCount} di riferimento
            </span>
            {session.userText.length > 0 && (
              <button
                type="button"
                onClick={() => handleTextChange('')}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                <span>Svuota testo</span>
              </button>
            )}
          </div>

          {/* Real-time Red Discrepancy Highlighting Panel */}
          <div className="mt-5 border-t border-slate-200 pt-5 dark:border-slate-800">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Confronto Live e Discrepanze Evidenziate
              </h4>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-slate-600 dark:text-slate-400">
                  Corrette:{' '}
                  <strong className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                    {score.matchedWords}
                  </strong>
                </span>
                <span className="text-slate-600 dark:text-slate-400">
                  Discrepanze:{' '}
                  <strong className="font-mono tabular-nums text-red-600 dark:text-red-400">
                    {score.totalErrors}
                  </strong>
                </span>
              </div>
            </div>

            {tokens.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                Inizia a digitare nel riquadro sopra per vedere la verifica in tempo reale parola
                per parola. Le discrepanze rispetto all&apos;audio verranno evidenziate in rosso.
              </div>
            ) : (
              <div
                aria-live="polite"
                className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 text-[15px] leading-[1.9] dark:border-slate-800 dark:bg-slate-950/60"
              >
                {tokens.map((tok) => {
                  if (tok.kind === 'match') {
                    return (
                      <span
                        key={tok.id}
                        className="mr-1.5 inline-block text-slate-800 dark:text-slate-200"
                      >
                        {tok.typed}
                      </span>
                    );
                  }

                  if (tok.kind === 'substitution') {
                    return (
                      <span
                        key={tok.id}
                        title={`Discrepanza — Atteso: "${tok.expected}"`}
                        className="mr-1.5 inline-flex items-baseline gap-1 rounded-sm border-b-2 border-red-500 bg-red-500/15 px-1.5 py-0.5 font-medium text-red-700 dark:border-red-400 dark:bg-red-500/20 dark:text-red-300"
                      >
                        <span>{tok.typed}</span>
                        <span className="text-[11px] font-normal text-red-600/90 dark:text-red-300/90">
                          ({tok.expected})
                        </span>
                      </span>
                    );
                  }

                  if (tok.kind === 'insertion') {
                    return (
                      <span
                        key={tok.id}
                        title="Parola extra non presente nell'audio"
                        className="mr-1.5 inline-block rounded-sm bg-red-500/15 px-1.5 py-0.5 text-red-700 line-through decoration-red-500 dark:bg-red-500/20 dark:text-red-300"
                      >
                        {tok.typed}
                      </span>
                    );
                  }

                  return (
                    <span
                      key={tok.id}
                      title="Parola omessa rispetto all'audio"
                      className="mr-1.5 inline-block rounded-sm border border-red-300 bg-red-500/10 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300"
                    >
                      [mancante: {tok.expected}]
                    </span>
                  );
                })}
              </div>
            )}

            {/* Specific Red Discrepancy Summary List */}
            {discrepancyTokens.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold text-red-700 dark:text-red-400">
                  Dettaglio discrepanze rilevate ({discrepancyTokens.length})
                </p>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-red-200 bg-red-50/40 divide-y divide-red-200/70 dark:border-red-900/60 dark:bg-red-950/20 dark:divide-red-900/40">
                  {discrepancyTokens.slice(0, 25).map((errTok) => (
                    <div
                      key={errTok.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                    >
                      <span className="text-red-800 dark:text-red-300">
                        {errTok.kind === 'substitution' && (
                          <>
                            Scritto <strong>&ldquo;{errTok.typed}&rdquo;</strong> invece di{' '}
                            <strong className="text-slate-900 dark:text-slate-100">
                              &ldquo;{errTok.expected}&rdquo;
                            </strong>
                          </>
                        )}
                        {errTok.kind === 'insertion' && (
                          <>
                            Parola extra inserita: <strong>&ldquo;{errTok.typed}&rdquo;</strong>
                          </>
                        )}
                        {errTok.kind === 'deletion' && (
                          <>
                            Parola mancante:{' '}
                            <strong className="text-slate-900 dark:text-slate-100">
                              &ldquo;{errTok.expected}&rdquo;
                            </strong>
                          </>
                        )}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-red-600 dark:text-red-400">
                        {errTok.kind === 'substitution'
                          ? 'Sostituzione'
                          : errTok.kind === 'insertion'
                            ? 'Extra'
                            : 'Omissione'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Timed Segments Navigation & Reference Reveal */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Segmenti Temporali dell&apos;Audio ({session.referenceSegments.length})
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Clicca su qualsiasi timestamp per saltare direttamente a quel punto dello stream.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {onOpenAiSettings && (
                <button
                  type="button"
                  onClick={onOpenAiSettings}
                  title="Impostazioni Modello AI"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                  <span className="font-mono text-[11px]">
                    {(aiSettings || loadAiSettings()).model}
                  </span>
                </button>
              )}

              {(session.mediaId || session.youtubeId) && (
                <button
                  type="button"
                  onClick={handleRetranscribe}
                  disabled={isRetranscribing}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {isRetranscribing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  <span>Rigenera Riferimento AI</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowReference(!showReference)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {showReference ? (
                  <>
                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Nascondi Testo</span>
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Mostra Testo Riferimento</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {retranscribeError && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {retranscribeError}
            </div>
          )}

          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {session.referenceSegments.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                <p>Nessun segmento di riferimento presente per questa sessione.</p>
                {(session.mediaId || session.youtubeId) && (
                  <button
                    type="button"
                    onClick={handleRetranscribe}
                    disabled={isRetranscribing}
                    className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isRetranscribing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    <span>Genera Trascrizione di Riferimento AI</span>
                  </button>
                )}
              </div>
            ) : (
              session.referenceSegments.map((seg, idx) => {
                const isActive = idx === activeSegmentIndex;
                return (
                  <button
                    key={seg.id}
                    type="button"
                    onClick={() => setExternalSeekTime(seg.startSec)}
                    className={`flex w-full items-start gap-4 px-4 py-2.5 text-left transition-colors ${
                      isActive
                        ? 'bg-blue-50/80 dark:bg-blue-950/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <span
                      className={`shrink-0 pt-0.5 font-mono text-xs tabular-nums ${
                        isActive
                          ? 'font-semibold text-blue-600 dark:text-blue-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {formatClockTime(seg.startSec)}
                    </span>
                    <span
                      className={`text-sm leading-relaxed ${
                        showReference
                          ? 'text-slate-800 dark:text-slate-200'
                          : 'select-none blur-[5px] text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {seg.text}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Right Scoreboard & Actions Deck (4 cols) */}
      <aside className="space-y-6 xl:col-span-4">
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-4 dark:border-slate-800">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Punteggio di Precisione
            </h3>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              {tierIcon}
              <span>{score.tier}</span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Precisione</p>
              <p className="mt-1 font-mono text-3xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
                {score.accuracyPercent.toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Punteggio Totale</p>
              <p className="mt-1 font-mono text-3xl font-bold tracking-tight text-blue-600 tabular-nums dark:text-blue-400">
                {score.points}
                <span className="text-sm font-medium text-slate-400"> / 1000</span>
              </p>
            </div>
          </div>

          {/* Accuracy bar */}
          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                style={{ width: `${Math.min(100, score.accuracyPercent)}%` }}
                className={`h-full transition-all duration-200 ${
                  score.accuracyPercent >= 85
                    ? 'bg-emerald-600 dark:bg-emerald-500'
                    : score.accuracyPercent >= 65
                      ? 'bg-blue-600 dark:bg-blue-500'
                      : 'bg-red-600 dark:bg-red-500'
                }`}
              />
            </div>
          </div>

          {/* Tabular metrics list */}
          <dl className="mt-6 divide-y divide-slate-100 border-t border-slate-100 text-xs dark:divide-slate-800 dark:border-slate-800">
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-600 dark:text-slate-400">Parole corrette</dt>
              <dd className="font-mono font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
                {score.matchedWords}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-600 dark:text-slate-400">Sostituzioni (errate)</dt>
              <dd className="font-mono font-semibold text-red-600 tabular-nums dark:text-red-400">
                {score.substitutions}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-600 dark:text-slate-400">Omissioni (mancanti)</dt>
              <dd className="font-mono font-semibold text-red-600 tabular-nums dark:text-red-400">
                {score.deletions}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-600 dark:text-slate-400">Inserimenti (extra)</dt>
              <dd className="font-mono font-semibold text-red-600 tabular-nums dark:text-red-400">
                {score.insertions}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-600 dark:text-slate-400">Copertura audio</dt>
              <dd className="font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                {score.coveragePercent.toFixed(1)}%
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-600 dark:text-slate-400">Velocità trascrizione</dt>
              <dd className="font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                {score.wpm > 0 ? `${score.wpm} WPM` : '—'}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-600 dark:text-slate-400">Tasso Errore (WER)</dt>
              <dd className="font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                {score.werPercent.toFixed(1)}%
              </dd>
            </div>
          </dl>

          {/* Primary Studio Actions */}
          <div className="mt-6 space-y-2.5">
            <button
              type="button"
              onClick={handleRecordAttempt}
              disabled={session.userText.trim().length === 0}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-45 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
              <span>Salva Risultato nella Dashboard</span>
            </button>

            {attemptSavedBanner && (
              <p className="text-center text-xs font-medium text-emerald-700 dark:text-emerald-400">
                Tentativo salvato nello storico progressi.
              </p>
            )}

            <button
              type="button"
              onClick={onOpenSrtModal}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              <FileDown className="h-4 w-4" aria-hidden="true" />
              <span>Esporta Sottotitoli Corretti (.SRT)</span>
            </button>

            <button
              type="button"
              onClick={toggleCompletionStatus}
              className="flex h-10 w-full items-center justify-center rounded-lg border border-slate-200 px-4 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {session.status === 'completata'
                ? 'Riapri Sessione (In Corso)'
                : 'Segna Sessione come Completata'}
            </button>
          </div>
        </section>

        {/* Session Recent Attempts Quick History */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Tentativi di Questa Sessione ({session.attempts.length})
          </h3>
          {session.attempts.length === 0 ? (
            <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Nessun risultato salvato ancora. Premi &ldquo;Salva Risultato nella Dashboard&rdquo;
              dopo aver trascritto per monitorare i miglioramenti.
            </p>
          ) : (
            <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
              {session.attempts
                .slice()
                .reverse()
                .slice(0, 5)
                .map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between py-2.5 text-xs"
                  >
                    <span className="text-slate-500 dark:text-slate-400">
                      {new Date(att.timestamp).toLocaleString('it-IT', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <div className="flex items-center gap-3 font-mono tabular-nums">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {att.accuracyPercent.toFixed(1)}%
                      </span>
                      <span className="text-blue-600 dark:text-blue-400">{att.points} pt</span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>
      </aside>
    </div>
  );
};
