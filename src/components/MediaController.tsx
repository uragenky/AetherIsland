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
    <div className="flex flex-col gap-2.5 w-full text-white">
      {/* Top Info Row */}
      <div className="flex items-center gap-3">
        {/* Cover Art */}
        <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-neutral-800 flex-shrink-0 shadow-md border border-white/10">
          {media.cover_url ? (
            <img
              src={media.cover_url}
              alt={media.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-neutral-400">
              <Music className="w-6 h-6 animate-pulse" />
            </div>
          )}
        </div>

        {/* Title and Artist */}
        <div className="flex flex-col min-w-0 flex-1">
          <div className="font-semibold text-sm truncate text-white tracking-wide" title={media.title}>
            {media.title || 'No Media Playing'}
          </div>
          <div className="text-xs text-neutral-400 truncate" title={media.artist}>
            {media.artist || 'Waiting for audio...'}
          </div>
        </div>

        {/* Lyrics Button */}
        {showLyricsButton && (
          <button
            onClick={onToggleLyrics}
            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 hover:text-white transition-colors"
            title="Toggle Synced Lyrics"
          >
            <Mic2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Progress Bar & Seek */}
      <div className="flex flex-col gap-1">
        <div
          onClick={handleSliderClick}
          className="w-full h-1.5 bg-neutral-700/60 rounded-full cursor-pointer overflow-hidden group relative hover:h-2 transition-all"
        >
          <div
            className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full relative"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-neutral-400 px-0.5">
          <span>{formatTime(media.position_ms)}</span>
          <span>{formatTime(media.duration_ms)}</span>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={onPrev}
          className="p-1.5 rounded-full text-neutral-300 hover:text-white hover:bg-white/10 transition-colors"
          title="Previous Track"
        >
          <SkipBack className="w-4 h-4 fill-current" />
        </button>

        <button
          onClick={onPlayPause}
          className="p-2.5 rounded-full bg-white text-black hover:bg-neutral-200 shadow-md transition-all active:scale-95"
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
          className="p-1.5 rounded-full text-neutral-300 hover:text-white hover:bg-white/10 transition-colors"
          title="Next Track"
        >
          <SkipForward className="w-4 h-4 fill-current" />
        </button>
      </div>
    </div>
  );
};
