import React, { useMemo, useState } from 'react';
import { BarChart3, Plus } from 'lucide-react';
import { LearningAttempt, LearningSession } from '../types';

interface ProgressDashboardProps {
  sessions: LearningSession[];
  onOpenSession: (sessionId: string) => void;
  onNewSession: () => void;
}

interface FlattenedAttempt extends LearningAttempt {
  sessionId: string;
  sessionTitle: string;
  sourceType: 'youtube' | 'local';
}

type Timeframe = '7d' | '30d' | 'all';

export const ProgressDashboard: React.FC<ProgressDashboardProps> = ({
  sessions,
  onOpenSession,
  onNewSession,
}) => {
  const [timeframe, setTimeframe] = useState<Timeframe>('all');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const allAttempts = useMemo<FlattenedAttempt[]>(() => {
    const list: FlattenedAttempt[] = [];
    for (const session of sessions) {
      if (session.attempts.length > 0) {
        for (const att of session.attempts) {
          list.push({
            ...att,
            sessionId: session.id,
            sessionTitle: session.title,
            sourceType: session.sourceType,
          });
        }
      } else if (session.latestScore && session.latestScore.typedWordCount > 0) {
        // Include active in-progress session snapshot if no manual save yet
        list.push({
          id: `live-${session.id}`,
          timestamp: session.updatedAt,
          accuracyPercent: session.latestScore.accuracyPercent,
          points: session.latestScore.points,
          totalErrors: session.latestScore.totalErrors,
          substitutions: session.latestScore.substitutions,
          insertions: session.latestScore.insertions,
          deletions: session.latestScore.deletions,
          typedWordCount: session.latestScore.typedWordCount,
          durationPracticedSec: Math.round(session.durationSeconds || 30),
          wpm: session.latestScore.wpm,
          sessionId: session.id,
          sessionTitle: session.title,
          sourceType: session.sourceType,
        });
      }
    }

    return list.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [sessions]);

  const filteredAttempts = useMemo(() => {
    if (timeframe === 'all') return allAttempts;
    const days = timeframe === '7d' ? 7 : 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return allAttempts.filter((a) => new Date(a.timestamp).getTime() >= cutoff);
  }, [allAttempts, timeframe]);

  const kpis = useMemo(() => {
    if (filteredAttempts.length === 0) {
      return {
        avgAccuracy: 0,
        accuracyDelta: 0,
        bestPoints: 0,
        avgWpm: 0,
        totalWords: 0,
        totalMinutes: 0,
        completedCount: sessions.filter((s) => s.status === 'completata').length,
      };
    }

    const avgAccuracy =
      filteredAttempts.reduce((acc, a) => acc + a.accuracyPercent, 0) /
      filteredAttempts.length;

    const half = Math.max(1, Math.floor(filteredAttempts.length / 2));
    const earlyAvg =
      filteredAttempts.slice(0, half).reduce((acc, a) => acc + a.accuracyPercent, 0) / half;
    const recentSlice = filteredAttempts.slice(-half);
    const lateAvg =
      recentSlice.reduce((acc, a) => acc + a.accuracyPercent, 0) / recentSlice.length;

    const bestPoints = Math.max(...filteredAttempts.map((a) => a.points));
    const wpmEntries = filteredAttempts.filter((a) => a.wpm > 0);
    const avgWpm =
      wpmEntries.length > 0
        ? Math.round(wpmEntries.reduce((acc, a) => acc + a.wpm, 0) / wpmEntries.length)
        : 0;
    const totalWords = filteredAttempts.reduce((acc, a) => acc + a.typedWordCount, 0);
    const totalMinutes = Math.max(
      1,
      Math.round(
        filteredAttempts.reduce((acc, a) => acc + a.durationPracticedSec, 0) / 60
      )
    );

    return {
      avgAccuracy: Number(avgAccuracy.toFixed(1)),
      accuracyDelta:
        filteredAttempts.length > 1 ? Number((lateAvg - earlyAvg).toFixed(1)) : 0,
      bestPoints,
      avgWpm,
      totalWords,
      totalMinutes,
      completedCount: sessions.filter((s) => s.status === 'completata').length,
    };
  }, [filteredAttempts, sessions]);

  // SVG Chart dimensions
  const chartW = 720;
  const chartH = 240;
  const padL = 42;
  const padR = 20;
  const padT = 20;
  const padB = 34;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  const linePoints = useMemo(() => {
    if (filteredAttempts.length === 0) return [];
    const count = filteredAttempts.length;
    return filteredAttempts.map((att, idx) => {
      const x = count === 1 ? padL + plotW / 2 : padL + (idx / (count - 1)) * plotW;
      const y = padT + plotH - (Math.min(100, Math.max(0, att.accuracyPercent)) / 100) * plotH;
      return { x, y, att };
    });
  }, [filteredAttempts, plotW, plotH]);

  const pathD = useMemo(() => {
    if (linePoints.length === 0) return '';
    return linePoints
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');
  }, [linePoints]);

  const areaD = useMemo(() => {
    if (linePoints.length === 0) return '';
    const first = linePoints[0];
    const last = linePoints[linePoints.length - 1];
    return `${pathD} L ${last.x.toFixed(1)} ${(padT + plotH).toFixed(1)} L ${first.x.toFixed(
      1
    )} ${(padT + plotH).toFixed(1)} Z`;
  }, [linePoints, pathD, plotH]);

  const recentBars = useMemo(() => filteredAttempts.slice(-10), [filteredAttempts]);
  const maxBarErrors = useMemo(
    () => Math.max(5, ...recentBars.map((a) => a.totalErrors)),
    [recentBars]
  );

  return (
    <div className="space-y-6">
      {/* Header + Timeframe Controls */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Dashboard Progressi nel Tempo
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Analisi longitudinale della precisione di trascrizione, punteggio e riduzione delle
            discrepanze.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-1 dark:bg-slate-800">
          {(
            [
              ['7d', 'Ultimi 7 Giorni'],
              ['30d', 'Ultimi 30 Giorni'],
              ['all', 'Tutto lo Storico'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTimeframe(key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                timeframe === key
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 4-Column Full-Width KPI Strip */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Precisione Media
          </p>
          <p className="mt-2 font-mono text-3xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
            {kpis.avgAccuracy.toFixed(1)}%
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums dark:text-slate-400">
            {kpis.accuracyDelta > 0
              ? `+${kpis.accuracyDelta}% rispetto all’inizio`
              : kpis.accuracyDelta < 0
                ? `${kpis.accuracyDelta}% rispetto all’inizio`
                : 'Media su tutte le verifiche'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Miglior Punteggio
          </p>
          <p className="mt-2 font-mono text-3xl font-bold text-blue-600 tabular-nums dark:text-blue-400">
            {kpis.bestPoints}
            <span className="text-sm font-medium text-slate-400"> / 1000</span>
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums dark:text-slate-400">
            Velocità media: {kpis.avgWpm > 0 ? `${kpis.avgWpm} WPM` : '—'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Sessioni &amp; Tentativi
          </p>
          <p className="mt-2 font-mono text-3xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
            {sessions.length}
            <span className="text-sm font-medium text-slate-400">
              {' '}
              · {filteredAttempts.length} prove
            </span>
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums dark:text-slate-400">
            {kpis.completedCount} sessioni completate
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Volume di Studio
          </p>
          <p className="mt-2 font-mono text-3xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
            {kpis.totalWords}
            <span className="text-sm font-medium text-slate-400"> parole</span>
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums dark:text-slate-400">
            {kpis.totalMinutes} min di pratica registrata
          </p>
        </div>
      </section>

      {filteredAttempts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-slate-700 dark:bg-slate-900">
          <BarChart3
            className="mx-auto mb-3 h-9 w-9 text-slate-400 dark:text-slate-500"
            aria-hidden="true"
          />
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Nessun dato di progressione disponibile
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Completa una trascrizione nello Studio e salva il risultato per visualizzare i grafici
            dell&apos;andamento della precisione e delle discrepanze nel tempo.
          </p>
          <button
            type="button"
            onClick={onNewSession}
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Inizia Sessione</span>
          </button>
        </div>
      ) : (
        <>
          {/* Charts Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Trend Line Chart */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Andamento Precisione nel Tempo
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Percentuale di accuratezza su ogni tentativo registrato
                  </p>
                </div>
                {hoveredIdx !== null && linePoints[hoveredIdx] && (
                  <div className="text-right font-mono text-xs tabular-nums">
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      {linePoints[hoveredIdx].att.accuracyPercent.toFixed(1)}%
                    </span>
                    <span className="mx-1.5 text-slate-400">·</span>
                    <span className="text-slate-700 dark:text-slate-300">
                      {linePoints[hoveredIdx].att.points} pt
                    </span>
                  </div>
                )}
              </div>

              <div className="w-full overflow-x-auto">
                <svg
                  viewBox={`0 0 ${chartW} ${chartH}`}
                  className="h-60 w-full min-w-[460px]"
                  role="img"
                  aria-label="Grafico dell'andamento della precisione nel tempo"
                >
                  <defs>
                    <linearGradient id="ingageAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563EB" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#2563EB" stopOpacity="0.01" />
                    </linearGradient>
                  </defs>

                  {[0, 25, 50, 75, 100].map((tick) => {
                    const y = padT + plotH - (tick / 100) * plotH;
                    return (
                      <g key={tick}>
                        <line
                          x1={padL}
                          y1={y}
                          x2={chartW - padR}
                          y2={y}
                          stroke="currentColor"
                          className="text-slate-200 dark:text-slate-800"
                          strokeDasharray="3 3"
                        />
                        <text
                          x={padL - 8}
                          y={y + 4}
                          textAnchor="end"
                          className="fill-slate-400 font-mono text-[10px] tabular-nums"
                        >
                          {tick}%
                        </text>
                      </g>
                    );
                  })}

                  {areaD && <path d={areaD} fill="url(#ingageAreaGrad)" />}
                  {pathD && (
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#2563EB"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {linePoints.map((pt, idx) => (
                    <g
                      key={pt.att.id}
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                      className="cursor-pointer"
                      onClick={() => onOpenSession(pt.att.sessionId)}
                    >
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={hoveredIdx === idx ? 6 : 4}
                        className="fill-blue-600 stroke-white stroke-2 dark:fill-blue-400 dark:stroke-slate-900"
                      />
                      {(idx === 0 ||
                        idx === linePoints.length - 1 ||
                        hoveredIdx === idx) && (
                        <text
                          x={pt.x}
                          y={chartH - 10}
                          textAnchor="middle"
                          className="fill-slate-500 font-mono text-[10px] dark:fill-slate-400"
                        >
                          {new Date(pt.att.timestamp).toLocaleDateString('it-IT', {
                            day: '2-digit',
                            month: '2-digit',
                          })}
                        </text>
                      )}
                    </g>
                  ))}
                </svg>
              </div>
            </section>

            {/* Discrepancy Breakdown Chart */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Tipologia di Discrepanze
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ultime {recentBars.length} prove: sostituzioni, omissioni e inserimenti
                </p>
              </div>

              <div className="mt-4 flex h-48 items-end gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
                {recentBars.map((att, idx) => {
                  const totalH = Math.max(4, (att.totalErrors / maxBarErrors) * 100);
                  const subPct =
                    att.totalErrors > 0 ? (att.substitutions / att.totalErrors) * totalH : 0;
                  const delPct =
                    att.totalErrors > 0 ? (att.deletions / att.totalErrors) * totalH : 0;
                  const insPct =
                    att.totalErrors > 0 ? (att.insertions / att.totalErrors) * totalH : 0;

                  return (
                    <div
                      key={att.id}
                      title={`${att.sessionTitle}: ${att.totalErrors} errori (${att.substitutions} sost., ${att.deletions} omiss., ${att.insertions} extra)`}
                      className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                    >
                      <span className="font-mono text-[10px] text-slate-500 tabular-nums dark:text-slate-400">
                        {att.totalErrors}
                      </span>
                      <div className="flex w-full max-w-[28px] flex-1 flex-col justify-end overflow-hidden rounded-t-sm">
                        {att.totalErrors === 0 ? (
                          <div className="h-1.5 w-full rounded-xs bg-emerald-500/70" />
                        ) : (
                          <>
                            <div
                              style={{ height: `${insPct}%` }}
                              className="w-full bg-amber-500"
                            />
                            <div
                              style={{ height: `${delPct}%` }}
                              className="w-full bg-red-400"
                            />
                            <div
                              style={{ height: `${subPct}%` }}
                              className="w-full bg-red-600"
                            />
                          </>
                        )}
                      </div>
                      <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                        #{idx + 1}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-red-600" />
                  Sostituzioni
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-red-400" />
                  Omissioni
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-amber-500" />
                  Inserimenti
                </span>
              </div>
            </section>
          </div>

          {/* High-Density Attempt Log Table */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Registro Storico Verifiche
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
                    <th className="px-5 py-3 font-medium">Sessione</th>
                    <th className="px-4 py-3 font-medium">Sorgente</th>
                    <th className="px-4 py-3 text-right font-medium">Precisione</th>
                    <th className="px-4 py-3 text-right font-medium">Punteggio</th>
                    <th className="px-4 py-3 text-right font-medium">Discrepanze</th>
                    <th className="px-4 py-3 text-right font-medium">WPM</th>
                    <th className="px-5 py-3 text-right font-medium">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredAttempts
                    .slice()
                    .reverse()
                    .map((att) => (
                      <tr
                        key={att.id}
                        onClick={() => onOpenSession(att.sessionId)}
                        className="h-10 cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        <td className="max-w-[260px] truncate px-5 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                          {att.sessionTitle}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">
                          {att.sourceType === 'youtube' ? 'YouTube' : 'Locale'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                          {att.accuracyPercent.toFixed(1)}%
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-blue-600 tabular-nums dark:text-blue-400">
                          {att.points}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-red-600 tabular-nums dark:text-red-400">
                          {att.totalErrors}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-600 tabular-nums dark:text-slate-400">
                          {att.wpm > 0 ? att.wpm : '—'}
                        </td>
                        <td className="px-5 py-2.5 text-right font-mono text-slate-500 tabular-nums dark:text-slate-400">
                          {new Date(att.timestamp).toLocaleDateString('it-IT', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
