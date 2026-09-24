# Rancangan — Pemeliharaan Jaringan (Harjar) di HP mengikuti pola kerja lapangan

Disusun 25 September 2026. Fitur kelima dalam urutan
`rencana-mobile-kerja-lapangan.md` §8. Berlaku `teknisaplikasi.md` butir 1, 2,
5, 6, 14–17. **Keputusan §7 diambil 25 Sep 2026; menunggu "kerjakan H1".**

---

## 1. Keadaan sekarang (diperiksa ke data asli 25 Sep 2026)

**Dua jalan terpisah untuk pekerjaan yang sama:**

| Jalan | Tempat di HP | Isi di database | Masalah |
|---|---|---|---|
| **Tugas** (bilah bawah) | tab Tugas → ubah status Ditugaskan → Dalam Proses → Selesai + foto sesudah | tabel `inspeksi`, `eksekutor = 'HARJAR'`: **44 Ditugaskan, 23 Dalam Proses, 34 Selesai** (hampir semua `team_name` kosong → satu daftar untuk semua regu HARJAR se-ULP; `assigned_at` kosong pada 73 dari 75 yang terbuka) | langsung ke server tanpa draf/luring; tidak menjadi realisasi Pemeliharaan Jaringan |
| **Pemeliharaan Jaringan** (menu Harjar) | formulir → Simpan di HP → Kirim; riwayat 30 terakhir; koreksi dari HP selama Selesai | tabel `pemeliharaan_jaringan`: **1 baris** (uji) | tanpa tugas; `tgl` = tanggal SERVER saat kirim (bukan saat kerja); kirim ulang bisa menggandakan (id dari server); koreksi dari HP melanggar butir 2 yang baru |

Akibatnya pekerjaan HARJAR yang nyata (tugas temuan) **tidak pernah masuk
Rekap Kinerja** baris Pemeliharaan Jaringan, dan kalau regu juga mencatatnya di
menu Harjar, satu pekerjaan tercatat dua kali tanpa kaitan
(`pemeliharaan_jaringan.inspeksi_id` belum ada — PR dari tab Temuan JTM).

## 2. Gagasan inti: tugas temuan = "WO" Harjar

Tugas temuan yang ditugaskan ke HARJAR (dari Monitoring Inspeksi maupun tab
Temuan JTM/JTR di web) diperlakukan sebagai WO modul ini. **Mengerjakan tugas =
mengisi formulir Pemeliharaan Jaringan** yang sudah terisi dari temuannya.
Saat dikirim, SATU transaksi (butir 17):

1. membuat baris `pemeliharaan_jaringan` dengan `inspeksi_id`, dan
2. menutup tugasnya: `inspeksi.status = 'Selesai'`, `foto_sesudah_url`,
   `tgl_eksekusi`, `updated_by` = tim login.

Jadi satu pekerjaan = satu catatan, terhitung sekali, dan Monitoring Inspeksi
tetap benar tanpa diubah.

## 3. HP — empat tab (tampilan WO Pengukuran)

| Tab | Isi | Ketuk |
|---|---|---|
| **WO** | tugas HARJAR terbuka (Ditugaskan/Dalam Proses, berapa pun umurnya — itu tunggakan) + yang dikerjakan bulan ini, dengan progres | formulir / lihat |
| **Belum dikerjakan** | tugas terbuka yang belum ada drafnya | formulir |
| **Sudah dikerjakan** | draf di HP (tugas maupun di luar tugas) + yang dikembalikan admin (merah + alasan); **Kirim** per kartu & **Kirim semua**; tombol **"Catat pekerjaan di luar tugas"** | formulir |
| **Sudah dikirim** | terkirim bulan ini se-ULP, nama tim & status — hanya dilihat | rincian |

