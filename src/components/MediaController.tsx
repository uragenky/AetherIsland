import React from 'react';
import { Play, Pause, SkipForward, SkipBack, Music, Mic2 } from 'lucide-react';
import { MediaSessionInfo } from '../types';

interface MediaControllerProps {
  media: MediaSessionInfo;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (positionMs: number) => void;
  onToggleLyrics?: () => void;
  showLyricsButton?: boolean;
}

export const MediaController: React.FC<MediaControllerProps> = ({
  media,
  onPlayPause,
  onNext,
  onPrev,
  onSeek,
  onToggleLyrics,
  showLyricsButton = true,
}) => {
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const progressPercent = media.duration_ms > 0
    ? Math.min(100, (media.position_ms / media.duration_ms) * 100)
    : 0;

  const handleSliderClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(Math.floor(ratio * media.duration_ms));
  };

  return (
    <div className="flex flex-col gap-3 w-full text-white pt-1">
      {/* Top Info Row */}
      <div className="flex items-center gap-3">
        {/* Cover Art */}
        <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-neutral-900 flex-shrink-0 shadow-lg border border-white/10 ring-1 ring-white/5">
          {media.cover_url ? (
            <img
              src={media.cover_url}
              alt={media.title}
              className="w-full h-full object-cover transition-transform hover:scale-105 duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-neutral-500 bg-neutral-800/80">
              <Music className="w-5 h-5 animate-pulse text-cyan-400" />
            </div>
          )}
        </div>

        {/* Title and Artist */}
        <div className="flex flex-col min-w-0 flex-1">
          <div className="font-semibold text-sm truncate text-white tracking-wide" title={media.title}>
            {media.title || 'No Media Active'}
          </div>
          <div className="text-xs text-neutral-400 truncate mt-0.5" title={media.artist}>
            {media.artist || 'Waiting for system audio...'}
          </div>
        </div>

        {/* Lyrics Button */}
        {showLyricsButton && (
          <button
            onClick={onToggleLyrics}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-400 border border-cyan-500/20 text-xs transition-all active:scale-95 cursor-pointer"
            title="Open Live Lyrics"
          >
            <Mic2 className="w-3.5 h-3.5" />
            <span className="text-[11px] font-medium">Lyrics</span>
          </button>
        )}
      </div>

      {/* Progress Bar & Seek */}
      <div className="flex flex-col gap-1.5 px-0.5">
        <div
          onClick={handleSliderClick}
          className="w-full h-1.5 bg-neutral-800 rounded-full cursor-pointer relative group overflow-hidden"
        >
          <div
            className="h-full bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 rounded-full relative transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-neutral-400 font-mono px-0.5">
          <span>{formatTime(media.position_ms)}</span>
          <span>{formatTime(media.duration_ms)}</span>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="flex items-center justify-center gap-5 pt-0.5">
        <button
          onClick={onPrev}
          className="p-2 rounded-full text-cyan-400 hover:text-cyan-200 hover:bg-cyan-500/15 transition-all active:scale-90 cursor-pointer"
          title="Previous Track"
        >
          <SkipBack className="w-4 h-4 fill-current" />
        </button>

        <button
          onClick={onPlayPause}
          className="p-3 rounded-full bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 shadow-[0_0_16px_rgba(56,189,248,0.45)] transition-all active:scale-90 cursor-pointer"
          title={media.is_playing ? 'Pause' : 'Play'}
        >
          {media.is_playing ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current ml-0.5" />
          )}
        </button>

        <button
          onClick={onNext}
          className="p-2 rounded-full text-cyan-400 hover:text-cyan-200 hover:bg-cyan-500/15 transition-all active:scale-90 cursor-pointer"
          title="Next Track"
        >
          <SkipForward className="w-4 h-4 fill-current" />
        </button>
      </div>
    </div>
  );
};
