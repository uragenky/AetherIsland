# AetherIsland - Windows Dynamic Island & Companion Specification

## 1. System Overview

**AetherIsland** is an ultra-lightweight, high-performance Dynamic Island utility for Windows 10 and Windows 11. It rests seamlessly at the top-center edge of the active display, serving as an interactive companion with expressive eye animations, real-time system resource monitoring, universal media controls, and auto-synchronized scrolling lyrics.

### Design Principles
- **Minimal Footprint**: Native-first architecture targeting `< 35 MB` RAM usage and `< 1%` CPU utilization during idle states.
- **Zero Click-Interference**: Strict transparent window hit-testing ensuring that clicks outside the island pill pass directly through to underlying desktop elements and browser tabs.
- **Full Compatibility**: Universal media transport control using native Windows WinRT APIs (supporting Spotify, YouTube in Chromium/Gecko browsers, Foobar2000, Apple Music, and VLC).
- **Distraction-Free Gaming**: Automatic detection of fullscreen applications and games to hide or suppress overlays.

---

## 2. Technology Stack & Rationale

| Layer | Technology | Rationale |
| :--- | :--- | :--- |
| **Desktop Application Framework** | **Tauri v2** | Combines the safety and low-level performance of Rust with modern Webview2 UI rendering. Eliminates Node/Chromium runtime overhead found in Electron. |
| **Backend Core** | **Rust** (`windows-rs`, `tokio`, `sysinfo`) | Direct interop with Windows Win32 and WinRT COM APIs without C# runtime dependencies. Guarantees deterministic memory management and zero garbage collection pauses. |
| **Frontend Framework** | **React 19 + TypeScript** | Strongly typed component tree for UI states (pill expansion, views, transitions). |
| **Styling & Motion** | **Tailwind CSS + Framer Motion** | Hardware-accelerated fluid spring dynamics for the signature liquid morphing island aesthetic. |
| **Lyrics Provider** | **LRCLIB API** | Free, public, zero-authentication REST API providing synchronized time-tagged lyrics (`.lrc`). |

---

## 3. High-Level Architecture

