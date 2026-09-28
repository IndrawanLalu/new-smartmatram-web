# Rancangan — Pengukuran Tegangan Ujung dipisah dari Pengukuran Beban

Disusun 27 September 2026. Berlaku `teknisaplikasi.md` butir 1, 2, 3, 5, 6,
14–17. **T1–T5 dikerjakan 27–28 Sep 2026** (SQL `scripts/tegangan-ujung.sql`, belum dijalankan saat ditulis).

---

## 1. Keadaan sekarang (diperiksa ke data asli 27 Sep 2026)

- Tegangan ujung = tiga angka **R/S/T per jurusan** di dalam formulir BEBAN
  (`pengukuran_gardu.perjurusan -> {A..K}.tegangan`), tanpa titik, tanpa foto.
- Terisi di **3.572 dari 3.576** jurusan berarus (99,9%), nilainya setara
  tegangan panel (218/217/219). Hampir pasti diketik di gardu, bukan diukur di
  ujung jaringan. Catatan Rekap Kinerja sendiri: "Tegangan ujung belum punya
  tempat sendiri — belum diukur, belum tercatat."
- **Agen AMG** (`smart-agent/index.js`) mengirim `tegujung_r/s/t_<jurusan>` dari
  `perjurusan` itu, dalam SATU kiriman bersama beban (`cUkur/save_ukur`).
- Realisasi WO Pengukuran (`wo_pengukuran_realisasi`) dan Rekap Kinerja
  ("Pengukuran beban & tegangan ujung") dihitung dari beban saja.
- Data JTR baru 3 tiang uji → rekomendasi titik dari tiang terjauh di awal
  hampir selalu belum tersedia.

## 2. Keputusan user

| # | Keputusan |
|---|---|
| u1 | Pengukuran gardu di HP **dipecah dua**: beban (seperti sekarang) dan **tegangan ujung** (formulir baru). Gardu yang sudah diukur bebannya masuk **tab baru**: belum diukur tegangan ujungnya |
| u2 | Formulir ujung: isian tegangan seperti pengukuran tegangan, **foto wajib** (alat ukur saat mengukur), **titik koordinat disimpan**, **ketelitian GPS tampil**; > 20 m = **peringatan** (bukan larangan) |
| u3 | Gardu dua jurusan atau lebih: **wajib satu** titik — jurusan yang ujung JTR-nya **terjauh** dari gardu (bila data JTR sudah ada) |
| u4 | Lokasi pengukuran **direkomendasikan** = tiang JTR terjauh itu |
| u5 | Realisasi WO Pengukuran & Rekap = **beban + tegangan ujung** (27 Sep 2026) |
| u6 | AMG **menunggu tegangan ujung**: "Kirim ke AMG" aktif setelah ujungnya terkirim; agen mengisi tegujung jurusan yang diukur, jurusan lain kosong |
| u7 | Isian tegangan ujung **dihapus dari formulir beban**. Data lama tetap sebagai sejarah, ditandai "tanpa titik" |
| u8 | "Terjauh" = **panjang jaringan** (jumlah bentang dari gardu sampai ujung), bukan garis lurus |

## 3. Usulan data (SQL T1)

**Tabel `pengukuran_tegangan_ujung`** — satu baris = satu titik ukur:

| Kolom | Isi |
|---|---|
| `id` | UUID dari HP (kirim ulang idempoten) |
| `pengukuran_id` | beban yang dipasangkan (FK `pengukuran_gardu`) |
| `gardu_kode`, `ulp`, `jurusan` | |
| `v_rn, v_sn, v_tn` | fasa-netral (§6 no. 2) |
| `lat, lng, akurasi_m` | titik petugas saat Simpan — WAJIB |
| `foto_url` | WAJIB (NOT NULL) |
| `tiang_rekomendasi_id`, `jarak_rekomendasi_m` | tiang terjauh saat itu & jarak titik ukur darinya — admin bisa melihat "diukur 12 m dari ujung" vs "diukur 400 m sebelum ujung" |
| `tgl_ukur`, `petugas_nama`, `petugas_uid` | |
| `status` | Terkirim · Dikembalikan · Dibatalkan (butir 2) |

**View `jtr_ujung_terjauh`** — per (gardu, jurusan): tiang ujung dengan panjang
jaringan terpanjang (CTE rekursif menyusuri `jtr_tiang` dari pangkal, memakai
bentang yang sama dengan `tiang_gawang`), berikut panjangnya. Termasuk tiang
pinjaman (master tiang tunggal).

