# Rencana — UI baru web admin (14 Okt 2026)

Permintaan user 14 Okt 2026: rancang UI baru dari mockup `formatexcel/UIbaru.png`
(halaman Perabasan Pohon & Rekap Kinerja) — lebih bersih, lebih hidup,
profesional; komponen, ikon, huruf, dll. **reusable dan seragam di setiap
halaman**.

Status: keputusan §2 dijawab user 14 Okt. User minta **CONTOH SATU HALAMAN
dulu**, baru eksekusi bila pas → `/contoh-ui` (Perabasan Pohon, data asli,
kerangka baru) dibangun 14 Okt, belum commit, menunggu penilaian user.

Banner dari user (`formatexcel/baner.png`, 1983×793, banner hero lengkap):
potongan kanan (petugas + slogan "Energi Untuk Negeri") → `public/banner-kepala.webp`
(23 KB) untuk kepala halaman; utuh → `public/banner-beranda.webp` (100 KB)
untuk hero Beranda nanti.

---

## 1. Yang dibaca dari mockup

| Bagian | Isi mockup |
|---|---|
| Kerangka | Sidebar **navy gelap**, item aktif pil biru terang; topbar putih: kotak cari global (Ctrl K), lonceng notifikasi berangka, menu pengguna |
| Kepala halaman | Ikon besar + judul + satu kalimat keterangan; **banner foto** jaringan + slogan "Jaga Keandalan Listrik Untuk Negeri" di kanan |
| Navigasi halaman | Tab **pil** (aktif biru penuh, lainnya putih bergaris) |
| Saringan | Satu baris: ULP · Bulan · kotak cari; di bawahnya **chip status berangka** (Semua · Belum ditugaskan 0 · Dijadwalkan 20 …); tombol utama di kanan (Download XLSX) |
| Catatan | Baris info kecil berikon (i) — menjelaskan aturan daftar |
| Tabel | Judul kolom **berikon**, sel dua baris (BATU DAWA / AMPENAN), angka + satuan, status **pil berwarna**, menu ⋯ per baris, kotak centang |
| Ringkasan | **Kartu KPI** berikon bulat berwarna: angka besar, delta ↑, sub "dari bulan lalu", **bilah progres**, cincin SLA |
| Tabel rekap | Satuan kecil di depan angka, **bilah capaian** sebaris dengan %, legenda status di kanan atas |

---

## 2. Bertentangan dengan keputusan lama — DIPUTUSKAN user 14 Okt 2026

A navy gelap ✓ · B kepala ringkas + banner ✓ · C **navy, sedikit lebih
terang** (bukan biru terang mockup) → `#2F55B0` · D cari global & notifikasi
tahap terpisah (U5) ✓.

| # | Keputusan lama | Mockup | Usulan |
|---|---|---|---|
| A | Sidebar **terang** `#e9edf5` (31 Jul) | Sidebar **navy gelap** | Ikut mockup: `navy-950 #0F2347`, teks putih/80 (kontras 8:1), aktif pil biru |
| B | **Judul di topbar**, halaman tanpa blok header — "biar tidak makan tempat" (5 Agu) | Kepala halaman ±96 px + banner foto | Kepala halaman **ringkas** (≤ 96 px) dengan banner; judul DIHAPUS dari topbar supaya tidak dobel. Halaman layar penuh (Peta, Command Center) tanpa kepala |
| C | Navy `#1D3573` = warna interaktif | **Biru terang** untuk tab aktif, tombol, item aktif | **Keputusan user: navy sedikit lebih terang** → `brand-600 #2F55B0` (putih di atasnya 6,9:1; pil aktif di sidebar `#0F2347` beda 2,3:1 — navy lama cuma 1,3:1, menyatu) |
| D | — | Cari global Ctrl K + lonceng notifikasi | Fitur baru, bukan hiasan — **tahap terpisah** (U5), jangan dipasang sebagai tampilan kosong |

---

## 3. Fondasi (token) — `app/globals.css @theme`

**Warna**
- `navy-950 #0F2347` (sidebar), ramp `navy-*` lama tetap.
- `brand-50…700` (navy terang interaktif; 600 = `#2F55B0`): tab aktif, tombol
  utama, item menu aktif, tautan.
- Tinta & bidang tetap: `ink`, `ink-soft`, `ink-muted`, `surface`, `line`.
- **Status (dikunci, satu arti per warna)** — tiap status punya `fg`/`bg`/`border`:

| Nada | Dipakai untuk |
|---|---|
| `selesai` hijau | Selesai, Diverifikasi, SLA tercapai |
| `proses` biru | Dijadwalkan, Dalam proses |
| `tunggu` amber | Menunggu verifikasi, Belum disetujui |
| `masalah` merah | Dikembalikan, Tertunda, Lewat SLA |
| `netral` abu | Belum ditugaskan, Dibatalkan |

Satu peta `STATUS → nada` di `lib/statusUi.ts` — modul tidak memilih warna sendiri.

**Huruf** — tetap dua keluarga yang sudah dimuat: **Plus Jakarta Sans** (judul,
angka KPI, tombol) dan **Geist** (isi & tabel, angka tabular). Skala: 11 / 12 /
13 / 14 / 16 / 20 / 28.

**Ikon** — lucide saja, `strokeWidth 1.75`, ukuran 14 (tabel/chip) · 16
(tombol) · 18 (sidebar) · 22 (kepala halaman). **Kamus ikon** `lib/ikonUi.ts`:
satu konsep = satu ikon di semua halaman (Penyulang ⚡ `Zap`, Segmen `Spline`,
Panjang `Ruler`, WO `ClipboardList`, Tanggal `CalendarDays`, Regu `Users`,
Petugas `UserRound`, Status `CircleDot`, Gardu `House` …).

**Bentuk** — radius 12 (field, tombol, chip) · 16 (kartu); bayangan `card`
yang ada; jarak kelipatan 4.

---

## 4. Komponen bersama — `app/admin/_kit/` (satu folder, satu gaya; `_ui.ts` lama tetap sampai semua dimigrasi)

| Komponen | Isi | Menggantikan |
|---|---|---|
| `KepalaHalaman` | ikon, judul, keterangan, banner opsional, slot aksi | blok header navy tiap halaman + `PageTitle` |
| `TabPil` | tab pil + ikon + angka opsional, tersambung `?tab=` | tab buatan tiap modul |
| `BilahSaring` | wadah baris saringan + slot aksi kanan | baris filter tiap modul |
| `PilihUlp`, `PilihBulan`, `KotakCari` | field seragam (ikon kiri) | select/input lepas |
| `ChipSaring` | chip berangka, satu terpilih | chip status tiap modul |
| `CatatanInfo` | baris info (i) | teks kecil lepas |
| `Tabel` | kepala berikon, sel 2 baris, kolom angka+satuan, centang, ⋯ menu, urut, halaman 20, kepala lengket, kosong & memuat | tabel buatan tiap modul |
| `PilStatus` | status → nada dari `lib/statusUi` | `STATUS_CONFIG`/`NADA_*` tersebar |
| `KartuKpi` | ikon bulat bernada, angka, delta, sub, progres / cincin | `StatTile` (ditingkatkan, bukan ditambah) |
| `BilahCapaian` | bilah + % sebaris | bilah buatan Rekap Kinerja |
| `Tombol` | utama / kedua / hantu / ikon, ukuran sm/md | `BTN_*` di `_ui.ts` |
| `Kartu`, `Bagian` | kartu + judul bagian + aksi + legenda | `CARD` |
| `Kosong`, `Kerangka` | keadaan kosong & skeleton | teks "Memuat…" tersebar |

Yang sudah ada dan dipertahankan: `ModalShell`, `ConfirmDialog`,
`BatalkanModal`, `Toast`, `LencanaGaransi`.

**Halaman katalog** `/admin/ui-kit` (UP3 & admin): semua komponen di satu layar
— tempat user menilai SEBELUM halaman nyata disentuh, dan rujukan saat membuat
halaman baru.

---

## 5a. Yang sudah terpasang (14 Okt 2026, belum commit)

**Kerangka (U1–U2) — seluruh admin:**
- `app/admin/layout.tsx`: `SidebarGelap` + topbar (`GrupTopbar` nama kelompok
  · `WadahTopbar` slot saringan · Tanya AI · pengguna) + `KepalaOtomatis`
  (ikon, judul, keterangan dari `_nav.ts`, banner, slot tab). Isi halaman tetap
  `p-6` → halaman lama berdiri apa adanya. `--topbar-h` 3rem → 3,5rem.
- `_nav.ts`: `keterangan` per item, `layarPenuh` (Command Center, Peta SLD,
  Peta) = tanpa kepala, nama halaman ditulis di topbar; `itemUntuk(pathname)`
  (cocok juga untuk alamat turunan, mis. /admin/work-order/123).