```
+-----------------------------------------------------------------------------------+
|                                FRONTEND (Webview2)                                |
|                                                                                   |
|  +--------------------+  +----------------------+  +---------------------------+  |
|  | Eye Companion View |  | Island Shell (Pill)  |  | Synced Lyrics Renderer    |  |
|  | (SVG Morphing)     |  | (Spring Animations)  |  | (Milisecond Precision)    |  |
|  +---------+----------+  +----------+-----------+  +-------------+-------------+  |
|            |                        |                            |                |
|            +------------------------+----------------------------+                |
|                                     |                                             |
|                                     v                                             |
|                     Tauri IPC Channel (Bi-directional)                            |
+-------------------------------------+---------------------------------------------+
                                      |
+-------------------------------------v---------------------------------------------+
|                                BACKEND (Rust)                                     |
|                                                                                   |
|  +-------------------+  +--------------------+  +------------------------------+  |
|  | WinRT GSMTC Worker|  | System Monitor     |  | Lyrics Fetcher & Cache       |  |
|  | (Windows.Media)   |  | (sysinfo, 2s tick) |  | (LRCLIB REST Client)         |  |
|  +---------+---------+  +---------+----------+  +--------------+---------------+  |
|            |                      |                            |                  |
|  +---------v----------------------v----------------------------v---------------+  |
|  |                            Win32 OS Interop                                 |  |
|  | (DPI Awareness, Dynamic Hit-Test Mask, Fullscreen Window Detection)         |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

---

## 4. Module Specifications

### 4.1. Windowing & Display Engine (`src-tauri/src/lib.rs`)
- **Window Attributes**:
  - `decorations: false`
  - `transparent: true`
  - `always_on_top: true`
  - `skip_taskbar: true`
- **Dynamic Hit-Testing & Sizing**:
  - In traditional transparent overlay windows, a full-width transparent window captures mouse clicks and blocks user interactions with browser tabs or application title bars.
  - *Solution*: AetherIsland resizes the OS-level native window bounds dynamically to match the current visual size of the pill (e.g., `84x38` in idle compact capsule, `370x38` in media mode, `430x276` in expanded mode).
  - Area outside the pill remains nonexistent to the OS window manager, guaranteeing 100% click pass-through.
- **Smart Non-Intrusive Taskbar Z-Order & Start Menu Guard**:
  - The island and the Windows Taskbar (`Shell_TrayWnd`) both reside in the `HWND_TOPMOST` Z-band.
  - Rather than spamming `SetWindowPos` on an aggressive timer loop (which forces DWM composition re-renders and auto-dismisses light-dismiss popups), AetherIsland employs an event-driven and conditional Z-order guard:
    - **Start Menu & Flyout Detection (`is_start_menu_or_flyout_open`)**: Inspects foreground window classes (`Windows.UI.Core.CoreWindow`, `StartMenuExperienceHost`, `XamlExplorerHostIslandWindow`) and checks `Shell_LightDismissOverlay` visibility. If any shell flyout is active, `SetWindowPos` is suspended to guarantee that pressing the Windows key or clicking Start never dismisses the Start Menu.
    - **Covered-by-Taskbar Detection (`is_island_covered_by_taskbar`)**: Climbs the Z-order chain (`GW_HWNDPREV`). Only when `Shell_TrayWnd` has actually been elevated above the island (and Start Menu is not open) is `SetWindowPos` called with `SWP_NOOWNERZORDER | SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE`.
    - Once elevated, zero subsequent API calls are made, yielding 0% CPU consumption and no DWM interference.
- **Native OS Context Menu**:
  - Right-clicking the island invokes a native Win32/Tauri context menu without taking application focus.
  - Features a **Visible Metrics** submenu (`CPU`, `RAM`, `GPU`, `Battery`, `Network`) for real-time toggle without entering settings, and a graceful **Exit Application** action.
- **Multi-Edge Docking & WorkArea Support**:
  - Supports three distinct docking modes: `'top'`, `'bottom'`, and `'floating'`.
  - Integrates native Win32 `GetMonitorInfoW` (`rcWork`) to read the display's usable work area, automatically compensating for the Windows Taskbar height when docking to the bottom of the screen.
  - Directional expansion in `set_island_window_size`:
    - **Top Docked**: Expands downward with top edge pinned.
    - **Bottom Docked**: Expands upward (`new_y = work_area.bottom - height`), keeping the bottom edge flush against the taskbar without pushing content off-screen.
    - **Horizontal Anchoring**: Preserves user-defined horizontal positions (e.g., bottom-left corner with 16px margin, bottom-right, or centered) across mode transitions instead of forcing center repositioning.
- **Physical Magnetic Snapping**:
  - When dragging finishes (`start_window_drag` returns on mouse release):
    - Top threshold: $\le 38\text{px} \to$ magnetically snaps flush to $y = \text{work\_area.top}$.
    - Bottom threshold: $\le 38\text{px} \to$ magnetically snaps flush to $y = \text{work\_area.bottom} - \text{height}$.
    - Left/Right threshold: $\le 38\text{px} \to$ magnetically snaps to screen margin ($16\text{px}$).
    - Center threshold: $\pm 35\text{px} \to$ magnetically snaps to horizontal center.
  - Real-time preview: Emits `edge-snap-status` during drag to dynamically morph corner radii and borders before release.
- **Drag Threshold & Interaction Isolation**:
  - Direct `onMouseDown` calls to `window.start_dragging()` cause the OS window manager to immediately take mouse capture, suppressing browser `click` and `dblclick` events.
  - *Solution*: A 5-pixel displacement threshold is implemented. If movement is under 5px, mouse up and click/double-click events fire instantaneously (allowing winks on single-click and stats toggle on double-click). Only active drags past 5px initiate native window movement.
- **DPI Scaling**:
  - Registered as `DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2`.
  - Coordinates are recalculated on monitor DPI changes:
    $$\text{Window}_X = \left(\frac{\text{ScreenWidth}}{2} - \frac{\text{PillWidth}}{2}\right) \times \text{DpiScale}$$
- **Fullscreen Suppression**:
  - Win32 API loop (`GetForegroundWindow` + `GetWindowRect`) runs every 1000ms.
  - If the active foreground window occupies the entire bounds of the current display monitor, AetherIsland automatically transitions into hidden state to avoid interrupting games or fullscreen playback.

---

### 4.2. Eyes Companion Engine (`src/components/EyesCompanion.tsx`)
- **Visual Representation**: Minimalist expressive capsule/arc eye pairs rendered via vector SVG paths.
- **Behavioral State Machine**:
  1. `IDLE`: Regular calm blinking. Random blink intervals scheduled between 3.0s and 6.5s with a 25% double-blink chance.
  2. `LOOK_AT_MOUSE`: Tracks mouse proximity when cursor moves across the screen. Pupils shift their offsets toward cursor coordinates.
  3. `PETTING_HAPPY` (`^ ^`): Triggered by rapidly stroking/scrubbing the cursor over the eyes companion. Eyes transform into curved joyful emerald arcs with a cheerful bounce for 1.4s.
  4. `CHARGING_FLASH` (`⚡ ⚡`): Triggered on transition when the laptop is plugged into an AC charger. Eyes flash into vibrant electric amber-yellow lightning bolts for 2.2s.
  5. `DIZZY_SPIN`: Triggered while actively dragging the island window across the desktop. Eyes become lilac anime swirl spirals spinning continuously.
  6. `MUSIC_GROOVE`: Triggered when GSMTC detects active media playback. Eyes morph into curved happy arcs and gently oscillate in sync with music.
  7. `SYSTEM_STRESS`: Triggered when CPU usage exceeds 80%. Eyes contract with high-frequency jitter and soft coral glow.
  8. `DEEP_SLEEP`: Triggered after 3 minutes of total inactivity (no cursor movement, no keystrokes, no music). Eyes become resting slits with slow 3.2s breathing animation and tiny floating `"z"` particles.
  9. `WINK`: Triggered on single-click interaction without expanding or closing the island.

---

### 4.3. System Monitor Worker (`src-tauri/src/monitor.rs` & `SystemDashboard.tsx`)
- Utilizes the `sysinfo` Rust crate with minimal polling overhead:
  - `CpuRefreshKind::nothing().with_cpu_usage()`
  - `MemoryRefreshKind::nothing().with_ram()`
- **Native Battery Polling**: Integrates native Win32 `GetSystemPowerStatus` API from `kernel32.dll` to read battery level percentage and real-time AC charging status (`is_charging`).
- **GPU Telemetry**: GPU utilization tracking integrated with hardware stress alerts and displayed via dedicated `<Gpu />` PCIe graphics card icon.
- **Actionable Telemetry**: Clicking the CPU or RAM metric card launches the native Windows Task Manager (`taskmgr.exe`).
- **Real-Time Mini Sparklines**: Vector SVG trend lines inside CPU, RAM, and GPU cards capturing the last 12 telemetry polling cycles.
- **Update Frequency**: 1500ms asynchronous background loop. Emits Tauri `system-metrics` events to the frontend.
- **Telemetry Payload**:
  ```json
  {
    "cpu_usage": 14.2,
    "ram_used_bytes": 8589934592,
    "ram_total_bytes": 17179869184,
    "ram_percentage": 50.0,
    "gpu_usage": 18.0,
    "battery_percentage": 94,
    "is_charging": true,
    "net_download_kbps": 245.0,
    "net_upload_kbps": 34.0
  }
  ```

---

### 4.4. Global System Media Transport Controls (GSMTC) & Audio Controls (`src-tauri/src/media.rs` & `src-tauri/src/lib.rs`)
- Connects to Windows Runtime `Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager`.
- Runs on a dedicated Multi-Threaded Apartment (MTA) worker thread to prevent thread affinity crashes (`RPC_E_WRONG_THREAD`).
- **Looping-Free Clock Synchronization**:
  - Solves the SMTC timeline zero-reset bug found in YouTube / Chromium / foobar2000 by establishing an authoritative internal monotonic clock.
  - Native SMTC timeline position updates are filtered; only true user-seek jumps (`> 2500ms`) or track changes are synchronized.
  - Rust background ticker increments position every 500ms and frontend runs a local 250ms sub-second micro-clock, ensuring smooth seekbar movement and uninterrupted karaoke scrolling.
- **Quick Audio Controls (Mouse & Desktop Utility)**:
  - **Mouse Wheel Volume Scrubber**: Scrolling the mouse wheel over the compact island invokes `change_volume(steps)` sending native `VK_VOLUME_UP` / `VK_VOLUME_DOWN` key events, accompanied by an instant HUD overlay feedback pill.
  - **Middle-Click Quick Action**: Clicking mouse button 1 (wheel click) triggers instantaneous Play/Pause during media playback or native Windows `toggle_mute` (`VK_VOLUME_MUTE`) during idle.
- **Capabilities**:
  - Event listener for `CurrentSessionChanged` and `MediaPropertiesChanged`.
  - Extracts title, artist, album name, and cover thumbnail stream.
  - Controls: `TryPlayAsync()`, `TryPauseAsync()`, `TrySkipNextAsync()`, `TrySkipPreviousAsync()`, `TryChangePlaybackPositionAsync()`.
  - Electric cyan/blue-themed transport controls (`SkipBack`, `Play`/`Pause`, `SkipForward`).

---

### 4.5. Synced Lyrics Engine & Multi-Script Romanizer (`src-tauri/src/lyrics.rs` & `src/utils/transliterate.ts`)
- **Query Sanitization Pipeline**:
  Raw media titles from YouTube and streaming platforms frequently contain metadata noise. Titles undergo regex sanitization:
  ```regex
  \b(official\s*(music)?\s*video|lyric\s*video|audio|remastered|hd|4k|feat\..*|ft\..*)\b|[\[\(].*?[\]\)]
  ```
- **LRCLIB Integration & Smart Duration Matching**:
  - Primary Endpoint: `https://lrclib.net/api/get?track_name={title}&artist_name={artist}&duration={duration}`
  - Secondary Fuzzy Search: `https://lrclib.net/api/search?q={title}+{artist}`
  - **Smart Candidate Selection**: When exact match falls back to fuzzy search, candidates are filtered to prioritize those with `syncedLyrics`. If audio duration is known, the candidate minimizing $|\text{candidate\_duration} - \text{audio\_duration}|$ is chosen, preventing mismatch between music video and album cuts.
  - **Standard LRC `[offset: +/-ms]` Tag Support**: Parses global offset header tags, shifting `time_ms` forward (positive) or backward (negative) with overflow protection.
