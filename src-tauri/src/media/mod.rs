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
        #[cfg(target_os = "windows")]
        {
            let _ = windows_media::trigger_seek(position_ms);
        }

        let mut curr = self.current.lock().unwrap();
        curr.position_ms = if curr.duration_ms > 0 {
            position_ms.min(curr.duration_ms)
        } else {
            position_ms
        };
        *self.last_native_pos.lock().unwrap() = Some(curr.position_ms);
        curr.clone()
    }

    pub fn update_from_native(&self, info: MediaSessionInfo) {
        let mut curr = self.current.lock().unwrap();
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
            // Only accept native position if it significantly jumped (> 3000ms seek)
            // and prevent resetting to 0 while playback is active
            let diff = (info.position_ms as i64 - curr.position_ms as i64).abs();
            if diff > 3000 && (info.position_ms > 0 || !curr.is_playing) {
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
                if curr.is_playing {
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
            let async_op = GlobalSystemMediaTransportControlsSessionManager::RequestAsync();
            if let Ok(session_manager) = async_op.and_then(|op| op.get()) {
                // Poll or subscribe to session changes
                loop {
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
                                    if let Ok(pos) = tl.Position() {
                                        pos_ms = (pos.Duration / 10000) as u64;
                                    }
                                    if let Ok(end) = tl.EndTime() {
                                        dur_ms = (end.Duration / 10000) as u64;
                                    }
                                }

                                let playback_info = current_session.GetPlaybackInfo();
                                let is_playing = playback_info
                                    .map(|p| p.PlaybackStatus().unwrap_or_default().0 == 4) // 4 = Playing
                                    .unwrap_or(false);

                                if !title.is_empty() {
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

    pub fn trigger_seek(position_ms: u64) -> Result<(), ()> {
        let op = GlobalSystemMediaTransportControlsSessionManager::RequestAsync();
        if let Ok(mgr) = op.and_then(|o| o.get()) {
            if let Ok(session) = mgr.GetCurrentSession() {
                let pos_100ns = (position_ms as i64) * 10_000;
                let _ = session.TryChangePlaybackPositionAsync(pos_100ns);
                return Ok(());
            }
        }
        Err(())
    }
}
