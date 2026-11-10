# AetherIsland Planning & Roadmap

Dokumen ini merangkum rencana arsitektur dan eksekusi untuk peningkatan fitur, konsistensi docking, dan standarisasi UI/UX AetherIsland pada rilis mendatang.

---

## 1. Fitur Pencarian & Penggantian Lirik Alternatif (Change Lyrics)

### Masalah Saat Ini
- LRCLIB terkadang mengembalikan lirik yang salah (misalnya lagu dengan judul sama dari artis berbeda, atau versi remix/live).
- Saat ini sistem hanya mengambil kandidat pertama (`items[0]`) dari endpoint pencarian LRCLIB, tanpa opsi bagi pengguna untuk mengganti lirik jika terjadi *mismatch*.

### Rencana Solusi & Arsitektur
1. **Backend Rust (`src-tauri/src/lyrics.rs`)**:
   - Tambahkan fungsi API baru `search_lyrics_candidates(track: &str, artist: &str) -> Result<Vec<LyricsCandidate>, ...>`:
     - Mengirim kueri ke `https://lrclib.net/api/search?q={query}`.
     - Mengembalikan daftar kandidat (ID, judul, artis, album, durasi, ketersediaan `syncedLyrics`).
   - Tambahkan fungsi `fetch_lyrics_by_id(id: u64) -> Result<LyricsData, ...>` untuk mengambil lirik spesifik berdasarkan ID kandidat.
   - Daftarkan Tauri command: `get_alternate_lyrics` dan `apply_lyrics_candidate`.
2. **Penyimpanan Preferensi Pengguna**:
   - Simpan ID lirik yang dipilih manual ke dalam `localStorage` dengan key `custom_lyrics_{artist}_{title}`.
   - Ketika lagu yang sama diputar kembali, sistem langsung memuat lirik yang telah dipilih pengguna secara permanen.
3. **Frontend UI/UX (`SyncedLyricsView.tsx`)**:
   - Tambahkan tombol **Change Lyrics** (ikon `ListMusic` atau `RotateCw`) pada toolbar lirik di sebelah tombol `Latin`.
   - Menampilkan modal mini popover atau drawer daftar lirik alternatif:
     - Menampilkan judul, nama artis, dan badge durasi (`synced` / `plain`).
     - Satu klik langsung mengganti dan mensinkronkan lirik secara *real-time*.

---

## 2. Penyempurnaan Visual Docking Saat Expand (Lyrics & Dashboard Bar)

### Masalah Saat Ini
- Ketika island menempel di tepi atas atau bawah, pada mode compact island menempel rata (*flush*) tanpa celah (`border-radius: 0px` di sisi yang menempel, tanpa border pada sisi tersebut).
- Namun saat di-expand ke mode lyrics/expanded:
  - Terdapat padding vertikal (`pt-1.5` / `pb-1.5`) yang memberi celah 6px dari tepi monitor.
  - Border radius disetel melengkung (`24px`) di keempat sudut.
  - Keempat sisi border aktif kembali.
  - Efek ini membuat island terlihat terlepas (*detached*) mengapung di udara, bukan menempel pada tepi monitor.

### Rencana Solusi
1. **Visual Snapping Continuity**:
   - **Docking Atas (`isDockTop`)**:
     - Hilangkan celah `pt-1.5`. Bagian atas card tetap rata menempel pada posisi `y = 0`.
     - Sudut atas kiri & kanan tetap `0px` (`borderTopLeftRadius: 0px`, `borderTopRightRadius: 0px`).
     - Sudut bawah tetap membulat presisi (`24px`).
     - Sisi atas tetap `borderTop: none`, sedangkan sisi kiri, kanan, dan bawah memiliki outline yang bersih.
   - **Docking Bawah (`isDockBottom`)**:
     - Hilangkan celah `pb-1.5`. Bagian bawah card tetap menempel rata pada `y = screen.bottom - height`.
     - Sudut bawah kiri & kanan tetap `0px` (`borderBottomLeftRadius: 0px`, `borderBottomRightRadius: 0px`).
     - Sudut atas membulat presisi (`24px`).
     - Sisi bawah tetap `borderBottom: none`, sedangkan sisi kiri, kanan, dan atas memiliki outline utuh.
   - **Mode Floating (`floating`)**:
     - Seluruh sudut membulat simetris (`24px`) dengan outline lengkap di keempat sisi.