- **Micro-Offset Sync Controls & Click-to-Seek**:
  - Compact toolbar pill in `SyncedLyricsView`:
    - `[-]`: Delays lyrics highlighting by 0.25s.
    - `[+]`: Advances lyrics highlighting by 0.25s.
    - Reset button: Restores offset to `0.00s`.
    - Per-track persistence saved to `localStorage` (`circo_lyric_offset_${artist}_${title}`).
  - **Click-to-Seek**: Clicking any lyric line immediately seeks native Windows media playback to that line's exact timestamp.
  - **Dead-Center Auto-Scrolling**: Dynamic `scrollIntoView({ behavior: 'smooth', block: 'center' })` keeping active lines centered within a bounded, masked viewport.
- **Multi-Script Transliteration Engine**:
  - **Japanese (Hepburn Romaji)**:
    - Fixed Hiragana `で` particle mapping.
    - Comprehensive Joyo & Jinmeiyo Kanji dataset (3,116 kanji) with modern Joyo readings (numbers 1-10, everyday lyric vocabulary, On/Kun standard readings).
    - Dynamic Sokuon (`っ`/`ッ`) engine that duplicates the subsequent consonant (e.g., `kippu`, `ippai`, `gakkou`).
    - Kanji repetition mark (`々`) expansion (e.g., `hibi`, `tokidoki`, `hitobito`).
    - Extensive curated dictionary of common Japanese song lyric compound words and inflected verb okurigana (`KANJI_COMPOUNDS`).
  - **Korean (Hangul)**: Algorithmic syllable decomposition based on Revised Romanization of Korean (RR), mapping Choseong, Jungseong, and Jongseong.
  - **Cyrillic**: Transliteration for Slavic alphabets.
  - **Arabic**: Phonetic Latin transliteration.
  - Dual-line display in `SyncedLyricsView` with toggleable **Latin** button in header.

