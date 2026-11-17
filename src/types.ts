export type MediaSourceType = 'youtube' | 'local';

export type VerificationMode = 'progressive' | 'full';

export interface TranscriptSegment {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
}

export type DiffKind = 'match' | 'substitution' | 'insertion' | 'deletion';

export interface DiffToken {
  id: string;
  kind: DiffKind;
  typed?: string;
  expected?: string;
  segmentIndex?: number;
}

export type MasteryTier = 'Eccellente' | 'Ottimo' | 'Buono' | 'In Allenamento';

export interface ScoreBreakdown {
  accuracyPercent: number;
  points: number;
  werPercent: number;
  matchedWords: number;
  substitutions: number;
  insertions: number;
  deletions: number;
  totalErrors: number;
  referenceWordCount: number;
  typedWordCount: number;
  coveragePercent: number;
  wpm: number;
  tier: MasteryTier;
}

export interface LearningAttempt {
  id: string;
  timestamp: string;
  accuracyPercent: number;
  points: number;
  totalErrors: number;
  substitutions: number;
  insertions: number;
  deletions: number;
  typedWordCount: number;
  durationPracticedSec: number;
  wpm: number;
}

export type StreamMode = 'mp3' | 'youtube_iframe';

export interface LearningSession {
  id: string;
  title: string;
  sourceType: MediaSourceType;
  streamMode: StreamMode;
  streamNotice?: string;
  sourceUrl?: string;
  youtubeId?: string;
  author?: string;
  mediaId?: string;
  audioUrl?: string;
  downloadUrl?: string;
  durationSeconds: number;
  waveformPeaks: number[];
  language: string;
  referenceSegments: TranscriptSegment[];
  userText: string;
  correctedSegments?: TranscriptSegment[];
  strictPunctuation: boolean;
  verificationMode: VerificationMode;
  status: 'in_corso' | 'completata';
  createdAt: string;
  updatedAt: string;
  latestScore: ScoreBreakdown | null;
  attempts: LearningAttempt[];
  notes?: string;
}

export interface ExtractMediaResponse {
  mediaId?: string;
  title: string;
  author?: string;
  youtubeId?: string;
  sourceType: MediaSourceType;
  streamMode: StreamMode;
  streamNotice?: string;
  durationSeconds: number;
  audioUrl?: string;
  downloadUrl?: string;
  waveformPeaks: number[];
  captions?: TranscriptSegment[];
  captionSource?: 'youtube' | 'gemini' | 'none';
}

export interface TranscribeMediaResponse {
  fullText: string;
  segments: TranscriptSegment[];
  languageDetected?: string;
}

export type GeminiModelId =
  | 'gemini-2.5-flash'
  | 'gemini-2.0-flash'
  | 'gemini-2.5-pro'
  | 'gemini-1.5-pro'
  | 'gemini-1.5-flash';

export interface UserAiSettings {
  model: GeminiModelId;
  apiKey: string;
}

export interface GeminiModelOption {
  id: GeminiModelId;
  name: string;
  tierLabel: string;
  isFreeTier: boolean;
  isPro?: boolean;
  description: string;
}
