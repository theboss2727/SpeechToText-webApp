import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  FolderKanban,
  Headphones,
  Menu,
  Moon,
  Plus,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import {
  ExtractMediaResponse,
  LearningAttempt,
  LearningSession,
  ScoreBreakdown,
  TranscriptSegment,
  UserAiSettings,
} from './types';
import {
  loadAiSettings,
  loadSessions,
  loadThemePreference,
  saveAiSettings,
  saveSessions,
  saveThemePreference,
} from './utils/storage';
import { SourceIntakePanel } from './components/SourceIntakePanel';
import { TranscriptionStudio } from './components/TranscriptionStudio';
import { SessionsManager } from './components/SessionsManager';
import { ProgressDashboard } from './components/ProgressDashboard';
import { SrtExportModal } from './components/SrtExportModal';
import { AiSettingsModal } from './components/AiSettingsModal';

type AppView = 'studio' | 'sessions' | 'dashboard';

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => loadThemePreference());
  const [sessions, setSessions] = useState<LearningSession[]>(() => loadSessions());
  const [activeView, setActiveView] = useState<AppView>('studio');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    const existing = loadSessions();
    return existing.length > 0 ? existing[0].id : null;
  });
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(() => {
    return loadSessions().length === 0;
  });
  const [aiSettings, setAiSettings] = useState<UserAiSettings>(() => loadAiSettings());
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);
  const [isSrtModalOpen, setIsSrtModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Sync dark class on documentElement
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    saveThemePreference(theme);
  }, [theme]);

  // Persist sessions
  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );

  const handleMediaReady = ({
    media,
    segments,
    language,
  }: {
    media: ExtractMediaResponse;
    segments: TranscriptSegment[];
    language: string;
  }) => {
    const now = new Date().toISOString();
    const newSession: LearningSession = {
      id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: media.title,
      sourceType: media.sourceType,
      streamMode: media.streamMode || (media.audioUrl ? 'mp3' : 'youtube_iframe'),
      streamNotice: media.streamNotice,
      youtubeId: media.youtubeId,
      author: media.author,
      mediaId: media.mediaId,
      audioUrl: media.audioUrl,
      downloadUrl: media.downloadUrl,
      durationSeconds: media.durationSeconds,
      waveformPeaks: media.waveformPeaks,
      language,
      referenceSegments: segments,
      userText: '',
      strictPunctuation: false,
      verificationMode: 'progressive',
      status: 'in_corso',
      createdAt: now,
      updatedAt: now,
      latestScore: null,
      attempts: [],
    };

    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setIsCreatingNew(false);
    setActiveView('studio');
  };

  const handleUpdateSession = (updated: LearningSession) => {
    setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  const handleSaveAttempt = (score: ScoreBreakdown, practicedSec: number) => {
    if (!activeSession) return;
    const attempt: LearningAttempt = {
      id: `att_${Date.now()}`,
      timestamp: new Date().toISOString(),
      accuracyPercent: score.accuracyPercent,
      points: score.points,
      totalErrors: score.totalErrors,
      substitutions: score.substitutions,
      insertions: score.insertions,
      deletions: score.deletions,
      typedWordCount: score.typedWordCount,
      durationPracticedSec: practicedSec,
      wpm: score.wpm,
    };

    handleUpdateSession({
      ...activeSession,
      latestScore: score,
      attempts: [...activeSession.attempts, attempt],
      updatedAt: new Date().toISOString(),
    });
  };

  const handleSelectSession = (id: string) => {
    setActiveSessionId(id);
    setIsCreatingNew(false);
    setActiveView('studio');
    setMobileMenuOpen(false);
  };

  const handleStartNewSession = () => {
    setIsCreatingNew(true);
    setActiveView('studio');
    setMobileMenuOpen(false);
  };

  const handleRenameSession = (id: string, newTitle: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, title: newTitle, updatedAt: new Date().toISOString() } : s
      )
    );
  };

  const handleToggleComplete = (id: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              status: s.status === 'completata' ? 'in_corso' : 'completata',
              updatedAt: new Date().toISOString(),
            }
          : s
      )
    );
  };

  const handleDeleteSession = (id: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (activeSessionId === id) {
        setActiveSessionId(next[0]?.id ?? null);
        if (next.length === 0) setIsCreatingNew(true);
      }
      return next;
    });
  };

  const recentSessions = useMemo(
    () =>
      sessions
        .slice()
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 6),
    [sessions]
  );

  const breadcrumbLabel =
    activeView === 'studio'
      ? isCreatingNew || !activeSession
        ? 'Studio / Nuova Estrazione'
        : `Studio / ${activeSession.title}`
      : activeView === 'sessions'
        ? 'Gestione Sessioni'
        : 'Dashboard Progressi';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex min-h-screen">
        {/* Mobile Sidebar Backdrop */}
        {mobileMenuOpen && (
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
          />
        )}

        {/* Workspace Sidebar (260px) */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-[260px] shrink-0 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:static lg:translate-x-0 dark:border-slate-800 dark:bg-slate-900 ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Brand Zone */}
          <div className="flex h-16 items-center justify-between border-b border-slate-200 px-6 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setActiveView('studio')}
              className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 dark:text-slate-100"
            >
              ingage
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Chiudi menu"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Primary Navigation */}
          <nav aria-label="Navigazione principale" className="space-y-1 px-3 py-4">
            <button
              type="button"
              onClick={() => {
                setActiveView('studio');
                setMobileMenuOpen(false);
              }}
              className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors whitespace-nowrap ${
                activeView === 'studio'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
              }`}
            >
              <Headphones className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Studio Audio</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveView('sessions');
                setMobileMenuOpen(false);
              }}
              className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors whitespace-nowrap ${
                activeView === 'sessions'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
              }`}
            >
              <FolderKanban className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Sessioni ({sessions.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveView('dashboard');
                setMobileMenuOpen(false);
              }}
              className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors whitespace-nowrap ${
                activeView === 'dashboard'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
              }`}
            >
              <BarChart3 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Dashboard Progressi</span>
            </button>
          </nav>

          {/* Recent Sessions Quick Switcher */}
          <div className="flex-1 overflow-y-auto border-t border-slate-200 px-3 py-4 dark:border-slate-800">
            <div className="mb-2 flex items-center justify-between px-3">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Sessioni Recenti
              </span>
              <button
                type="button"
                onClick={handleStartNewSession}
                title="Nuova sessione"
                className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {recentSessions.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">
                Nessuna sessione salvata.
              </p>
            ) : (
              <div className="space-y-1">
                {recentSessions.map((sess) => {
                  const selected =
                    activeView === 'studio' && !isCreatingNew && sess.id === activeSessionId;
                  return (
                    <button
                      key={sess.id}
                      type="button"
                      onClick={() => handleSelectSession(sess.id)}
                      className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                        selected
                          ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200'
                      }`}
                    >
                      <div className="truncate text-xs font-medium">{sess.title}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400 tabular-nums dark:text-slate-500">
                        <span>{sess.sourceType === 'youtube' ? 'YouTube' : 'Locale'}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {sess.latestScore
                            ? `${sess.latestScore.accuracyPercent.toFixed(0)}%`
                            : 'Nuova'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Theme Switcher Footer */}
          <div className="border-t border-slate-200 p-3 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={
                theme === 'dark' ? 'Attiva modalità chiara' : 'Attiva modalità oscura'
              }
              className="flex h-10 w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <span>{theme === 'dark' ? 'Modalità Scura' : 'Modalità Chiara'}</span>
              {theme === 'dark' ? (
                <Moon className="h-4 w-4 text-blue-400" aria-hidden="true" />
              ) : (
                <Sun className="h-4 w-4 text-amber-500" aria-hidden="true" />
              )}
            </button>
          </div>
        </aside>

        {/* Main Viewport */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top Bar */}
          <header className="flex h-16 items-center justify-between gap-6 border-b border-slate-200 bg-white px-4 sm:px-8 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Apri menu di navigazione"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 lg:hidden dark:border-slate-700 dark:text-slate-300"
              >
                <Menu className="h-4 w-4" />
              </button>
              <span className="truncate text-sm font-medium text-slate-600 dark:text-slate-300">
                {breadcrumbLabel}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsAiSettingsOpen(true)}
                title="Configura modello AI e chiave API"
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                <span className="hidden sm:inline font-mono">{aiSettings.model}</span>
                <span className="sm:hidden font-mono text-[11px]">{aiSettings.model.replace('gemini-', '')}</span>
                {aiSettings.apiKey ? (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    BYOK
                  </span>
                ) : (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                    Free
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={handleStartNewSession}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Nuova Sessione</span>
              </button>
            </div>
          </header>

          {/* Content Container */}
          <main className="mx-auto w-full max-w-[1280px] flex-1 p-4 sm:p-8">
            {activeView === 'studio' &&
              (isCreatingNew || !activeSession ? (
                <SourceIntakePanel
                  onMediaReady={handleMediaReady}
                  aiSettings={aiSettings}
                  onOpenAiSettings={() => setIsAiSettingsOpen(true)}
                />
              ) : (
                <TranscriptionStudio
                  session={activeSession}
                  aiSettings={aiSettings}
                  onOpenAiSettings={() => setIsAiSettingsOpen(true)}
                  onUpdateSession={handleUpdateSession}
                  onSaveAttempt={handleSaveAttempt}
                  onOpenSrtModal={() => setIsSrtModalOpen(true)}
                />
              ))}

            {activeView === 'sessions' && (
              <SessionsManager
                sessions={sessions}
                activeSessionId={activeSessionId}
                onSelectSession={handleSelectSession}
                onNewSession={handleStartNewSession}
                onRenameSession={handleRenameSession}
                onToggleComplete={handleToggleComplete}
                onDeleteSession={handleDeleteSession}
              />
            )}

            {activeView === 'dashboard' && (
              <ProgressDashboard
                sessions={sessions}
                onOpenSession={handleSelectSession}
                onNewSession={handleStartNewSession}
              />
            )}
          </main>
        </div>
      </div>

      {/* AI Settings Modal */}
      <AiSettingsModal
        isOpen={isAiSettingsOpen}
        onClose={() => setIsAiSettingsOpen(false)}
        settings={aiSettings}
        onSave={(updated) => {
          setAiSettings(updated);
          saveAiSettings(updated);
        }}
      />

      {/* SRT Subtitle Correction & Export Modal */}
      {activeSession && (
        <SrtExportModal
          isOpen={isSrtModalOpen}
          onClose={() => setIsSrtModalOpen(false)}
          sessionTitle={activeSession.title}
          referenceSegments={activeSession.referenceSegments}
          userText={activeSession.userText}
          savedCorrectedSegments={activeSession.correctedSegments}
          onSaveCorrectedSegments={(correctedSegments) =>
            handleUpdateSession({
              ...activeSession,
              correctedSegments,
              updatedAt: new Date().toISOString(),
            })
          }
        />
      )}
    </div>
  );
}