---

## 5. UI Layout & State Transitions

The island operates in three visual modes:

1. **Compact Idle Modes**:
   - **Idle Emoticon Capsule (Default)**:
     - Size: `84px x 38px` (Native window: `84px x 38px`, Border-radius: `9999px` / notched `20px`)
     - Centered: Expressive SVG Eyes Companion emoticon only. Zero distraction or visual clutter.
     - Interactions: Single-click on eye to wink, double-click on eye to toggle hardware stats pill, stroke to pet (`^ ^`), drag to dizzy swirl, drag with 5px movement threshold to reposition.
   - **Idle Hardware Stats Pill: The Partitioned HUD (Concept A)**:
     - Size: `120px - 340px x 38px` (Native window: dynamic `statsWidth` x `38px`)
     - Left: Expressive SVG Eyes Companion (single-click to wink, double-click to collapse back to capsule).
     - Divider: Micro vertical hairline partition (`1px x 14px bg-white/20`) establishing clear visual separation between the companion persona and the telemetry HUD.
     - Right: Balanced modular telemetry indicators: `<Cpu /> %`, `<MemoryStick /> %` (RAM), `<Gpu /> %` (GPU), dynamic `<BatteryCharging />` / `<BatteryFull />` indicator with percentage, and `<ArrowDown />` / `<ArrowUp />` bandwidth speeds.
     - Interactions: Double-click on the stats area opens the full dashboard. Scroll wheel controls master volume. Middle-click mutes audio.

