import { DiffToken, MasteryTier, ScoreBreakdown, TranscriptSegment, VerificationMode } from '../types';

interface WordWithSegment {
  raw: string;
  normalized: string;
  segmentIndex: number;
}

function normalizeToken(token: string, strictPunctuation: boolean): string {
  const cleaned = token
    .normalize('NFC')
    .trim();

  if (strictPunctuation) {
    return cleaned;
  }

  return cleaned
    .toLowerCase()
    .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '')
    .replace(/['’`]/g, "'");
}

function tokenizeText(text: string, strictPunctuation: boolean): { raw: string; normalized: string }[] {
  if (!text.trim()) return [];
  const rawTokens = text
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return rawTokens
    .map((raw) => ({
      raw,
      normalized: normalizeToken(raw, strictPunctuation),
    }))
    .filter((t) => t.normalized.length > 0 || strictPunctuation);
}

export function flattenSegmentsToWords(
  segments: TranscriptSegment[],
  strictPunctuation: boolean
): WordWithSegment[] {
  const words: WordWithSegment[] = [];
  segments.forEach((seg, segIdx) => {
    const tokens = tokenizeText(seg.text, strictPunctuation);
    tokens.forEach((tok) => {
      words.push({
        raw: tok.raw,
        normalized: tok.normalized,
        segmentIndex: segIdx,
      });
    });
  });
  return words;
}

function computeAlignment(
  refWords: WordWithSegment[],
  typedWords: { raw: string; normalized: string }[],
  mode: VerificationMode
): DiffToken[] {
  if (typedWords.length === 0) {
    return [];
  }

  // In progressive mode, align user's typed words against a matching prefix window
  // so future untranscribed words do not flood the UI as errors while typing live.
  const refSlice =
    mode === 'progressive'
      ? refWords.slice(0, Math.min(refWords.length, Math.max(typedWords.length + 4, Math.ceil(typedWords.length * 1.2))))
      : refWords;

  const n = refSlice.length;
  const m = typedWords.length;

  // Guard for very long transcripts: use bounded window DP if n*m > 250000
  if (n * m > 250000) {
    const tokens: DiffToken[] = [];
    const maxLen = Math.max(n, m);
    for (let i = 0; i < maxLen; i++) {
      const r = refSlice[i];
      const t = typedWords[i];
      if (r && t) {
        if (r.normalized === t.normalized) {
          tokens.push({ id: `tok-${i}`, kind: 'match', typed: t.raw, expected: r.raw, segmentIndex: r.segmentIndex });
        } else {
          tokens.push({ id: `tok-${i}`, kind: 'substitution', typed: t.raw, expected: r.raw, segmentIndex: r.segmentIndex });
        }
      } else if (t && !r) {
        tokens.push({ id: `tok-${i}`, kind: 'insertion', typed: t.raw });
      } else if (r && !t && mode === 'full') {
        tokens.push({ id: `tok-${i}`, kind: 'deletion', expected: r.raw, segmentIndex: r.segmentIndex });
      }
    }
    return tokens;
  }

  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));

  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = refSlice[i - 1].normalized === typedWords[j - 1].normalized ? 0 : 1;
      const del = dp[i - 1][j] + 1;
      const ins = dp[i][j - 1] + 1;
      const sub = dp[i - 1][j - 1] + cost;
      dp[i][j] = Math.min(del, ins, sub);
    }
  }

  let endI = n;
  if (mode === 'progressive' && n > m) {
    // Find prefix endI in [0..n] that minimizes edit distance to all m typed words
    let bestCost = Infinity;
    for (let i = Math.max(0, m - 4); i <= n; i++) {
      if (dp[i][m] < bestCost) {
        bestCost = dp[i][m];
        endI = i;
      }
    }
  }

  const reversed: DiffToken[] = [];
  let i = endI;
  let j = m;
  let step = 0;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const isMatch = refSlice[i - 1].normalized === typedWords[j - 1].normalized;
      const expectedCost = dp[i - 1][j - 1] + (isMatch ? 0 : 1);
      if (dp[i][j] === expectedCost) {
        reversed.push({
          id: `d-${step++}`,
          kind: isMatch ? 'match' : 'substitution',
          typed: typedWords[j - 1].raw,
          expected: refSlice[i - 1].raw,
          segmentIndex: refSlice[i - 1].segmentIndex,
        });
        i--;
        j--;
        continue;
      }
    }

    if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      reversed.push({
        id: `d-${step++}`,
        kind: 'insertion',
        typed: typedWords[j - 1].raw,
      });
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      reversed.push({
        id: `d-${step++}`,
        kind: 'deletion',
        expected: refSlice[i - 1].raw,
        segmentIndex: refSlice[i - 1].segmentIndex,
      });
      i--;
    } else {
      break;
    }
  }

  return reversed.reverse();
}

