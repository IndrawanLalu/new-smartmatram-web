# SMART-Mataram

Aplikasi monitoring Pekerjaan Realtime Mataram.
Dibangun dengan Next.js 16, Supabase, dan Tailwind CSS v4.

---

## Daftar Isi

- [Prasyarat](#prasyarat)
- [Instalasi](#instalasi)
- [Konfigurasi Environment](#konfigurasi-environment)
- [Menjalankan Aplikasi](#menjalankan-aplikasi)
- [Deploy ke Vercel](#deploy-ke-vercel)
- [Panduan Menu](#panduan-menu)

---

## Prasyarat

Pastikan perangkat sudah terinstal:

| Software | Versi Minimum       | Link                  |
| -------- | ------------------- | --------------------- |
| Node.js  | v18 atau lebih baru | https://nodejs.org    |
| pnpm     | v8 atau lebih baru  | `npm install -g pnpm` |
| Git      | versi terbaru       | https://git-scm.com   |

Untuk cek versi yang sudah terinstal:

```bash
node -v
pnpm -v
git --version
```

---

## Instalasi

### 1. Clone Repository

```bash
git clone https://github.com/indra037/smart-mataram-next.git
cd smart-mataram-next
```

Atau, jika mendapat folder project secara langsung (tanpa git), cukup masuk ke folder tersebut.

### 2. Install Dependensi

```bash
pnpm install
```

Proses ini akan mengunduh semua paket yang diperlukan. Tunggu hingga selesai (biasanya 1–2 menit tergantung koneksi).

### 3. Buat File Environment

Buat file `.env.local` di root folder project:

sesuaikan dengan dtabase yang dipakai

```bash
# Windows (PowerShell)
copy .env.example .env.local

# Mac / Linux
cp .env.example .env.local
```

Kemudian isi nilai-nilainya sesuai panduan di bawah.

---

## Konfigurasi Environment

Buka file `.env.local` dan isi variabel berikut:

```env
# ── Supabase ──────────────────────────────────────────────────────────────────
# Dapatkan dari: Supabase Dashboard → Project Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# ── Gemini AI (opsional, untuk fitur AI) ─────────────────────────────────────
# Dapatkan dari: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=AIzaSy...

# ── WhatsApp Bot (lokal, opsional) ───────────────────────────────────────────
# Hanya dibutuhkan jika menjalankan bot WhatsApp di komputer yang sama
WA_BOT_URL=http://127.0.0.1:3001

# Group ID WhatsApp per ULP (format: nomor@g.us)
WA_GROUP_PERABASAN_AMPENAN=
WA_GROUP_PERABASAN_CAKRANEGARA=
WA_GROUP_JARINGAN_AMPENAN=
WA_GROUP_JARINGAN_CAKRANEGARA=

NEXT_PUBLIC_WA_GROUP_REALISASI=
WA_GROUP_MORNING_BRIEF=

# ── URL Aplikasi ─────────────────────────────────────────────────────────────
# Development lokal
NEXT_PUBLIC_SITE_URL=http://localhost:3000
# Production (ganti dengan domain Vercel atau domain kustom)
# NEXT_PUBLIC_SITE_URL=https://nama-app.vercel.app

# ── Secret untuk API internal ─────────────────────────────────────────────────
# Buat sendiri, bisa string acak apa saja
AGENT_SECRET=ganti-dengan-string-rahasia-acak

# ── AMG (Aplikasi Manajemen Gardu — intranet PLN, opsional) ──────────────────
AMG_URL=http://10.33.1.77/gardu
AMG_USERNAME=username-anda
AMG_PASSWORD=password-anda
AMG_KODE_PREFIX=
```

> **Catatan:** Nilai `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, dan `SUPABASE_SERVICE_ROLE_KEY` bisa diminta ke administrator sistem.

---

## Menjalankan Aplikasi

### Mode Development (lokal)

```bash
pnpm dev
```

Buka browser dan akses `http://localhost:3000`. Aplikasi akan otomatis reload setiap kali ada perubahan kode.

### Mode Production (lokal)

```bash
# Build terlebih dahulu
pnpm build

# Jalankan hasil build
pnpm start
```

Akses di `http://localhost:3000`.

---

## Deploy ke Vercel

Cara termudah untuk menyebarkan aplikasi ke publik/jaringan kantor:

### 1. Push ke GitHub

```bash
git add .
git commit -m "initial deploy"
git push origin main
```

### 2. Hubungkan ke Vercel (tanpa wa bot)

1. Buka https://vercel.com dan login
2. Klik **Add New Project** → pilih repository ini
3. Vercel akan otomatis mendeteksi ini adalah proyek Next.js
4. Klik **Deploy**

### 3. Tambahkan Environment Variables di Vercel

Di Vercel Dashboard → Project → **Settings** → **Environment Variables**, tambahkan semua variabel dari `.env.local` di atas (kecuali `WA_BOT_URL` yang hanya untuk lokal).

Tambahkan juga variabel khusus Vercel:

```env
# Untuk fitur Morning Brief (auto-send Telegram)
TELEGRAM_BOT_TOKEN=token-dari-botfather
TELEGRAM_CHAT_ID=id-grup-telegram
CRON_SECRET=string-rahasia-untuk-cron
```

### 4. Verifikasi

Setelah deploy selesai, akses URL yang diberikan Vercel (misalnya `https://smart-mataram.vercel.app`).

---

## Panduan Menu

Setelah login, semua menu ada di sidebar kiri. Berikut penjelasan tiga menu utama:

---

### 1. Dashboard

**Route:** `/admin/dashboard`

Halaman analisis data gangguan penyulang dan inspeksi jaringan secara keseluruhan.

#### Bagian yang Tersedia

**Rekap Gangguan Penyulang**

- Kartu KPI yang menampilkan total gangguan, jumlah gangguan per ULP, dan perbandingan dengan periode sebelumnya
- Data diambil otomatis dari Google Sheets gangguan penyulang

**Analisis Gangguan — Detail**

- Filter rentang tanggal (date range) untuk membatasi periode analisis
- **Trend Gangguan per Tahun** — diagram garis tren jumlah gangguan dari tahun ke tahun
- **Top 10 Penyulang** — diagram batang penyulang dengan gangguan terbanyak pada periode yang dipilih
- **Sumber Gangguan** — diagram distribusi penyebab/sumber gangguan (pohon, petir, kelalaian, dll.)

---

### 2. Monitoring Inspeksi

**Route:** `/admin/monitoring-inspeksi`

Halaman pemantauan seluruh kegiatan inspeksi jaringan dan pohon/rabas secara real-time.

#### KPI Cards (Ringkasan Atas)

Ditampilkan di bagian paling atas:

- Total inspeksi jaringan dan pohon
- Jumlah yang belum selesai
- Jumlah yang sudah selesai bulan ini
- Jumlah inspeksi pohon dengan risiko sangat tinggi

Untuk role **UP3**, tersedia dropdown **Filter ULP** untuk menyaring data per unit (Ampenan, Cakranegara, Gerung, Tanjung).

#### Tab yang Tersedia

**Tab Inspeksi Jaringan**

- Tabel seluruh data inspeksi jaringan dengan kolom: penyulang, kategori, status, temuan, petugas, tanggal
- Penanda merah di tab jika ada temuan **Emergency** atau **Urgent** yang belum selesai
- Klik baris → buka **modal detail** yang memperlihatkan:
  - Foto sebelum, lokasi, dan sesudah
  - Informasi lengkap: penyulang, kategori, temuan, keterangan, koordinat
  - Tombol ubah status (role-based: hanya role tertentu yang bisa mengubah status)
  - Tombol tugaskan eksekutor (hanya admin/inspektor)
  - Upload foto sesudah perbaikan
  - Generate & kirim Work Order via WhatsApp

**Tab Inspeksi Pohon**

- Sama strukturnya dengan tab Jaringan, namun khusus data inspeksi pohon/rabas
- Menampilkan kolom tambahan: tingkat risiko (Sangat Tinggi / Tinggi / Sedang / Rendah)
- Penanda merah jika ada pohon risiko Sangat Tinggi yang belum ditangani

**Tab Peta**

- Peta interaktif (Leaflet) menampilkan titik-titik lokasi inspeksi
- **Toggle layer**: tampilkan/sembunyikan marker Jaringan dan/atau Pohon secara terpisah
- **Filter status**: centang/uncentang status tertentu (Temuan / Perlu Tindakan / Ditugaskan / Dalam Proses / Selesai) — marker berwarna sesuai status
- **Filter tambahan**: ULP, penyulang, dan kategori inspeksi
- Klik marker → popup menampilkan ringkasan: penyulang, temuan, petugas (jika sudah ditugaskan), keterangan

**Tab Dashboard**

- Ringkasan visual statistik inspeksi: grafik distribusi status, distribusi kategori, dan progres penyelesaian

---

### 3. Pengukuran Gardu

**Route:** `/admin/pengukuran-gardu`

Halaman monitoring beban dan kondisi gardu distribusi berdasarkan data pengukuran lapangan.

#### Filter Global (berlaku untuk semua tab)

Di bagian atas halaman:

- **Periode**: pilih bulan dan tahun pengukuran
- **ULP** (khusus role UP3): filter per unit
- **Penyulang**: filter per penyulang tertentu
- Tombol **Refresh** untuk memperbarui data

#### Panel Kriteria Anomali

Sebelum tabel/chart, tersedia panel pengaturan ambang batas deteksi anomali yang bisa disesuaikan per ULP. Pengaturan ini disimpan ke database dan berlaku permanen sampai diubah.

#### Tab yang Tersedia

**Tab Dashboard**

Ringkasan kondisi seluruh gardu:

- **Kartu KPI** (6 tile): Total Gardu, Trafo Overload (≥80%), Trafo Underload, Jurusan Arus Tinggi (>200A), Overload 1 Fasa, dan Suhu Tinggi (>60°C) — semua bisa diklik untuk melihat daftar gardu yang masuk kondisi tersebut
- **Bar anomali kriteria**: jika kriteria anomali diaktifkan, tampil ringkasan berapa gardu anomali, berapa sudah di-WO, berapa belum
- **Grafik Top 20 % Beban Trafo**: bar chart horizontal, klik bar untuk langsung buka detail gardu
- **Grafik Distribusi per Penyulang**: chart distribusi jumlah gardu berdasarkan kategori beban (overload/normal/underload) per penyulang
- **Rekap Tahunan**: tabel statistik bulanan sepanjang tahun yang dipilih

**Tab Data Gardu**

Kondisi terkini setiap gardu (satu baris = satu gardu, data pengukuran terakhir):

- Tabel yang baru tampil setelah klik tombol **Tampilkan Data** (lazy load untuk efisiensi)
- Kolom: No. Gardu, Penyulang, Alamat, KVA, % Beban (dengan progress bar warna), Beban KVA, Arus R/S/T, Suhu, Tanggal Ukur, Petugas
- Badge **WO** (teal) jika sudah dibuatkan Work Order
- Badge **AMG** (biru) jika sudah dikirim ke sistem AMG
- Ikon segitiga merah jika masuk kondisi alert
- Klik baris → **modal detail gardu** yang menampilkan:
  - Data lengkap gardu dan pengukuran terkini
  - Grafik history beban bulan-bulan sebelumnya
  - Tombol **Kirim WA** → generate PDF Work Order dan share via WhatsApp
  - Tombol **Tandai Sudah di-WO** → menyimpan timestamp WO ke database
  - Tombol **Edit** untuk koreksi data pengukuran

**Tab Realisasi Pengukuran**

Tabel seluruh data pengukuran pada periode yang dipilih (semua history, bukan hanya terkini):

- Tabel baru tampil setelah klik **Tampilkan Data**
- Fitur pencarian: cari berdasarkan nomor gardu, penyulang, alamat, atau nama petugas
- Checkbox untuk memilih beberapa gardu sekaligus
- **Toolbar bulk**: setelah memilih beberapa gardu, muncul toolbar mengambang di bawah untuk **Kirim AMG** massal (kirim data ke sistem AMG PLN)
- Tombol **Download XLSX**: ekspor data yang tampil ke file Excel

**Tab Filter Pengukuran**

Filter lanjutan untuk analisis spesifik:

- Filter berdasarkan kondisi beban: overload, underload, rentang persen tertentu
- Filter berdasarkan ambang arus dan suhu
- Hasil filter ditampilkan dalam tabel yang sama seperti Tab Realisasi

**Tab Tindak Lanjut Anomali**

Daftar gardu yang terdeteksi anomali berdasarkan kriteria yang sudah diatur:

- Tampil gardu-gardu yang masuk ambang anomali
- Kolom status tindak lanjut: apakah sudah di-WO, sudah ada penyeimbangan beban, atau masih perlu tindakan
- Bisa digunakan sebagai acuan perencanaan pekerjaan pemeliharaan

---

## Akun & Role

Login menggunakan email dan password yang sudah didaftarkan oleh administrator.

| Role        | Akses                                            |
| ----------- | ------------------------------------------------ |
| `UP3`       | Semua data semua ULP + dropdown filter ULP       |
| `admin`     | Data ULP sendiri + semua fitur edit              |
| `inspektor` | Data ULP sendiri + input & update inspeksi       |
| `HARJAR`    | Data task dengan eksekutor HARJAR di ULP sendiri |
| `HARGAR`    | Data task dengan eksekutor HARGAR di ULP sendiri |
| `PERABASAN` | Inspeksi pohon yang ditugaskan ke PERABASAN      |

Untuk penambahan akun baru, hubungi administrator sistem.