2. **Compact Media Pill (Active Playback)**:
   - Size: `370px x 38px` (Native window: `370px x 38px`)
   - Left: Eyes companion with groove/music animation + `<Mic2 />` button with pulsing cyan indicator when synced lyrics are available.
   - Middle: Stable Track Title & Artist display (`Title — Artist`) preserving glanceability without text cutting or lyric flickering, with Romanized tooltip on hover.
   - Right: Quick cyan-themed media playback controls (Previous, Play/Pause, Next) + Real-time animated audio visualizer bars. Double-click anywhere expands to full dashboard.
   - Aesthetic: Safe OLED inset ambient glow (`box-shadow: inset 0 0 16px rgba(56, 189, 248, 0.14)`) and dynamic border hue.

3. **Expanded Island (Double-Click or Expand Button)**:
   - Size: `430px x 276px` (Native window: `430px x 276px`, Border-radius: `24px` / notched `26px`)
   - **Header**: Eyes companion with mood status + unified draggable header + Mode/Tab switchers (Media / System) + minimize button.
   - **Body Left/Center**: Full media controls with glowing blue/cyan transport controls, album artwork, and synced lyrics view with Apple Music style focal typography and automatic Latin/Romaji transliteration for Japanese (Kana & full Kanji dictionary), Korean (Hangul), Arabic, and Cyrillic, or comprehensive system resource metrics dashboard (CPU, RAM, GPU, Network, Battery).
   - **Footer/Mini-bar**: Quick media toggle or detailed hardware telemetry with real-time SVG sparklines and 1-click Task Manager launcher.

---

## 6. Edge Case Handling & Defense Checklist

| Scenario | Defensive Strategy |
| :--- | :--- |
| **No active media playing** | Automatically collapses into the minimalist idle emoticon capsule (84px), displaying only the playful eye companion. |
| **No lyrics found on LRCLIB** | Gracefully display `"No synced lyrics available"` and display album/artist metadata without UI jitter. |
| **High network latency** | Non-blocking asynchronous reqwest calls with a 3-second timeout. Shows skeleton loader in expanded mode. |
| **Multi-monitor display disconnect** | Window registers `WM_DISPLAYCHANGE` and `WM_DPICHANGED` messages to recalculate center offset on the primary display. |
| **High DPI display (125%, 150%, 200%)** | Native scaling factors applied to physical window dimensions to prevent blurriness and pixel misalignment. |
| **WebView2 DWM Alpha Premultiplication Artifacts** | All ambient glowing uses internal `inset` shadows and dynamic border highlights; 0 outer shadows are cast onto transparent desktop bounds. |

---

## 7. Implementation Roadmap

- [x] **Phase 1**: Project skeleton setup with Tauri v2, React, Tailwind CSS, and Framer Motion.
- [x] **Phase 2**: Native transparent, borderless window configuration with dynamic sizing and hit-test passthrough.
- [x] **Phase 3**: Eyes Companion SVG animation component with state transitions (idle, look-at, vibe, stress, wink).
- [x] **Phase 4**: WinRT GSMTC media worker integration, bidirectional IPC commands, loop-free time tracking, and transport controls.
- [x] **Phase 5**: LRCLIB lyrics client, title sanitizer, multi-script Romanization engine (Romaji, Hangul, Cyrillic, Arabic), and synchronized karaoke renderer.
- [x] **Phase 6**: `sysinfo` + Win32 telemetry worker for CPU, RAM (`MemoryStick`), GPU (`Gpu`), native battery & charging, and network bandwidth.
- [x] **Phase 7**: Smart non-intrusive taskbar Z-order & Start Menu guard, native context menu, seekbar desync guard, and modular telemetry.
- [x] **Phase 8**: Production packaging (NSIS .exe and WiX .msi bundle workflows).
- [x] **Phase 9**: Interactive desktop pet emotions (dizzy drag, petting, charging flash, deep sleep), Concept A Partitioned HUD, master volume wheel scrubber, middle-click controls, and Task Manager sparklines.
- [x] **Phase 10**: Complete system audit & bug remediation: LRCLIB camelCase deserialization & alternative candidate search, Start Menu guard & Fullscreen app suppression, Win32 rcWork bottom docking, media pause retention with player shutdown auto-reset, Cyrillic & Sokuon transliteration fixes, and smooth container-scoped lyrics scrolling.
