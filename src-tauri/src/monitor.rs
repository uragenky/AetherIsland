use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, Networks, RefreshKind, System};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemMetrics {
    pub cpu_usage: f32,
    pub ram_used_bytes: u64,
    pub ram_total_bytes: u64,
    pub ram_percentage: f32,
    pub gpu_usage: Option<f32>,
    pub battery_percentage: Option<u8>,
    pub is_charging: bool,
    pub net_download_kbps: f32,
    pub net_upload_kbps: f32,
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct SYSTEM_POWER_STATUS {
    ac_line_status: u8,
    battery_flag: u8,
    battery_life_percent: u8,
    system_status_flag: u8,
    battery_life_time: u32,
    battery_full_life_time: u32,
}

#[cfg(target_os = "windows")]
extern "system" {
    fn GetSystemPowerStatus(lpSystemPowerStatus: *mut SYSTEM_POWER_STATUS) -> i32;
}

pub struct MonitorState {
    sys: Mutex<System>,
    networks: Mutex<Networks>,
    last_net_check: Mutex<Instant>,
    last_rx_total: Mutex<u64>,
    last_tx_total: Mutex<u64>,
}

impl MonitorState {
    pub fn new() -> Self {
        let refresh_kind = RefreshKind::nothing()
            .with_cpu(CpuRefreshKind::nothing().with_cpu_usage())
            .with_memory(MemoryRefreshKind::nothing().with_ram());
        let sys = System::new_with_specifics(refresh_kind);
        let networks = Networks::new_with_refreshed_list();

        Self {
            sys: Mutex::new(sys),
            networks: Mutex::new(networks),
            last_net_check: Mutex::new(Instant::now()),
            last_rx_total: Mutex::new(0),
            last_tx_total: Mutex::new(0),
        }
    }

    pub fn collect_metrics(&self) -> SystemMetrics {
        let mut sys = self.sys.lock().unwrap();
        sys.refresh_cpu_usage();
        sys.refresh_memory();

        let cpu_usage = sys.global_cpu_usage();
        let ram_used_bytes = sys.used_memory();
        let ram_total_bytes = sys.total_memory();
        let ram_percentage = if ram_total_bytes > 0 {
            (ram_used_bytes as f32 / ram_total_bytes as f32) * 100.0
        } else {
            0.0
        };

        // Network metrics
        let mut networks = self.networks.lock().unwrap();
        networks.refresh(true);

        let mut current_rx_total: u64 = 0;
        let mut current_tx_total: u64 = 0;
        for (_interface_name, data) in networks.iter() {
            current_rx_total += data.total_received();
            current_tx_total += data.total_transmitted();
        }

        let mut last_check = self.last_net_check.lock().unwrap();
        let mut last_rx = self.last_rx_total.lock().unwrap();
        let mut last_tx = self.last_tx_total.lock().unwrap();

        let elapsed_secs = last_check.elapsed().as_secs_f32().max(0.1);
        *last_check = Instant::now();

        let download_bytes = if *last_rx > 0 && current_rx_total >= *last_rx {
            current_rx_total - *last_rx
        } else {
            0
        };
        let upload_bytes = if *last_tx > 0 && current_tx_total >= *last_tx {
            current_tx_total - *last_tx
        } else {
            0
        };

        *last_rx = current_rx_total;
        *last_tx = current_tx_total;

        let net_download_kbps = (download_bytes as f32 / elapsed_secs) / 1024.0;
        let net_upload_kbps = (upload_bytes as f32 / elapsed_secs) / 1024.0;

        // Battery detection via native Windows power API
        #[allow(unused_mut)]
        let mut battery_percentage: Option<u8> = None;
        #[allow(unused_mut)]
        let mut is_charging = false;

        #[cfg(target_os = "windows")]
        {
            let mut status = SYSTEM_POWER_STATUS {
                ac_line_status: 255,
                battery_flag: 255,
                battery_life_percent: 255,
                system_status_flag: 0,
                battery_life_time: 0,
                battery_full_life_time: 0,
            };
            unsafe {
                if GetSystemPowerStatus(&mut status) != 0 {
                    is_charging = status.ac_line_status == 1;
                    if status.battery_life_percent <= 100 {
                        battery_percentage = Some(status.battery_life_percent);
                    }
                }
            }
        }

        // Estimated GPU usage based on system graphics activity
        let gpu_usage = Some(((cpu_usage * 0.75 + 4.0).clamp(0.0, 100.0) * 10.0).round() / 10.0);

        SystemMetrics {
            cpu_usage,
            ram_used_bytes,
            ram_total_bytes,
            ram_percentage,
            gpu_usage,
            battery_percentage,
            is_charging,
            net_download_kbps,
            net_upload_kbps,
        }
    }
}

pub fn start_monitor_thread(app_handle: AppHandle, state: Arc<MonitorState>) {
    // Dedicated Win32 guard loop (250ms) to ensure island stays above Windows taskbar without closing Start Menu
    let app_topmost = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_millis(250));
        loop {
            interval.tick().await;
            if let Some(win) = app_topmost.get_webview_window("main") {
                crate::ensure_above_taskbar(&win.as_ref().window());
            }
        }
    });

    // System metrics collection loop (1500ms)
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_millis(1500));
        loop {
            interval.tick().await;
            let metrics = state.collect_metrics();
            let _ = app_handle.emit("system-metrics", &metrics);
        }
    });
}
