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

2. **Liquid Morphing Dynamic Island & Multi-Edge Docking**
   - Transisi fisik lentur berbasis spring physics (*Framer Motion*).
   - **Multi-Edge Docking & Magnetic Snapping**:
     - Mendukung penempatan di **sisi atas** (*Top Notch*), **sisi bawah layar tepat di atas Windows Taskbar** (*Bottom Dock* via Win32 `GetMonitorInfoW` `rcWork`), maupun **melayang bebas** (*Floating Pill*).
     - **Tarikan Magnetik Fisik (*True Snapping Pull*)**: Menarik jendela secara otomatis saat dilepas dalam jarak $\le 38\text{px}$ dari tepi atas, tepi bawah/taskbar, sisi kiri (dengan margin rapi $16\text{px}$ untuk pojok kiri bawah), atau sumbu tengah.
     - **Ekspansi Arah Cerdas**: Saat ukuran membesar di sisi bawah, jendela membesar ke arah atas tanpa keluar layar atau tertutup taskbar. Posisi horizontal (seperti pojok kiri bawah) dipertahankan saat jendela membesar atau mengecil.
     - Bentuk adaptif: sisi menempel menjadi rata (`0px`), sisi berlawanan melengkung, dengan border yang menyatu alami.
   - Mode visual adaptif: **Idle Emoticon Capsule** (hanya menampilkan emoticon companion saat tidak ada media; klik 1x mata untuk berkedip, dobel klik pada mata untuk toggle ringkasan metrik icon-only CPU, RAM `<MemoryStick>`, GPU `<Gpu>`, Baterai dinamis, & Download/Upload Bandwidth, dobel klik pada stats untuk membuka dashboard penuh), **Compact Media Pill** (otomatis muncul saat media aktif dilengkapi tombol lirik cepat, kontrol lagu Previous/Play/Pause/Next bernuansa cyan/biru elektrik, serta visualizer audio), **Expanded Dashboard**, dan **Live Synced Lyrics**.
   - Penyesuaian ukuran window native OS dinamis untuk mencegah click-blocking pada elemen desktop di bawahnya dengan drag threshold 5px.

3. **System Resource Monitor**
   - Pemantauan real-time CPU, RAM, GPU, Suhu, status Baterai & deteksi pengisian daya native Win32.
   - Kecepatan jaringan download & upload real-time (KB/s & MB/s).
   - Polling asinkron hemat daya via crate `sysinfo` di Rust backend (< 1% CPU overhead).

4. **Universal Media Controls (Windows GSMTC)**
   - Mendukung Spotify, YouTube di browser Chromium/Gecko, Foobar2000, VLC, Apple Music.
   - Album art display, title marquee, timeline scrubber dengan interpolasi waktu lokal sub-detik real-time (bebas bug looping posisi), Play/Pause, Next, dan Previous dengan tema visual cyan/biru elektrik.

5. **Live Synced Lyrics & Multi-Script Romanizer**
   - Pencarian lirik otomatis bebas registrasi melalui LRCLIB REST API dengan **Smart Duration Matching** (memilih hasil lirik dengan selisih durasi audio paling minimal guna mencegah ketidakcocokan versi Music Video vs Album).
   - Pembersih judul otomatis (*regex sanitizer*) untuk membuang keyword noise video YouTube seperti `[Official Music Video]`, `(feat. ...)`.
   - **Sinkronisasi Presisi Tinggi**:
     - Mendukung parsing tag standar `[offset: +/-ms]` dari file LRC.
     - Kontrol penyesuaian manual langsung di UI: tombol `[-]` (delay 0.25s) dan `[+]` (advance 0.25s) dengan reset `0.00s` dan penyimpanan otomatis per-lagu (`localStorage`).
     - **Click-to-Seek**: Klik pada baris lirik mana pun untuk langsung melompatkan pemutaran audio ke detik tersebut.
     - Auto-scroll halus dengan posisi lirik aktif selalu berada tepat di tengah layar (*dead-center*).
   - **Engine Transliterasi Multi-Aksara Modern**:
     - **Jepang**: Hepburn Romaji lengkap dengan kamus 3.116 Joyo & Jinmeiyo Kanji bacaan On/Kun modern, penanganan sokuon dinamis (`っ`/`ッ` $\to$ duplikasi konsonan berikutnya seperti `kippu`, `ippai`, `gakkou`), tanda pengulangan `々` (`hibi`, `tokidoki`), konjugasi okurigana lirik lagu, dan perbaikan partikel `で`.
     - **Korea**: Algoritma dekomposisi suku kata Hangul (Revised Romanization).
     - **Sirilik & Arab**: Transliterasi fonetik Latin otomatis dengan tombol toggle **Latin** cepat.

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
