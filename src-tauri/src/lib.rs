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
pub struct WorkArea {
    pub left: f64,
    pub top: f64,
    pub right: f64,
    pub bottom: f64,
}

const SNAP_THRESHOLD_Y: f64 = 38.0;
const SNAP_THRESHOLD_X: f64 = 38.0;
const SCREEN_MARGIN_X: f64 = 16.0;

#[cfg(target_os = "windows")]
fn get_windows_work_area(pos_x: i32, pos_y: i32, scale_factor: f64) -> Option<WorkArea> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };

    unsafe {
        let pt = POINT { x: pos_x, y: pos_y };
        let h_mon = MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST);
        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if GetMonitorInfoW(h_mon, &mut mi).as_bool() {
            return Some(WorkArea {
                left: mi.rcWork.left as f64 / scale_factor,
                top: mi.rcWork.top as f64 / scale_factor,
                right: mi.rcWork.right as f64 / scale_factor,
                bottom: mi.rcWork.bottom as f64 / scale_factor,
            });
        }
    }
    None
}

fn get_monitor_work_area(window: &Window) -> Option<WorkArea> {
    let monitor = window.current_monitor().ok().flatten()?;
    let scale_factor = monitor.scale_factor();

    #[cfg(target_os = "windows")]
    {
        let pos = window.outer_position().unwrap_or_default();
        if let Some(wa) = get_windows_work_area(pos.x, pos.y, scale_factor) {
            return Some(wa);
        }
    }

    let mon_pos = monitor.position();
    let mon_size = monitor.size();
    let left = mon_pos.x as f64 / scale_factor;
    let top = mon_pos.y as f64 / scale_factor;
    let width = mon_size.width as f64 / scale_factor;
    let height = mon_size.height as f64 / scale_factor;

    Some(WorkArea {
        left,
        top,
        right: left + width,
        bottom: top + height,
    })
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

    let work_area = match get_monitor_work_area(window) {
        Some(wa) => wa,
        None => return "floating".to_string(),
    };

    let cur_x = current_pos.x as f64 / scale_factor;
    let cur_y = current_pos.y as f64 / scale_factor;
    let cur_w = current_size.width as f64 / scale_factor;
    let cur_h = current_size.height as f64 / scale_factor;

    let work_w = work_area.right - work_area.left;

    // 1. Vertical snapping
    let dist_top = cur_y - work_area.top;
    let dist_bottom = work_area.bottom - (cur_y + cur_h);

    let (snapped_y, dock_status) = if dist_top.abs() <= SNAP_THRESHOLD_Y {
        (work_area.top, "top")
    } else if dist_bottom.abs() <= SNAP_THRESHOLD_Y {
        (work_area.bottom - cur_h, "bottom")
    } else {
        (cur_y, "floating")
    };

    // 2. Horizontal magnetic snapping
    let dist_left = cur_x - work_area.left;
    let dist_right = work_area.right - (cur_x + cur_w);
    let center_x = work_area.left + (work_w - cur_w) / 2.0;
    let dist_center = cur_x - center_x;

    let snapped_x = if dist_left.abs() <= SNAP_THRESHOLD_X {
        // Magnetic pull to left margin
        work_area.left + SCREEN_MARGIN_X
    } else if dist_right.abs() <= SNAP_THRESHOLD_X {
        // Magnetic pull to right margin
        work_area.right - cur_w - SCREEN_MARGIN_X
    } else if dist_center.abs() <= 35.0 {
        // Magnetic pull to exact horizontal center
        center_x
    } else {
        // Clamp within work area
        cur_x.max(work_area.left).min(work_area.right - cur_w)
    };

    let _ = window.set_position(tauri::LogicalPosition::new(snapped_x, snapped_y));
    let _ = window.emit("edge-snap-status", dock_status);

    dock_status.to_string()
}

#[tauri::command]
fn start_window_drag(window: Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())?;
    // Once user drops the window, physically snap to closest edge
    snap_window_to_edges(&window);
    Ok(())
}

#[tauri::command]
fn get_dock_status(window: Window) -> Result<String, String> {
    if let Some(wa) = get_monitor_work_area(&window) {
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

            if (logical_y - wa.top).abs() <= SNAP_THRESHOLD_Y {
                return Ok("top".to_string());
            } else if (wa.bottom - (logical_y + logical_h)).abs() <= SNAP_THRESHOLD_Y {
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

    let work_area = get_monitor_work_area(&window).unwrap_or(WorkArea {
        left: 0.0,
        top: 0.0,
        right: 1920.0,
        bottom: 1080.0,
    });
    let work_w = work_area.right - work_area.left;

    let is_docked_top = (cur_y - work_area.top).abs() <= 12.0;
    let is_docked_bottom = (work_area.bottom - (cur_y + old_h)).abs() <= 12.0;

    // Vertical positioning:
    let new_y = if is_docked_top {
        // Top edge remains pinned flush
        work_area.top
    } else if is_docked_bottom {
        // Bottom edge remains pinned flush: expand upwards
        work_area.bottom - height
    } else {
        // Floating: expand symmetrically from vertical center
        (cur_y + (old_h - height) / 2.0)
            .max(work_area.top)
            .min(work_area.bottom - height)
    };

    // Horizontal positioning:
    let is_pinned_left = (cur_x - (work_area.left + SCREEN_MARGIN_X)).abs() <= 20.0;
    let is_pinned_right = (work_area.right - (cur_x + old_w) - SCREEN_MARGIN_X).abs() <= 20.0;
    let old_center_x = work_area.left + (work_w - old_w) / 2.0;
    let is_centered = (cur_x - old_center_x).abs() <= 25.0;

    let new_x = if is_pinned_left {
        work_area.left + SCREEN_MARGIN_X
    } else if is_pinned_right {
        work_area.right - width - SCREEN_MARGIN_X
    } else if is_centered {
        work_area.left + (work_w - width) / 2.0
    } else {
        (cur_x + (old_w - width) / 2.0)
            .max(work_area.left)
            .min(work_area.right - width)
    };

    let size = tauri::LogicalSize::new(width, height);
    window
        .set_size(size)
        .map_err(|e| format!("Failed to set window size: {}", e))?;
    let _ = window.set_position(tauri::LogicalPosition::new(new_x, new_y));

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

                if let Some(wa) = get_monitor_work_area(window) {
                    let is_top = (logical_y - wa.top).abs() <= SNAP_THRESHOLD_Y;
                    let is_bottom = (wa.bottom - (logical_y + logical_h)).abs() <= SNAP_THRESHOLD_Y;
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
            get_dock_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AetherIsland application");
}
