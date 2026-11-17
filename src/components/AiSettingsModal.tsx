import { useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { GeminiModelId, GeminiModelOption, UserAiSettings } from '../types';

export const AVAILABLE_MODELS: GeminiModelOption[] = [
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    tierLabel: 'Consigliato · Free Tier',
    isFreeTier: true,
    description:
      'Multimodale nativo veloce e accurato. Ideale per trascrizioni verbatim e allineamento sottotitoli. Ampia quota gratuita in Google AI Studio.',
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    tierLabel: 'Ultra-Rapido · Free Tier',
    isFreeTier: true,
    description:
      'Massima velocità di risposta e latenza minima. Perfetto come alternativa ad alte prestazioni per sessioni quotidiane.',
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    tierLabel: 'Pro · Massima Precisione',
    isFreeTier: false,
    isPro: true,
    description:
      'Livello di fedeltà e ragionamento avanzato, ottimo per dialetti, audio con forte rumore di fondo o sovrapposizioni vocali. Richiede piano con fatturazione abilitata.',
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    tierLabel: 'Pro · Ampio Contesto',
    isFreeTier: false,
    isPro: true,
    description:
      'Ottima capacità analitica e finestra di contesto estesa per file audio molto lunghi.',
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    tierLabel: 'Free Tier · Stabile',
    isFreeTier: true,
    description:
      'Modello collaudato ed economico per l’estrazione e la trascrizione di base.',
  },
];

interface AiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserAiSettings;
  onSave: (updated: UserAiSettings) => void;
}

export function AiSettingsModal({
  isOpen,
  onClose,
  settings,
  onSave,
}: AiSettingsModalProps) {
  const [selectedModel, setSelectedModel] = useState<GeminiModelId>(settings.model);
  const [apiKey, setApiKey] = useState<string>(settings.apiKey || '');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      model: selectedModel,
      apiKey: apiKey.trim(),
    });
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 700);
  };

  const handleClearKey = () => {
    setApiKey('');
  };

  const hasPersonalKey = Boolean(apiKey.trim());

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
      />

      {/* Modal Dialog */}
      <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="ai-settings-title"
                className="text-base font-semibold text-slate-900 dark:text-slate-100"
              >
                Impostazioni Modello AI & API Key
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Scegli il modello di trascrizione e gestisci la tua quota personale
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Sezione 1: Selezione Modello */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Modello Gemini per Trascrizione & Sottotitoli
              </label>
              <span className="text-[11px] text-slate-400">
                Fallback automatico se il server è sotto carico
              </span>
            </div>

            <div className="grid gap-2.5">
              {AVAILABLE_MODELS.map((item) => {
                const isSelected = selectedModel === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedModel(item.id)}
                    className={`cursor-pointer rounded-xl border p-3.5 transition-all text-left flex items-start gap-3.5 ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20 dark:border-blue-500 dark:bg-blue-950/40 dark:ring-blue-500/20'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        isSelected
                          ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {item.name}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${
                            item.isFreeTier
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                              : 'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300'
                          }`}
                        >
                          {item.isFreeTier ? (
                            <Zap className="h-3 w-3" />
                          ) : (
                            <Sparkles className="h-3 w-3" />
                          )}
                          {item.tierLabel}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 leading-relaxed dark:text-slate-400">
                        {item.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sezione 2: BYOK - Personal API Key */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Chiave API Personale (Opzionale / BYOK)
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                {hasPersonalKey ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" /> Chiave Personale Attiva
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <ShieldCheck className="h-3 w-3" /> Chiave Server Predefinita
                  </span>
                )}
              </div>
            </div>

            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Inserisci la tua chiave API di <strong>Google AI Studio</strong> per beneficiare
              della tua quota personale gratuita (o per usare modelli Pro). La chiave viene salvata
              esclusivamente nel tuo browser (localStorage) e non viene ceduta a terzi.
            </p>

            <div className="mt-3 relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-20 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  title={showKey ? 'Nascondi chiave' : 'Mostra chiave'}
                  className="rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                {hasPersonalKey && (
                  <button
                    type="button"
                    onClick={handleClearKey}
                    title="Rimuovi chiave personale"
                    className="rounded p-1 text-red-400 hover:text-red-600 dark:hover:text-red-300"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px]">
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                <span>Genera chiave gratuita su Google AI Studio</span>
                <ExternalLink className="h-3 w-3" />
              </a>

              {hasPersonalKey && (
                <button
                  type="button"
                  onClick={handleClearKey}
                  className="text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 underline"
                >
                  Usa chiave server
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3.5 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 rounded-b-2xl">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            {selectedModel.includes('pro') && !hasPersonalKey && (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-3.5 w-3.5" />
                I modelli Pro richiedono una chiave con piano abilitato.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {savedSuccess ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Salvato!</span>
                </>
              ) : (
                <span>Salva Preferenze</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
