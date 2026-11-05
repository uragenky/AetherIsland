import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { EyesCompanion } from './EyesCompanion';
import { MediaController } from './MediaController';
import { SyncedLyricsView } from './SyncedLyricsView';
import { SystemDashboard } from './SystemDashboard';
import {
  IslandMode,
  SystemMetrics,
  MediaSessionInfo,
  LyricsData,
  VisibleStatsConfig,
  DEFAULT_VISIBLE_STATS,
} from '../types';
import {
  Activity,
  Music2,
  Disc,
  Minimize2,
  Cpu,
  MemoryStick,
  Gpu,
  ArrowDown,
  ArrowUp,
  BatteryCharging,
  BatteryFull,
  BatteryMedium,
  BatteryLow,
  Mic2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
} from 'lucide-react';
import { hasNonLatinScript, transliterateText } from '../utils/transliterate';

const formatSpeed = (kbps: number) => {
  if (kbps >= 1024) {
    return `${(kbps / 1024).toFixed(1)}M`;
  }
  return `${kbps.toFixed(0)}K`;
};

interface DynamicIslandProps {
  metrics: SystemMetrics;
  media: MediaSessionInfo;
  lyricsData: LyricsData | null;
  isLyricsLoading: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (posMs: number) => void;
  onLyricsChange?: (data: LyricsData) => void;
}

