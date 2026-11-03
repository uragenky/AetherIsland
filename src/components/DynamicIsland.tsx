import React, { useState, useEffect, useMemo } from 'react';
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
import { Activity, Music2, Disc, Minimize2, Cpu, HardDrive, Zap, ArrowDown, ArrowUp } from 'lucide-react';

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
  const [isNotch, setIsNotch] = useState(true);
  const [showIdleStats, setShowIdleStats] = useState(false);

  // Listen to real-time window movement & edge snap state from Tauri backend
  useEffect(() => {
    invoke<boolean>('get_is_notch')
      .then((snapped) => setIsNotch(snapped))
      .catch(() => setIsNotch(true));

    const unlistenSnap = listen<boolean>('edge-snap-status', (event) => {
      setIsNotch(event.payload);
    });

    return () => {
      unlistenSnap.then((f) => f());
    };
  }, []);

  const isMediaActive = Boolean(media.has_media && media.is_playing);

  // Dynamically resize and re-center OS native window when mode changes
  useEffect(() => {
    const resizeWindow = async () => {
      try {
        if (mode === 'compact') {
          if (isMediaActive) {
            await invoke('set_island_window_size', { width: 330.0, height: 44.0, yOffset: 0.0 });
          } else if (showIdleStats) {
            await invoke('set_island_window_size', { width: 340.0, height: 44.0, yOffset: 0.0 });
          } else {
            await invoke('set_island_window_size', { width: 92.0, height: 42.0, yOffset: 0.0 });
          }
        } else {
          await invoke('set_island_window_size', { width: 440.0, height: 285.0, yOffset: 0.0 });
        }
      } catch {
        // Ignored in non-windowed environments
      }
    };
    resizeWindow();
  }, [mode, isMediaActive, showIdleStats]);

  const toggleExpand = () => {
    if (mode === 'compact') {
      setMode('expanded');
    } else {
      setMode('compact');
    }
  };

  const handleStartDrag = (e: React.MouseEvent) => {
    if (e.button === 0) {
      invoke('start_window_drag').catch(() => {});
    }
  };

  // Find active single line for compact lyric preview
  const compactLyricText = useMemo(() => {
    if (!lyricsData || !lyricsData.parsed_lines || lyricsData.parsed_lines.length === 0) {
      return null;
    }
    const lines = lyricsData.parsed_lines;
    let text = null;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time_ms <= media.position_ms) {
        text = lines[i].text;
      } else {
        break;
      }
    }
    return text;
  }, [lyricsData, media.position_ms]);

  return (
    <div className="fixed top-0 left-0 right-0 flex justify-center items-start select-none pointer-events-auto">
      <motion.div
        layout
        transition={{
          type: 'spring',
          stiffness: 420,
          damping: 30,
          mass: 0.8,
        }}
        style={{
          backgroundColor: '#000000',
          border: isNotch
            ? 'none'
            : '1px solid rgba(255, 255, 255, 0.15)',
          borderBottom: isNotch ? '1px solid rgba(255, 255, 255, 0.15)' : undefined,
          borderLeft: isNotch ? '1px solid rgba(255, 255, 255, 0.15)' : undefined,
          borderRight: isNotch ? '1px solid rgba(255, 255, 255, 0.15)' : undefined,
          borderTopLeftRadius: isNotch ? '0px' : mode === 'compact' ? '9999px' : '24px',
          borderTopRightRadius: isNotch ? '0px' : mode === 'compact' ? '9999px' : '24px',
          borderBottomLeftRadius: isNotch
            ? mode === 'compact'
              ? '20px'
              : '26px'
            : mode === 'compact'
            ? '9999px'
            : '24px',
          borderBottomRightRadius: isNotch
            ? mode === 'compact'
              ? '20px'
              : '26px'
            : mode === 'compact'
            ? '9999px'
            : '24px',
        }}
        className={`relative bg-black transition-all duration-300 ${
          mode === 'compact'
            ? isMediaActive || showIdleStats
              ? 'px-3 py-1 flex items-center justify-between w-[330px] h-[38px]'
              : 'px-2 py-1 flex items-center justify-center w-[84px] h-[36px]'
            : 'p-4 w-[430px] min-h-[270px] flex flex-col justify-between'
        }`}
      >
        {/* COMPACT MODE */}
        {mode === 'compact' && (
          isMediaActive ? (
            <div
              className="flex items-center justify-between w-full h-full gap-2 px-1"
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

              {/* Middle Content (Draggable Area, Double-Click to Expand Dashboard) */}
              <div
                onMouseDown={handleStartDrag}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  toggleExpand();
                }}
                className="flex-1 min-w-0 flex items-center justify-center px-1 overflow-hidden cursor-grab active:cursor-grabbing"
                title="Drag to reposition, double-click to expand dashboard"
              >
                <div className="flex items-center gap-1.5 max-w-full text-xs truncate pointer-events-none">
                  <span className="text-cyan-300 font-medium truncate text-[11px]">
                    {compactLyricText ? `♪ ${compactLyricText}` : `${media.title} — ${media.artist}`}
                  </span>
                </div>
              </div>

              {/* Right Mini Audio Visualizer */}
              <div
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  toggleExpand();
                }}
                className="flex items-center gap-0.5 h-3 px-1 cursor-pointer flex-shrink-0"
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
                onMouseDown={handleStartDrag}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  toggleExpand();
                }}
                className="flex-1 min-w-0 flex items-center justify-center gap-2 text-[10px] font-mono text-neutral-300 select-none overflow-hidden cursor-grab active:cursor-grabbing px-1"
                title="Drag to reposition, double-click for full dashboard"
              >
                {/* CPU */}
                <div className="flex items-center gap-1" title={`CPU: ${metrics.cpu_usage.toFixed(0)}%`}>
                  <Cpu className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                  <span className={metrics.cpu_usage > 80 ? 'text-rose-400 font-semibold' : 'text-neutral-100 font-medium'}>
                    {metrics.cpu_usage.toFixed(0)}%
                  </span>
                </div>

                <span className="text-neutral-700">•</span>

                {/* RAM */}
                <div className="flex items-center gap-1" title={`RAM: ${metrics.ram_percentage.toFixed(0)}%`}>
                  <HardDrive className="w-3 h-3 text-sky-400 flex-shrink-0" />
                  <span className={metrics.ram_percentage > 85 ? 'text-rose-400 font-semibold' : 'text-neutral-100 font-medium'}>
                    {metrics.ram_percentage.toFixed(0)}%
                  </span>
                </div>

                <span className="text-neutral-700">•</span>

                {/* GPU */}
                <div className="flex items-center gap-1" title={`GPU: ${(metrics.gpu_usage ?? 0).toFixed(0)}%`}>
                  <Zap className="w-3 h-3 text-amber-400 flex-shrink-0" />
                  <span className={(metrics.gpu_usage ?? 0) > 80 ? 'text-rose-400 font-semibold' : 'text-neutral-100 font-medium'}>
                    {(metrics.gpu_usage ?? 0).toFixed(0)}%
                  </span>
                </div>

                <span className="text-neutral-700">•</span>

                {/* Bandwidth Download & Upload */}
                <div className="flex items-center gap-1.5 font-semibold">
                  <span className="flex items-center gap-0.5 text-emerald-300" title={`Download: ${formatSpeed(metrics.net_download_kbps)}/s`}>
                    <ArrowDown className="w-2.5 h-2.5 flex-shrink-0" />
                    <span>{formatSpeed(metrics.net_download_kbps)}</span>
                  </span>
                  <span className="flex items-center gap-0.5 text-sky-300" title={`Upload: ${formatSpeed(metrics.net_upload_kbps)}/s`}>
                    <ArrowUp className="w-2.5 h-2.5 flex-shrink-0" />
                    <span>{formatSpeed(metrics.net_upload_kbps)}</span>
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* IDLE MINIMALIST MODE: ONLY EYES COMPANION */
            <div
              onMouseDown={handleStartDrag}
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
              className="flex flex-col w-full h-full"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header: Eyes Companion & Mode Switcher (Draggable) */}
              <div
                onMouseDown={handleStartDrag}
                className="flex items-center justify-between pb-2.5 border-b border-white/10 mb-2 cursor-grab active:cursor-grabbing"
                title="Drag header to move"
              >
                <div className="flex items-center gap-2 select-none pointer-events-none">
                  <EyesCompanion
                    mood="idle"
                    isMusicPlaying={media.is_playing}
                    cpuUsage={metrics.cpu_usage}
                    size="medium"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-white tracking-wide">
                      AetherIsland
                    </span>
                    <span className="text-[10px] text-neutral-400 -mt-0.5">
                      {isNotch ? 'Snapped Notch' : 'Floating Pill'}
                    </span>
                  </div>
                </div>

                <div
                  className="flex items-center gap-1 bg-white/5 rounded-full p-0.5 border border-white/5"
                  onMouseDown={(e) => e.stopPropagation()}
                >
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

                  <button
                    onClick={toggleExpand}
                    className="p-1 text-neutral-400 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer ml-0.5"
                    title="Minimize Island"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Main Body View */}
              {mode === 'lyrics' ? (
                <SyncedLyricsView
                  lyricsData={lyricsData}
                  currentPositionMs={media.position_ms}
                  isLoading={isLyricsLoading}
                  onSeek={onSeek}
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
                    <div className="flex items-center gap-2 truncate flex-1 min-w-0 pr-2">
                      <Music2 className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                      <span className="text-xs text-neutral-200 truncate font-medium">
                        {media.title} — {media.artist}
                      </span>
                    </div>
                    <button
                      onClick={onPlayPause}
                      className="text-xs text-white hover:text-cyan-300 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 transition-all cursor-pointer font-medium"
                    >
                      {media.is_playing ? 'Pause' : 'Play'}
                    </button>
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
