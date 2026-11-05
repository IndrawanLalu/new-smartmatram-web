# Rencana: Realisasi Harian LM 4DX + Penurunan Susut (5 Nov 2026)

## Tujuan
Satu halaman baru: tabel realisasi harian (baris pekerjaan × tanggal 1–31) dengan
sakelar **LM 4DX | Penurunan Susut**. Belakangan: klik baris/sel → daftar rincian
(detail, alamat, lokasi, gardu/penyulang, foto). Item mudah ditambah/diubah dari web.
Copy to LM 4DX di Rekap Kinerja tetap ada.

## Keputusan user (5 Nov)
- Halaman sendiri, sakelar 4DX | Susut. Susut = tabel harian saja (tanpa salin ke sheet).
- Nama menu **"Realisasi Harian LM"**, sakelar "LM 4DX" | "Penurunan Susut".
- Tindakan Pemeliharaan Gardu/Pemerataan dihitung **dari jumlahnya** (3 jurusan = 3),
  beda dengan harjar (per pekerjaan).
- Daftar tindakan semua modul diatur **di halaman baru ini** (Pengaturan), bersama
  baris 4DX/Susut.
- Hanya pekerjaan yang **disetujui** yang dihitung (`realisasi_rentang.disetujui`).
- Pekerjaan spesifik yang belum tercatat (grounding gardu, SR seri, gembok, tap
  trafo, …) → daftar **"Pekerjaan yang dikerjakan"** diatur web, dicentang di HP:
  - Pemeliharaan Gardu: **langkah sendiri tepat sebelum "Bukti pekerjaan"**.
  - Pemerataan Beban: blok di bawah "Arus setelah diratakan".
  - Isi jumlah (bawaan 1), **foto wajib per tindakan**, ada pilihan "Tidak ada
    pekerjaan perbaikan", tampil lagi di "Periksa & simpan".
- Pemeliharaan Jaringan (harjar): tetap pakai **kategori** (dipecah di Pengaturan
  kategori bila perlu). HP harjar ditambah **jumlah item** (mis. 3 isolator),
  tapi realisasi tetap dihitung **per titik/pekerjaan**, bukan per jumlah.
- Drone Skyprobe = Inspeksi JTM Tier 1 + drone (jumlah penyulang per hari).
- Belakangan, baris dibiarkan kosong dulu: Penebangan pohon (Perabasan), Peta
  Kerawanan (Inspeksi JTM, cek pohon), Penggantian MDU (input material harjar &
  hargardu).

## Data
- `lm4dx_baris` + kolom `laporan` ('4dx' | 'susut'). Satu tabel, satu modal
  Atur, sumber sama. Baris Susut diisi awal dari daftar user (30 baris) dengan
  sumber yang sama dengan baris 4DX yang setara.
- `tindakan_ref` — daftar "Pekerjaan yang dikerjakan": kode, nama, satuan,
  modul (hargardu / penyeimbangan), urutan, aktif. Diatur web.
- `pekerjaan_tindakan` — yang dicentang regu: modul, sumber_id (catatan
  pemeliharaan gardu / pemerataan), tindakan_kode, jumlah, foto_url.
  Status ikut catatan induknya (dihitung bila induk disetujui).
- Sumber baris baru: `tindakan:<kode>`, di samping kunci Rekap Kinerja,
  `harjtm:<kategori>`, dan drone.
- `pemeliharaan_jaringan` + kolom `jumlah_item` (per kategori).

## Tahapan
1. **R1 – Halaman + tabel harian** (SQL + web, tanpa HP): halaman baru, sakelar,
   baris Susut, hanya disetujui, sambung drone. Baris yang sumbernya belum ada
   tampil "belum ada sumber".
2. **R2 – Pekerjaan yang dikerjakan** (SQL + web + HP/OTA): `tindakan_ref`,
   langkah HP Pemeliharaan Gardu + blok Pemerataan (jumlah + foto wajib),
   pengaturan web, tampil di detail catatan web, baris bisa memakai `tindakan:`.
3. **R3 – Jumlah item harjar** (SQL + HP/OTA + web tampil).
4. **R4 – Daftar rincian** (klik baris/sel) — belakangan.
5. Belakangan: penebangan, peta kerawanan, MDU.

## Status (5 Nov 2026)
- R1–R4 DIBANGUN (belum commit). SQL: `realisasi-harian-lm.sql` (jalan), `pekerjaan-tindakan.sql`
  (R2+R3: tindakan_ref + pekerjaan_tindakan + tambal kirim_pemeliharaan_gardu + RPC
  simpan_tindakan_penyeimbangan + jumlah_item harjar + sumber baris).
- Web: tab Pengaturan (daftar tindakan per modul), klik uraian/angka → modal rincian
  (alamat & titik dari master gardu / harjar, foto tindakan / foto sesudah harjar),
  detail Pemeliharaan Gardu & Pemerataan menampilkan tindakan, detail harjar jumlah item.
- HP: langkah "Pekerjaan yang dikerjakan" (hargardu, sebelum Bukti, hanya bila daftar
  ada), blok di Pemerataan + tampil di bukti terkirim, harjar isian jumlah item.
- Urutan: SQL dulu → build web → OTA.

## 5 Nov 2026 (lanjutan)
- Halaman pindah ke kelompok menu **Monitoring**.
- Copy to LM 4DX dipindah ke halaman ini (Salin tanggal / sebulan, 4DX & Susut), **hanya yang disetujui**; tab lama di Rekap Kinerja DIHAPUS.
- Sel berisi angka diberi warna; baris dikelompokkan JTM / Gardu / JTR (`lm4dx_baris.kelompok`, diisi user lewat Atur baris, awal kosong). Judul kelompok hanya tampilan, tidak ikut tersalin; urutan tidak berubah.
- Harjar jenis **GARDU**: regu pilih kode gardu dari master (`pemeliharaan_jaringan.gardu_kode`), penyulang terisi dari gardu (boleh diganti). Input admin web & tugas tetap JTM/JTR. SQL bagian 7–8 di `scripts/pekerjaan-tindakan.sql`.
- Pelajaran: kondisi `IF` PL/pgSQL berhenti di THEN pertama → jangan `IF CASE … THEN … END THEN`.
