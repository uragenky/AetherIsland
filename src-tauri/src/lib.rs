pub mod lyrics;
pub mod media;
pub mod monitor;

use lyrics::{LyricsData, LyricsState};
use media::{MediaManager, MediaSessionInfo};
use monitor::{MonitorState, SystemMetrics};
use std::sync::Arc;
use tauri::{Manager, State, Window};

struct AppState {
    monitor: Arc<MonitorState>,
    media: Arc<MediaManager>,
    lyrics: Arc<LyricsState>,
}

#[tauri::command]
fn get_system_metrics(state: State<'_, AppState>) -> SystemMetrics {
    state.monitor.collect_metrics()
}

#[tauri::command]
fn get_media_info(state: State<'_, AppState>) -> MediaSessionInfo {
    state.media.get_info()
}

#[tauri::command]
fn media_play_pause(state: State<'_, AppState>) -> MediaSessionInfo {
    state.media.play_pause()
}

#[tauri::command]
fn media_skip_next(state: State<'_, AppState>) -> MediaSessionInfo {
    state.media.skip_next()
}

#[tauri::command]
fn media_skip_previous(state: State<'_, AppState>) -> MediaSessionInfo {
    state.media.skip_previous()
}

#[tauri::command]
fn media_seek(state: State<'_, AppState>, position_ms: u64) -> MediaSessionInfo {
    state.media.seek(position_ms)
}

#[tauri::command]
async fn get_lyrics(
    state: State<'_, AppState>,
    title: String,
    artist: String,
    duration_secs: Option<u64>,
) -> Result<LyricsData, String> {
    state.lyrics.fetch_lyrics(&title, &artist, duration_secs).await
}

#[tauri::command]
fn set_island_window_size(
    window: Window,
    width: f64,
    height: f64,
    y_offset: Option<f64>,
) -> Result<(), String> {
    if let Ok(Some(monitor)) = window.current_monitor() {
        let scale_factor = monitor.scale_factor();
        let screen_width = monitor.size().width as f64 / scale_factor;
        let new_x = ((screen_width - width) / 2.0).max(0.0);
        let new_y = y_offset.unwrap_or(0.0);
        let _ = window.set_position(tauri::LogicalPosition::new(new_x, new_y));
    }
    let size = tauri::LogicalSize::new(width, height);
    window
        .set_size(size)
        .map_err(|e| format!("Failed to set window size: {}", e))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let monitor = Arc::new(MonitorState::new());
    let media = Arc::new(MediaManager::new());
    let lyrics = Arc::new(LyricsState::new());

    let state = AppState {
        monitor: monitor.clone(),
        media: media.clone(),
        lyrics: lyrics.clone(),
    };

    tauri::Builder::default()
        .manage(state)
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            let handle = app.handle().clone();

            // Position initial window at top-center
            if let Some(window) = app.get_webview_window("main") {
                let initial_w = 320.0;
                let initial_h = 44.0;
                if let Ok(Some(monitor)) = window.current_monitor() {
                    let scale_factor = monitor.scale_factor();
                    let screen_width = monitor.size().width as f64 / scale_factor;
                    let new_x = ((screen_width - initial_w) / 2.0).max(0.0);
                    let _ = window.set_position(tauri::LogicalPosition::new(new_x, 0.0));
                }
                let _ = window.set_size(tauri::LogicalSize::new(initial_w, initial_h));
            }

            monitor::start_monitor_thread(handle.clone(), monitor);
            media::start_media_service(handle, media);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_system_metrics,
            get_media_info,
            media_play_pause,
            media_skip_next,
            media_skip_previous,
            media_seek,
            get_lyrics,
            set_island_window_size,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AetherIsland application");
}
