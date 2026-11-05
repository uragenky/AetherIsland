import { LyricsData } from '../types';
import { hasNonLatinScript, transliterateText } from './transliterate';

export interface ProcessedLyricLine {
  time_ms: number;
  text: string;
  romanized: string | null;
}

export const LYRIC_BASE_LEAD_MS = 250;

export function buildProcessedLines(lyricsData: LyricsData | null): ProcessedLyricLine[] {
  if (!lyricsData?.parsed_lines || lyricsData.parsed_lines.length === 0) {
    return [];
  }

  return lyricsData.parsed_lines.map((line) => {
    const isNonLatin = hasNonLatinScript(line.text);
    return {
      time_ms: line.time_ms,
      text: line.text,
      romanized: isNonLatin ? transliterateText(line.text) : null,
    };
  });
}

export function findActiveLyricIndex(
  lines: ProcessedLyricLine[],
  positionMs: number,
  offsetMs = 0
): number {
  if (lines.length === 0) return -1;

  const effectiveTime = positionMs + LYRIC_BASE_LEAD_MS + offsetMs;
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time_ms <= effectiveTime) {
      idx = i;
    } else {
      break;
    }
  }
  return idx;
}
