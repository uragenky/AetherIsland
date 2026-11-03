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
}

impl MediaManager {
    pub fn new() -> Self {
        Self {
            current: Mutex::new(MediaSessionInfo::default()),
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
        curr.is_playing = !curr.is_playing;
        if curr.is_playing && curr.title.is_empty() {
            curr.has_media = true;
            curr.title = "Cruel Summer".to_string();
            curr.artist = "Taylor Swift".to_string();
            curr.album = "Lover".to_string();
            curr.cover_url = Some("https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80".to_string());
            curr.position_ms = 45000;
            curr.duration_ms = 178000;
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
        curr.title = "Starboy".to_string();
        curr.artist = "The Weeknd".to_string();
        curr.album = "Starboy".to_string();
        curr.duration_ms = 230000;
        curr.clone()
    }

    pub fn skip_previous(&self) -> MediaSessionInfo {
        #[cfg(target_os = "windows")]
        {
            let _ = windows_media::trigger_skip_previous();
        }

        let mut curr = self.current.lock().unwrap();
        curr.position_ms = 0;
        curr.title = "Blinding Lights".to_string();
        curr.artist = "The Weeknd".to_string();
        curr.album = "After Hours".to_string();
        curr.duration_ms = 200000;
        curr.clone()
    }

    pub fn seek(&self, position_ms: u64) -> MediaSessionInfo {
        let mut curr = self.current.lock().unwrap();
        curr.position_ms = position_ms.min(curr.duration_ms);
        curr.clone()
    }

    pub fn update_from_native(&self, info: MediaSessionInfo) {
        let mut curr = self.current.lock().unwrap();
        *curr = info;
    }
}

pub fn start_media_service(app_handle: AppHandle, manager: Arc<MediaManager>) {
    #[cfg(target_os = "windows")]
    {
        windows_media::init_windows_smtc(app_handle.clone(), manager.clone());
    }

    // Background playback position progress ticker (updates position every second if playing)
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_millis(1000));
        loop {
            interval.tick().await;
            {
                let mut curr = manager.current.lock().unwrap();
                if curr.is_playing {
                    curr.position_ms = (curr.position_ms + 1000).min(curr.duration_ms);
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
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSession,
        GlobalSystemMediaTransportControlsSessionManager,
    };

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
                                    manager.update_from_native(info.clone());
                                    let _ = app_handle.emit("media-status", &info);
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
}
