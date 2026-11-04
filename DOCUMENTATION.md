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
| **Frontend Framework** | **React 18 + TypeScript** | Strongly typed component tree for UI states (pill expansion, views, transitions). |
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
  - *Solution*: AetherIsland resizes the OS-level native window bounds dynamically to match the current visual size of the pill (e.g., `84x36` in idle compact capsule, `370x38` in media mode, `430x270` in expanded mode).
  - Area outside the pill remains nonexistent to the OS window manager, guaranteeing 100% click pass-through.
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
  1. `IDLE`: Regular calm blinking. Random blink intervals scheduled between 3.5s and 6.0s.
  2. `LOOK_AT_MOUSE`: Tracks mouse proximity when cursor is within a 300px radius of the island. Pupils subtly shift their `cx`/`cy` offsets toward the cursor coordinates.
  3. `MUSIC_VIBE`: Triggered when GSMTC detects active media playback. Eyes morph into curved happy arcs (`^ ^`) and gently oscillate vertically in sync with tempo heuristics.
  4. `SYSTEM_STRESS`: Triggered when CPU, RAM, or GPU usage exceeds 80%. Eyes expand with contracted pupils or spin into spiral indicators (`@ @`).
  5. `SLEEP`: Triggered when the OS reports no user input for over 5 minutes via `GetLastInputInfo`. Eyes transition to resting horizontal slits (`- -`).
  6. `WINK`: Triggered on single-click interaction without expanding or closing the island.

---

### 4.3. System Monitor Worker (`src-tauri/src/monitor.rs`)
- Utilizes the `sysinfo` Rust crate with minimal polling overhead:
  - `CpuRefreshKind::nothing().with_cpu_usage()`
  - `MemoryRefreshKind::nothing().with_ram()`
- **Native Battery Polling**: Integrates native Win32 `GetSystemPowerStatus` API from `kernel32.dll` to read battery level percentage and real-time AC charging status (`is_charging`).
- **GPU Telemetry**: GPU utilization tracking integrated with hardware stress alerts and displayed via dedicated `<Gpu />` PCIe graphics card icon.
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

### 4.4. Global System Media Transport Controls (GSMTC) (`src-tauri/src/media.rs`)
- Connects to Windows Runtime `Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager`.
- Runs on a dedicated Multi-Threaded Apartment (MTA) worker thread to prevent thread affinity crashes (`RPC_E_WRONG_THREAD`).
- **Looping-Free Clock Synchronization**:
  - Solves the SMTC timeline zero-reset bug found in YouTube / Chromium / foobar2000 by establishing an authoritative internal monotonic clock.
  - Native SMTC timeline position updates are filtered; only true user-seek jumps (`> 2500ms`) or track changes are synchronized.
  - Rust background ticker increments position every 500ms and frontend runs a local 250ms sub-second micro-clock, ensuring smooth seekbar movement and uninterrupted karaoke scrolling.
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
     - Size: `84px x 36px` (Native window: `92px x 42px`, Border-radius: `9999px` / notched `20px`)
     - Centered: Expressive SVG Eyes Companion emoticon only. Zero distraction or visual clutter.
     - Interactions: Single-click on eye to wink, double-click on eye to toggle hardware stats pill, drag with 5px movement threshold to reposition.
   - **Idle Hardware Stats Pill (Double-Click on Eye)**:
     - Size: `340px - 385px x 38px` (Native window: `340px - 395px x 44px`)
     - Left: Expressive SVG Eyes Companion (single-click to wink, double-click to collapse back to capsule).
     - Center: Icon-only live telemetry indicators: `<Cpu /> %`, `<MemoryStick /> %` (RAM), `<Gpu /> %` (GPU), dynamic `<BatteryCharging />` / `<BatteryFull />` indicator with percentage, and `<ArrowDown />` / `<ArrowUp />` bandwidth speeds.
     - Interactions: Double-click on the stats area opens the full dashboard. No arrow buttons required.

2. **Compact Media Pill (Active Playback)**:
   - Size: `370px x 38px` (Native window: `380px x 44px`)
   - Left: Eyes companion with groove/music animation + `<Mic2 />` button with pulsing cyan indicator when synced lyrics are available.
   - Middle: Stable Track Title & Artist display (`Title — Artist`) preserving glanceability without text cutting or lyric flickering, with Romanized tooltip on hover.
   - Right: Quick cyan-themed media playback controls (Previous, Play/Pause, Next) + Real-time animated audio visualizer bars. Double-click anywhere expands to full dashboard.

3. **Expanded Island (Double-Click or Expand Button)**:
   - Size: `430px x 270px` (Native window: `440px x 285px`, Border-radius: `24px` / notched `26px`)
   - **Header**: Eyes companion with mood status + unified draggable header + Mode/Tab switchers (Media / System) + minimize button.
   - **Body Left/Center**: Full media controls with glowing blue/cyan transport controls, album artwork, and synced lyrics view with automatic Latin/Romaji transliteration for Japanese (Kana & full Kanji dictionary), Korean (Hangul), Arabic, and Cyrillic, or comprehensive system resource metrics dashboard (CPU, RAM, GPU, Network, Battery).
   - **Footer/Mini-bar**: Quick media toggle or detailed hardware telemetry.

---

## 6. Edge Case Handling & Defense Checklist

| Scenario | Defensive Strategy |
| :--- | :--- |
| **No active media playing** | Automatically collapses into the minimalist idle emoticon capsule (84px), displaying only the playful eye companion. |
| **No lyrics found on LRCLIB** | Gracefully display `"No synced lyrics available"` and display album/artist metadata without UI jitter. |
| **High network latency** | Non-blocking asynchronous reqwest calls with a 3-second timeout. Shows skeleton loader in expanded mode. |
| **Multi-monitor display disconnect** | Window registers `WM_DISPLAYCHANGE` and `WM_DPICHANGED` messages to recalculate center offset on the primary display. |
| **High DPI display (125%, 150%, 200%)** | Native scaling factors applied to physical window dimensions to prevent blurriness and pixel misalignment. |

---

## 7. Implementation Roadmap

- [x] **Phase 1**: Project skeleton setup with Tauri v2, React, Tailwind CSS, and Framer Motion.
- [x] **Phase 2**: Native transparent, borderless window configuration with dynamic sizing and hit-test passthrough.
- [x] **Phase 3**: Eyes Companion SVG animation component with state transitions (idle, look-at, vibe, stress, wink).
- [x] **Phase 4**: WinRT GSMTC media worker integration, bidirectional IPC commands, loop-free time tracking, and transport controls.
- [x] **Phase 5**: LRCLIB lyrics client, title sanitizer, multi-script Romanization engine (Romaji, Hangul, Cyrillic, Arabic), and synchronized karaoke renderer.
- [x] **Phase 6**: `sysinfo` + Win32 telemetry worker for CPU, RAM (`MemoryStick`), GPU (`Gpu`), native battery & charging, and network bandwidth.
- [ ] **Phase 7**: Fullscreen detection and auto-hide/collapse mechanics.
- [ ] **Phase 8**: Optimization pass, memory profiling, and packaging.
