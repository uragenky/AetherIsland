import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LyricLine, LyricsData } from '../types';
import { Sparkles, ArrowLeft, Disc3, Languages } from 'lucide-react';
import { hasNonLatinScript, transliterateText } from '../utils/transliterate';

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
  const [showRomanized, setShowRomanized] = useState(true);

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
    <div className="flex flex-col w-full h-[195px] text-white">
      {/* Header bar */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-1">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white px-2 py-0.5 rounded-full hover:bg-white/10 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-1.5 text-xs font-medium text-cyan-400">
          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          <span className="tracking-wide">Live Synced Lyrics</span>
        </div>

        <button
          onClick={() => setShowRomanized((prev) => !prev)}
          className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full transition-all cursor-pointer border ${
            showRomanized
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
              : 'text-neutral-400 border-white/10 hover:text-white'
          }`}
          title="Toggle Latin / Romanized text for non-Latin lyrics"
        >
          <Languages className="w-3 h-3" />
          <span>Latin</span>
        </button>
      </div>

      {/* Lyrics Content with smooth mask gradients */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden space-y-3 py-4 text-center select-none"
        style={{
          maskImage:
            'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)',
        }}
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-neutral-400 text-xs gap-2">
            <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-neutral-400 font-medium">Fetching real-time lyrics...</span>
          </div>
        ) : !lyricsData || lyricsData.parsed_lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-neutral-400 text-xs px-4 gap-1">
            <Disc3 className="w-6 h-6 text-neutral-600 animate-spin" style={{ animationDuration: '6s' }} />
            <p className="font-semibold text-neutral-300 mt-1">No synchronized lyrics available</p>
            <p className="text-[11px] text-neutral-500">
              {lyricsData?.title ? `${lyricsData.title} • ${lyricsData.artist}` : 'Enjoy the music'}
            </p>
          </div>
        ) : (
          lyricsData.parsed_lines.map((line: LyricLine, index: number) => {
            const isActive = index === activeIndex;
            const isNear = Math.abs(index - activeIndex) <= 1;
            const isNonLatin = hasNonLatinScript(line.text);
            const romanized = showRomanized && isNonLatin ? transliterateText(line.text) : null;

            return (
              <div
                key={`${line.time_ms}-${index}`}
                ref={isActive ? activeLineRef : null}
                onClick={() => onSeek(line.time_ms)}
                className={`cursor-pointer transition-all duration-300 px-4 py-1.5 rounded-xl flex flex-col items-center justify-center ${
                  isActive
                    ? 'text-cyan-300 font-bold text-sm scale-105 bg-cyan-500/10 shadow-lg drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]'
                    : isNear
                    ? 'text-neutral-200 text-xs hover:text-white opacity-85'
                    : 'text-neutral-500 text-[11px] hover:text-neutral-300 opacity-45'
                }`}
              >
                <span>{line.text}</span>
                {romanized && (
                  <span
                    className={`text-[10px] font-normal tracking-wide italic mt-0.5 transition-colors ${
                      isActive ? 'text-sky-200/90' : 'text-neutral-400/80'
                    }`}
                  >
                    {romanized}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