- Slot lewat context (`SlotKerangka`: callback ref, bukan getElementById —
  pindah dari halaman layar penuh tidak membuat tab nyasar).
- `AdminSidebar.tsx` & `PageTitle.tsx` dihapus.
- 13 halaman berkepala sendiri dibereskan (judul tidak dobel); isi kepala
  lama yang bukan judul dipindah ke `IsiKepala`: Buat WO (Work Order), angka
  Jaringan/Pohon/Di Peta (Monitoring Inspeksi), N baris data (Padam APKT),
  status JSON, Refresh (Efektivitas, Advanced), Mode Presentasi (Score Board).
  Keterangan asli halaman itu dipakai di `_nav.ts`.

**Pilot (U3) — Perabasan Pohon:** tab di kepala, saringan di topbar (ULP ·
Periode · Cari · ikon peta; Dashboard: ULP · Tahun; Daftar WO: ULP), chip
status bertitik + Download, `TabelRabas` baru (kepala berikon & menempel,
urut, WO+tgl & regu+petugas digabung, umur tunggakan, menu ⋯: Tugaskan/Ganti
regu langsung, Periksa & putuskan → modal rincian). Semua fungsi lama tetap.

**15 Okt 2026 (commit 329747f = kerangka + pilot Perabasan):**
- **Rekap Kinerja**: tab di kepala, Periode · ULP · Muat ulang di topbar,
  kepala tabel `Kolom bergaris` berikon, legenda capaian dari `AMBANG` →
  `NADA_UI`. **Kartu KPI mockup DITOLAK user** (tetap tanpa kartu — angka
  lintas satuan tidak bermakna).
- **Chip seluruh halaman**: `CHIP/CHIP_ON/CHIP_OFF` di `_ui.ts` = rupa
  `ChipSaring` (31 berkas ikut), + chip buatan sendiri di Master Gardu &
  Pengukuran Gardu.
- **Kepala tabel 66 berkas terang**: kelas `kepala-kit` di `<thead>` + satu
  aturan CSS di luar @layer (`globals.css`). Halaman gelap tidak disentuh;
  sel berwarna berarti = `kepala-tetap`. Ikon kepala kolom belum (per kolom).

- **Tab 10 halaman ke kepala** (`TabPil`, commit ac2e97d): JTM, JTR, Hargardu,
  Pengukuran, Yantek, Detail Gangguan, Master Penyulang/Segmen, Optimasi,
  Pemeliharaan.

**Belum:** saringan halaman lain ke topbar, ikon kepala kolom per tabel, isi halaman lain ke komponen `_kit`
(tab ke kepala, saringan ke topbar, tabel), halaman gelap, cari global (U5),
banner Beranda.

## 5. Tahapan

| Tahap | Isi | Hasil yang dinilai user |
|---|---|---|
| **U1** | Token + komponen §4 + `/admin/ui-kit` | katalog komponen |
| **U2** | Kerangka: sidebar navy, topbar baru, `KepalaHalaman` + banner | semua halaman berbingkai baru |
| **U3** | Pilot: **Perabasan Pohon** & **Rekap Kinerja** (persis mockup) | dua halaman jadi |
| **U4** | Sisa menu per kelompok (Kinerja Pelayanan Teknik → Master Data → Analitik → Monitoring → Operasional), termasuk halaman yang masih gelap (`advanced-dashboard`, `scoreboard`) | seragam semua |
| **U5** | Cari global (Ctrl K: penyulang, segmen, gardu, regu) + notifikasi | fitur |

Tiap tahap satu commit; `tsc` + `eslint` + dibuka di peramban. Peta (`/peta`)
tetap tema gelapnya sendiri — layar penuh, bukan halaman admin.
`_WODocument.tsx` (PDF resmi) tidak disentuh.

**Aplikasi HP** tidak termasuk rencana ini; tokennya (warna status, kamus
ikon) disusun supaya bisa dipakai ulang di HP sesudahnya.

---

## 6. Aset

- **Banner**: foto di mockup perlu berkas aslinya (≥ 1600 px lebar). Disimpan
  sebagai `public/banner-jaringan.webp` (±80 KB) lewat `next/image`, bukan
  diambil dari tangkapan layar. Pastikan hak pakainya (foto sendiri / dibuat
  AI / milik PLN).
- Slogan "Jaga Keandalan Listrik Untuk Negeri" ditulis sebagai TEKS di atas
  foto (tajam di semua layar, bisa diganti), bukan bagian gambar.
