import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { DynamicIsland } from './components/DynamicIsland';
import { SystemMetrics, MediaSessionInfo, LyricsData } from './types';

export function App() {
  const [metrics, setMetrics] = useState<SystemMetrics>({
    cpu_usage: 12.5,
    ram_used_bytes: 8589934592,
    ram_total_bytes: 17179869184,
    ram_percentage: 50.0,
    gpu_usage: 18.0,
    battery_percentage: 88,
    is_charging: true,
    net_download_kbps: 420.0,
    net_upload_kbps: 58.0,
  });

  const [media, setMedia] = useState<MediaSessionInfo>({
    has_media: false,
    title: '',
    artist: '',
    album: '',
    cover_url: null,
    is_playing: false,
    position_ms: 0,
    duration_ms: 0,
  });

  const [lyricsData, setLyricsData] = useState<LyricsData | null>(null);
  const [isLyricsLoading, setIsLyricsLoading] = useState(false);
  const lastTrackKey = useRef<string>('');

  // Initial fetch and Tauri event listeners
  useEffect(() => {
    // Initial calls
    invoke<SystemMetrics>('get_system_metrics')
      .then((m) => setMetrics(m))
      .catch(() => {});

    invoke<MediaSessionInfo>('get_media_info')
      .then((m) => setMedia(m))
      .catch(() => {});

    // Listen to real-time events emitted by Rust workers
    const unlistenMetrics = listen<SystemMetrics>('system-metrics', (event) => {
      setMetrics(event.payload);
    });

    const unlistenMedia = listen<MediaSessionInfo>('media-status', (event) => {
      setMedia((prev) => {
        const incoming = event.payload;
        const sameTrack = incoming.title === prev.title && incoming.artist === prev.artist;

        // If same track is actively playing, prevent oscillation resets to 0 or unprompted backward jumps
        if (sameTrack && incoming.is_playing && prev.position_ms > 1000) {
          if (
            incoming.position_ms === 0 ||
            (incoming.position_ms < prev.position_ms && prev.position_ms - incoming.position_ms < 3000)
          ) {
            return {
              ...incoming,
              position_ms: prev.position_ms,
              duration_ms: incoming.duration_ms > 0 ? incoming.duration_ms : prev.duration_ms,
            };
          }
        }
        return {
          ...incoming,
          duration_ms: incoming.duration_ms > 0 ? incoming.duration_ms : prev.duration_ms,
        };
      });
    });

    return () => {
      unlistenMetrics.then((f) => f());
      unlistenMedia.then((f) => f());
    };
  }, []);

  // Fetch lyrics whenever track changes
  useEffect(() => {
    if (!media.title) return;
    const currentKey = `${media.artist}::${media.title}`;
    if (lastTrackKey.current === currentKey) return;
    lastTrackKey.current = currentKey;

    setIsLyricsLoading(true);
    const durationSecs = media.duration_ms > 0 ? Math.floor(media.duration_ms / 1000) : undefined;

    invoke<LyricsData>('get_lyrics', {
      title: media.title,
      artist: media.artist,
      durationSecs,
    })
      .then((data) => {
        setLyricsData(data);
        const resolvedDuration = data.duration_ms && data.duration_ms > 0
          ? data.duration_ms
          : (data.parsed_lines && data.parsed_lines.length > 0
              ? data.parsed_lines[data.parsed_lines.length - 1].time_ms + 15000
              : 0);

        if (resolvedDuration > 0) {
          setMedia((prev) => ({
            ...prev,
            duration_ms: prev.duration_ms > 0 ? prev.duration_ms : resolvedDuration,
          }));
        }
      })
      .catch(() => {
        // Fallback or empty lyrics state
        setLyricsData({
          title: media.title,
          artist: media.artist,
          synced_lyrics: null,
          plain_lyrics: null,
          parsed_lines: [],
        });
      })
      .finally(() => {
        setIsLyricsLoading(false);
      });
  }, [media.title, media.artist, media.duration_ms]);

  // Local micro-clock for smooth sub-second progress and auto-scrolling lyrics
  useEffect(() => {
    if (!media.is_playing) return;
    const interval = setInterval(() => {
      setMedia((prev) => {
        if (!prev.is_playing) return prev;
        const nextPos = prev.position_ms + 250;
        const maxPos = prev.duration_ms > 0 ? prev.duration_ms : Infinity;
        return {
          ...prev,
          position_ms: Math.min(nextPos, maxPos),
        };
      });
    }, 250);
    return () => clearInterval(interval);
  }, [media.is_playing, media.duration_ms]);

  // Media Controls handlers
  const handlePlayPause = async () => {
    try {
      const updated = await invoke<MediaSessionInfo>('media_play_pause');
      setMedia(updated);
    } catch {
      setMedia((prev) => ({ ...prev, is_playing: !prev.is_playing }));
    }
  };

  const handleNext = async () => {
    try {
      const updated = await invoke<MediaSessionInfo>('media_skip_next');
      setMedia(updated);
    } catch {}
  };

  const handlePrev = async () => {
    try {
      const updated = await invoke<MediaSessionInfo>('media_skip_previous');
      setMedia(updated);
    } catch {}
  };

  const handleSeek = async (positionMs: number) => {
    try {
      const updated = await invoke<MediaSessionInfo>('media_seek', { positionMs });
      setMedia(updated);
    } catch {
      setMedia((prev) => ({ ...prev, position_ms: positionMs }));
    }
  };

  return (
    <main className="w-screen h-screen bg-transparent overflow-hidden">
      <DynamicIsland
        metrics={metrics}
        media={media}
        lyricsData={lyricsData}
        isLyricsLoading={isLyricsLoading}
        onPlayPause={handlePlayPause}
        onNext={handleNext}
        onPrev={handlePrev}
        onSeek={handleSeek}
      />
    </main>
  );
}

export default App;
