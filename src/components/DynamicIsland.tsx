import React, { useState, useEffect, useRef } from 'react';
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
} from '../types';
import {
  Activity,
  Music2,
  Disc,
  Minimize2,
  X,
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
}) => {
  const [mode, setMode] = useState<IslandMode>('compact');
  const [activeTab, setActiveTab] = useState<'media' | 'system'>('media');
  const [dockStatus, setDockStatus] = useState<'top' | 'bottom' | 'floating'>('top');
  const [showIdleStats, setShowIdleStats] = useState(false);

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

    return () => {
      unlistenSnap.then((f) => f());
      unlistenDashboard.then((f) => f());
      unlistenStats.then((f) => f());
    };
  }, []);

  const isMediaActive = Boolean(media.has_media && media.is_playing);
  const hasBattery = metrics.battery_percentage !== undefined && metrics.battery_percentage !== null;

  // Dynamically resize and re-center OS native window when mode changes
  useEffect(() => {
    const resizeWindow = async () => {
      try {
        if (mode === 'compact') {
          if (isMediaActive) {
            await invoke('set_island_window_size', { width: 380.0, height: 44.0, yOffset: 0.0 });
          } else if (showIdleStats) {
            await invoke('set_island_window_size', { width: hasBattery ? 395.0 : 340.0, height: 44.0, yOffset: 0.0 });
          } else {
            await invoke('set_island_window_size', { width: 92.0, height: 42.0, yOffset: 0.0 });
          }
        } else {
          await invoke('set_island_window_size', { width: 440.0, height: 292.0, yOffset: 0.0 });
        }
      } catch {
        // Ignored in non-windowed environments
      }
    };
    resizeWindow();
  }, [mode, isMediaActive, showIdleStats, hasBattery]);

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
    if (e.button === 0) {
      dragStartRef.current = { x: e.screenX, y: e.screenY, isDown: true };
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragStartRef.current && dragStartRef.current.isDown) {
      const dist = Math.hypot(e.screenX - dragStartRef.current.x, e.screenY - dragStartRef.current.y);
      if (dist > 5) {
        dragStartRef.current.isDown = false;
        invoke('start_window_drag')
          .then(() => {
            invoke('snap_island').catch(() => {});
          })
          .catch(() => {});
      }
    }
  };

  const handlePointerUp = () => {
    if (dragStartRef.current) {
      dragStartRef.current.isDown = false;
    }
  };

  // Ensure drag release executes snapping reliably on pointer release
  useEffect(() => {
    const handleGlobalRelease = () => {
      if (dragStartRef.current?.isDown) {
        dragStartRef.current.isDown = false;
        setTimeout(() => {
          invoke('snap_island').catch(() => {});
        }, 35);
      }
    };
    window.addEventListener('pointerup', handleGlobalRelease);
    window.addEventListener('mouseup', handleGlobalRelease);
    return () => {
      window.removeEventListener('pointerup', handleGlobalRelease);
      window.removeEventListener('mouseup', handleGlobalRelease);
    };
  }, []);

  const displayTrack = media.title ? `${media.title}${media.artist ? ` — ${media.artist}` : ''}` : 'No Track Playing';
  const romajiTrack = hasNonLatinScript(displayTrack) ? transliterateText(displayTrack) : null;

  const isDockTop = dockStatus === 'top';
  const isDockBottom = dockStatus === 'bottom';

  return (
    <div
      className={`fixed inset-0 flex justify-center ${
        isDockBottom
          ? mode === 'compact'
            ? 'items-end'
            : 'items-end pb-1.5'
          : isDockTop
          ? mode === 'compact'
            ? 'items-start'
            : 'items-start pt-1.5'
          : 'items-center'
      } select-none pointer-events-auto`}
    >
      <motion.div
        layout
        transition={{
          type: 'spring',
          stiffness: 420,
          damping: 30,
          mass: 0.8,
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          invoke('show_context_menu').catch(() => {});
        }}
        onPointerEnter={() => {
          invoke('force_topmost').catch(() => {});
        }}
        style={{
          backgroundColor: '#000000',
          borderTop: mode === 'compact' && isDockTop ? 'none' : '1px solid rgba(255, 255, 255, 0.35)',
          borderBottom: mode === 'compact' && isDockBottom ? 'none' : '1px solid rgba(255, 255, 255, 0.35)',
          borderLeft: '1px solid rgba(255, 255, 255, 0.35)',
          borderRight: '1px solid rgba(255, 255, 255, 0.35)',
          borderTopLeftRadius: mode === 'compact' ? (isDockTop ? '0px' : isDockBottom ? '20px' : '9999px') : '24px',
          borderTopRightRadius: mode === 'compact' ? (isDockTop ? '0px' : isDockBottom ? '20px' : '9999px') : '24px',
          borderBottomLeftRadius: mode === 'compact' ? (isDockBottom ? '0px' : isDockTop ? '20px' : '9999px') : '24px',
          borderBottomRightRadius: mode === 'compact' ? (isDockBottom ? '0px' : isDockTop ? '20px' : '9999px') : '24px',
          boxShadow: 'none',
        }}
        className={`relative bg-black transition-all duration-300 ${
          mode === 'compact'
            ? isMediaActive
              ? 'px-3 py-1 flex items-center justify-between w-[370px] h-[38px]'
              : showIdleStats
              ? hasBattery
                ? 'px-3 py-1 flex items-center justify-between w-[385px] h-[38px]'
                : 'px-3 py-1 flex items-center justify-between w-[340px] h-[38px]'
              : 'px-2 py-1 flex items-center justify-center w-[84px] h-[36px]'
            : 'p-3.5 w-[430px] h-[276px] flex flex-col justify-between'
        }`}
      >
        {/* COMPACT MODE */}
        {mode === 'compact' && (
          isMediaActive ? (
            <div
              className="flex items-center justify-between w-full h-full gap-1.5 px-0.5"
              style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: '100%' }}
            >
              {/* Eyes Companion (Left) */}
              <div
                className="flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
                style={{ display: 'inline-flex', alignItems: 'center' }}
                title="Double-click to expand dashboard"
              >
                <EyesCompanion
                  mood="idle"
                  isMusicPlaying={media.is_playing}
                  cpuUsage={metrics.cpu_usage}
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
                className="flex items-center gap-0.5 h-3 px-0.5 cursor-pointer flex-shrink-0"
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
            </div>
          ) : showIdleStats ? (
            /* IDLE STATS MODE: EYES (DOUBLE-CLICK TO HIDE) + ICON-ONLY STATS (DOUBLE-CLICK FOR DASHBOARD) */
            <div
              className="flex items-center justify-between w-full h-full gap-2 px-1"
              style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: '100%' }}
            >
              {/* Eyes Companion (Left - double-click to collapse stats) */}
              <div
                className="flex items-center gap-1 flex-shrink-0 cursor-pointer"
                style={{ display: 'inline-flex', alignItems: 'center' }}
                title="Double-click eye to hide stats, click to wink"
              >
                <EyesCompanion
                  mood="idle"
                  isMusicPlaying={false}
                  cpuUsage={metrics.cpu_usage}
                  size="small"
                  onDoubleClick={() => setShowIdleStats(false)}
                />
              </div>

              {/* Hardware Stats (Middle - Draggable, Double-click to expand dashboard) */}
              <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  toggleExpand();
                }}
                className="flex-1 min-w-0 flex items-center justify-center gap-1.5 text-[10px] font-mono text-neutral-300 select-none overflow-hidden cursor-grab active:cursor-grabbing px-1"
                title="Drag to reposition, double-click for full dashboard, right-click for menu"
              >
                {/* CPU */}
                <div className="flex items-center gap-1 w-[46px] flex-shrink-0" title={`CPU: ${metrics.cpu_usage.toFixed(0)}%`}>
                  <Cpu className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                  <span className={`tabular-nums text-left ${metrics.cpu_usage > 80 ? 'text-rose-400 font-semibold' : 'text-neutral-100 font-medium'}`}>
                    {metrics.cpu_usage.toFixed(0)}%
                  </span>
                </div>

                <span className="text-neutral-700 flex-shrink-0">•</span>

                {/* RAM (MemoryStick Icon) */}
                <div className="flex items-center gap-1 w-[46px] flex-shrink-0" title={`RAM: ${metrics.ram_percentage.toFixed(0)}%`}>
                  <MemoryStick className="w-3 h-3 text-sky-400 flex-shrink-0" />
                  <span className={`tabular-nums text-left ${metrics.ram_percentage > 85 ? 'text-rose-400 font-semibold' : 'text-neutral-100 font-medium'}`}>
                    {metrics.ram_percentage.toFixed(0)}%
                  </span>
                </div>

                <span className="text-neutral-700 flex-shrink-0">•</span>

                {/* GPU (Gpu Icon) */}
                <div className="flex items-center gap-1 w-[46px] flex-shrink-0" title={`GPU: ${(metrics.gpu_usage ?? 0).toFixed(0)}%`}>
                  <Gpu className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <span className={`tabular-nums text-left ${(metrics.gpu_usage ?? 0) > 80 ? 'text-rose-400 font-semibold' : 'text-neutral-100 font-medium'}`}>
                    {(metrics.gpu_usage ?? 0).toFixed(0)}%
                  </span>
                </div>

                {/* Dynamic Battery Indicator */}
                {hasBattery && (
                  <>
                    <span className="text-neutral-700 flex-shrink-0">•</span>
                    <div
                      className="flex items-center gap-1 w-[48px] flex-shrink-0"
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
                      <span className={`tabular-nums text-left ${(metrics.battery_percentage ?? 100) <= 20 ? 'text-rose-400 font-semibold' : 'text-neutral-100 font-medium'}`}>
                        {metrics.battery_percentage}%
                      </span>
                    </div>
                  </>
                )}

                <span className="text-neutral-700 flex-shrink-0">•</span>

                {/* Bandwidth Download & Upload */}
                <div className="flex items-center gap-1 font-semibold flex-shrink-0">
                  <span className="flex items-center gap-0.5 text-emerald-300 w-[44px] flex-shrink-0" title={`Download: ${formatSpeed(metrics.net_download_kbps)}/s`}>
                    <ArrowDown className="w-2.5 h-2.5 flex-shrink-0" />
                    <span className="tabular-nums text-left truncate">{formatSpeed(metrics.net_download_kbps)}</span>
                  </span>
                  <span className="flex items-center gap-0.5 text-sky-300 w-[44px] flex-shrink-0" title={`Upload: ${formatSpeed(metrics.net_upload_kbps)}/s`}>
                    <ArrowUp className="w-2.5 h-2.5 flex-shrink-0" />
                    <span className="tabular-nums text-left truncate">{formatSpeed(metrics.net_upload_kbps)}</span>
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* IDLE MINIMALIST MODE: ONLY EYES COMPANION */
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setShowIdleStats(true);
              }}
              className="flex items-center justify-center w-full h-full cursor-pointer active:cursor-grabbing"
              title="Click to wink, double-click to view stats, drag to move"
            >
              <EyesCompanion
                mood="idle"
                isMusicPlaying={false}
                cpuUsage={metrics.cpu_usage}
                size="small"
                onDoubleClick={() => setShowIdleStats(true)}
              />
            </div>
          )
        )}

        {/* EXPANDED / LYRICS MODE */}
        {mode !== 'compact' && (
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.18 }}
              className={`flex ${isDockBottom ? 'flex-col-reverse' : 'flex-col'} w-full h-full justify-between`}
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
                  className="flex items-center gap-1 bg-white/5 rounded-full p-0.5 border border-white/5"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {mode === 'lyrics' ? (
                    <button
                      onClick={() => setMode('expanded')}
                      className="px-2.5 py-1 text-xs rounded-full transition-all flex items-center gap-1 cursor-pointer bg-white/20 text-white font-medium shadow-sm"
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
                        className={`px-2.5 py-1 text-xs rounded-full transition-all flex items-center gap-1 cursor-pointer ${
                          mode === 'expanded' && activeTab === 'media'
                            ? 'bg-white/20 text-white font-medium shadow-sm'
                            : 'text-neutral-400 hover:text-white'
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
                        className={`px-2.5 py-1 text-xs rounded-full transition-all flex items-center gap-1 cursor-pointer ${
                          mode === 'expanded' && activeTab === 'system'
                            ? 'bg-white/20 text-white font-medium shadow-sm'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        <Activity className="w-3 h-3" />
                        <span>System</span>
                      </button>
                    </>
                  )}

                  <button
                    onClick={toggleExpand}
                    className="p-1 text-neutral-400 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer ml-0.5"
                    title="Minimize Island"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => invoke('exit_app')}
                    className="p-1 text-neutral-400 hover:text-rose-400 hover:bg-rose-500/20 rounded-full transition-colors cursor-pointer ml-0.5"
                    title="Quit AetherIsland"
                  >
                    <X className="w-3.5 h-3.5" />
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
                  <SystemDashboard metrics={metrics} />
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
