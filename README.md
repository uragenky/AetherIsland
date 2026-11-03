# AetherIsland (Windows Dynamic Island & Emoticon Companion)

An ultra-lightweight, high-performance Dynamic Island utility for Windows with an expressive eye companion, hardware telemetry monitor, universal media playback controls, and auto-synchronized lyrics.

---

## Features

1. **Eyes Companion Emoticon (Hanya Mata)**
   - Vektor mata ekspresif berbasis SVG tanpa bloat.
   - Kedipan mata natural (*random natural blinking*).
   - Melirik mengikuti pergerakan kursor mouse (*cursor look-at tracking*).
   - Reaksi dinamis terhadap musik (*music groove bouncing*), stres hardware (*spiral/stressed eyes* saat CPU > 80%), dan tidur (*sleepy slits* saat idle).
   - Interaksi klik langsung untuk memicu kedipan lucu (*wink*).

2. **Liquid Morphing Dynamic Island**
   - Transisi fisik lentur berbasis spring physics (*Framer Motion*).
   - Mode visual adaptif: **Idle Emoticon Capsule** (hanya menampilkan emoticon companion saat tidak ada media; klik 1x mata untuk berkedip, dobel klik pada mata untuk toggle ringkasan metrik icon-only CPU, RAM `<MemoryStick>`, GPU `<Gpu>`, Baterai dinamis, & Download/Upload Bandwidth, dobel klik pada stats untuk membuka dashboard penuh), **Compact Media Pill** (otomatis muncul saat media aktif dilengkapi tombol lirik cepat, kontrol lagu Previous/Play/Pause/Next bernuansa cyan/biru elektrik, serta visualizer audio), **Expanded Dashboard**, dan **Live Synced Lyrics**.
   - Penyesuaian ukuran window native OS dinamis untuk mencegah click-blocking pada elemen desktop di bawahnya dengan drag threshold 5px.

3. **System Resource Monitor**
   - Pemantauan real-time CPU, RAM, GPU, Suhu, status Baterai & deteksi pengisian daya native Win32.
   - Kecepatan jaringan download & upload real-time (KB/s & MB/s).
   - Polling asinkron hemat daya via crate `sysinfo` di Rust backend (< 1% CPU overhead).

4. **Universal Media Controls (Windows GSMTC)**
   - Mendukung Spotify, YouTube di browser Chromium/Gecko, Foobar2000, VLC, Apple Music.
   - Album art display, title marquee, timeline scrubber dengan interpolasi waktu lokal sub-detik real-time (bebas bug looping posisi), Play/Pause, Next, dan Previous dengan tema visual cyan/biru elektrik.

5. **Live Synced Lyrics (LRCLIB) & Multi-Script Romanizer**
   - Pencarian lirik otomatis bebas registrasi melalui LRCLIB REST API.
   - Pembersih judul otomatis (*regex sanitizer*) untuk membuang keyword noise video YouTube seperti `[Official Music Video]`, `(feat. ...)`.
   - Transliterasi otomatis aksara non-Latin ke alfabet Latin (Romaji untuk Jepang Kanji & Kana, Revised Romanization untuk Korea Hangul, Cyrillic, dan Arab) pada tampilan lirik karaoke dan compact lyric preview.
   - Karaoke scrolling real-time dengan sinkronisasi milidetik dan fitur click-to-seek timestamp.

---

## Tech Stack

- **Backend**: Rust 2021 + Tauri v2 (`windows-rs`, `sysinfo`, `reqwest`, `tokio`, `regex`).
- **Frontend**: React 18, TypeScript, Tailwind CSS, Framer Motion, Lucide Icons.

---

## How to Run & Develop

### Prerequisites
- Node.js v18+ & npm
- Rust toolchain (`rustc` & `cargo`)
- On Windows: WebView2 Runtime (pre-installed on Windows 10 & 11)

### Development
```bash
# Install dependencies
npm install

# Run frontend dev server + Tauri desktop window
npm run tauri dev
```

### Production Build
```bash
# Build production bundle / installer
npm run tauri build
```

### Run Tests
```bash
npm run build
cd src-tauri && cargo test
```
