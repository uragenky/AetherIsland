import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { LyricsData, MediaSessionInfo, LyricsCandidate } from '../types';
import { Sparkles, Disc3, Languages, Play, Pause, ListMusic, Check } from 'lucide-react';
import { hasNonLatinScript, transliterateText } from '../utils/transliterate';

interface SyncedLyricsViewProps {
  media: MediaSessionInfo;
  lyricsData: LyricsData | null;
  currentPositionMs: number;
  isLoading: boolean;
  onSeek: (positionMs: number) => void;
  onPlayPause?: () => void;
  onBack: () => void;
  onLyricsChange?: (data: LyricsData) => void;
}

interface ProcessedLyricLine {
  time_ms: number;
  text: string;
  romanized: string | null;
}

export const SyncedLyricsView: React.FC<SyncedLyricsViewProps> = ({
  media,
  lyricsData,
  currentPositionMs,
  isLoading,
  onSeek,
  onPlayPause,
  onLyricsChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isUserScrollingRef = useRef(false);
  const userScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showRomanized, setShowRomanized] = useState(true);
  const [showCandidateModal, setShowCandidateModal] = useState(false);
  const [candidates, setCandidates] = useState<LyricsCandidate[]>([]);
  const [isSearchingCandidates, setIsSearchingCandidates] = useState(false);

  // Preference key for custom selected lyric
  const candidatePrefKey = useMemo(() => {
    const a = (media.artist || '').trim().toLowerCase();
    const t = (media.title || '').trim().toLowerCase();
    return `custom_lyrics_${a}_${t}`;
  }, [media.artist, media.title]);

  const [savedCustomId, setSavedCustomId] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem(candidatePrefKey);
      return saved ? parseInt(saved, 10) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(candidatePrefKey);
      setSavedCustomId(saved ? parseInt(saved, 10) : null);
    } catch {
      setSavedCustomId(null);
    }
  }, [candidatePrefKey]);

  const handleToggleCandidates = async () => {
    if (showCandidateModal) {
      setShowCandidateModal(false);
      return;
    }

    setShowCandidateModal(true);
    setIsSearchingCandidates(true);
    try {
      const results = await invoke<LyricsCandidate[]>('search_lyrics_candidates', {
        title: media.title,
        artist: media.artist,
      });
      setCandidates(results);
    } catch {
      setCandidates([]);
    } finally {
      setIsSearchingCandidates(false);
    }
  };

  const handleSelectCandidate = async (c: LyricsCandidate) => {
    try {
      const data = await invoke<LyricsData>('get_lyrics_by_id', {
        id: c.id,
        title: media.title,
        artist: media.artist,
      });
      localStorage.setItem(candidatePrefKey, c.id.toString());
      setSavedCustomId(c.id);
      onLyricsChange?.(data);
      setShowCandidateModal(false);
    } catch (err) {
      console.error('Failed to apply lyrics candidate', err);
    }
  };

  const handleResetToDefault = async () => {
    try {
      localStorage.removeItem(candidatePrefKey);
      setSavedCustomId(null);
      const durationSecs = media.duration_ms > 0 ? Math.floor(media.duration_ms / 1000) : undefined;
      const data = await invoke<LyricsData>('get_lyrics', {
        title: media.title,
        artist: media.artist,
        durationSecs,
      });
      onLyricsChange?.(data);
      setShowCandidateModal(false);
    } catch (err) {
      console.error('Failed to reset lyrics', err);
    }
  };

  // Storage key for per-track manual offset compensation
  const storageKey = useMemo(() => {
    const a = (media.artist || '').trim().toLowerCase();
    const t = (media.title || '').trim().toLowerCase();
    return `circo_lyric_offset_${a}_${t}`;
  }, [media.artist, media.title]);

  const [userOffsetMs, setUserOffsetMs] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? parseInt(saved, 10) || 0 : 0;
    } catch {
      return 0;
    }
  });

  // Reload saved offset when track changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      setUserOffsetMs(saved ? parseInt(saved, 10) || 0 : 0);
    } catch {
      setUserOffsetMs(0);
    }
  }, [storageKey]);

  const handleAdjustOffset = (deltaMs: number) => {
    setUserOffsetMs((prev) => {
      const next = Math.max(-15000, Math.min(15000, prev + deltaMs));
      try {
        localStorage.setItem(storageKey, next.toString());
      } catch {}
      return next;
    });
  };

  const handleResetOffset = () => {
    setUserOffsetMs(0);
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  };

  // Precompute transliteration once per track to eliminate runtime CPU overhead
  const processedLines = useMemo<ProcessedLyricLine[]>(() => {
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
  }, [lyricsData]);

  // Subtle anticipation (250ms) + user offset
  const BASE_LEAD_MS = 250;

  // Active line index lookup
  const activeIndex = useMemo(() => {
    if (processedLines.length === 0) return -1;
    const effectiveTime = currentPositionMs + BASE_LEAD_MS + userOffsetMs;
    let idx = -1;
    for (let i = 0; i < processedLines.length; i++) {
      if (processedLines[i].time_ms <= effectiveTime) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [processedLines, currentPositionMs, userOffsetMs]);

  // Smooth centering scroll handler using browser native centering
  const scrollToLine = useCallback((index: number) => {
    if (index < 0) return;
    const lineEl = lineRefs.current[index];
    if (!lineEl) return;

    lineEl.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    });
  }, []);

  // Auto-scroll when activeIndex changes unless user is manually inspecting
  useEffect(() => {
    if (!isUserScrollingRef.current && activeIndex >= 0) {
      scrollToLine(activeIndex);
    }
  }, [activeIndex, scrollToLine]);

  // Center on mount when lyrics view opens
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeIndex >= 0) {
        scrollToLine(activeIndex);
      }
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  // Detect user manual scroll/wheel to pause auto-scrolling temporarily
  const handleUserWheel = () => {
    isUserScrollingRef.current = true;
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }
    userScrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
      if (activeIndex >= 0) {
        scrollToLine(activeIndex);
      }
    }, 2500);
  };

  useEffect(() => {
    return () => {
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current);
      }
    };
  }, []);

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
    <div className="flex flex-col w-full h-full text-white justify-between">
      {/* Sub-toolbar */}
      <div className="flex items-center justify-between pb-1 border-b border-white/10 mb-1 px-1 flex-shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-medium text-cyan-400">
          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          <span className="tracking-wide text-[11px]">Live Synced Lyrics</span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Per-track Manual Sync Offset: [-] [±0.00s] [+] */}
          <div
            className="flex items-center bg-cyan-500/10 border border-cyan-500/20 rounded-full px-1 py-0.5 text-[10px] text-neutral-300"
            title="Adjust sync offset: [-] delay / [+] advance (0.25s). Click number to reset."
          >
            <button
              onClick={() => handleAdjustOffset(-250)}
              className="w-4 h-4 flex items-center justify-center text-neutral-400 hover:text-cyan-300 active:scale-90 transition-all cursor-pointer text-xs font-bold rounded-full hover:bg-cyan-500/20"
              title="Delay lyrics (-0.25s)"
            >
              -
            </button>
            <button
              onClick={handleResetOffset}
              className={`px-1 font-mono text-[9px] cursor-pointer transition-colors ${
                userOffsetMs !== 0 ? 'text-cyan-300 font-semibold' : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="Click to reset offset to 0.00s"
            >
              {userOffsetMs > 0 ? `+${(userOffsetMs / 1000).toFixed(2)}s` : `${(userOffsetMs / 1000).toFixed(2)}s`}
            </button>
            <button
              onClick={() => handleAdjustOffset(250)}
              className="w-4 h-4 flex items-center justify-center text-neutral-400 hover:text-cyan-300 active:scale-90 transition-all cursor-pointer text-xs font-bold rounded-full hover:bg-cyan-500/20"
              title="Advance lyrics (+0.25s)"
            >
              +
            </button>
          </div>

          <button
            onClick={() => setShowRomanized((prev) => !prev)}
            className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full transition-all cursor-pointer border active:scale-95 ${
              showRomanized
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                : 'text-neutral-400 border-white/10 hover:text-white hover:bg-white/5'
            }`}
            title="Toggle Latin / Romanized text for non-Latin lyrics"
          >
            <Languages className="w-3 h-3" />
            <span>Latin</span>
          </button>

          <button
            onClick={handleToggleCandidates}
            className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full transition-all cursor-pointer border active:scale-95 ${
              showCandidateModal
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                : 'text-neutral-400 border-white/10 hover:text-white hover:bg-white/5'
            }`}
            title="Search & select alternative lyrics from LRCLIB"
          >
            <ListMusic className="w-3 h-3" />
            <span>Lyrics</span>
          </button>
        </div>
      </div>

      {showCandidateModal ? (
        <div className="h-[142px] overflow-y-auto px-1 py-1 space-y-1.5 select-none scrollbar-thin">
          <div className="flex items-center justify-between text-[11px] px-1 text-neutral-400">
            <span>Select lyric version:</span>
            {savedCustomId && (
              <button
                onClick={handleResetToDefault}
                className="text-cyan-400 hover:text-cyan-300 text-[10px] underline cursor-pointer"
              >
                Reset to default
              </button>
            )}
          </div>
          {isSearchingCandidates ? (
            <div className="flex flex-col items-center justify-center h-[100px] text-xs text-neutral-400 gap-2">
              <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-[11px]">Searching LRCLIB database...</span>
            </div>
          ) : candidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[100px] text-xs text-neutral-400 gap-1.5">
              <span>No alternative versions found</span>
              <button
                onClick={() => setShowCandidateModal(false)}
                className="text-cyan-400 hover:text-cyan-300 text-[10px] underline cursor-pointer"
              >
                Back to active lyrics
              </button>
            </div>
          ) : (
            candidates.map((c) => {
              const isSelected = savedCustomId === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => handleSelectCandidate(c)}
                  className={`flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer transition-all active:scale-[0.98] ${
                    isSelected
                      ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-200'
                      : 'bg-white/5 border-white/10 hover:bg-white/10 text-neutral-300'
                  }`}
                >
                  <div className="flex flex-col min-w-0 pr-2 text-left">
                    <span className="font-semibold truncate text-[11px] text-white">
                      {c.track_name}
                    </span>
                    <span className="text-[10px] text-neutral-400 truncate">
                      {c.artist_name} {c.album_name ? `• ${c.album_name}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-full border ${
                        c.has_synced
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                      }`}
                    >
                      {c.has_synced ? 'Synced' : 'Plain'}
                    </span>
                    {c.duration && (
                      <span className="text-[10px] font-mono text-neutral-400">
                        {Math.floor(c.duration / 60)}:{(Math.floor(c.duration % 60)).toString().padStart(2, '0')}
                      </span>
                    )}
                    {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 ml-0.5" />}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Lyrics Content with bounded height, smooth mask gradients, and hardware-accelerated transitions */
        <div
          ref={containerRef}
          onWheel={handleUserWheel}
          onTouchMove={handleUserWheel}
          className="h-[142px] overflow-y-auto overflow-x-hidden space-y-2 py-16 text-center select-none"
          style={{
            maskImage:
              'linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)',
          }}
        >
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-neutral-400 text-xs gap-2">
              <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-neutral-400 font-medium">Fetching real-time lyrics...</span>
            </div>
          ) : processedLines.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-neutral-400 text-xs px-4 gap-1">
              <Disc3 className="w-6 h-6 text-neutral-600 animate-spin" style={{ animationDuration: '6s' }} />
              <p className="font-semibold text-neutral-300 mt-1">No synchronized lyrics available</p>
              <p className="text-[11px] text-neutral-500">
                {lyricsData?.title ? `${lyricsData.title} • ${lyricsData.artist}` : 'Enjoy the music'}
              </p>
            </div>
          ) : (
            processedLines.map((line: ProcessedLyricLine, index: number) => {
              const isActive = index === activeIndex;
              const isNear = Math.abs(index - activeIndex) <= 1;
              const romanized = showRomanized ? line.romanized : null;

              return (
                <div
                  key={`${line.time_ms}-${index}`}
                  ref={(el) => {
                    lineRefs.current[index] = el;
                  }}
                  onClick={() => onSeek(line.time_ms)}
                  style={{
                    transform: isActive
                      ? 'scale(1.06) translateZ(0)'
                      : isNear
                      ? 'scale(0.98) translateZ(0)'
                      : 'scale(0.93) translateZ(0)',
                    opacity: isActive ? 1 : isNear ? 0.65 : 0.28,
                    color: isActive ? '#38bdf8' : isNear ? '#f1f5f9' : '#94a3b8',
                    backgroundColor: isActive ? 'rgba(6, 182, 212, 0.12)' : 'transparent',
                    borderColor: isActive ? 'rgba(56, 189, 248, 0.28)' : 'transparent',
                    transition:
                      'transform 320ms cubic-bezier(0.2, 0.9, 0.3, 1), opacity 260ms ease, color 260ms ease, background-color 260ms ease, border-color 260ms ease',
                    willChange: 'transform, opacity',
                  }}
                  className={`cursor-pointer px-3 py-1.5 rounded-xl border flex flex-col items-center justify-center text-[13px] leading-snug ${
                    isActive ? 'font-semibold' : 'font-normal'
                  }`}
                >
                  <span>{line.text}</span>
                  {romanized && (
                    <span
                      style={{
                        opacity: isActive ? 0.95 : 0.7,
                        color: isActive ? '#bae6fd' : '#94a3b8',
                        transition: 'color 260ms ease, opacity 260ms ease',
                      }}
                      className="text-[10px] font-normal tracking-wide italic mt-0.5"
                    >
                      {romanized}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Bottom Mini Progress Scrubber */}
      <div className="pt-2 border-t border-white/10 flex items-center gap-2 px-1 text-white select-none flex-shrink-0">
        {onPlayPause && (
          <button
            onClick={onPlayPause}
            className="p-1 text-cyan-400 hover:text-cyan-200 active:scale-90 transition-all flex-shrink-0 cursor-pointer"
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
            className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full"
            style={{
              width: `${progressPercent}%`,
              transition: 'width 100ms linear',
            }}
          />
        </div>
        <span className="text-[10px] font-mono text-neutral-400 flex-shrink-0">
          {media.duration_ms > 0 ? formatTime(media.duration_ms) : '--:--'}
        </span>
      </div>
    </div>
  );
};
