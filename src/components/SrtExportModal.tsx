import React, { useEffect, useState } from 'react';
import { Check, Copy, Download, Sparkles, X } from 'lucide-react';
import { TranscriptSegment } from '../types';
import { downloadSrtFile, formatSrtTimestamp, generateSrtContent } from '../utils/srt';
import { buildCorrectedSegmentsFromUserText } from '../utils/verification';

interface SrtExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionTitle: string;
  referenceSegments: TranscriptSegment[];
  userText: string;
  savedCorrectedSegments?: TranscriptSegment[];
  onSaveCorrectedSegments: (segments: TranscriptSegment[]) => void;
}

export const SrtExportModal: React.FC<SrtExportModalProps> = ({
  isOpen,
  onClose,
  sessionTitle,
  referenceSegments,
  userText,
  savedCorrectedSegments,
  onSaveCorrectedSegments,
}) => {
  const [editableSegments, setEditableSegments] = useState<TranscriptSegment[]>([]);
  const [viewMode, setViewMode] = useState<'editor' | 'preview'>('editor');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (savedCorrectedSegments && savedCorrectedSegments.length > 0) {
      setEditableSegments(savedCorrectedSegments.map((s) => ({ ...s })));
    } else if (userText.trim()) {
      setEditableSegments(
        buildCorrectedSegmentsFromUserText(referenceSegments, userText, false)
      );
    } else {
      setEditableSegments(referenceSegments.map((s) => ({ ...s })));
    }
  }, [isOpen, referenceSegments, userText, savedCorrectedSegments]);

  if (!isOpen) return null;

  const srtString = generateSrtContent(editableSegments);

  const handleApplyAllCorrections = () => {
    const corrected = referenceSegments.map((seg, idx) => ({
      id: editableSegments[idx]?.id || seg.id,
      startSec: editableSegments[idx]?.startSec ?? seg.startSec,
      endSec: editableSegments[idx]?.endSec ?? seg.endSec,
      text: seg.text,
    }));
    setEditableSegments(corrected);
    onSaveCorrectedSegments(corrected);
  };

  const handleApplySingleCorrection = (index: number) => {
    const refSeg = referenceSegments[index];
    if (!refSeg) return;
    const next = editableSegments.map((seg, i) =>
      i === index ? { ...seg, text: refSeg.text } : seg
    );
    setEditableSegments(next);
    onSaveCorrectedSegments(next);
  };

  const handleSegmentTextChange = (index: number, newText: string) => {
    const next = editableSegments.map((seg, i) =>
      i === index ? { ...seg, text: newText } : seg
    );
    setEditableSegments(next);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(srtString);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = () => {
    onSaveCorrectedSegments(editableSegments);
    downloadSrtFile(sessionTitle, srtString);
  };

  const discrepanciesCount = editableSegments.reduce((acc, seg, idx) => {
    const refText = referenceSegments[idx]?.text?.trim() ?? '';
    return seg.text.trim() !== refText ? acc + 1 : acc;
  }, 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="srt-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
    >
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div>
            <h2
              id="srt-modal-title"
              className="text-lg font-bold text-slate-900 dark:text-slate-100"
            >
              Esportazione Sottotitoli Corretti (.SRT)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {editableSegments.length} blocchi temporali ·{' '}
              {discrepanciesCount > 0
                ? `${discrepanciesCount} blocchi con differenze rispetto all’audio`
                : 'Tutti i blocchi allineati al testo di riferimento'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi finestra esportazione SRT"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-6 py-3 dark:border-slate-800 dark:bg-slate-950/50">
          <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('editor')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'editor'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Revisione &amp; Correzioni
            </button>
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'preview'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Anteprima File .SRT
            </button>
          </div>

          <button
            type="button"
            onClick={handleApplyAllCorrections}
            disabled={discrepanciesCount === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-45 whitespace-nowrap shrink-0 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/50"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Correggi Tutte le Discrepanze</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {viewMode === 'editor' ? (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {editableSegments.map((seg, idx) => {
                const refText = referenceSegments[idx]?.text?.trim() ?? '';
                const hasDiff = refText.length > 0 && seg.text.trim() !== refText;

                return (
                  <div key={seg.id} className="py-4 first:pt-1 last:pb-1">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          #{idx + 1}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {formatSrtTimestamp(seg.startSec)} --&gt; {formatSrtTimestamp(seg.endSec)}
                        </span>
                      </div>
                      {hasDiff ? (
                        <button
                          type="button"
                          onClick={() => handleApplySingleCorrection(idx)}
                          className="text-xs font-semibold text-red-600 hover:underline dark:text-red-400"
                        >
                          Applica testo corretto
                        </button>
                      ) : (
                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          Verificato
                        </span>
                      )}
                    </div>

                    <textarea
                      rows={2}
                      value={seg.text}
                      onChange={(e) => handleSegmentTextChange(idx, e.target.value)}
                      className={`w-full rounded-lg border px-3 py-2 text-sm leading-relaxed focus:outline-none ${
                        hasDiff
                          ? 'border-red-300 bg-red-50/40 text-slate-900 focus:border-red-500 dark:border-red-800/80 dark:bg-red-950/20 dark:text-slate-100'
                          : 'border-slate-200 bg-white text-slate-900 focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'
                      }`}
                    />

                    {hasDiff && (
                      <p className="mt-1.5 text-xs text-red-700 dark:text-red-300">
                        Riferimento audio:{' '}
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {refText}
                        </span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <pre className="rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-800 overflow-x-auto dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
              {srtString || 'Nessun sottotitolo disponibile.'}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-800">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                <span>Copiato</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" aria-hidden="true" />
                <span>Copia Testo SRT</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>Scarica Sottotitoli .SRT</span>
          </button>
        </div>
      </div>
    </div>
  );
};
