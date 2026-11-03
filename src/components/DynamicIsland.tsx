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
import { Activity, Music2, Disc, Maximize2, Minimize2 } from 'lucide-react';

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

  // Dynamically resize and re-center OS native window when mode changes
  useEffect(() => {
    const resizeWindow = async () => {
      try {
        if (mode === 'compact') {
          await invoke('set_island_window_size', { width: 330.0, height: 44.0, yOffset: 0.0 });
        } else {
          await invoke('set_island_window_size', { width: 440.0, height: 285.0, yOffset: 0.0 });
        }
      } catch {
        // Ignored in non-windowed environments
      }
    };
    resizeWindow();
  }, [mode]);

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
        onDoubleClick={toggleExpand}
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
            ? 'px-3 py-1 flex items-center justify-between w-[320px] h-[38px]'
            : 'p-4 w-[430px] min-h-[270px] flex flex-col justify-between'
        }`}
      >
        {/* Organic Notch Ears (MacBook/iPhone Bezel Flares) when snapped to top */}
        {isNotch && (
          <>
            {/* Left Ear Flare */}
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              className="absolute -left-[10px] top-0 pointer-events-none fill-black"
            >
              <path d="M 10 0 Q 10 10 0 10 L 10 10 Z" />
            </svg>
            {/* Right Ear Flare */}
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              className="absolute -right-[10px] top-0 pointer-events-none fill-black"
            >
              <path d="M 0 0 Q 0 10 10 10 L 0 10 Z" />
            </svg>
          </>
        )}

        {/* COMPACT MODE */}
        {mode === 'compact' && (
          <div
            className="flex items-center justify-between w-full h-full gap-2"
            style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: '100%' }}
          >
            {/* Eyes Companion (Left) */}
            <div
              className="flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
              style={{ display: 'inline-flex', alignItems: 'center' }}
              onClick={toggleExpand}
              title="Click to expand island"
            >
              <EyesCompanion
                mood="idle"
                isMusicPlaying={media.is_playing}
                cpuUsage={metrics.cpu_usage}
                size="small"
              />
            </div>

            {/* Middle Content (Draggable Area) */}
            <div
              onMouseDown={handleStartDrag}
              className="flex-1 min-w-0 flex items-center justify-center px-1 overflow-hidden cursor-grab active:cursor-grabbing"
              title="Drag to reposition (Move near top bezel to snap into Notch)"
            >
              {media.is_playing ? (
                <div className="flex items-center gap-1.5 max-w-full text-xs truncate pointer-events-none">
                  <span className="text-cyan-300 font-medium truncate text-[11px]">
                    {compactLyricText ? `♪ ${compactLyricText}` : `${media.title} — ${media.artist}`}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[11px] text-neutral-400 font-mono pointer-events-none">
                  <span>CPU {metrics.cpu_usage.toFixed(0)}%</span>
                  <span>•</span>
                  <span>RAM {metrics.ram_percentage.toFixed(0)}%</span>
                </div>
              )}
            </div>

            {/* Right Status & Expand Button */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {media.is_playing ? (
                <div
                  onClick={toggleExpand}
                  className="flex items-center gap-0.5 h-3 px-1 cursor-pointer"
                  title="Expand island"
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
              ) : (
                <div
                  onClick={toggleExpand}
                  className="cursor-pointer p-0.5"
                  title="Expand island"
                >
                  <div
                    className={`w-2 h-2 rounded-full ${
                      metrics.cpu_usage > 80
                        ? 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.7)]'
                        : metrics.cpu_usage > 50
                        ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]'
                        : 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]'
                    }`}
                  />
                </div>
              )}

              {/* Expand Toggle Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand();
                }}
                className="text-neutral-500 hover:text-white p-1 rounded-full transition-colors cursor-pointer"
                title="Expand Island"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
            </div>
          </div>
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
