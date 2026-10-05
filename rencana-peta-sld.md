# Rencana Peta SLD

Menggantikan **Peta Aset** (`/admin/peta-gardu`). Route tetap `/admin/peta-gardu`
supaya hak menu yang sudah diatur per role tidak perlu diubah; labelnya **Peta SLD**.

Disetujui user 5 Okt 2026: nama "Peta SLD", alat gambar lama dipensiunkan,
**Fase 1 dulu**, pelanggan per gardu dilewati dulu, beban per penyulang/keypoint
= jumlah **pengukuran terakhir** gardu di hilirnya.

## Prinsip

SLD **tidak disimpan terpisah**. Ia diringkas dari pohon tiang JTM (`peta_tiang`,
sudah membaca induk per penyulang untuk titik pertemuan) menjadi simpul yang berarti
bagi operasi: **pangkal, keypoint, gardu, percabangan, ujung**. Tiap simpul membawa
jalur + panjang bentang dari simpul di hulunya. Regu menitik, admin mengoreksi — SLD
ikut berubah karena memang satu data. Peringkasan & simulasi di browser
(`lib/sld.ts`, fungsi murni), jadi klik simulasi tanpa menunggu server.

## Fase 1 (sedang dibangun)

- Daftar penyulang (ULP sendiri; UP3 pilih ULP) dengan kartu: KMS (dari tiang bila
  sudah dititik, dan dari data segmen), jumlah gardu & kVA (Master Gardu), beban
  terukur (pengukuran terakhir), gardu ≥80%, gangguan 12 bulan. Lencana kelengkapan:
  "SLD dari tiang" / "belum dititik".
- Peta: hanya pangkal, garis ringkas, keypoint (bentuk & warna dari Pengaturan JTM),
  gardu (warna menurut % beban). Bisa beberapa penyulang sekaligus.
- **Lepas pangkal / lepas keypoint**: hilir diwarnai padam; KMS, gardu, kVA, beban
  terukur, keypoint hilir, **zona langsung** (sampai keypoint berikutnya), daftar
  gardu + unduh Excel.
- Peringatan data: lebih dari satu pangkal (jaringan belum tersambung), kode gardu
  ganda di dua tiang, gardu tanpa kode, gardu Master penyulang itu yang belum ada
  di jaringan.
- SQL: `scripts/peta-sld.sql` (view `peta_sld_penyulang`, hanya membaca).

## Fase berikut (belum)

- **F2** status NC/NO keypoint, titik pertemuan sebagai sambungan NO ke penyulang
  tetangga, simulasi manuver (lepas X + tutup tie Y), isolasi seksi.
- **F3** gangguan APKT/Sheet ditempel ke seksi (termasuk yang tercatat di level
  recloser, mis. "REC. BLONGAS"), skor ML, usulan keypoint baru, ENS.
- **F4** skema SLD otomatis berdampingan dengan peta, PDF A3, Excel format SLD ULP.
- **Pembenahan segmen impor** (39 penyulang tanpa tiang): penomoran "1.1 / 1.4A /
  2.1" diurai jadi pohon; 495 dari 1.308 titik bisa ditempatkan lewat kode gardu di
  namanya, sisanya diseret admin. Kolom titik awal/akhir impor salah urai
  ("SEGMENT X").
- Pelanggan per gardu (estimasi dari APKT atau data AP2T).

## Temuan data (5 Okt 2026)

- Tiang JTM baru 10 penyulang. KMS ringkasan cocok dengan `penyulang_jtm_panjang`
  (Lembar 7,052 = 7,052; Sandubaya 13,300 vs 13,306). Selisih kecil = bentang
  underbuild ikut dihitung di SLD (penyulang itu memang lewat sana).
- Kode gardu ganda di tiang: OL. BENTEK TJ007/TJ014/TJ033/TJ041/TJ046, SANDUBAYA
  CN295. PERUMNAS & SANDUBAYA masing-masing 2 pangkal.