export const DynamicIsland: React.FC<DynamicIslandProps> = ({
  metrics,
  media,
  lyricsData,
  isLyricsLoading,
  onPlayPause,
  onNext,
  onPrev,
  onSeek,
  onLyricsChange,
}) => {
  const [mode, setMode] = useState<IslandMode>('compact');
  const [activeTab, setActiveTab] = useState<'media' | 'system'>('media');
  const [dockStatus, setDockStatus] = useState<'top' | 'bottom' | 'floating'>('top');
  const [showIdleStats, setShowIdleStats] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [volumeFeedback, setVolumeFeedback] = useState<'up' | 'down' | null>(null);
  const volumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visibleStats, setVisibleStats] = useState<VisibleStatsConfig>(() => {
    try {
      const saved = localStorage.getItem('aether_visible_stats');
      if (saved) {
        return { ...DEFAULT_VISIBLE_STATS, ...JSON.parse(saved) };
      }
    } catch {}
    return DEFAULT_VISIBLE_STATS;
  });

  const handleToggleStat = (key: keyof VisibleStatsConfig) => {
    setVisibleStats((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem('aether_visible_stats', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const isMediaActive = Boolean(media.has_media && media.is_playing);
  const hasBattery = metrics.battery_percentage !== undefined && metrics.battery_percentage !== null;

  // Calculate dynamic width for compact stats pill based on visible metrics
  const statsWidth = React.useMemo(() => {
    let contentWidth = 0;
    let count = 0;
    if (visibleStats.cpu) {
      contentWidth += 40;
      count++;
    }
    if (visibleStats.ram) {
      contentWidth += 40;
      count++;
    }
    if (visibleStats.gpu) {
      contentWidth += 40;
      count++;
    }
    if (visibleStats.battery && hasBattery) {
      contentWidth += 42;
      count++;
    }
    if (visibleStats.net) {
      contentWidth += 72; // 35 down + 35 up + 2 gap
      count++;
    }

    if (count === 0) {
      return 84;
    }

    // Concept A: Perfectly Symmetric Partitioned HUD
    // Left padding (12px) + eyes (~30px) + space to divider (10px) + divider (1.5px) + space to first stat (10px) + right padding (12px) = 75.5px (~76px)
    const basePillWidth = 76;
    const gapWidth = Math.max(0, count - 1) * 6;
    return Math.max(120, basePillWidth + contentWidth + gapWidth);
  }, [visibleStats, hasBattery]);

  // Listen to real-time window movement & edge snap state from Tauri backend
  useEffect(() => {
    invoke<string>('get_dock_status')
      .then((status) => {
        if (status === 'top' || status === 'bottom' || status === 'floating') {
          setDockStatus(status);
        }
      })
      .catch(() => setDockStatus('top'));

    const unlistenSnap = listen<string>('edge-snap-status', (event) => {
      const payload = event.payload;
      if (payload === 'top' || payload === 'bottom' || payload === 'floating') {
        setDockStatus(payload);
      }
    });

    const unlistenDashboard = listen('menu-toggle-dashboard', () => {
      setMode((prev) => (prev === 'compact' ? 'expanded' : 'compact'));
    });

    const unlistenStats = listen('menu-toggle-stats', () => {
      setShowIdleStats((prev) => !prev);
    });

    const unlistenMenuStat = listen<string>('menu-toggle-stat', (event) => {
      const statKey = event.payload as keyof VisibleStatsConfig;
      if (statKey && ['cpu', 'ram', 'gpu', 'battery', 'net'].includes(statKey)) {
        handleToggleStat(statKey);
      }
    });

    return () => {
      unlistenSnap.then((f) => f());
      unlistenDashboard.then((f) => f());
      unlistenStats.then((f) => f());
      unlistenMenuStat.then((f) => f());
    };
  }, []);

  // Dynamically resize and re-center OS native window when mode changes
  useEffect(() => {
    const resizeWindow = async () => {
      try {
        const isDocked = (dockStatus === 'top' || dockStatus === 'bottom') && !isDragging;
        const earBuffer = isDocked ? 30.0 : 0.0;
        if (mode === 'compact') {
          if (isMediaActive) {
            await invoke('set_island_window_size', { width: 370.0 + earBuffer, height: 38.0, yOffset: 0.0 });
          } else if (showIdleStats) {
            await invoke('set_island_window_size', { width: statsWidth + earBuffer, height: 38.0, yOffset: 0.0 });
          } else {
            await invoke('set_island_window_size', { width: 84.0 + earBuffer, height: 38.0, yOffset: 0.0 });
          }
        } else {
          await invoke('set_island_window_size', { width: 430.0 + earBuffer, height: 276.0, yOffset: 0.0 });
        }
      } catch {
        // Ignored in non-windowed environments
      }
    };
    resizeWindow();
  }, [mode, isMediaActive, showIdleStats, statsWidth, dockStatus, isDragging]);

  const toggleExpand = () => {
    if (mode === 'compact') {
      setMode('expanded');
    } else {
      setMode('compact');
    }
  };

  const hasLyrics = Boolean(lyricsData && lyricsData.parsed_lines && lyricsData.parsed_lines.length > 0);

  // Drag threshold handler to avoid swallowing clicks and double-clicks
  const dragStartRef = useRef<{ x: number; y: number; isDown: boolean } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Middle-click (wheel button) triggers quick play/pause or mute
    if (e.button === 1) {
      e.preventDefault();
      if (isMediaActive) {
        onPlayPause();
      } else {
        invoke('toggle_mute').catch(() => {});
      }
      return;
    }

    if (e.button === 0) {
      invoke('force_topmost').catch(() => {});
      dragStartRef.current = { x: e.screenX, y: e.screenY, isDown: true };
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragStartRef.current && dragStartRef.current.isDown) {
      const dist = Math.hypot(e.screenX - dragStartRef.current.x, e.screenY - dragStartRef.current.y);
      if (dist > 5) {
        dragStartRef.current.isDown = false;
        setIsDragging(true);
        invoke<string>('start_window_drag')
          .then((status) => {
            if (status === 'top' || status === 'bottom' || status === 'floating') {
              setDockStatus(status);
            }
          })
          .catch(() => {})
          .finally(() => {
            setIsDragging(false);
          });
      }
    }
  };

  // Mouse wheel volume scrubber on compact pill
  const handleWheel = (e: React.WheelEvent) => {
    if (mode === 'compact') {
      const steps = e.deltaY < 0 ? 1 : -1;
      invoke('change_volume', { steps }).catch(() => {});
      setVolumeFeedback(steps > 0 ? 'up' : 'down');
      if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
      volumeTimerRef.current = setTimeout(() => {
        setVolumeFeedback(null);
      }, 850);
    }
  };

  const handlePointerUp = () => {
    if (dragStartRef.current) {
      dragStartRef.current.isDown = false;
    }
    setIsDragging(false);
  };

  // Ensure drag release executes snapping reliably on pointer release
  useEffect(() => {
    const handleGlobalRelease = () => {
      if (dragStartRef.current?.isDown || isDragging) {
        if (dragStartRef.current) dragStartRef.current.isDown = false;
        setTimeout(() => {
          invoke<string>('snap_island')
            .then((status) => {
              if (status === 'top' || status === 'bottom' || status === 'floating') {
                setDockStatus(status);
              }
            })
            .catch(() => {})
            .finally(() => {
              setIsDragging(false);
            });
        }, 35);
      }
    };
    window.addEventListener('pointerup', handleGlobalRelease);
    window.addEventListener('mouseup', handleGlobalRelease);
    return () => {
      window.removeEventListener('pointerup', handleGlobalRelease);
      window.removeEventListener('mouseup', handleGlobalRelease);
    };
  }, [isDragging]);

  const displayTrack = media.title ? `${media.title}${media.artist ? ` — ${media.artist}` : ''}` : 'No Track Playing';
  const romajiTrack = hasNonLatinScript(displayTrack) ? transliterateText(displayTrack) : null;

  const isDockTop = dockStatus === 'top' && !isDragging;
  const isDockBottom = dockStatus === 'bottom' && !isDragging;
  const isFloating = !isDockTop && !isDockBottom;

  const [isHovered, setIsHovered] = useState(false);

  const pillWidth =
    mode === 'compact'
      ? isMediaActive
        ? 370
        : showIdleStats
        ? statsWidth
        : 84
      : 430;
  const pillHeight = mode === 'compact' ? 38 : 276;

  // Floating outline brightness (Restored to original level: 0.30 idle, 0.55 hover)
  const floatingOutlineColor = isMediaActive
    ? isHovered
      ? 'rgba(56, 189, 248, 0.75)'
      : 'rgba(56, 189, 248, 0.42)'
    : metrics.cpu_usage > 80
    ? isHovered
      ? 'rgba(251, 113, 133, 0.75)'
      : 'rgba(251, 113, 133, 0.42)'
    : isHovered
    ? 'rgba(255, 255, 255, 0.55)'
    : 'rgba(255, 255, 255, 0.30)';

  // Docked outline: Hidden by default when idle, only shows on hover or high CPU alert
  const showDockedOutline = isHovered || metrics.cpu_usage > 80;
  const dockedStrokeColor = showDockedOutline
    ? metrics.cpu_usage > 80
      ? 'rgba(251, 113, 133, 0.65)'
      : isMediaActive
      ? 'rgba(56, 189, 248, 0.65)'
      : 'rgba(255, 255, 255, 0.45)'
    : 'transparent';

  // Continuous vector path for docked modes (ears + body silhouette)
  const dockedPath = useMemo(() => {
    if (isFloating) return '';
    const r = mode === 'compact' ? 19 : 24;
    const wingW = 14;
    const wingH = 10;
    const w = pillWidth;
    const h = pillHeight;

    if (isDockTop) {
      // Inset stroke by 0.5px so it remains 100% inside window bounds
      return [
        `M ${-wingW} 0`,
        `C ${-wingW * 0.45} 0 0.5 ${wingH * 0.45} 0.5 ${wingH}`,
        `L 0.5 ${h - r}`,
        `A ${r - 0.5} ${r - 0.5} 0 0 0 ${r} ${h - 0.5}`,
        `L ${w - r} ${h - 0.5}`,
        `A ${r - 0.5} ${r - 0.5} 0 0 0 ${w - 0.5} ${h - r}`,
        `L ${w - 0.5} ${wingH}`,
        `C ${w - 0.5} ${wingH * 0.45} ${w + wingW * 0.55} 0 ${w + wingW} 0`,
      ].join(' ');
    }

    if (isDockBottom) {
      return [
        `M ${-wingW} ${h}`,
        `C ${-wingW * 0.45} ${h} 0.5 ${h - wingH * 0.45} 0.5 ${h - wingH}`,
        `L 0.5 ${r}`,
        `A ${r - 0.5} ${r - 0.5} 0 0 1 ${r} 0.5`,
        `L ${w - r} 0.5`,
        `A ${r - 0.5} ${r - 0.5} 0 0 1 ${w - 0.5} ${r}`,
        `L ${w - 0.5} ${h - wingH}`,
        `C ${w - 0.5} ${h - wingH * 0.45} ${w + wingW * 0.55} ${h} ${w + wingW} ${h}`,
      ].join(' ');
    }

    return '';
  }, [pillWidth, pillHeight, isDockTop, isDockBottom, isFloating, mode]);

  return (
    <div
      className={`fixed inset-0 flex justify-center ${
        isDockBottom
          ? 'items-end'
          : isDockTop
          ? 'items-start'
          : 'items-center'
      } select-none pointer-events-auto`}
    >
      <motion.div
        layout
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 26,
          mass: 0.8,
        }}
        onWheel={handleWheel}
        onContextMenu={(e) => {
          e.preventDefault();
          invoke('show_context_menu', { config: visibleStats }).catch(() => {});
        }}
        onPointerEnter={() => {
          setIsHovered(true);
          invoke('force_topmost').catch(() => {});
        }}
        onPointerLeave={() => {
          setIsHovered(false);
        }}
        style={{
          backgroundColor: '#000000',
          width: `${pillWidth}px`,
          height: `${pillHeight}px`,
          border: isFloating ? `1px solid ${floatingOutlineColor}` : 'none',
          borderTopLeftRadius: isDockTop ? '0px' : (mode === 'compact' ? (isDockBottom ? '19px' : '9999px') : '24px'),
          borderTopRightRadius: isDockTop ? '0px' : (mode === 'compact' ? (isDockBottom ? '19px' : '9999px') : '24px'),
          borderBottomLeftRadius: isDockBottom ? '0px' : (mode === 'compact' ? (isDockTop ? '19px' : '9999px') : '24px'),
          borderBottomRightRadius: isDockBottom ? '0px' : (mode === 'compact' ? (isDockTop ? '19px' : '9999px') : '24px'),
          boxShadow: isMediaActive
            ? 'none'
            : metrics.cpu_usage > 80
            ? 'inset 0 0 16px rgba(251, 113, 133, 0.18)'
            : isHovered
            ? 'inset 0 0 12px rgba(255, 255, 255, 0.08)'
            : 'none',
        }}
        className="relative bg-black flex items-center justify-center select-none"
      >
        {/* Outward Concave Ear Wings (Docked Mode Only - Pinned to absolute corners with 2px pill overlap to prevent seams) */}
        {!isFloating && (
          <>
            {isDockTop && (
              <>
                <svg
                  className="absolute -left-[14px] top-0 pointer-events-none select-none z-0"
                  width="16"
                  height="10"
                  viewBox="0 0 16 10"
                  fill="none"
                >
                  <path d="M 0 0 C 7.7 0 14 4.5 14 10 L 16 10 L 16 0 Z" fill="#000000" />
                </svg>
                <svg
                  className="absolute -right-[14px] top-0 pointer-events-none select-none z-0"
                  width="16"
                  height="10"
                  viewBox="0 0 16 10"
                  fill="none"
                >
                  <path d="M 0 0 L 0 10 L 2 10 C 2 4.5 9.7 0 16 0 Z" fill="#000000" />
                </svg>
              </>
            )}
            {isDockBottom && (
              <>
                <svg
                  className="absolute -left-[14px] bottom-0 pointer-events-none select-none z-0"
                  width="16"
                  height="10"
                  viewBox="0 0 16 10"
                  fill="none"
                >
                  <path d="M 0 10 C 7.7 10 14 5.5 14 0 L 16 0 L 16 10 Z" fill="#000000" />
                </svg>
                <svg
                  className="absolute -right-[14px] bottom-0 pointer-events-none select-none z-0"
                  width="16"
                  height="10"
                  viewBox="0 0 16 10"
                  fill="none"
                >
                  <path d="M 0 10 L 0 0 L 2 0 C 2 5.5 9.7 10 16 10 Z" fill="#000000" />
                </svg>
              </>
            )}

            {/* Seamless Notch Perimeter Stroke */}
            <svg
              className="absolute inset-0 pointer-events-none select-none z-0"
              style={{ overflow: 'visible', width: `${pillWidth}px`, height: `${pillHeight}px` }}
            >
              <path
                d={dockedPath}
                fill="none"
                stroke={dockedStrokeColor}
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transition: 'stroke 0.25s ease' }}
              />
            </svg>
          </>
        )}

        {/* Temporary Volume Feedback Overlay */}
        <AnimatePresence>
          {volumeFeedback && mode === 'compact' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.12 }}
              className="absolute inset-0 bg-black/92 rounded-full flex items-center justify-center gap-1.5 text-cyan-300 text-xs font-medium z-50 pointer-events-none border border-cyan-500/40"
            >
              <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-mono text-[11px] tracking-wide">
                {volumeFeedback === 'up' ? 'Volume +' : 'Volume -'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        {/* COMPACT MODE */}
        <AnimatePresence mode="popLayout" initial={false}>
          {mode === 'compact' && (
            isMediaActive ? (
              <motion.div
                key="compact-media"
                initial={{ opacity: 0, scale: 0.96, filter: 'blur(3px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.96, filter: 'blur(3px)' }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-10 flex items-center justify-between w-full h-full gap-1.5 px-3 py-1"
                style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: '100%' }}
              >
              {/* Eyes Companion (Left) */}
              <div
                className="flex items-center flex-shrink-0 cursor-pointer"
                style={{ display: 'inline-flex', alignItems: 'center' }}
                title="Double-click to expand dashboard"
              >
                <EyesCompanion
                  mood="idle"
                  isMusicPlaying={media.is_playing}
                  cpuUsage={metrics.cpu_usage}
                  isCharging={metrics.is_charging}
                  isDragging={isDragging}
                  size="small"
                  onDoubleClick={toggleExpand}
                />
              </div>

              {/* Lyrics Icon Button (Shown if lyrics exist, click to open lyrics) */}
              {hasLyrics && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMode('lyrics');
                  }}
                  className="relative p-1 rounded-full text-cyan-400 hover:text-white hover:bg-cyan-500/20 transition-all cursor-pointer flex-shrink-0"
                  title="Lyrics Available — Click to view Live Lyrics"
                >
                  <Mic2 className="w-3.5 h-3.5 drop-shadow-[0_0_6px_rgba(6,182,212,0.8)]" />
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse shadow-[0_0_4px_#22d3ee]" />
                </button>
              )}

              {/* Middle Content (Draggable Area, Double-Click to Expand Dashboard) */}
              <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  toggleExpand();
                }}
                className="flex-1 min-w-0 flex items-center justify-center px-1 overflow-hidden cursor-grab active:cursor-grabbing"
                title={romajiTrack ? `${displayTrack} (${romajiTrack})` : displayTrack}
              >
                <div className="flex items-center gap-1.5 max-w-full text-xs truncate pointer-events-none">
                  <span className="text-cyan-300 font-medium truncate text-[11px]">
                    {displayTrack}
                  </span>
                </div>
              </div>

              {/* Compact Media Transport Controls (Prev, Play/Pause, Next) - Styled in Electric Cyan/Blue */}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPrev();
                  }}
                  className="p-1 text-cyan-400 hover:text-cyan-200 transition-colors cursor-pointer"
                  title="Previous Track"
                >
                  <SkipBack className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlayPause();
                  }}
                  className="p-1 text-cyan-300 hover:text-white transition-colors cursor-pointer"
                  title={media.is_playing ? 'Pause' : 'Play'}
                >
                  {media.is_playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onNext();
                  }}
                  className="p-1 text-cyan-400 hover:text-cyan-200 transition-colors cursor-pointer"
                  title="Next Track"
                >
                  <SkipForward className="w-3 h-3" />
                </button>
              </div>

              {/* Right Mini Audio Visualizer */}
              <div
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  toggleExpand();
                }}
                className="flex items-center gap-0.5 h-3 cursor-pointer flex-shrink-0"
                title="Double-click to expand dashboard"
              >
                <motion.div
                  animate={{ height: ['4px', '13px', '6px'] }}
                  transition={{ repeat: Infinity, duration: 0.55 }}
                  className="w-0.5 bg-cyan-400 rounded-full"
                />
                <motion.div
                  animate={{ height: ['12px', '5px', '14px'] }}
                  transition={{ repeat: Infinity, duration: 0.45, delay: 0.1 }}
                  className="w-0.5 bg-sky-400 rounded-full"
                />
                <motion.div
                  animate={{ height: ['5px', '14px', '4px'] }}
                  transition={{ repeat: Infinity, duration: 0.65, delay: 0.2 }}
                  className="w-0.5 bg-blue-400 rounded-full"
                />
              </div>
            </motion.div>
          ) : showIdleStats ? (
            /* IDLE STATS MODE: THE PARTITIONED HUD (CONCEPT A) */
            <motion.div
              key="compact-stats"
              initial={{ opacity: 0, scale: 0.96, filter: 'blur(3px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.96, filter: 'blur(3px)' }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 flex items-center w-full h-full px-3 py-1"
              style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', width: '100%', height: '100%' }}
            >
              {/* Eyes Companion (Left Partition - double-click to collapse stats) */}
              <div
                className="flex items-center flex-shrink-0 cursor-pointer"
                style={{ display: 'inline-flex', alignItems: 'center' }}
                title="Double-click eye to hide stats, stroke to pet, click to wink"
              >
                <EyesCompanion
                  mood="idle"
                  isMusicPlaying={false}
                  cpuUsage={metrics.cpu_usage}
                  isCharging={metrics.is_charging}
                  isDragging={isDragging}
                  size="small"
                  onDoubleClick={() => setShowIdleStats(false)}
                />
              </div>

              {/* Micro Vertical Hairline Partition: 18px height, 1.5px width, 10px symmetric spacing */}
              <div
                style={{
                  width: '1.5px',
                  height: '18px',
                  backgroundColor: 'rgba(255, 255, 255, 0.45)',
                  boxShadow: '0 0 4px rgba(255, 255, 255, 0.25)',
                  borderRadius: '9999px',
                  marginLeft: '10px',
                  marginRight: '10px',
                  flexShrink: 0,
                }}
                aria-hidden="true"
              />

              {/* Hardware Stats HUD (Right Partition - Draggable, Double-click to expand dashboard) */}
              <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  toggleExpand();
                }}
                className="flex items-center gap-[6px] text-[10px] font-mono text-neutral-300 select-none cursor-grab active:cursor-grabbing flex-shrink-0"
                title="Double-click for full dashboard, right-click to choose metrics or quit"
              >
                {/* 1. CPU Item: [ <Cpu /> + % ] (Fixed-width box, right-aligned to prevent jitter) */}
                {visibleStats.cpu && (
                  <div className="flex items-center justify-between w-[40px] flex-shrink-0" title={`CPU: ${metrics.cpu_usage.toFixed(0)}%`}>
                    <Cpu className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                    <span className={`tabular-nums text-right ml-auto ${metrics.cpu_usage > 80 ? 'text-rose-400 font-semibold' : 'text-neutral-100 font-medium'}`}>
                      {metrics.cpu_usage.toFixed(0)}%
                    </span>
                  </div>
                )}

                {/* 2. RAM Item: [ <MemoryStick /> + % ] (Fixed-width box, right-aligned to prevent jitter) */}
                {visibleStats.ram && (
                  <div className="flex items-center justify-between w-[40px] flex-shrink-0" title={`RAM: ${metrics.ram_percentage.toFixed(0)}%`}>
                    <MemoryStick className="w-3 h-3 text-sky-400 flex-shrink-0" />
                    <span className={`tabular-nums text-right ml-auto ${metrics.ram_percentage > 85 ? 'text-rose-400 font-semibold' : 'text-neutral-100 font-medium'}`}>
                      {metrics.ram_percentage.toFixed(0)}%
                    </span>
                  </div>
                )}

                {/* 3. GPU Item: [ <Gpu /> + % ] (Fixed-width box, right-aligned to prevent jitter) */}
                {visibleStats.gpu && (
                  <div className="flex items-center justify-between w-[40px] flex-shrink-0" title={`GPU: ${(metrics.gpu_usage ?? 0).toFixed(0)}%`}>
                    <Gpu className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                    <span className={`tabular-nums text-right ml-auto ${(metrics.gpu_usage ?? 0) > 80 ? 'text-rose-400 font-semibold' : 'text-neutral-100 font-medium'}`}>
                      {(metrics.gpu_usage ?? 0).toFixed(0)}%
                    </span>
                  </div>
                )}

                {/* 4. Battery Indicator (if present) (Fixed-width box, right-aligned to prevent jitter) */}
                {visibleStats.battery && hasBattery && (
                  <div
                    className="flex items-center justify-between w-[42px] flex-shrink-0"
                    title={metrics.is_charging ? `Charging: ${metrics.battery_percentage}%` : `Battery: ${metrics.battery_percentage}%`}
                  >
                    {metrics.is_charging ? (
                      <BatteryCharging className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 animate-pulse" />
                    ) : (metrics.battery_percentage ?? 100) > 75 ? (
                      <BatteryFull className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                    ) : (metrics.battery_percentage ?? 100) > 25 ? (
                      <BatteryMedium className="w-3 h-3 text-sky-400 flex-shrink-0" />
                    ) : (
                      <BatteryLow className="w-3 h-3 text-rose-400 flex-shrink-0" />
                    )}
                    <span className={`tabular-nums text-right ml-auto ${(metrics.battery_percentage ?? 100) <= 20 ? 'text-rose-400 font-semibold' : 'text-neutral-100 font-medium'}`}>
                      {metrics.battery_percentage}%
                    </span>
                  </div>
                )}

                {/* 5. Bandwidth Download & Upload (Fixed-width boxes, right-aligned to prevent jitter) */}
                {visibleStats.net && (
                  <div className="flex items-center gap-[2px] font-semibold flex-shrink-0">
                    <span className="flex items-center justify-between text-emerald-300 w-[35px] flex-shrink-0" title={`Download: ${formatSpeed(metrics.net_download_kbps)}/s`}>
                      <ArrowDown className="w-2.5 h-2.5 flex-shrink-0" />
                      <span className="tabular-nums text-right ml-auto truncate">{formatSpeed(metrics.net_download_kbps)}</span>
                    </span>
                    <span className="flex items-center justify-between text-sky-300 w-[35px] flex-shrink-0" title={`Upload: ${formatSpeed(metrics.net_upload_kbps)}/s`}>
                      <ArrowUp className="w-2.5 h-2.5 flex-shrink-0" />
                      <span className="tabular-nums text-right ml-auto truncate">{formatSpeed(metrics.net_upload_kbps)}</span>
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            /* IDLE MINIMALIST MODE: ONLY EYES COMPANION */
            <motion.div
              key="compact-idle"
              initial={{ opacity: 0, scale: 0.92, filter: 'blur(3px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.92, filter: 'blur(3px)' }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setShowIdleStats(true);
              }}
              className="relative z-10 flex items-center justify-center w-full h-full px-2 py-1 cursor-pointer active:cursor-grabbing"
              title="Click to wink, double-click to view stats, drag to move"
            >
              <EyesCompanion
                mood="idle"
                isMusicPlaying={false}
                cpuUsage={metrics.cpu_usage}
                isCharging={metrics.is_charging}
                isDragging={isDragging}
                size="small"
                onDoubleClick={() => setShowIdleStats(true)}
              />
            </motion.div>
          )
        )}
        </AnimatePresence>

        {/* EXPANDED / LYRICS MODE */}
        {mode !== 'compact' && (
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={mode}
              initial={{ opacity: 0, scale: 0.96, filter: 'blur(4px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.96, filter: 'blur(4px)' }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className={`relative z-10 flex ${isDockBottom ? 'flex-col-reverse' : 'flex-col'} w-full h-full justify-between p-3.5`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Unified Header: Eyes Companion & Song Title/Artist (Draggable) */}
              <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className={`flex items-center justify-between ${
                  isDockBottom ? 'pt-2 border-t mt-1.5' : 'pb-2 border-b mb-1.5'
                } border-white/10 cursor-grab active:cursor-grabbing flex-shrink-0`}
                title="Drag header to move"
              >
                <div className="flex items-center gap-2 select-none pointer-events-none min-w-0">
                  <EyesCompanion
                    mood="idle"
                    isMusicPlaying={media.is_playing}
                    cpuUsage={metrics.cpu_usage}
                    isCharging={metrics.is_charging}
                    isDragging={isDragging}
                    size="medium"
                  />
                  <div className="flex flex-col min-w-0 max-w-[190px]">
                    <span className="text-xs font-semibold text-white tracking-wide truncate" title={media.title}>
                      {media.title || 'AetherIsland'}
                    </span>
                    <span className="text-[10px] text-cyan-300/80 -mt-0.5 truncate" title={media.artist}>
                      {media.artist || (isDockTop ? 'Top Notch' : isDockBottom ? 'Bottom Dock' : 'Floating Pill')}
                    </span>
                  </div>
                </div>

                <div
                  className="flex items-center gap-1 bg-white/5 rounded-full p-0.5 border border-white/10"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {mode === 'lyrics' ? (
                    <button
                      onClick={() => setMode('expanded')}
                      className="px-2.5 py-1 text-xs rounded-full transition-all flex items-center gap-1 cursor-pointer bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-medium shadow-sm active:scale-95"
                    >
                      <Disc className="w-3 h-3" />
                      <span>Player</span>
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setMode('expanded');
                          setActiveTab('media');
                        }}
                        className={`px-2.5 py-1 text-xs rounded-full transition-all flex items-center gap-1 cursor-pointer active:scale-95 border ${
                          mode === 'expanded' && activeTab === 'media'
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30 font-medium shadow-sm'
                            : 'text-neutral-400 hover:text-white hover:bg-white/5 border-transparent'
                        }`}
                      >
                        <Disc className="w-3 h-3" />
                        <span>Media</span>
                      </button>

                      <button
                        onClick={() => {
                          setMode('expanded');
                          setActiveTab('system');
                        }}
                        className={`px-2.5 py-1 text-xs rounded-full transition-all flex items-center gap-1 cursor-pointer active:scale-95 border ${
                          mode === 'expanded' && activeTab === 'system'
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30 font-medium shadow-sm'
                            : 'text-neutral-400 hover:text-white hover:bg-white/5 border-transparent'
                        }`}
                      >
                        <Activity className="w-3 h-3" />
                        <span>System</span>
                      </button>
                    </>
                  )}

                  <button
                    onClick={toggleExpand}
                    className="p-1 text-neutral-400 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer ml-0.5 active:scale-90"
                    title="Minimize Island"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Main Body View */}
              {mode === 'lyrics' ? (
                <SyncedLyricsView
                  media={media}
                  lyricsData={lyricsData}
                  currentPositionMs={media.position_ms}
                  isLoading={isLyricsLoading}
                  onSeek={onSeek}
                  onPlayPause={onPlayPause}
                  onBack={() => setMode('expanded')}
                  onLyricsChange={onLyricsChange}
                />
              ) : activeTab === 'media' ? (
                <MediaController
                  media={media}
                  onPlayPause={onPlayPause}
                  onNext={onNext}
                  onPrev={onPrev}
                  onSeek={onSeek}
                  onToggleLyrics={() => setMode('lyrics')}
                  showLyricsButton={true}
                />
              ) : (
                <div className="flex flex-col gap-2.5">
                  <SystemDashboard
                    metrics={metrics}
                    visibleStats={visibleStats}
                    onToggleStat={handleToggleStat}
                  />
                  {/* Mini Media Bar inside System Tab */}
                  <div className="flex items-center justify-between bg-neutral-900/80 rounded-xl px-3 py-2 border border-white/5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Music2 className="w-4 h-4 text-cyan-400 flex-shrink-0 animate-pulse" />
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-medium text-white truncate max-w-[180px]">
                          {media.title || 'No Media'}
                        </span>
                        <span className="text-[10px] text-neutral-400 truncate max-w-[180px]">
                          {media.artist || 'Idle'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={onPrev}
                        className="p-1 text-cyan-400 hover:text-cyan-200 transition-colors cursor-pointer"
                      >
                        <SkipBack className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={onPlayPause}
                        className="p-1 text-cyan-300 hover:text-white transition-colors cursor-pointer"
                      >
                        {media.is_playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={onNext}
                        className="p-1 text-cyan-400 hover:text-cyan-200 transition-colors cursor-pointer"
                      >
                        <SkipForward className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </motion.div>
    </div>
  );
};
