pub mod lyrics;
pub mod media;
pub mod monitor;

use lyrics::{LyricsData, LyricsState};
use media::{MediaManager, MediaSessionInfo};
use monitor::{MonitorState, SystemMetrics};
use std::sync::Arc;
use tauri::{Emitter, Manager, State, Window};

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
fn start_window_drag(window: Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_is_notch(window: Window) -> Result<bool, String> {
    if let Ok(pos) = window.outer_position() {
        if let Ok(Some(monitor)) = window.current_monitor() {
            let scale_factor = monitor.scale_factor();
            let logical_y = pos.y as f64 / scale_factor;
            return Ok(logical_y <= 65.0);
        }
        Ok(pos.y <= 65)
    } else {
        Ok(true)
    }
}

#[tauri::command]
fn set_island_window_size(
    window: Window,
    width: f64,
    height: f64,
    y_offset: Option<f64>,
) -> Result<(), String> {
    let scale_factor = window
        .current_monitor()
        .ok()
        .flatten()
        .map(|m| m.scale_factor())
        .unwrap_or(1.0);

    let current_is_notch = window
        .outer_position()
        .map(|pos| (pos.y as f64 / scale_factor) <= 65.0)
        .unwrap_or(true);

    if let Ok(Some(monitor)) = window.current_monitor() {
        let screen_width = monitor.size().width as f64 / scale_factor;
        let new_x = ((screen_width - width) / 2.0).max(0.0);

        if current_is_notch {
            let _ = window.set_position(tauri::LogicalPosition::new(new_x, 0.0));
        } else if let Some(y) = y_offset {
            let _ = window.set_position(tauri::LogicalPosition::new(new_x, y));
        }
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
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Moved(pos) = event {
                let (logical_y, scale_factor, screen_width) =
                    if let Ok(Some(monitor)) = window.current_monitor() {
                        let sf = monitor.scale_factor();
                        let sw = monitor.size().width as f64 / sf;
                        (pos.y as f64 / sf, sf, sw)
                    } else {
                        (pos.y as f64, 1.0, 1920.0)
                    };

                if logical_y <= 65.0 {
                    // Magnetic snap: pull to y=0 and re-center when near top edge
                    if pos.y > 0 {
                        if let Ok(win_size) = window.inner_size() {
                            let win_width = win_size.width as f64 / scale_factor;
                            let center_x = ((screen_width - win_width) / 2.0).max(0.0);
                            let _ = window.set_position(tauri::LogicalPosition::new(center_x, 0.0));
                        }
                    }
                    let _ = window.emit("edge-snap-status", true);
                } else {
                    let _ = window.emit("edge-snap-status", false);
                }
            }
        })
        .setup(move |app| {
            let handle = app.handle().clone();

            // Position initial window at top-center as a notch
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
            start_window_drag,
            get_is_notch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AetherIsland application");
}
