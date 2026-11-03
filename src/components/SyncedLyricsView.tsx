import React, { useEffect, useRef, useMemo } from 'react';
import { LyricLine, LyricsData } from '../types';
import { Sparkles, ArrowLeft } from 'lucide-react';

interface SyncedLyricsViewProps {
  lyricsData: LyricsData | null;
  currentPositionMs: number;
  isLoading: boolean;
  onSeek: (positionMs: number) => void;
  onBack: () => void;
}

export const SyncedLyricsView: React.FC<SyncedLyricsViewProps> = ({
  lyricsData,
  currentPositionMs,
  isLoading,
  onSeek,
  onBack,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);

  // Find index of the currently active line
  const activeIndex = useMemo(() => {
    if (!lyricsData || !lyricsData.parsed_lines || lyricsData.parsed_lines.length === 0) {
      return -1;
    }
    const lines = lyricsData.parsed_lines;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time_ms <= currentPositionMs) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [lyricsData, currentPositionMs]);

  // Smooth scroll active line to center
  useEffect(() => {
    if (activeLineRef.current && containerRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeIndex]);

  return (
    <div className="flex flex-col w-full h-[180px] text-white">
      {/* Header bar */}
      <div className="flex items-center justify-between pb-1.5 border-b border-white/10 mb-1">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-neutral-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back</span>
        </button>
        <div className="flex items-center gap-1 text-[11px] text-cyan-400 font-medium">
          <Sparkles className="w-3 h-3" />
          <span>Live Synced Lyrics</span>
        </div>
      </div>

      {/* Lyrics Content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden space-y-2.5 py-3 pr-1 text-center"
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-neutral-400 text-xs gap-1.5">
            <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span>Finding lyrics...</span>
          </div>
        ) : !lyricsData || lyricsData.parsed_lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-neutral-400 text-xs px-4">
            <p className="font-medium text-neutral-300">No synced lyrics found</p>
            <p className="text-[11px] text-neutral-500 mt-0.5">Playing: {lyricsData?.title || 'Unknown'}</p>
          </div>
        ) : (
          lyricsData.parsed_lines.map((line: LyricLine, index: number) => {
            const isActive = index === activeIndex;
            const isNear = Math.abs(index - activeIndex) <= 1;

            return (
              <div
                key={`${line.time_ms}-${index}`}
                ref={isActive ? activeLineRef : null}
                onClick={() => onSeek(line.time_ms)}
                className={`cursor-pointer transition-all duration-300 px-3 py-1 rounded-lg ${
                  isActive
                    ? 'text-white font-bold text-sm scale-105 bg-white/10 shadow-sm text-cyan-300'
                    : isNear
                    ? 'text-neutral-300 text-xs hover:text-white'
                    : 'text-neutral-500 text-[11px] hover:text-neutral-300 opacity-60'
                }`}
              >
                {line.text}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
