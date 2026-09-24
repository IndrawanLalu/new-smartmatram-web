# Rancangan — Optimasi Trafo di HP mengikuti pola kerja lapangan

Disusun 25 September 2026. Fitur ketiga dalam urutan
`rencana-mobile-kerja-lapangan.md` §8 (sesudah Pemeliharaan Gardu dan
Pengukuran). Berlaku `teknisaplikasi.md` butir 1, 2, 6, 14–17.
**Belum dikerjakan — menunggu persetujuan.**

---

## 0. Keputusan user (25 Sep 2026, jangan ditawar ulang)

| # | Keputusan |
|---|---|
| 1 | Koreksi yang terkirim **disamakan dengan aturan baru**: HP hanya melihat; web dapat **"Kembalikan ke petugas"** (status baru `Dikembalikan`, tidak dihitung sampai dikirim ulang). Edit admin di web tetap ada |
| 2 | Tab pertama **"WO"** = seluruh WO terbuka (apa pun bulan terbitnya) + yang dikerjakan bulan ini, dengan progres |
| 3 | Tab *Sudah dikirim* **menampilkan yang dibatalkan** dengan label + alasannya |

---

## 1. Keadaan sekarang

Sudah sesuai: draf di HP (`optimasiDraf.ts`), foto diunggah saat Kirim, satu
RPC `simpan_optimasi_trafo`, nama petugas dari tim login.

Belum sesuai:
- **Tampilan**: tiga daftar ditumpuk di satu layar (draf, WO, riwayat).
- **Koreksi**: HP bisa mengoreksi sendiri yang terkirim selama belum
  diverifikasi (`ubah_optimasi_trafo`) — bertentangan dengan butir 2 yang baru.
- **Luring**: daftar WO & riwayat tidak disimpan di HP; pencarian gardu di luar
  WO langsung ke server.
- **Id dibuat server**: jawaban yang hilang di jalan lalu dikirim ulang bisa
  mencatat optimasi di luar WO dua kali (butir 17).

---

## 2. HP — empat tab (pola butir 15, tampilan WO Pengukuran)

| Tab | Isi |
|---|---|
| **WO** | WO terbuka + yang dikerjakan bulan ini, progres "x dari y" |
| **Belum dikerjakan** | WO terbuka yang belum ada drafnya + draf belum lengkap |
| **Sudah dikerjakan** | draf lengkap di HP (WO maupun di luar WO) + yang **dikembalikan** admin (merah + alasan). Kirim / Kirim semua / Buang |
| **Sudah dikirim** | terkirim bulan ini se-ULP: *menunggu verifikasi · diverifikasi · dibatalkan (+ alasan)* — hanya-baca |

- Di luar WO: pencarian memunculkan **"Gardu lain"** dari master gardu ULP
  yang disimpan di HP (menggantikan pencarian langsung ke server).
- Formulir (`FormOptimasi.tsx`) tetap; tombol **Koreksi** di rincian terkirim
  **dihapus**.
- Luring: WO, master gardu, dan terkirim disimpan di HP (`utils/luring.ts`).
- Draf lama (`@optimasi_draf`) tetap dipakai — tidak ada yang dipindah.

## 3. Kirim — id dari HP

- Draf baru mendapat UUID dari HP (`uuidAcak`), dikirim sebagai `p_id`.
  `simpan_optimasi_trafo` yang menerima id yang **sudah ada** mengembalikan
  catatan itu, bukan membuat kembaran (kirim ulang setelah putus = aman).
- Yang dikembalikan dikirim ulang lewat `ubah_optimasi_trafo(p_id, …)`, yang
  kini menerima status `Dikembalikan` → `Selesai` (dan tetap menerima `Selesai`
  untuk Edit admin di web). HP versi baru tidak lagi memanggilnya untuk
  catatan berstatus `Selesai`.

## 4. Web & database

- Status baru **`Dikembalikan`** + kolom `dikembalikan_alasan`, `dikembalikan_oleh`,
  `dikembalikan_at`; RPC `kembalikan_optimasi_trafo(id, alasan)` (admin ULP /
  UP3, hanya dari `Selesai`). Usulan master yang menunggu **tidak** diputuskan
  saat dikembalikan — ikut diputuskan saat verifikasi seperti biasa.
- Modal detail Optimasi: tombol "Kembalikan ke petugas" (BatalkanModal +
  alasan); chip status **Dikembalikan** di daftar.
- `rekap_kinerja`: realisasi Optimasi mengecualikan `Dikembalikan` (sama
  dengan Pengukuran). `v_wo_optimasi_terbuka` tidak berubah — catatan yang
  dikembalikan tetap menutup WO-nya; regu melihatnya sebagai draf
  "Dikembalikan", bukan WO baru.
- HP menarik catatan `Dikembalikan` milik tim login menjadi draf berisi isian
  lama (termasuk URL foto yang sudah ada).

## 5. Urutan pengerjaan

| Fase | Isi |
|---|---|
| O1 | SQL: status & kolom dikembalikan, `kembalikan_optimasi_trafo`, `simpan_optimasi_trafo` + `p_id`, `ubah_optimasi_trafo` terima Dikembalikan, `rekap_kinerja` |
| O2 | HP layanan: tembolok WO/terkirim/master, tarik dikembalikan, kirim dengan id |
| O3 | HP layar: 4 tab; hapus Koreksi HP |
| O4 | Web: tombol Kembalikan + chip status |

## 6. Risiko

- `simpan_optimasi_trafo` diganti tanda tangannya (tambah `p_id`): fungsi lama
  dibuang dulu supaya tidak ada dua fungsi senama; HP versi lama yang belum OTA
  memanggil tanpa `p_id` dan tetap berjalan (parameter berawalan bawaan).
- Status baru menyentuh CHECK constraint dan semua layar web yang menyaring
  status Optimasi — diperiksa satu per satu di O4.
