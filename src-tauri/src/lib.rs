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

#[derive(Debug, Clone, Copy)]
pub struct ScreenBounds {
    pub left: f64,
    pub top: f64,
    pub right: f64,
    pub bottom: f64,
}

// Tighter magnetic snap attraction threshold (in logical pixels)
const SNAP_THRESHOLD_TOP: f64 = 32.0;
const SNAP_THRESHOLD_BOTTOM: f64 = 32.0;
const SNAP_THRESHOLD_SIDES: f64 = 28.0;
const SCREEN_MARGIN_X: f64 = 16.0;

fn get_monitor_screen_bounds(window: &Window) -> Option<ScreenBounds> {
    let monitor = window.current_monitor().ok().flatten()?;
    let scale_factor = monitor.scale_factor();

    let mon_pos = monitor.position();
    let mon_size = monitor.size();
    let left = mon_pos.x as f64 / scale_factor;
    let top = mon_pos.y as f64 / scale_factor;
    let width = mon_size.width as f64 / scale_factor;
    let height = mon_size.height as f64 / scale_factor;

    Some(ScreenBounds {
        left,
        top,
        right: left + width,
        bottom: top + height,
    })
}

fn ensure_always_on_top(window: &Window) {
    let _ = window.set_always_on_top(true);

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
        };

        if let Ok(hwnd_ptr) = window.hwnd() {
            unsafe {
                let hwnd = HWND(hwnd_ptr.0);
                let _ = SetWindowPos(
                    hwnd,
                    HWND_TOPMOST,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                );
            }
        }
    }
}

fn snap_window_to_edges(window: &Window) -> String {
    let scale_factor = window
        .current_monitor()
        .ok()
        .flatten()
        .map(|m| m.scale_factor())
        .unwrap_or(1.0);

    let current_pos = match window.outer_position() {
        Ok(p) => p,
        Err(_) => return "floating".to_string(),
    };
    let current_size = match window.outer_size() {
        Ok(s) => s,
        Err(_) => return "floating".to_string(),
    };

    let screen = match get_monitor_screen_bounds(window) {
        Some(s) => s,
        None => return "floating".to_string(),
    };

    let cur_x = current_pos.x as f64 / scale_factor;
    let cur_y = current_pos.y as f64 / scale_factor;
    let cur_w = current_size.width as f64 / scale_factor;
    let cur_h = current_size.height as f64 / scale_factor;

    let screen_w = screen.right - screen.left;

    // 1. Vertical snapping:
    // Distance from top: negative if dragged above screen, positive if below top edge
    let dist_from_top = cur_y - screen.top;
    // Distance from bottom: negative if dragged below screen, positive if above bottom edge
    let dist_from_bottom = screen.bottom - (cur_y + cur_h);

    let (snapped_y, dock_status) = if dist_from_top <= SNAP_THRESHOLD_TOP {
        // Snap flush to top edge (works even if user dragged into negative coordinates)
        (screen.top, "top")
    } else if dist_from_bottom <= SNAP_THRESHOLD_BOTTOM {
        // Snap flush to bottom edge exactly like top
        (screen.bottom - cur_h, "bottom")
    } else {
        (cur_y, "floating")
    };

    // 2. Horizontal magnetic snapping
    let dist_from_left = cur_x - screen.left;
    let dist_from_right = screen.right - (cur_x + cur_w);
    let center_x = screen.left + (screen_w - cur_w) / 2.0;
    let dist_from_center = (cur_x - center_x).abs();

    let snapped_x = if dist_from_left <= SNAP_THRESHOLD_SIDES {
        // Magnetic pull to left margin (16px)
        screen.left + SCREEN_MARGIN_X
    } else if dist_from_right <= SNAP_THRESHOLD_SIDES {
        // Magnetic pull to right margin (16px)
        screen.right - cur_w - SCREEN_MARGIN_X
    } else if dist_from_center <= 30.0 {
        // Magnetic pull to exact horizontal center
        center_x
    } else {
        // Clamp within screen boundaries
        cur_x.max(screen.left).min(screen.right - cur_w)
    };

    let _ = window.set_position(tauri::LogicalPosition::new(snapped_x, snapped_y));
    ensure_always_on_top(window);
    let _ = window.emit("edge-snap-status", dock_status);

    dock_status.to_string()
}

#[cfg(target_os = "windows")]
extern "system" {
    fn GetAsyncKeyState(vKey: i32) -> i16;
}

