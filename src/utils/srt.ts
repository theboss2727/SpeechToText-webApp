import { TranscriptSegment } from '../types';

export function formatSrtTimestamp(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);

  const hh = String(hrs).padStart(2, '0');
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  const mmm = String(ms === 1000 ? 999 : ms).padStart(3, '0');

  return `${hh}:${mm}:${ss},${mmm}`;
}

export function formatClockTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function generateSrtContent(segments: TranscriptSegment[]): string {
  const valid = segments.filter((s) => s.text.trim().length > 0);
  return valid
    .map((seg, index) => {
      const start = formatSrtTimestamp(seg.startSec);
      const end = formatSrtTimestamp(Math.max(seg.endSec, seg.startSec + 0.5));
      return `${index + 1}\n${start} --> ${end}\n${seg.text.trim()}`;
    })
    .join('\n\n')
    .concat(valid.length > 0 ? '\n' : '');
}

export function parseSubtitleFile(content: string): TranscriptSegment[] {
  const normalized = content.replace(/\r\n/g, '\n').replace(/^WEBVTT[^\n]*\n+/, '').trim();
  if (!normalized) return [];

  const blocks = normalized.split(/\n{2,}/);
  const segments: TranscriptSegment[] = [];

  const parseTime = (raw: string): number => {
    const cleaned = raw.trim().replace(',', '.');
    const parts = cleaned.split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return 0;
  };

  blocks.forEach((block, idx) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    const timeLineIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeLineIdx !== -1) {
      const [startStr, endStr] = lines[timeLineIdx].split('-->');
      const startSec = parseTime(startStr);
      const endSec = parseTime(endStr.split(/\s+/)[0]);
      const text = lines
        .slice(timeLineIdx + 1)
        .join(' ')
        .replace(/<[^>]+>/g, '')
        .trim();
      if (text) {
        segments.push({
          id: `sub-${idx + 1}`,
          startSec,
          endSec: Math.max(endSec, startSec + 0.5),
          text,
        });
      }
    }
  });

  // Fallback for plain text files without timestamps
  if (segments.length === 0) {
    const sentences = normalized
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter(Boolean);

    let cursor = 0;
    sentences.forEach((sentence, idx) => {
      const wordCount = Math.max(2, sentence.split(/\s+/).length);
      const duration = Math.max(2.5, Number((wordCount * 0.45).toFixed(1)));
      segments.push({
        id: `txt-${idx + 1}`,
        startSec: Number(cursor.toFixed(2)),
        endSec: Number((cursor + duration).toFixed(2)),
        text: sentence,
      });
      cursor += duration;
    });
  }

  return segments;
}

export function downloadSrtFile(filename: string, srtContent: string): void {
  const safeName = filename
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '_') || 'ingage_sottotitoli';

  const blob = new Blob([srtContent], { type: 'application/x-subrip;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeName}.srt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
