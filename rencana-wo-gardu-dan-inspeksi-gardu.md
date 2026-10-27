# Rencana — WO seragam semua pekerjaan + Inspeksi Gardu Tier 1/2

26 Okt 2026. Status: **RENCANA, menunggu keputusan user** (bagian "Keputusan
yang dibutuhkan" di bawah). Belum ada kode.

Permintaan user 26 Okt:
1. Susun WO JTM sudah dirapikan (tab Daftar WO · Susun WO · Segmen berjalan) —
   lanjutkan ke semua pekerjaan.
2. Inspeksi Gardu Tier 1 & Tier 2 sekarang hanya tempelan Excel → buat Susun WO di web.
3. Pemeliharaan Gardu baru punya Susun WO lewat unggah file — pastikan.
4. Fitur baru Inspeksi Gardu Tier 1/2 di HP: **hanya input temuan** (model
   Inspeksi JTM Tier 2: isi saat ada temuan), tetapi **wajib di radius gardu**
   seperti Pemeliharaan Gardu.

---

## A. Keadaan sekarang (dicek 26 Okt dari kode)

| Pekerjaan | Halaman WO | Cara WO terbit | Pilih objek manual? |
|---|---|---|---|
| Inspeksi JTM / JTR | tab WO di /admin/jtm, /admin/jtr — **sudah bertab** (26 Okt) | Susun WO: pilih segmen/gardu | ya |
| Perabasan | /admin/wo-perabasan — tab "Daftar WO" + "Susun WO" terpisah | Susun WO: pilih segmen | ya |
| Pemeliharaan Gardu | tab "WO Pemeliharaan" di /admin/hargardu | **Rencana dari unggah Excel** (RencanaGardu) → WO terbit otomatis tgl 1 / manual per ULP; tanpa rencana: kandidat dari riwayat (umur) | **tidak** — hanya lewat Excel/otomatis |
| Pengukuran | tab WO di /admin/pengukuran-gardu | sama dengan Pemeliharaan Gardu (Rencana Excel + otomatis) | **tidak** |
| Inspeksi Gardu Tier 1 / 2 | **tidak ada** — Rekap Kinerja → Tempel WO (Excel) | tempelan; realisasi **dicentang per gardu** di web | — |

Jadi butir 3 benar: Pemeliharaan Gardu (dan Pengukuran) tidak punya cara
memilih gardu sendiri — hanya Excel rencana atau kandidat otomatis. Ini sama
dengan F4 yang tertunda di `rencana-wo-garansi.md` ("tambah gardu manual ke WO
gardu/pengukuran").

---

## B. Fase W — WO seragam di semua pekerjaan

Bentuk yang dipakai (sudah dicoba di JTM): **tiga tab di dalam menu WO**

```
[ Daftar WO · n ]  [ + Susun WO ]  [ <Objek> berjalan · n ]        Tier ▾  ULP ▾
```

- **Daftar WO** bawaan: WO terbaru di atas, Tambah item / Batalkan per WO.
- **Susun WO**: pilih objek → terbitkan, atau "Tambah ke WO yang sudah ada".
  Selesai → kembali ke Daftar WO.
- **<Objek> berjalan**: item yang belum selesai, keluarkan / ganti regu.
- Data diambil per ULP di kueri (bukan disaring di layar).

| Fase | Isi | Sentuh |
|---|---|---|
| W1 | Perabasan → tiga tab yang sama (Daftar WO & Susun WO sudah ada, tinggal disatukan di satu tab WO + "Segmen berjalan") | web |
| W2 | Komponen **SusunWoGardu** (kembaran SusunWoSegmen untuk gardu: saring penyulang, cari, umur pemeliharaan/pengukuran terakhir, garansi) | web |
| W3 | Pemeliharaan Gardu: tab WO jadi tiga tab; **Susun WO manual** pakai W2 di samping Rencana Excel & terbit otomatis (yang lama tetap jalan) | SQL + web |
| W4 | Pengukuran: sama dengan W3 | SQL + web |

W3/W4 butuh RPC "tambah gardu ke WO bulan ini" + "terbitkan WO dari pilihan"
karena WO gardu sekarang satu per ULP per bulan (ganda ditolak) — gardu pilihan
manual masuk ke WO bulan itu, bukan WO kedua.

---

## C. Fase G — Inspeksi Gardu Tier 1 / Tier 2

### Bentuk kerja
- Satuan kerja: **satu gardu** (seperti Pemeliharaan Gardu), dari WO.
- Regu tiba di gardu → **wajib dalam radius gardu** (radius ULP yang sama
  dengan Pemeliharaan Gardu, `anomali_settings.radius_titik_m`). Di luar radius /
  gardu belum bertitik → perilaku sama dengan Pemeliharaan Gardu.
- Isian = **temuan saja**: "Tidak ada temuan" (satu ketuk) atau "Tambah temuan"
  (kategori, uraian, foto, kategori Urgent/Rawan/Biasa — sepola temuan JTM).
  Boleh lebih dari satu temuan per gardu.
- Tier 1 vs Tier 2 dibedakan dari WO-nya (seperti JTM). Isian Tier 2 bisa
  menambah ukuran khusus (mis. suhu/ΔT termovisi) — lihat keputusan K3.
- Pola HP wajib teknisaplikasi.md: isi → Simpan ke HP → periksa → Kirim; foto
  1024/0,60; draf bisa dibuka lagi.

### Data (usulan)
- `inspeksi_gardu` — satu kunjungan: gardu_kode, ulp, penyulang, tier,
  wo_item_id, tgl, lat/lng/jarak, ada_temuan, status (Selesai → Diverifikasi /
  Dikembalikan / Dibatalkan), petugas.
- `inspeksi_gardu_temuan` — n per kunjungan: kategori (data, dari Pengaturan),
  uraian, prioritas, foto (sampai 3), status tindak lanjut.
- `wo_igardu` + `wo_igardu_item` — atau MEMAKAI `wo_inspeksi` yang sudah ada
  dengan jenis baru 'GARDU' (tier + titik sudah ada di sana). Lihat K5.
- Kategori temuan gardu = data (`igardu_ref`), diatur di tab Pengaturan.

### Web (menu baru, nama lihat K1)
Tab: Daftar Inspeksi (periksa / setujui / kembalikan) · Dashboard · Temuan ·
WO (tiga tab seperti Fase W, pakai SusunWoGardu dari W2) · Pengaturan kategori.

### Rekap Kinerja
- Baris igardu1/igardu2: WO = item WO dari sistem; realisasi = gardu WO yang
  kunjungannya sudah dikirim (dengan atau tanpa temuan) di bulan WO — DITURUNKAN
  lewat view, seperti Pemeliharaan Gardu.
- Bulan yang sudah ditempel Excel tetap memakai tempelan (tidak diubah).

### Urutan
G1 SQL (tabel, RPC kirim/verifikasi, view realisasi, penjaga radius) + uji PGlite →
G2 web WO + daftar + pengaturan → G3 HP (menu, WO, radius, temuan, kirim) →
G4 Rekap Kinerja & lampiran → OTA.

---

## Keputusan

Diputuskan user 26 Okt:

| # | Pertanyaan | Keputusan |
|---|---|---|
| K2 | Gardu tanpa temuan: bukti apa? | **dalam radius + 1 foto gardu** |
| K3 | Tier 1 dan Tier 2 isiannya beda? | **sama (temuan); Tier 2 + suhu/ΔT bila ada titik panas** |
| K4 | Temuan diteruskan ke mana? | **"Perlu Perbaikan" Pemeliharaan Gardu** — view `gardu_perlu_perbaikan` (hargardu-view.sql) ditambah baris dari `inspeksi_gardu_temuan`, lalu ditindaklanjuti regu HARGAR seperti biasa |
| K6 | Urutan kerja | **Fase G dulu** (menggantikan tempelan), lalu W1–W4 |

Masih terbuka (dipakai usulan kecuali user mengubah):

| # | Pertanyaan | Usulan |
|---|---|---|
| K1 | Nama menu/layar. Catatan 21 Sep: "Inspeksi gardu" pernah dilarang karena bentrok Pemeliharaan Gardu — tetapi Rekap Kinerja sudah memakai "Inspeksi Gardu Tier 1/2", dan user sendiri menyebutnya begitu 26 Okt. | "Inspeksi Gardu" |
| K5 | Siapa yang mengerjakan di HP (role)? | role baru INSP_GARDU (dicentang di Kelola Role) |
| K7 | Tabel WO | ~~memakai wo_inspeksi~~ → **tabel sendiri `wo_igardu` / `wo_igardu_item`** (26 Okt, saat G1): 24 berkas SQL membaca wo_inspeksi (surat WO, garansi, tempel, rekap), sebagian tanpa saringan jenis — WO gardu akan bocor |

---

## Status

- **G1 SQL — SELESAI (lokal)** `scripts/inspeksi-gardu.sql`, uji PGlite 55/55 (`uji_igardu.mjs`).
  Kategori temuan = `igardu_ref` yang WAJIB menunjuk item Pemeliharaan Gardu
  (FK `tindak_lanjut_gardu.item_kode`), item penampung tersembunyi `temuan_lain`.
  Perlu Perbaikan = UNION baris pemeliharaan (tak berubah) + temuan terbuka;
  temuan hilang bila admin menandai selesai, kunjungan dibatalkan/dikembalikan,
  atau pemeliharaan terverifikasi SESUDAHNYA mencatat item itu normal.
  Indeks baru: master_usulan (sumber_modul, sumber_id) menunggu;
  pemeliharaan_gardu (gardu_kode, ulp, tgl_selesai) Diverifikasi.
- **G2 web — SELESAI (lokal)**: /admin/inspeksi-gardu (Daftar Inspeksi · WO Inspeksi · Pengaturan Kategori), `SusunWoGardu` (pakai-ulang, ukuran jumlah gardu), menu web + menu HP `inspeksiGardu` di Kelola Role. SQL `scripts/inspeksi-gardu-pengaturan.sql` (simpan_igardu_ref + perbaikan view daftar tanpa fungsi per baris). Uji PGlite 60/60; 11 kueri web dicek ke DB nyata.
- **G3 HP — SELESAI (lokal, belum OTA)**: menu `inspeksiGardu` → `InspeksiGarduScreen` (pilihan Tier 1/2 di kepala, diingat; 4 tab butir 15; gardu di luar WO lewat cari) + `InspeksiGarduKerjaScreen` (satu halaman: foto gardu wajib bila tanpa temuan, temuan kategori/uraian/Urgent-Rawan-Biasa/1–3 foto, Tier 2 suhu + ΔT; penjaga radius + usulan titik seperti Pemeliharaan Gardu). Service `igarduKerja.ts`: draf `@igardu_draf_v1` per gardu+ULP+tier bercap pemilik, master/WO/kategori/terkirim di HP, tarik Dikembalikan, kirim = unggah foto (gardu 1024/0,60; temuan & papan nama 1600/0,70 — butir 4 foto kondisi) lalu RPC `kirim_inspeksi_gardu`. Draf ikut Riwayat/Beranda. tsc bersih; 7 kueri HP dicek ke DB nyata.
- **G4 Rekap Kinerja — SELESAI (lokal, 27 Okt)** `scripts/inspeksi-gardu-rekap.sql` (salinan utuh
  terbaru dari jtm-km-disetujui.sql + riwayat-petugas-foto.sql, ★★ = baru):
  `_rekap_kinerja_inti` igardu1/2 = tempelan + WO aplikasi (bulan+ULP yang sudah ditempel tetap
  tempelan saja — tidak ganda), realisasi = terkirim & tidak tertahan, belum disetujui, di luar WO;
  `realisasi_rentang` (Harian/Bulanan/PRO NTB/lampiran) + `riwayat_pekerjaan` jenis `igardu` +
  `foto_riwayat` cabang `igardu`. Uji PGlite 9 + 3 lulus. Web: Rekap baris igardu bertaut ke
  /admin/inspeksi-gardu; lampiran Realisasi Bulanan ikut memuat kunjungan aplikasi.
- Urutan jalankan SQL: inspeksi-gardu.sql → inspeksi-gardu-pengaturan.sql → inspeksi-gardu-rekap.sql.