#[tauri::command]
async fn start_window_drag(window: Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    {
        // Allow brief time for the native modal drag loop to engage
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        let mut loop_count = 0;
        // While left mouse button (VK_LBUTTON = 0x01) is held down, user is still actively dragging
        while (unsafe { GetAsyncKeyState(0x01) } as u16 & 0x8000) != 0 && loop_count < 1800 {
            tokio::time::sleep(std::time::Duration::from_millis(16)).await;
            loop_count += 1;
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }

    // Left mouse button has now been released by the user!
    // Allow brief time for Windows DWM drop coordinates to settle
    tokio::time::sleep(std::time::Duration::from_millis(35)).await;
    snap_window_to_edges(&window);
    Ok(())
}

#[tauri::command]
fn snap_island(window: Window) -> Result<String, String> {
    Ok(snap_window_to_edges(&window))
}

#[tauri::command]
fn get_dock_status(window: Window) -> Result<String, String> {
    if let Some(screen) = get_monitor_screen_bounds(&window) {
        if let Ok(pos) = window.outer_position() {
            let scale_factor = window
                .current_monitor()
                .ok()
                .flatten()
                .map(|m| m.scale_factor())
                .unwrap_or(1.0);
            let logical_y = pos.y as f64 / scale_factor;
            let logical_h = window
                .outer_size()
                .map(|s| s.height as f64 / scale_factor)
                .unwrap_or(38.0);

            if (logical_y - screen.top) <= SNAP_THRESHOLD_TOP {
                return Ok("top".to_string());
            } else if (screen.bottom - (logical_y + logical_h)) <= SNAP_THRESHOLD_BOTTOM {
                return Ok("bottom".to_string());
            } else {
                return Ok("floating".to_string());
            }
        }
    }
    Ok("top".to_string())
}

#[tauri::command]
fn get_is_notch(window: Window) -> Result<bool, String> {
    get_dock_status(window).map(|s| s == "top")
}

#[tauri::command]
fn set_island_window_size(
    window: Window,
    width: f64,
    height: f64,
    _y_offset: Option<f64>,
) -> Result<(), String> {
    let scale_factor = window
        .current_monitor()
        .ok()
        .flatten()
        .map(|m| m.scale_factor())
        .unwrap_or(1.0);

    let current_pos = window.outer_position().unwrap_or_default();
    let current_size = window.outer_size().unwrap_or_default();

    let cur_x = current_pos.x as f64 / scale_factor;
    let cur_y = current_pos.y as f64 / scale_factor;
    let old_w = current_size.width as f64 / scale_factor;
    let old_h = current_size.height as f64 / scale_factor;

    let screen = get_monitor_screen_bounds(&window).unwrap_or(ScreenBounds {
        left: 0.0,
        top: 0.0,
        right: 1920.0,
        bottom: 1080.0,
    });
    let screen_w = screen.right - screen.left;

    let is_docked_top = (cur_y - screen.top) <= SNAP_THRESHOLD_TOP;
    let is_docked_bottom = (screen.bottom - (cur_y + old_h)) <= SNAP_THRESHOLD_BOTTOM;

    // Vertical positioning:
    let new_y = if is_docked_top {
        // Top edge remains pinned flush to top of the screen
        screen.top
    } else if is_docked_bottom {
        // Bottom edge remains pinned flush to bottom of screen (grows upward)
        screen.bottom - height
    } else {
        // Floating: expand symmetrically from vertical center
        (cur_y + (old_h - height) / 2.0)
            .max(screen.top)
            .min(screen.bottom - height)
    };

    // Horizontal positioning:
    let is_pinned_left = (cur_x - (screen.left + SCREEN_MARGIN_X)).abs() <= 25.0;
    let is_pinned_right = (screen.right - (cur_x + old_w) - SCREEN_MARGIN_X).abs() <= 25.0;
    let old_center_x = screen.left + (screen_w - old_w) / 2.0;
    let is_centered = (cur_x - old_center_x).abs() <= 30.0;

    let new_x = if is_pinned_left {
        screen.left + SCREEN_MARGIN_X
    } else if is_pinned_right {
        screen.right - width - SCREEN_MARGIN_X
    } else if is_centered {
        screen.left + (screen_w - width) / 2.0
    } else {
        (cur_x + (old_w - width) / 2.0)
            .max(screen.left)
            .min(screen.right - width)
    };

    let size = tauri::LogicalSize::new(width, height);
    window
        .set_size(size)
        .map_err(|e| format!("Failed to set window size: {}", e))?;
    let _ = window.set_position(tauri::LogicalPosition::new(new_x, new_y));
    ensure_always_on_top(&window);

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
                let scale_factor = window
                    .current_monitor()
                    .ok()
                    .flatten()
                    .map(|m| m.scale_factor())
                    .unwrap_or(1.0);

                let logical_y = pos.y as f64 / scale_factor;
                let logical_h = window
                    .outer_size()
                    .map(|s| s.height as f64 / scale_factor)
                    .unwrap_or(38.0);

                if let Some(screen) = get_monitor_screen_bounds(window) {
                    let is_top = (logical_y - screen.top) <= SNAP_THRESHOLD_TOP;
                    let is_bottom = (screen.bottom - (logical_y + logical_h)) <= SNAP_THRESHOLD_BOTTOM;
                    let status = if is_top {
                        "top"
                    } else if is_bottom {
                        "bottom"
                    } else {
                        "floating"
                    };
                    let _ = window.emit("edge-snap-status", status);
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
                let _ = window.set_always_on_top(true);
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
            snap_island,
            get_is_notch,
            get_dock_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AetherIsland application");
}
