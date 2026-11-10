use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaSessionInfo {
    pub has_media: bool,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub cover_url: Option<String>,
    pub is_playing: bool,
    pub position_ms: u64,
    pub duration_ms: u64,
}

impl Default for MediaSessionInfo {
    fn default() -> Self {
        Self {
            has_media: false,
            title: "".to_string(),
            artist: "".to_string(),
            album: "".to_string(),
            cover_url: None,
            is_playing: false,
            position_ms: 0,
            duration_ms: 0,
        }
    }
}

pub struct MediaManager {
    current: Mutex<MediaSessionInfo>,
    last_native_pos: Mutex<Option<u64>>,
}

impl MediaManager {
    pub fn new() -> Self {
        Self {
            current: Mutex::new(MediaSessionInfo::default()),
            last_native_pos: Mutex::new(None),
        }
    }

    pub fn get_info(&self) -> MediaSessionInfo {
        self.current.lock().unwrap().clone()
    }

    pub fn play_pause(&self) -> MediaSessionInfo {
        #[cfg(target_os = "windows")]
        {
            let _ = windows_media::trigger_play_pause();
        }

        let mut curr = self.current.lock().unwrap();
        if curr.has_media {
            curr.is_playing = !curr.is_playing;
        }
        curr.clone()
    }

    pub fn skip_next(&self) -> MediaSessionInfo {
        #[cfg(target_os = "windows")]
        {
            let _ = windows_media::trigger_skip_next();
        }

        let mut curr = self.current.lock().unwrap();
        curr.position_ms = 0;
        curr.clone()
    }

    pub fn skip_previous(&self) -> MediaSessionInfo {
        #[cfg(target_os = "windows")]
        {
            let _ = windows_media::trigger_skip_previous();
        }

        let mut curr = self.current.lock().unwrap();
        curr.position_ms = 0;
        curr.clone()
    }

    pub fn seek(&self, position_ms: u64) -> MediaSessionInfo {
        #[allow(unused_mut)]
        let mut seek_success = false;
        #[cfg(target_os = "windows")]
        {
            if let Ok(success) = windows_media::trigger_seek(position_ms) {
                seek_success = success;
            }
        }

        let mut curr = self.current.lock().unwrap();
        if seek_success {
            curr.position_ms = if curr.duration_ms > 0 {
                position_ms.min(curr.duration_ms)
            } else {
                position_ms
            };
            *self.last_native_pos.lock().unwrap() = Some(curr.position_ms);
        }
        // If seeking was not supported or failed (e.g. YouTube in browser, Foobar2000),
        // do NOT mutate curr.position_ms so the seekbar snaps back to the real playing time
        curr.clone()
    }

    pub fn update_from_native(&self, info: MediaSessionInfo) {
        let mut curr = self.current.lock().unwrap();
        if !info.has_media {
            *curr = MediaSessionInfo::default();
            *self.last_native_pos.lock().unwrap() = None;
            return;
        }

        let track_changed = curr.title != info.title || curr.artist != info.artist;
        if track_changed {
            *curr = info.clone();
            *self.last_native_pos.lock().unwrap() = Some(info.position_ms);
            return;
        }

        curr.is_playing = info.is_playing;
        curr.has_media = info.has_media;
        if info.duration_ms > 0 {
            curr.duration_ms = info.duration_ms;
        }

        let mut last_native = self.last_native_pos.lock().unwrap();
        let native_changed = match *last_native {
            Some(prev) => prev != info.position_ms,
            None => true,
        };

        if native_changed {
            *last_native = Some(info.position_ms);
            // Accept native position if it significantly jumped (> 1500ms seek)
            // or if it reset to 0 (rewind), or if playback is paused
            let diff = (info.position_ms as i64 - curr.position_ms as i64).abs();
            if diff > 1500 || info.position_ms == 0 || !curr.is_playing {
                curr.position_ms = info.position_ms;
            }
        }
    }
}

pub fn start_media_service(app_handle: AppHandle, manager: Arc<MediaManager>) {
    #[cfg(target_os = "windows")]
    {
        windows_media::init_windows_smtc(app_handle.clone(), manager.clone());
    }

    // Background playback position progress ticker (updates position every 500ms if playing)
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_millis(500));
        loop {
            interval.tick().await;
            {
                let mut curr = manager.current.lock().unwrap();
                if curr.has_media && curr.is_playing {
                    if curr.duration_ms > 0 {
                        curr.position_ms = (curr.position_ms + 500).min(curr.duration_ms);
                    } else {
                        curr.position_ms += 500;
                    }
                }
            }
            let info = manager.get_info();
            let _ = app_handle.emit("media-status", &info);
        }
    });
}

#[cfg(target_os = "windows")]
mod windows_media {
    use super::*;
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;