2. **Kompensasi Dimensi Window OS**:
   - Sesuaikan kalkulasi tinggi window di Tauri (`set_island_window_size`) agar ukuran webview persis sama dengan ukuran visual card tanpa membutuhkan padding vertikal luar yang merusak kesan docking.

---

## 3. Standardisasi Desain Sistem & Konsistensi UI/UX (Coloring & Token Harmony)

### Masalah Saat Ini
- Ditemukan inkonsistensi warna aksen pada beberapa elemen:
  - Tombol atur delay lirik `[-] [0.00s] [+]` saat ini berwarna netral putih/abu-abu (`text-neutral-300`, `bg-white/5`), berbeda dengan tombol `Latin` dan kontrol lainnya yang sudah mengadopsi tema aksen biru/cyan.
  - Tombol tab navigasi (`Player`, `Media`, `System`) menggunakan latar belakang putih pudar (`bg-white/20`) daripada warna aksen tema.
  - Ketidakkonsistenan border pada card metrik (`border-white/5` vs `border-white/10`).
  - Ketidaksamaan style tombol Play/Pause antara `MediaController` (bulat besar) dan `SyncedLyricsView` (kecil inline).

### Rencana Solusi & Panduan Desain Token

| Elemen UI | Status Saat Ini | Standar Desain Baru (Unified Theme) |
| :--- | :--- | :--- |
| **Aksen Utama** | Terpecah (White & Cyan) | **Cyan / Sky Blue** (`#38bdf8`, `text-cyan-400`, `bg-cyan-500/20`) |
| **Tombol Offset Lirik** | Putih netral / abu-abu | Border `border-cyan-500/20`, hover `text-cyan-300`, angka `font-mono text-cyan-300` |
| **Tab Navigasi Aktif** | `bg-white/20 text-white` | `bg-cyan-500/20 text-cyan-300 border border-cyan-500/30` |
| **Tab Navigasi Non-Aktif**| `text-neutral-400` | `text-neutral-400 hover:text-white hover:bg-white/5` |
| **Hairline Dividers** | Bervariasi | Konsisten `border-white/10` di semua modul |
| **Mini Scrubber Play/Pause**| Icon play abu-abu | Sesuai aksen cyan: hover glow cyan dan animasi klik responsif |
| **Feedback Interaksi** | Belum ada haptic visual | Micro-transition `active:scale-95` di semua tombol interaktif |

---

## 4. Status Tahapan Eksekusi (Implementation Steps - COMPLETED)

1. **Fase 1: Standarisasi Desain Token UI/UX** [SELESAI]:
   - Harmonisasikan palet warna di `SyncedLyricsView.tsx`, `MediaController.tsx`, dan `DynamicIsland.tsx`.
   - Ubah kontrol offset delay lirik ke palet cyan/sky blue konsisten.
   - Sediakan tombol tutup `✕ Close` yang mudah diakses pada modal lirik alternatif.
2. **Fase 2: Perbaikan Edge Continuity Docking & Z-Order** [SELESAI]:
   - Terapkan logika radius adaptif (`0px` pada sisi yang menempel) saat expand.
   - Gunakan Win32 `rcWork` untuk mendock di atas Windows Taskbar secara akurat.
   - Pasang *Start Menu Guard* dan *Fullscreen App Detection* untuk mencegah auto-dismiss dan gangguan gaming.
3. **Fase 3: Implementasi Pilihan Lirik Alternatif & Deserialisasi LRCLIB** [SELESAI]:
   - Perbaiki deserialisasi camelCase Serde (`artistName`, `albumName`, `trackName`).
   - Command Rust `search_lyrics_candidates` dan `get_lyrics_by_id` terverifikasi via unit test.
   - UI selector/modal mini di lirik toolbar dengan persistensi ke `localStorage`.
   - Penanganan smart title/artist sanitizer untuk video YouTube `Artist - Title`.
