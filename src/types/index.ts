export interface SystemMetrics {
  cpu_usage: number;
  ram_used_bytes: number;
  ram_total_bytes: number;
  ram_percentage: number;
  gpu_usage?: number | null;
  battery_percentage?: number | null;
  is_charging: boolean;
  net_download_kbps: number;
  net_upload_kbps: number;
}

export interface MediaSessionInfo {
  has_media: boolean;
  title: string;
  artist: string;
  album: string;
  cover_url?: string | null;
  is_playing: boolean;
  position_ms: number;
  duration_ms: number;
}

export interface LyricLine {
  time_ms: number;
  text: string;
}

export interface LyricsData {
  title: string;
  artist: string;
  duration_ms?: number | null;
  synced_lyrics?: string | null;
  plain_lyrics?: string | null;
  parsed_lines: LyricLine[];
}

export interface LyricsCandidate {
  id: number;
  track_name: string;
  artist_name: string;
  album_name?: string | null;
  duration?: number | null;
  instrumental: boolean;
  has_synced: boolean;
}

export type IslandMode = 'compact' | 'expanded' | 'lyrics';

export type EyeMood = 'idle' | 'happy' | 'groove' | 'look_at' | 'stress' | 'sleepy' | 'wink';