    pub fn init_windows_smtc(app_handle: AppHandle, manager: Arc<MediaManager>) {
        std::thread::spawn(move || {
            unsafe {
                windows::Win32::System::Com::CoInitializeEx(
                    None,
                    windows::Win32::System::Com::COINIT_MULTITHREADED,
                ).ok();
            }

            let async_op = GlobalSystemMediaTransportControlsSessionManager::RequestAsync();
            if let Ok(session_manager) = async_op.and_then(|op| op.get()) {
                // Poll session changes
                loop {
                    let mut session_found = false;
                    if let Ok(current_session) = session_manager.GetCurrentSession() {
                        if let Ok(media_props_op) = current_session.TryGetMediaPropertiesAsync() {
                            if let Ok(props) = media_props_op.get() {
                                let title = props.Title().map(|s| s.to_string()).unwrap_or_default();
                                let artist = props.Artist().map(|s| s.to_string()).unwrap_or_default();
                                let album = props.AlbumTitle().map(|s| s.to_string()).unwrap_or_default();

                                let timeline = current_session.GetTimelineProperties();
                                let mut pos_ms = 0;
                                let mut dur_ms = 0;
                                if let Ok(tl) = timeline {
                                    let start_ticks = tl.StartTime().map(|t| t.Duration).unwrap_or(0);
                                    let end_ticks = tl.EndTime().map(|t| t.Duration).unwrap_or(0);
                                    let max_seek_ticks = tl.MaxSeekTime().map(|t| t.Duration).unwrap_or(0);
                                    let min_seek_ticks = tl.MinSeekTime().map(|t| t.Duration).unwrap_or(0);
                                    let pos_ticks = tl.Position().map(|t| t.Duration).unwrap_or(0);

                                    let dur_ticks = if end_ticks > start_ticks {
                                        end_ticks - start_ticks
                                    } else if max_seek_ticks > min_seek_ticks {
                                        max_seek_ticks - min_seek_ticks
                                    } else {
                                        end_ticks.max(max_seek_ticks)
                                    };
                                    dur_ms = if dur_ticks > 0 { (dur_ticks / 10000) as u64 } else { 0 };

                                    let rel_pos_ticks = if start_ticks > 0 && pos_ticks >= start_ticks {
                                        pos_ticks - start_ticks
                                    } else {
                                        pos_ticks
                                    };
                                    pos_ms = (rel_pos_ticks / 10000) as u64;
                                    if dur_ms > 0 {
                                        pos_ms = pos_ms.min(dur_ms);
                                    }
                                }

                                let playback_info = current_session.GetPlaybackInfo();
                                let is_playing = playback_info
                                    .map(|p| p.PlaybackStatus().unwrap_or_default().0 == 4) // 4 = Playing
                                    .unwrap_or(false);

                                if !title.is_empty() {
                                    session_found = true;
                                    let info = MediaSessionInfo {
                                        has_media: true,
                                        title,
                                        artist,
                                        album,
                                        cover_url: None,
                                        is_playing,
                                        position_ms: pos_ms,
                                        duration_ms: dur_ms,
                                    };
                                    manager.update_from_native(info);
                                    let current = manager.get_info();
                                    let _ = app_handle.emit("media-status", &current);
                                }
                            }
                        }
                    }

                    if !session_found {
                        let had_media = manager.get_info().has_media;
                        if had_media {
                            let empty = MediaSessionInfo::default();
                            manager.update_from_native(empty.clone());
                            let _ = app_handle.emit("media-status", &empty);
                        }
                    }

                    std::thread::sleep(std::time::Duration::from_millis(1500));
                }
            }
        });
    }

    pub fn trigger_play_pause() -> Result<(), ()> {
        let op = GlobalSystemMediaTransportControlsSessionManager::RequestAsync();
        if let Ok(mgr) = op.and_then(|o| o.get()) {
            if let Ok(session) = mgr.GetCurrentSession() {
                let _ = session.TryTogglePlayPauseAsync();
                return Ok(());
            }
        }
        Err(())
    }

    pub fn trigger_skip_next() -> Result<(), ()> {
        let op = GlobalSystemMediaTransportControlsSessionManager::RequestAsync();
        if let Ok(mgr) = op.and_then(|o| o.get()) {
            if let Ok(session) = mgr.GetCurrentSession() {
                let _ = session.TrySkipNextAsync();
                return Ok(());
            }
        }
        Err(())
    }

    pub fn trigger_skip_previous() -> Result<(), ()> {
        let op = GlobalSystemMediaTransportControlsSessionManager::RequestAsync();
        if let Ok(mgr) = op.and_then(|o| o.get()) {
            if let Ok(session) = mgr.GetCurrentSession() {
                let _ = session.TrySkipPreviousAsync();
                return Ok(());
            }
        }
        Err(())
    }

    pub fn trigger_seek(position_ms: u64) -> Result<bool, ()> {
        let op = GlobalSystemMediaTransportControlsSessionManager::RequestAsync();
        if let Ok(mgr) = op.and_then(|o| o.get()) {
            if let Ok(session) = mgr.GetCurrentSession() {
                // Check if playback position changing is supported by the active player
                let is_seek_enabled = session
                    .GetPlaybackInfo()
                    .ok()
                    .and_then(|pi| pi.Controls().ok())
                    .and_then(|c| c.IsPlaybackPositionEnabled().ok())
                    .unwrap_or(false);

                if !is_seek_enabled {
                    return Ok(false);
                }

                let start_100ns = session
                    .GetTimelineProperties()
                    .ok()
                    .and_then(|tl| tl.StartTime().ok())
                    .map(|st| st.Duration)
                    .unwrap_or(0);
                let pos_100ns = (position_ms as i64) * 10_000 + start_100ns;
                if let Ok(async_op) = session.TryChangePlaybackPositionAsync(pos_100ns) {
                    if let Ok(success) = async_op.get() {
                        return Ok(success);
                    }
                }
            }
        }
        Err(())
    }
}
