pub mod lyrics;
pub mod media;
pub mod monitor;

use lyrics::{LyricsData, LyricsState};
use media::{MediaManager, MediaSessionInfo};
use monitor::{MonitorState, SystemMetrics};
use std::sync::Arc;
use tauri::{
    menu::{CheckMenuItemBuilder, MenuBuilder, SubmenuBuilder},
    Emitter, Manager, State, Window,
};

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
async fn search_lyrics_candidates(
    state: State<'_, AppState>,
    title: String,
    artist: String,
) -> Result<Vec<lyrics::LyricsCandidate>, String> {
    state.lyrics.search_candidates(&title, &artist).await
}

#[tauri::command]
async fn get_lyrics_by_id(
    state: State<'_, AppState>,
    id: u64,
    title: Option<String>,
    artist: Option<String>,
) -> Result<LyricsData, String> {
    state.lyrics.fetch_by_id(id, title, artist).await
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

pub static IS_POPUP_MENU_OPEN: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

#[cfg(target_os = "windows")]
unsafe fn is_start_menu_or_flyout_open() -> bool {
    use windows::Win32::UI::WindowsAndMessaging::{
        FindWindowW, GetClassNameW, GetForegroundWindow, IsWindowVisible,
    };
    use windows::core::{w, PCWSTR};

    // 1. Check if the active foreground window belongs to Start Menu or Windows Shell flyouts
    let fg = GetForegroundWindow();
    if !fg.0.is_null() {
        let mut class_buf = [0u16; 64];
        let len = GetClassNameW(fg, &mut class_buf) as usize;
        if len > 0 {
            let class_name = String::from_utf16_lossy(&class_buf[..len]);
            if class_name.contains("Windows.UI.Core.CoreWindow")
                || class_name.contains("StartMenuExperienceHost")
                || class_name.contains("XamlExplorerHostIslandWindow")
                || class_name.contains("Shell_LightDismissOverlay")
            {
                return true;
            }
        }
    }

    // 2. Check if the Windows Shell light-dismiss overlay is active
    if let Ok(overlay) = FindWindowW(w!("Shell_LightDismissOverlay"), PCWSTR::null()) {
        if !overlay.0.is_null() && IsWindowVisible(overlay).as_bool() {
            return true;
        }
    }

    // 3. Check if Start Menu CoreWindow is visible
    if let Ok(start) = FindWindowW(w!("Windows.UI.Core.CoreWindow"), w!("Start")) {
        if !start.0.is_null() && IsWindowVisible(start).as_bool() {
            return true;
        }
    }

    false
}

#[cfg(target_os = "windows")]
unsafe fn is_island_covered_by_taskbar(island_hwnd: windows::Win32::Foundation::HWND) -> bool {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetClassNameW, GetWindow, IsWindowVisible, GW_HWNDPREV,
    };

    let mut curr = island_hwnd;
    let mut depth = 0;
    while depth < 50 {
        depth += 1;
        match GetWindow(curr, GW_HWNDPREV) {
            Ok(above) => {
                if above.0.is_null() {
                    break;
                }
                if IsWindowVisible(above).as_bool() {
                    let mut class_buf = [0u16; 64];
                    let len = GetClassNameW(above, &mut class_buf) as usize;
                    if len > 0 {
                        let class_name = String::from_utf16_lossy(&class_buf[..len]);
                        if class_name == "Shell_TrayWnd" || class_name == "Shell_SecondaryTrayWnd" {
                            return true;
                        }
                    }
                }
                curr = above;
            }
            Err(_) => break,
        }
    }
    false
}

pub fn ensure_always_on_top(window: &Window) {
    if IS_POPUP_MENU_OPEN.load(std::sync::atomic::Ordering::Relaxed) {
        return;
    }
    let _ = window.set_always_on_top(true);

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER, SWP_NOSIZE,
        };

        unsafe {
            if is_start_menu_or_flyout_open() {
                return;
            }

            if let Ok(hwnd_ptr) = window.hwnd() {
                let hwnd = HWND(hwnd_ptr.0);
                let _ = SetWindowPos(
                    hwnd,
                    HWND_TOPMOST,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER,
                );
            }
        }
    }
}

pub fn ensure_above_taskbar(window: &Window) {
    if IS_POPUP_MENU_OPEN.load(std::sync::atomic::Ordering::Relaxed) {
        return;
    }

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER, SWP_NOSIZE,
        };

        unsafe {
            if is_start_menu_or_flyout_open() {
                return;
            }

            if let Ok(hwnd_ptr) = window.hwnd() {
                let hwnd = HWND(hwnd_ptr.0);
                if is_island_covered_by_taskbar(hwnd) {
                    let _ = SetWindowPos(
                        hwnd,
                        HWND_TOPMOST,
                        0,
                        0,
                        0,
                        0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER,
                    );
                }
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = window;
    }
}

#[tauri::command]
fn force_topmost(window: Window) {
    ensure_always_on_top(&window);
}

#[derive(serde::Deserialize, serde::Serialize, Clone, Copy, Debug)]
pub struct VisibleStatsConfig {
    pub cpu: bool,
    pub ram: bool,
    pub gpu: bool,
    pub battery: bool,
    pub net: bool,
}

