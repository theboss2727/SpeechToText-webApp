import { GeminiModelId, LearningSession, UserAiSettings } from '../types';

const SESSIONS_KEY = 'ingage_learning_sessions_v1';
const THEME_KEY = 'ingage_theme_v1';
const AI_SETTINGS_KEY = 'ingage_ai_settings_v1';

export const DEFAULT_AI_SETTINGS: UserAiSettings = {
  model: 'gemini-2.5-flash',
  apiKey: '',
};

export function loadAiSettings(): UserAiSettings {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY);
    if (!raw) return DEFAULT_AI_SETTINGS;
    const parsed = JSON.parse(raw);
    const validModels: GeminiModelId[] = [
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-2.5-pro',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
    ];
    const model = validModels.includes(parsed.model) ? parsed.model : 'gemini-2.5-flash';
    const apiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : '';
    return { model, apiKey };
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

export function saveAiSettings(settings: UserAiSettings): void {
  try {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error('Impossibile salvare le impostazioni AI in localStorage:', err);
  }
}

export function loadSessions(): LearningSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSessions(sessions: LearningSession[]): void {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch (err) {
    console.error('Impossibile salvare le sessioni in localStorage:', err);
  }
}

export function loadThemePreference(): 'light' | 'dark' {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  } catch {
    return 'light';
  }
}

export function saveThemePreference(theme: 'light' | 'dark'): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignore storage error
  }
}