export function evaluateTranscription(params: {
  segments: TranscriptSegment[];
  userText: string;
  strictPunctuation: boolean;
  mode: VerificationMode;
  elapsedTypingSeconds?: number;
}): { tokens: DiffToken[]; score: ScoreBreakdown } {
  const { segments, userText, strictPunctuation, mode, elapsedTypingSeconds = 0 } = params;
  const refWords = flattenSegmentsToWords(segments, strictPunctuation);
  const typedWords = tokenizeText(userText, strictPunctuation);

  const tokens = computeAlignment(refWords, typedWords, mode);

  let matchedWords = 0;
  let substitutions = 0;
  let insertions = 0;
  let deletions = 0;

  for (const tok of tokens) {
    if (tok.kind === 'match') matchedWords++;
    else if (tok.kind === 'substitution') substitutions++;
    else if (tok.kind === 'insertion') insertions++;
    else if (tok.kind === 'deletion') deletions++;
  }

  const totalErrors = substitutions + insertions + deletions;
  const evaluatedRefCount =
    mode === 'progressive'
      ? Math.max(1, matchedWords + substitutions + deletions)
      : Math.max(1, refWords.length);

  const rawAccuracy =
    typedWords.length === 0
      ? 0
      : Math.max(0, Math.min(100, (matchedWords / Math.max(evaluatedRefCount, typedWords.length)) * 100));

  const accuracyPercent = Number(rawAccuracy.toFixed(1));
  const werPercent =
    typedWords.length === 0
      ? 0
      : Number(Math.min(100, (totalErrors / evaluatedRefCount) * 100).toFixed(1));

  const coveragePercent =
    refWords.length === 0
      ? 0
      : Number(Math.min(100, (matchedWords / refWords.length) * 100).toFixed(1));

  // Score out of 1000: 82% accuracy + 18% coverage (or 100% accuracy in progressive if complete)
  const effectiveWeight = mode === 'progressive'
    ? accuracyPercent * 8.5 + coveragePercent * 1.5
    : accuracyPercent * 8.2 + coveragePercent * 1.8;

  const points = typedWords.length === 0 ? 0 : Math.round(Math.max(0, Math.min(1000, effectiveWeight)));

  const wpm =
    elapsedTypingSeconds > 4 && typedWords.length > 0
      ? Math.round((typedWords.length / elapsedTypingSeconds) * 60)
      : 0;

  let tier: MasteryTier = 'In Allenamento';
  if (accuracyPercent >= 95 && typedWords.length >= 3) tier = 'Eccellente';
  else if (accuracyPercent >= 85 && typedWords.length >= 3) tier = 'Ottimo';
  else if (accuracyPercent >= 70 && typedWords.length >= 3) tier = 'Buono';

  return {
    tokens,
    score: {
      accuracyPercent,
      points,
      werPercent,
      matchedWords,
      substitutions,
      insertions,
      deletions,
      totalErrors,
      referenceWordCount: refWords.length,
      typedWordCount: typedWords.length,
      coveragePercent,
      wpm,
      tier,
    },
  };
}

/**
 * Produces corrected text segments by aligning user text against reference segments,
 * allowing instant one-click correction of discrepancies for clean SRT export.
 */
export function buildCorrectedSegmentsFromUserText(
  referenceSegments: TranscriptSegment[],
  userText: string,
  useReferenceForErrors: boolean
): TranscriptSegment[] {
  if (referenceSegments.length === 0) {
    return userText.trim()
      ? [{ id: 'seg-1', startSec: 0, endSec: 5, text: userText.trim() }]
      : [];
  }

  if (useReferenceForErrors) {
    return referenceSegments.map((seg) => ({ ...seg }));
  }

  // Distribute user's typed words proportionally across the timed reference segments
  // while preserving segment timestamps so user edits remain exportable as SRT.
  const userWords = userText.trim().split(/\s+/).filter(Boolean);
  if (userWords.length === 0) {
    return referenceSegments.map((seg) => ({ ...seg }));
  }

  const refCounts = referenceSegments.map((seg) => Math.max(1, seg.text.trim().split(/\s+/).filter(Boolean).length));
  const totalRefWords = refCounts.reduce((acc, c) => acc + c, 0);

  let cursor = 0;
  return referenceSegments.map((seg, idx) => {
    if (idx === referenceSegments.length - 1) {
      const remaining = userWords.slice(cursor).join(' ');
      return { ...seg, text: remaining || seg.text };
    }
    const share = Math.round((refCounts[idx] / totalRefWords) * userWords.length);
    const slice = userWords.slice(cursor, cursor + Math.max(1, share)).join(' ');
    cursor += Math.max(1, share);
    return { ...seg, text: slice || seg.text };
  });
}
