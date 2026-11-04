import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LyricLine, LyricsData, MediaSessionInfo } from '../types';
import { ArrowLeft, Disc3, Languages, Play, Pause, Minimize2 } from 'lucide-react';
import { hasNonLatinScript, transliterateText } from '../utils/transliterate';

interface SyncedLyricsViewProps {
  media: MediaSessionInfo;
  lyricsData: LyricsData | null;
  currentPositionMs: number;
  isLoading: boolean;
  onSeek: (positionMs: number) => void;
  onPlayPause?: () => void;
  onBack: () => void;
  onCollapse?: () => void;
}

export const SyncedLyricsView: React.FC<SyncedLyricsViewProps> = ({
  media,
  lyricsData,
  currentPositionMs,
  isLoading,
  onSeek,
  onPlayPause,
  onBack,
  onCollapse,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const [showRomanized, setShowRomanized] = useState(true);

  // 550ms anticipation lead-in offset: displays next lyric before vocal starts so user can read ahead
  const LYRIC_LEAD_OFFSET_MS = 550;

  // Find index of the currently active line
  const activeIndex = useMemo(() => {
    if (!lyricsData || !lyricsData.parsed_lines || lyricsData.parsed_lines.length === 0) {
      return -1;
    }
    const lines = lyricsData.parsed_lines;
    const effectiveTime = currentPositionMs + LYRIC_LEAD_OFFSET_MS;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time_ms <= effectiveTime) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [lyricsData, currentPositionMs]);

  // Exact vertical center scroll alignment
  useEffect(() => {
    if (activeLineRef.current && containerRef.current) {
      const container = containerRef.current;
      const activeEl = activeLineRef.current;
      const targetScroll = activeEl.offsetTop - container.clientHeight / 2 + activeEl.clientHeight / 2;
      container.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: 'smooth',
      });
    }
  }, [activeIndex]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const progressPercent = media.duration_ms > 0
    ? Math.min(100, (currentPositionMs / media.duration_ms) * 100)
    : 0;

  const handleSliderClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (media.duration_ms <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(Math.floor(ratio * media.duration_ms));
  };

  return (
    <div className="flex flex-col w-full h-full text-white">
      {/* Header bar */}
      <div className="flex items-center justify-between pb-1.5 border-b border-white/10 mb-1 px-0.5">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-neutral-400 hover:text-white px-2 py-0.5 rounded-full hover:bg-white/10 transition-all cursor-pointer flex-shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back</span>
        </button>

        <div className="flex flex-col items-center justify-center min-w-0 max-w-[210px] text-center px-2">
          <span className="text-xs font-semibold text-white truncate max-w-full tracking-wide" title={media.title}>
            {media.title || lyricsData?.title || 'No Title'}
          </span>
          <span className="text-[10px] text-cyan-300/80 truncate max-w-full -mt-0.5" title={media.artist}>
            {media.artist || lyricsData?.artist || 'Unknown Artist'}
          </span>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
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

          {onCollapse && (
            <button
              onClick={onCollapse}
              className="p-1 text-neutral-400 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer ml-0.5"
              title="Minimize Island"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Lyrics Content with smooth mask gradients and precise center alignment */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-y-auto overflow-x-hidden space-y-2 py-12 text-center select-none"
        style={{
          maskImage:
            'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
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
                className={`cursor-pointer transition-all duration-300 px-3 py-1.5 rounded-xl flex flex-col items-center justify-center ${
                  isActive
                    ? 'text-cyan-300 font-bold text-sm bg-cyan-500/15 shadow-[0_0_12px_rgba(34,211,238,0.25)] drop-shadow-[0_0_6px_rgba(56,189,248,0.4)]'
                    : isNear
                    ? 'text-neutral-200 text-xs hover:text-white opacity-80'
                    : 'text-neutral-500 text-[11px] hover:text-neutral-300 opacity-40'
                }`}
              >
                <span>{line.text}</span>
                {romanized && (
                  <span
                    className={`text-[10px] font-normal tracking-wide italic mt-0.5 transition-colors ${
                      isActive ? 'text-sky-200/95 font-medium' : 'text-neutral-400/80'
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

      {/* Bottom Mini Progress Scrubber */}
      <div className="pt-1 border-t border-white/10 flex items-center gap-2 px-1 text-white select-none">
        {onPlayPause && (
          <button
            onClick={onPlayPause}
            className="p-1 text-cyan-400 hover:text-cyan-200 transition-colors flex-shrink-0 cursor-pointer"
            title={media.is_playing ? 'Pause' : 'Play'}
          >
            {media.is_playing ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
          </button>
        )}
        <span className="text-[10px] font-mono text-neutral-400 flex-shrink-0">
          {formatTime(currentPositionMs)}
        </span>
        <div
          onClick={handleSliderClick}
          className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden cursor-pointer relative"
          title="Click to seek"
        >
          <div
            className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-neutral-400 flex-shrink-0">
          {media.duration_ms > 0 ? formatTime(media.duration_ms) : '--:--'}
        </span>
      </div>
    </div>
  );
};