#[tauri::command]
fn show_context_menu(window: Window, config: Option<VisibleStatsConfig>) -> Result<(), String> {
    IS_POPUP_MENU_OPEN.store(true, std::sync::atomic::Ordering::SeqCst);
    let cfg = config.unwrap_or(VisibleStatsConfig {
        cpu: true,
        ram: true,
        gpu: true,
        battery: true,
        net: true,
    });

    let check_cpu = CheckMenuItemBuilder::new("CPU Usage")
        .id("toggle_cpu")
        .checked(cfg.cpu)
        .build(&window)
        .map_err(|e| e.to_string())?;

    let check_ram = CheckMenuItemBuilder::new("RAM Usage")
        .id("toggle_ram")
        .checked(cfg.ram)
        .build(&window)
        .map_err(|e| e.to_string())?;

    let check_gpu = CheckMenuItemBuilder::new("GPU Usage")
        .id("toggle_gpu")
        .checked(cfg.gpu)
        .build(&window)
        .map_err(|e| e.to_string())?;

    let check_battery = CheckMenuItemBuilder::new("Battery")
        .id("toggle_battery")
        .checked(cfg.battery)
        .build(&window)
        .map_err(|e| e.to_string())?;

    let check_net = CheckMenuItemBuilder::new("Bandwidth (Net)")
        .id("toggle_net")
        .checked(cfg.net)
        .build(&window)
        .map_err(|e| e.to_string())?;

    let stats_submenu = SubmenuBuilder::new(&window, "Visible Metrics")
        .item(&check_cpu)
        .item(&check_ram)
        .item(&check_gpu)
        .item(&check_battery)
        .item(&check_net)
        .build()
        .map_err(|e| e.to_string())?;

    let menu = MenuBuilder::new(&window)
        .text("dashboard", "Toggle Dashboard")
        .text("stats", "Toggle Hardware Stats")
        .item(&stats_submenu)
        .text("reset", "Reset Position")
        .separator()
        .text("exit", "Quit AetherIsland")
        .build()
        .map_err(|e| {
            IS_POPUP_MENU_OPEN.store(false, std::sync::atomic::Ordering::SeqCst);
            e.to_string()
        })?;

    let res = window.popup_menu(&menu);
    // Cool down so SetWindowPos doesn't interrupt menu closure animation
    std::thread::spawn(|| {
        std::thread::sleep(std::time::Duration::from_millis(400));
        IS_POPUP_MENU_OPEN.store(false, std::sync::atomic::Ordering::SeqCst);
    });
    res.map_err(|e| e.to_string())
}

#[tauri::command]
fn exit_app(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

#[tauri::command]
fn reset_island_position(window: Window) -> Result<(), String> {
    let scale_factor = window
        .current_monitor()
        .ok()
        .flatten()
        .map(|m| m.scale_factor())
        .unwrap_or(1.0);

    let screen = get_monitor_screen_bounds(&window).unwrap_or(ScreenBounds {
        left: 0.0,
        top: 0.0,
        right: 1920.0,
        bottom: 1080.0,
    });
    let screen_w = screen.right - screen.left;
    let current_size = window.outer_size().unwrap_or_default();
    let cur_w = current_size.width as f64 / scale_factor;

    let target_x = screen.left + (screen_w - cur_w) / 2.0;
    let target_y = screen.top;

    let _ = window.set_position(tauri::LogicalPosition::new(target_x, target_y));
    let _ = window.emit("edge-snap-status", "top");
    ensure_always_on_top(&window);
    Ok(())
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

#[tauri::command]
fn change_volume(steps: i32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    unsafe {
        extern "system" {
            fn keybd_event(b_vk: u8, b_scan: u8, dw_flags: u32, dw_extra_info: usize);
        }
        let vk = if steps > 0 { 0xAF } else { 0xAE }; // VK_VOLUME_UP (0xAF), VK_VOLUME_DOWN (0xAE)
        let count = steps.abs().min(10);
        for _ in 0..count {
            keybd_event(vk, 0, 0, 0);
            keybd_event(vk, 0, 0x0002, 0); // KEYEVENTF_KEYUP
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = steps;
    }
    Ok(())
}

#[tauri::command]
fn toggle_mute() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    unsafe {
        extern "system" {
            fn keybd_event(b_vk: u8, b_scan: u8, dw_flags: u32, dw_extra_info: usize);
        }
        keybd_event(0xAD, 0, 0, 0); // VK_VOLUME_MUTE
        keybd_event(0xAD, 0, 0x0002, 0);
    }
    Ok(())
}

#[tauri::command]
fn launch_task_manager() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("taskmgr.exe")
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("gnome-system-monitor")
            .spawn()
            .or_else(|_| std::process::Command::new("htop").spawn());
    }
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
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "dashboard" => {
                    let _ = app.emit("menu-toggle-dashboard", ());
                }
                "stats" => {
                    let _ = app.emit("menu-toggle-stats", ());
                }
                "toggle_cpu" => {
                    let _ = app.emit("menu-toggle-stat", "cpu");
                }
                "toggle_ram" => {
                    let _ = app.emit("menu-toggle-stat", "ram");
                }
                "toggle_gpu" => {
                    let _ = app.emit("menu-toggle-stat", "gpu");
                }
                "toggle_battery" => {
                    let _ = app.emit("menu-toggle-stat", "battery");
                }
                "toggle_net" => {
                    let _ = app.emit("menu-toggle-stat", "net");
                }
                "reset" => {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = reset_island_position(win.as_ref().window().clone());
                    }
                }
                "exit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
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
            search_lyrics_candidates,
            get_lyrics_by_id,
            set_island_window_size,
            start_window_drag,
            snap_island,
            get_is_notch,
            get_dock_status,
            force_topmost,
            show_context_menu,
            exit_app,
            reset_island_position,
            change_volume,
            toggle_mute,
            launch_task_manager,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AetherIsland application");
}
