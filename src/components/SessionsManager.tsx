import React, { useMemo, useState } from 'react';
import {
  Check,
  Edit3,
  FolderOpen,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { LearningSession } from '../types';
import { formatClockTime } from '../utils/srt';

interface SessionsManagerProps {
  sessions: LearningSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onRenameSession: (id: string, newTitle: string) => void;
  onToggleComplete: (id: string) => void;
  onDeleteSession: (id: string) => void;
}

type FilterTab = 'all' | 'youtube' | 'local' | 'completed';

export const SessionsManager: React.FC<SessionsManagerProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onRenameSession,
  onToggleComplete,
  onDeleteSession,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const filtered = useMemo(() => {
    return sessions
      .filter((s) => {
        if (filter === 'youtube' && s.sourceType !== 'youtube') return false;
        if (filter === 'local' && s.sourceType !== 'local') return false;
        if (filter === 'completed' && s.status !== 'completata') return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          return (
            s.title.toLowerCase().includes(q) ||
            (s.author ?? '').toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [sessions, filter, search]);

  const startRename = (session: LearningSession) => {
    setEditingId(session.id);
    setEditingTitle(session.title);
  };

  const commitRename = (id: string) => {
    if (editingTitle.trim()) {
      onRenameSession(id, editingTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Gestione Sessioni di Apprendimento
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Riprendi una trascrizione salvata, rinomina i moduli di studio o verifica lo stato di
            completamento.
          </p>
        </div>

        <button
          type="button"
          onClick={onNewSession}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Nuova Sessione</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {(
            [
              ['all', 'Tutte'],
              ['youtube', 'YouTube'],
              ['local', 'File Locali'],
              ['completed', 'Completate'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                filter === key
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca sessione o autore..."
            aria-label="Cerca tra le sessioni salvate"
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-900"
          />
        </div>
      </div>

      {/* Sessions List / Empty State */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-slate-700 dark:bg-slate-900">
          <FolderOpen
            className="mx-auto mb-3 h-9 w-9 text-slate-400 dark:text-slate-500"
            aria-hidden="true"
          />
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {sessions.length === 0
              ? 'Nessuna sessione di apprendimento presente'
              : 'Nessuna sessione corrisponde ai filtri'}
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {sessions.length === 0
              ? 'Estrai l’audio da un link YouTube oppure carica un file locale per iniziare la tua prima esercitazione di trascrizione.'
              : 'Prova a modificare la ricerca o il filtro selezionato.'}
          </p>
          {sessions.length === 0 && (
            <button
              type="button"
              onClick={onNewSession}
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Crea Prima Sessione</span>
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white divide-y divide-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:divide-slate-800">
          {filtered.map((session) => {
            const isActive = session.id === activeSessionId;
            const accuracy = session.latestScore?.accuracyPercent ?? 0;
            const points = session.latestScore?.points ?? 0;

            return (
              <div
                key={session.id}
                className={`flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40 ${
                  isActive ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  {editingId === session.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingTitle}
                        autoFocus
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename(session.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="h-9 w-full max-w-md rounded-md border border-blue-500 bg-white px-2.5 text-sm font-semibold text-slate-900 focus:outline-none dark:bg-slate-950 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => commitRename(session.id)}
                        className="inline-flex h-9 items-center gap-1 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Salva</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => onSelectSession(session.id)}
                        className="truncate text-left text-sm font-semibold text-slate-900 hover:text-blue-600 dark:text-slate-100 dark:hover:text-blue-400"
                      >
                        {session.title}
                      </button>
                      <button
                        type="button"
                        onClick={() => startRename(session)}
                        aria-label={`Rinomina ${session.title}`}
                        className="rounded p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Zero-Pill unboxed metadata */}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>{session.sourceType === 'youtube' ? 'YouTube' : 'File Locale'}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {formatClockTime(session.durationSeconds)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {session.status === 'completata' ? 'Completata' : 'In corso'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{session.attempts.length} tentativi</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Aggiornata il{' '}
                      {new Date(session.updatedAt).toLocaleDateString('it-IT', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>

                {/* Right numeric stats & actions */}
                <div className="flex flex-wrap items-center gap-4">
                  <div className="text-right font-mono tabular-nums">
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {accuracy.toFixed(1)}%
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {points} pt
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onToggleComplete(session.id)}
                      className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      {session.status === 'completata' ? 'Riapri' : 'Completa'}
                    </button>

                    <button
                      type="button"
                      onClick={() => onSelectSession(session.id)}
                      className="h-9 rounded-lg bg-slate-900 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0 dark:bg-blue-600 dark:hover:bg-blue-500"
                    >
                      Apri Studio
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteSession(session.id)}
                      aria-label={`Elimina sessione ${session.title}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-red-900 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
