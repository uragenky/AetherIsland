import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { LyricsData, MediaSessionInfo } from '../types';
import { buildProcessedLines, findActiveLyricIndex } from '../utils/lyricsSync';

export const AMBIENT_LYRICS_GAP = 8;
export const AMBIENT_LYRICS_HEIGHT = 44;

interface AmbientLyricsProps {
  media: MediaSessionInfo;
  lyricsData: LyricsData | null;
  currentPositionMs: number;
  isAltHeld: boolean;
}

export const AmbientLyrics: React.FC<AmbientLyricsProps> = ({
  media,
  lyricsData,
  currentPositionMs,
  isAltHeld,
}) => {
  const offsetMs = useMemo(() => {
    try {
      const key = `circo_lyric_offset_${(media.artist || '').trim().toLowerCase()}_${(
        media.title || ''
      )
        .trim()
        .toLowerCase()}`;
      return parseInt(localStorage.getItem(key) || '0', 10) || 0;
    } catch {
      return 0;
    }
  }, [media.artist, media.title]);

  const processedLines = useMemo(() => buildProcessedLines(lyricsData), [lyricsData]);
  const activeIndex = useMemo(
    () => findActiveLyricIndex(processedLines, currentPositionMs, offsetMs),
    [processedLines, currentPositionMs, offsetMs]
  );
  const activeLine = activeIndex >= 0 ? processedLines[activeIndex] : null;

  return (
    <div
      className="flex items-center justify-center w-full pointer-events-none select-none"
      style={{ height: `${AMBIENT_LYRICS_HEIGHT}px` }}
    >
      {activeLine && (
        <motion.div
          key={`${activeLine.time_ms}-${activeLine.text}`}
          initial={{ opacity: 0, y: 4, filter: 'blur(2px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="line-clamp-2 text-center font-medium text-[13px] leading-snug"
          style={{
            color: isAltHeld ? '#a5f3fc' : '#7dd3fc',
            textShadow: isAltHeld
              ? '0 1px 3px rgba(0,0,0,0.95), 0 0 12px rgba(56,189,248,0.65)'
              : '0 1px 3px rgba(0,0,0,0.95), 0 0 8px rgba(56,189,248,0.35)',
          }}
        >
          {activeLine.text}
        </motion.div>
      )}
    </div>
  );
};
