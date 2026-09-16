web application/stitch/projects/18165080451205317582/screens/e2a3047096cf423588aa40c16c908094
# Design System & Guidelines: Jadwal Tugas Kelas A (Portal Akademik)

## 1. Overview & Visual Identity
- **Nama Sistem Desain**: *Sistem Desain Jadwal Tugas Kelas A*
- **Tema & Persona**: Maskulin, modern, cerah (*crisp light mode*), tegas, terstruktur, dan sangat ramah pengguna (*user-friendly*).
- **Target Audiens**: Mahasiswa aktif, Ketua Kelas (Komting), Penanggung Jawab Mata Kuliah (PJ Matkul), dan Dosen/Asisten Lab.
- **Tujuan Desain**: Menyediakan portal akademik satu pintu yang memudahkan pemantauan deadline tugas kuliah, pembagian kelompok kerja, koordinasi forum asistensi, serta sinkronisasi jadwal secara real-time tanpa visual clutter.

---

## 2. Tipografi (Typography)
- **Font Utama**: `Plus Jakarta Sans` (Google Fonts)
- **Font Karakter**: Modern geometric sans-serif dengan legibility tinggi, memberi kesan tech-savvy, maskulin, dan rapi.

| Taraf / Tingkatan | Ukuran (Size) | Bobot (Weight) | Line Height | Contoh Penggunaan |
| :--- | :--- | :--- | :--- | :--- |
| **Display / Hero H1** | 2.25rem (36px) | Bold (700/800) | 1.2 | Header sapaan personal mahasiswa, judul halaman utama |
| **Heading H2** | 1.5rem (24px) | Bold (700) | 1.3 | Judul kartu tugas terdekat, judul modal, seksi utama |
| **Heading H3** | 1.125rem (18px) | SemiBold (600) | 1.4 | Judul kartu mata kuliah, judul thread diskusi |
| **Subheading / Label** | 0.875rem (14px) | Medium (500/600) | 1.4 | Label status SKS, badge deadline, nama dosen pengampu |
| **Body Text (Default)**| 0.875rem (14px) | Regular (400) | 1.5 | Deskripsi tugas, instruksi pengerjaan, teks body umum |
| **Caption / Footnote** | 0.75rem (12px) | Medium (500) | 1.4 | Meta info (waktu upload, jumlah komentar, countdown detik) |

---

## 3. Palet Warna (Color Palette & Tokens)

### A. Primary & Brand Colors (Maskulin & Tech)
- **Primary Brand**: `#1a56db` (Deep Royal Blue) — Aksi utama, tombol CTA primer, navigasi aktif, branding portal.
- **Primary Dark / Navy**: `#0f172a` (Slate 900) — Teks judul utama, hero banner kartu deadline mendesak, elemen penekanan maskulin.
- **Primary Light / Subtle**: `#eff4ff` (Blue 50) — Background badge aktif, hover state tombol sekunder, border highlight.
- **Accent Cyan / Sky**: `#0284c7` & `#38bdf8` — Indikator link, aksen countdown timer, progres bar teknologi.

### B. Surface & Neutral Backgrounds (Cerah & Bersih)
- **Base Background**: `#f8f9ff` (Soft Blue-tinted Off-White) — Memberikan kedalaman dibanding putih polos tanpa melelahkan mata.
- **Surface Container Lowest (White)**: `#ffffff` — Kartu utama, panel sidebar, dialog box.
- **Surface Border / Divider**: `#e2e8f0` (Slate 200) — Garis batas kartu yang renyah dan rapi.
- **Text Primary**: `#0f172a` (Slate 900) — Keterbacaan kontras tinggi.
- **Text Secondary / Muted**: `#64748b` (Slate 500) — Keterangan tambahan, instruksi sekunder, placeholder.

### C. Status & Priority Colors (Deadline Tokens)
- **Mendesak (< 24 Jam) / Danger**: `#ef4444` (Red 500) / Background `#fef2f2` — Tag deadline darurat, badge prioritas tinggi.
- **Segera (24-48 Jam) / Warning**: `#f59e0b` (Amber 500) / Background `#fffbeb` — Tag deadline dekat, tugas kelompok aktif.
- **Normal / Info**: `#3b82f6` (Blue 500) / Background `#eff6ff` — Tugas individu biasa, praktikum mingguan.
- **Tuntas / Success**: `#10b981` (Emerald 500) / Background `#ecfdf5` — Tugas selesai diserahkan, verifikasi PJ matkul.

---

## 4. Spacing, Elevation, & Radius
- **Border Radius**:
  - `rounded-md` (6px) untuk pill tags, badge SKS, indikator status.
  - `rounded-xl` (12px) untuk kartu tugas, input form pencarian, item modul.
  - `rounded-2xl` (16px) untuk container utama, banner countdown, widget sidebar.
- **Bayangan (Shadows)**:
  - *Subtle Elevation*: `0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)` untuk kartu default.
  - *Card Hover*: `0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.04)` memberikan responsivitas dinamis.
- **Layout Grid**: 12-kolom grid desktop dengan layout 2-kolom (Konten Utama 8 kolom + Widget Sidebar 4 kolom) atau 3-kolom kartu responsif.

---

## 5. Komponen Utama (Core UI Components)
1. **App Shell & Top Navigation**:
   - Logo portal akademik dengan ikon segitiga 'A' bergradasi royal blue.
   - Search bar terintegrasi dengan filter instan matkul/dosen.
   - Tab navigasi: *Jadwal Tugas*, *Kalender*, *Mata Kuliah*, *Tim Belajar*, *Pengumuman*.
   - Tombol shortcut aksi cepat `+ Tugas` serta profil mahasiswa aktif.
2. **Kartu Tugas (Assignment Card)**:
   - Header berkode warna kategori mata kuliah + badge tenggat waktu.
   - Progres bar persentase pengerjaan.
   - Tombol aksi kontekstual: *Unggah Tugas*, *Lihat Draft*, *Tandai Selesai*.
3. **Banner Countdown Darurat (Urgent Countdown Header)**:
   - Kontras tinggi dengan latar gelap/navy (`#0f172a`), penunjuk waktu digital sisa hari, jam, menit, dan detik.
4. **Pusat Kolaborasi & Komunikasi**:
   - Mini kanban board untuk membagi peran kelompok (SRS, UI Design, Backend API, Dokumen).
   - Thread tanya-jawab dengan lencana *Jawaban Terverifikasi PJ Matkul*.
   - Tombol integrasi eksternal ke WhatsApp Group, Discord Voice Study Room, Google Classroom, dan LMS Kampus.
