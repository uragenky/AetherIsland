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

### 4.1. Windowing & Display Engine (`src-tauri/src/window.rs`)
- **Window Attributes**:
  - `decorations: false`
  - `transparent: true`
  - `always_on_top: true`
  - `skip_taskbar: true`
- **Dynamic Hit-Testing & Sizing**:
  - In traditional transparent overlay windows, a full-width transparent window captures mouse clicks and blocks user interactions with browser tabs or application title bars.
  - *Solution*: AetherIsland resizes the OS-level native window bounds dynamically to match the current visual size of the pill (e.g., `200x36` in compact mode, `380x160` in expanded mode).
  - Area outside the pill remains nonexistent to the OS window manager, guaranteeing 100% click pass-through.
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
  4. `SYSTEM_STRESS`: Triggered when CPU or RAM usage exceeds 85%. Eyes expand with contracted pupils or spin into spiral indicators (`@ @`).
  5. `SLEEP`: Triggered when the OS reports no user input for over 5 minutes via `GetLastInputInfo`. Eyes transition to resting horizontal slits (`- -`).

---

### 4.3. System Monitor Worker (`src-tauri/src/monitor.rs`)
- Utilizes the `sysinfo` Rust crate with minimal polling overhead:
  - `CpuRefreshKind::nothing().with_cpu_usage()`
  - `MemoryRefreshKind::nothing().with_ram()`
- **Update Frequency**: 2000ms asynchronous background loop. Emits Tauri events only when significant delta is observed (`> 1%`).
- **Telemetry Payload**:
  ```json
  {
    "cpu_usage": 14.2,
    "ram_used_bytes": 8589934592,
    "ram_total_bytes": 17179869184,
    "ram_percentage": 50.0,
    "battery_percentage": 94,
    "is_charging": true,
    "net_download_bps": 245000,
    "net_upload_bps": 34000
  }
  ```

---

### 4.4. Global System Media Transport Controls (GSMTC) (`src-tauri/src/media.rs`)
- Connects to Windows Runtime `Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager`.
- Runs on a dedicated Multi-Threaded Apartment (MTA) worker thread to prevent thread affinity crashes (`RPC_E_WRONG_THREAD`).
- **Capabilities**:
  - Event listener for `CurrentSessionChanged` and `MediaPropertiesChanged`.
  - Extracts title, artist, album name, and cover thumbnail stream.
  - Cover art is processed into an in-memory buffer and sent to frontend as an object URL or base64 data URI.
  - Playback control commands: `TryPlayAsync()`, `TryPauseAsync()`, `TrySkipNextAsync()`, `TrySkipPreviousAsync()`, `TryChangePlaybackPositionAsync()`.

---

### 4.5. Automatic Synced Lyrics Engine (`src-tauri/src/lyrics.rs`)
- **Query Sanitization Pipeline**:
  Raw media titles from YouTube and streaming platforms frequently contain metadata noise. Titles undergo regex sanitization:
  ```regex
  \b(official\s*(music)?\s*video|lyric\s*video|audio|remastered|hd|4k|feat\..*|ft\..*)\b|[\[\(].*?[\]\)]
  ```
- **LRCLIB Integration**:
  - Endpoint: `https://lrclib.net/api/get?track_name={title}&artist_name={artist}&duration={duration}`
  - Response parses both plain lyrics (`lyrics`) and timestamped synced lyrics (`syncedLyrics`).
- **Disk Caching**:
  - Stored at `%LOCALAPPDATA%\AetherIsland\lyrics\{artist}_{title_hash}.json` to eliminate redundant network traffic.
- **Client Synchronization Algorithm**:
  - GSMTC updates position intermittently (often at 1–5 second intervals).
  - The frontend runs a micro-clock using `performance.now()`:
    $$\text{CurrentPlaybackMs} = \text{AnchorPositionMs} + (\text{TimeNow} - \text{AnchorTimestamp}) \times \text{PlaybackRate}$$
  - The active line is matched with binary search over the `.lrc` timestamp array for sub-millisecond precision.

---

## 5. UI Layout & State Transitions

The island operates in three visual modes:

1. **Compact Pill (Default)**:
   - Size: `180px x 34px` (Border-radius: `9999px`)
   - Left: Eyes companion emoticon.
   - Right: Subtle mini audio visualizer or CPU pulse bar.

2. **Mini Media / Track Toast (On Track Change)**:
   - Size: `320px x 40px`
   - Left: Eye companion with groove animation.
   - Middle: Single-line scrolling marquee of current track & artist.
   - Right: Compact active lyric line preview.

3. **Expanded Island (Hover or Click)**:
   - Size: `420px x 180px` (Border-radius: `24px`)
   - **Header**: Eyes companion with mood status + CPU/RAM micro badge.
   - **Body Left**: Album art thumbnail (`64x64px`) + Playback controls (Prev, Play/Pause, Next, Seekbar).
   - **Body Right**: 3-line synced lyrics view (previous line, highlighted active line, upcoming line).
   - **Footer**: Battery percentage, hardware thermals, network bandwidth status.

---

## 6. Edge Case Handling & Defense Checklist

| Scenario | Defensive Strategy |
| :--- | :--- |
| **No active media playing** | Gracefully collapse media module. Pill displays system vitals and playful eye behaviors. |
| **No lyrics found on LRCLIB** | Gracefully display `"No synced lyrics available"` and display album/artist metadata without UI jitter. |
| **High network latency** | Non-blocking asynchronous reqwest calls with a 3-second timeout. Shows skeleton loader in expanded mode. |
| **Multi-monitor display disconnect** | Window registers `WM_DISPLAYCHANGE` and `WM_DPICHANGED` messages to recalculate center offset on the primary display. |
| **High DPI display (125%, 150%, 200%)** | Native scaling factors applied to physical window dimensions to prevent blurriness and pixel misalignment. |

---

## 7. Implementation Roadmap

- [ ] **Phase 1**: Project skeleton setup with Tauri v2, React, Tailwind CSS, and Framer Motion.
- [ ] **Phase 2**: Native transparent, borderless window configuration with dynamic sizing and hit-test passthrough.
- [ ] **Phase 3**: Eyes Companion SVG animation component with state transitions (idle, look-at, vibe, stress).
- [ ] **Phase 4**: WinRT GSMTC media worker integration and bidirectional IPC commands.
- [ ] **Phase 5**: LRCLIB lyrics client, title sanitizer, caching layer, and synchronized karaoke renderer.
- [ ] **Phase 6**: `sysinfo` telemetry worker for CPU, RAM, battery, and network speeds.
- [ ] **Phase 7**: Fullscreen detection and auto-hide/collapse mechanics.
- [ ] **Phase 8**: Optimization pass, memory profiling, and packaging.
