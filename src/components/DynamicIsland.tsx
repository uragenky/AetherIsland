import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
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
import { Activity, Music2, Disc } from 'lucide-react';

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

  // Dynamically resize OS native window when mode changes
  useEffect(() => {
    const resizeWindow = async () => {
      try {
        if (mode === 'compact') {
          await invoke('set_island_window_size', { width: 240.0, height: 50.0 });
        } else if (mode === 'expanded') {
          await invoke('set_island_window_size', { width: 440.0, height: 260.0 });
        } else if (mode === 'lyrics') {
          await invoke('set_island_window_size', { width: 440.0, height: 260.0 });
        }
      } catch (e) {
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

  return (
    <div className="fixed top-2 left-0 right-0 flex justify-center items-start select-none pointer-events-auto">
      <motion.div
        layout
        transition={{
          type: 'spring',
          stiffness: 420,
          damping: 30,
          mass: 0.8,
        }}
        onClick={(e) => {
          if (mode === 'compact') {
            e.stopPropagation();
            toggleExpand();
          }
        }}
        className={`bg-black/90 backdrop-blur-2xl border border-white/10 shadow-2xl overflow-hidden cursor-pointer ${
          mode === 'compact'
            ? 'rounded-full px-3 py-1.5 flex items-center justify-between min-w-[200px] max-w-[240px] h-[36px]'
            : 'rounded-3xl p-4 w-[420px] min-h-[220px] flex flex-col justify-between'
        }`}
      >
        {/* COMPACT MODE */}
        {mode === 'compact' && (
          <div className="flex items-center justify-between w-full">
            {/* Eyes Companion (Left) */}
            <div className="flex items-center gap-1.5">
              <EyesCompanion
                mood="idle"
                isMusicPlaying={media.is_playing}
                cpuUsage={metrics.cpu_usage}
                size="small"
              />
            </div>

            {/* Right Status (Audio Wave or System indicator) */}
            <div className="flex items-center gap-2">
              {media.is_playing ? (
                <div className="flex items-center gap-0.5 h-3">
                  <motion.div
                    animate={{ height: ['4px', '12px', '6px'] }}
                    transition={{ repeat: Infinity, duration: 0.6 }}
                    className="w-0.5 bg-cyan-400 rounded-full"
                  />
                  <motion.div
                    animate={{ height: ['12px', '5px', '14px'] }}
                    transition={{ repeat: Infinity, duration: 0.5, delay: 0.1 }}
                    className="w-0.5 bg-blue-400 rounded-full"
                  />
                  <motion.div
                    animate={{ height: ['6px', '14px', '4px'] }}
                    transition={{ repeat: Infinity, duration: 0.7, delay: 0.2 }}
                    className="w-0.5 bg-purple-400 rounded-full"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-1 text-[11px] text-neutral-400 font-mono">
                  <span>{metrics.cpu_usage.toFixed(0)}%</span>
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      metrics.cpu_usage > 80
                        ? 'bg-rose-500'
                        : metrics.cpu_usage > 50
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                    }`}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* EXPANDED / LYRICS MODE */}
        {mode !== 'compact' && (
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col w-full h-full cursor-default"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header: Eyes Companion & Mode Switcher */}
              <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-3">
                <div className="flex items-center gap-2">
                  <EyesCompanion
                    mood="idle"
                    isMusicPlaying={media.is_playing}
                    cpuUsage={metrics.cpu_usage}
                    size="medium"
                  />
                  <span className="text-xs font-medium text-neutral-300">
                    AetherIsland
                  </span>
                </div>

                <div className="flex items-center gap-1 bg-white/5 rounded-full p-0.5">
                  <button
                    onClick={() => {
                      setMode('expanded');
                      setActiveTab('media');
                    }}
                    className={`px-2 py-0.5 text-xs rounded-full transition-all flex items-center gap-1 ${
                      mode === 'expanded' && activeTab === 'media'
                        ? 'bg-white/20 text-white font-medium'
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
                    className={`px-2 py-0.5 text-xs rounded-full transition-all flex items-center gap-1 ${
                      mode === 'expanded' && activeTab === 'system'
                        ? 'bg-white/20 text-white font-medium'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <Activity className="w-3 h-3" />
                    <span>System</span>
                  </button>

                  <button
                    onClick={() => setMode('compact')}
                    className="px-2 py-0.5 text-[10px] text-neutral-500 hover:text-neutral-300 rounded-full"
                    title="Minimize Island"
                  >
                    ✕
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
                <div className="flex flex-col gap-2">
                  <SystemDashboard metrics={metrics} />
                  {/* Mini Media Bar inside System Tab */}
                  <div className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-1.5 mt-1 border border-white/5">
                    <div className="flex items-center gap-2 truncate">
                      <Music2 className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="text-xs text-neutral-300 truncate">
                        {media.title} - {media.artist}
                      </span>
                    </div>
                    <button
                      onClick={onPlayPause}
                      className="text-xs text-white hover:text-cyan-400 px-2 py-0.5 rounded bg-white/10"
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