- Kartu tugas: temuan + deskripsi, penyulang, lokasi, umur ("ditugaskan 40
  hari"), foto temuan dari inspektur sebagai acuan, urutan **Terdekat** dari
  koordinat temuan.
- Formulir tugas: penyulang, lokasi, titik **terisi dari temuan**; regu memilih
  jenis (JTM/JTR) & kategori, menulis pekerjaan, **memotret sebelum & sesudah
  sendiri** (foto inspektur bisa berbulan-bulan lalu, tidak mewakili keadaan
  saat dikerjakan).
- Nama petugas = tim login, terkunci (butir 16). Tanggal kerja = saat Simpan
  di HP (butir 17).
- Luring: daftar tugas + terkirim disimpan di HP; kategori & penyulang sudah
  disimpan HP sebelumnya.

## 4. Alur

```
Tugas (Belum) ──isi formulir──► Simpan di HP (Sudah dikerjakan)
                                   │  [Kirim] foto naik (URL ditulis balik)
                                   ▼  + RPC kirim_pemeliharaan_jaringan
                              Sudah dikirim ── tugas ikut Selesai
                                   │ admin "Kembalikan ke petugas"
                                   ▼
                     Sudah dikerjakan (merah + alasan) → perbaiki → kirim ulang
                     (memperbarui catatan yang sama)
```
- **Kunci draf** (butir 14): tugas → id tugas (satu tugas satu draf);
  di luar tugas → UUID dari HP. Id catatan dibuat HP → kirim ulang tidak
  menggandakan.
- **Dua regu satu tugas** dicegah di RPC (kunci advisory + satu catatan aktif
  per `inspeksi_id`), bukan di layar.
- Koreksi dari HP untuk yang sudah terkirim **dihapus** (butir 2) — lewat
  "Kembalikan". Koreksi admin di web tetap.

## 5. Database (H1)

- `pemeliharaan_jaringan`: kolom `inspeksi_id` (FK `inspeksi`), status
  **`Dikembalikan`** + `dikembalikan_at/_alasan/_oleh`; indeks unik
  `inspeksi_id` untuk yang belum dibatalkan.
- **`kirim_pemeliharaan_jaringan(p_isi jsonb)`** — id & tanggal dari HP,
  idempoten, memakai ulang pemeriksaan `simpan_pemeliharaan_jaringan`
  (penyulang, kategori aktif, ULP dari master), menutup tugasnya.
- **`kembalikan_pemeliharaan_jaringan`** (admin ULP / UP3): catatan →
  Dikembalikan, tugasnya kembali **Dalam Proses**.
- `batalkan_…` diperluas: tugasnya kembali **Ditugaskan** (masih harus
  dikerjakan).
- `rekap_kinerja` baris Pemeliharaan Jaringan — lihat keputusan §7.

## 6. Web (H4)

- `/admin/pemeliharaan-jaringan`: tombol **Kembalikan ke petugas** + chip
  status Dikembalikan; kolom **WO / Tgl WO** terisi dari tugasnya (temuan,
  tanggal ditugaskan); tanpa tugas = "-".
- Modal menampilkan temuan asal (foto inspektur) di samping foto regu.

## 7. Keputusan user (25 Sep 2026, jangan ditawar ulang)

| # | Keputusan |
|---|---|
| a | **Tugas temuan HARJAR = WO Harjar** (§2) — mengerjakan tugas = formulir Pemeliharaan Jaringan; kirim menutup tugasnya dalam satu transaksi |
| b | **Tab Tugas tetap ada untuk HARJAR**, tapi ketuk tugas **membuka formulir Harjar**; ubah-status lama dimatikan untuk HARJAR. Role lain (PDKB, YANGU, …) tidak berubah |
| c | **"Dalam Proses" dikirim saat Simpan di HP** bila ada sinyal (sepola "Mulai" Perabasan); tanpa sinyal menyusul |
| d | **Rekap Kinerja tetap "belum ber-WO"**: realisasi = catatan terkirim, keterangan "N dari tugas temuan" (kolom `luar_wo` dipakai untuk N itu) |
| e | **Cakupan se-ULP, tim diutamakan**: semua tugas HARJAR se-ULP tampil; yang `team_name`-nya tim login ditandai dan diurutkan paling atas |

## 8. Urutan pengerjaan

| Fase | Isi |
|---|---|
| H1 | SQL §5 (dijalankan user) |
| H2 | HP layanan: draf per tugas/luar tugas, tembolok, kirim, tarik dikembalikan |
| H3 | HP layar 4 tab + formulir terisi dari tugas; tab Tugas untuk HARJAR sesuai (b) |
| H4 | Web §6 |