**RPC `kirim_tegangan_ujung(p_isi)`** — satu transaksi, penjaga ULP & sesi,
menolak foto yang belum terunggah, menolak kalau beban pasangannya tidak ada.

**Aturan realisasi (u5)** di `wo_pengukuran_realisasi` & `rekap_kinerja`: gardu
dihitung bila beban **dan** minimal satu tegangan ujung terkirim, keduanya di
jendela bulan WO yang sama.

**Kewajiban (u3)** diperiksa server: bila `jtr_ujung_terjauh` punya ujung untuk
gardu itu, yang wajib adalah jurusan terjauh; bila belum ada data JTR, jurusan
mana pun sah.

## 4. HP (T2–T3)

- **Formulir beban**: bagian tegangan ujung per jurusan disembunyikan untuk bulan sejak aturan ULP itu berlaku (u7, §6 no. 5); sebelum itu tetap seperti semula.
- **Tab baru** di Pengukuran Gardu (nama: §6 no. 1) — gardu yang bebannya sudah
  terkirim bulan ini tapi belum punya tegangan ujung.
- **Formulir tegangan ujung**:
  - peta kecil: titik gardu, tiang rekomendasi (bila ada) + panjang jaringannya,
    posisi petugas, dan jarak ke tiang rekomendasi;
  - ketelitian GPS tampil terus; > 20 m = peringatan kuning, tetap bisa simpan
    setelah konfirmasi (u2);
  - isian tegangan, foto wajib (1024/0,60, butir 4), titik dikunci saat Simpan;
  - Simpan di HP → Kirim (butir 1, 17). Dikembalikan admin → jadi draf lagi.
- Jurusan yang wajib ditandai; jurusan lain boleh ditambah.

## 5. Web & AMG (T4–T5)

- Detail gardu: tegangan ujung tampil dengan titik di peta, foto, dan jarak ke
  ujung JTR. Tombol **Kembalikan** / **Batalkan** (butir 2, 8).
- Data lama (u7) tampil berlabel "tanpa titik — dicatat di gardu".
- **Tombol "Kirim ke AMG"** mati sampai ujungnya terkirim, dengan keterangan
  sebabnya (u6).
- **Agen AMG**: `tegujung_*` diambil dari `pengukuran_tegangan_ujung` (lewat
  view), bukan dari `perjurusan`. ⚠ Agen jalan di PC lain di LAN PLN — sesudah
  diubah: push → pull di sana → `pm2 restart smart-amg-agent`.
- Unduhan Excel pengukuran: kolom tegangan ujung dari tabel baru + titik + jarak.

## 6. Jawaban user (27 Sep 2026)

1. Nama di layar: tab **"Tegangan ujung"**, formulir **"Pengukuran Tegangan Ujung"**.
2. Isian: **tiga fasa-netral** (R-N, S-N, T-N) — sama dengan yang diterima AMG.
3. Tegangan ujung **sebulan dengan bebannya**, dan tidak mendahului beban.
4. Gardu satu jurusan / tanpa data JTR: regu memilih jurusan sendiri, tanpa rekomendasi.
5. **Aturan u5–u7 berlaku mulai bulan depan**, bukan sekarang: bulan ini realisasi,
   Kirim AMG, dan isian formulir beban tetap seperti semula. Diatur lewat
   **"berlaku mulai bulan …" per ULP** (`aturan_tegangan_ujung`), bukan saklar —
   saklar akan menghitung ulang realisasi bulan-bulan lalu. Selama kosong, formulir
   tegangan ujung sudah bisa dipakai tapi belum wajib.

## 7. Urutan pengerjaan

| Tahap | Isi |
|---|---|
| T1 | SQL: tabel, `jtr_ujung_terjauh`, `kirim_tegangan_ujung`, kembalikan/batalkan, realisasi WO & rekap |
| T2 | HP: hapus tegangan ujung dari formulir beban; tab baru |
| T3 | HP: formulir tegangan ujung (peta rekomendasi, GPS, foto, draf, kirim) |
| T4 | Web: detail gardu, Kembalikan/Batalkan, gerbang tombol AMG, Excel |
| T5 | Agen AMG membaca tegangan ujung dari tabel baru (pasang di PC LAN PLN) |

⚠ **Agen AMG (T5) harus terpasang di PC LAN PLN SEBELUM "berlaku mulai" diisi**:
sejak saat itu formulir beban tidak lagi mengisi tegangan ujung, dan agen lama
akan mengirim tegujung kosong. Agen baru: tegangan ujung dari tabel baru bila
ada, dari `perjurusan` bila tidak — jadi aman dipasang kapan saja.
