# Rencana — Gardu Khusus

13 Nov 2026 · permintaan user · **DIBANGUN 13 Nov** (SQL `scripts/gardu-khusus.sql` belum dijalankan, belum commit)

Yang dibangun:
- SQL: tabel `gardu_khusus`, `gardu_dikecualikan()`, pemicu `gardu_khusus_lewati` di
  `wo_igardu_item` / `wo_inspeksi_item` (JTR) / `wo_hargardu_item` (WO baru melewati gardu
  khusus — semua jalan penyusun WO), RPC `tetapkan_gardu_khusus`, `kembalikan_gardu_biasa`,
  `usulkan_gardu_khusus` (HP), `putuskan_gardu_khusus`; view `gardu_khusus_daftar`,
  `gardu_khusus_usulan`. Usulan HP = `master_usulan` sumber_modul 'gardu_khusus'.
  Diuji PGlite (penolakan, kirim ulang, setuju/tolak, WO dibatalkan, pemicu).
- Web: Master Gardu tab **Gardu khusus** (usulan HP + modal Setujui/Tolak, daftar +
  Kembalikan jadi gardu biasa, modal Tetapkan dengan saringan "AMG: khusus"), lencana di
  tabel master, penyusun WO tiga modul tidak menawarkan gardu khusus (`lib/garduKhusus.ts`).
- HP: tombol **Gardu khusus** di kepala formulir tiga modul → `GarduKhususScreen`
  (alasan + keterangan + foto, Simpan di HP); pita + keterangan kartu di tiga daftar →
  `GarduKhususDaftarScreen` (Kirim / Kirim semua / Buang, sudah dikirim, isi ulang yang ditolak).

## Masalah

Ada gardu yang tidak bisa (dan tidak perlu) dikerjakan PLN:

- gardu pelanggan **di dalam bangunan** → Inspeksi Gardu tidak bisa;
- gardu khusus **tanpa JTR**, langsung ke kWh meter pelanggan → Inspeksi JTR tidak ada objeknya;
- gardu **dipelihara pelanggan** → Pemeliharaan Gardu bukan pekerjaan PLN.

Gardu seperti ini tetap masuk WO tiga modul itu, sehingga regu tidak bisa menyelesaikannya
dan capaiannya turun karena pekerjaan yang memang tidak ada.

## Yang ditemukan di data (13 Nov 2026)

- Master `gardu` **belum punya** penanda gardu khusus. `jenis_gardu` = konstruksi
  (Portal/Cantol/Bangunan, tidak rapi, 2.118 kosong) — bukan tempat yang tepat.
- Ekspor AMG (`gardu.data_amg->>'GRD KHUSUS'`) punya kolom **YA/TIDAK**:
  411 gardu Aktif bertanda YA (620 seluruhnya).
- Tapi tanda AMG **tidak sama** dengan definisi di atas: dari 411 itu, **63** pernah
  dipelihara HARGAR, **17** punya tiang JTR, **5** pernah Inspeksi Gardu. Jadi tanda AMG
  hanya **petunjuk**, tidak bisa langsung dipakai mengeluarkan gardu dari WO.
- Jalur usulan koreksi master dari HP + persetujuan web sudah ada: `master_usulan`
  (bukti_foto[], catatan, status menunggu/disetujui/ditolak) dan `master_audit`.

## Rancangan

### Data (SQL `scripts/gardu-khusus.sql`)

Tabel sendiri `gardu_khusus`, **PK (kode, ulp)** (butir 14 — kode gardu tidak unik
lintas ULP), bukan kolom di `gardu`: impor master AMG menimpa kolom `gardu`, sedangkan
keputusan orang di lapangan tidak boleh ikut tertimpa.

| kolom | isi |
|---|---|
| kode, ulp | gardu |
| alasan | teks pilihan: di dalam bangunan / tanpa JTR / dipelihara pelanggan (boleh lebih dari satu) |
| keterangan | teks bebas |
| foto_url, foto_lain[] | bukti (butir 22: sampai 3) |
| sumber | `hp` / `web` |
| usulan_id | ke `master_usulan` bila dari HP |
| ditetapkan_oleh, ditetapkan_at | |

Satu fungsi SQL `gardu_dikecualikan(kode, ulp)` dipakai SEMUA penyusun WO dan pemeriksa
kiriman (butir 23.9 — satu aturan, satu tempat).

### HP — petugas menandai

Di tiga modul (Inspeksi Gardu, Inspeksi JTR, Pemeliharaan Gardu), di kartu/formulir gardu:
tombol **"Gardu khusus"** → isian: alasan + keterangan + foto (1 wajib, sampai 3).

Mengikuti teknisaplikasi:
- **Butir 1**: Simpan ke HP dulu (draf), Kirim terpisah. Draf tampil di tab *Sudah
  dikerjakan* dengan label "usulan gardu khusus".
- **Butir 17**: Kirim = unggah foto → satu RPC `usulkan_gardu_khusus` → baris
  `master_usulan` (entitas 'gardu', field 'khusus', `sumber_modul` = modulnya). Penjaga
  di RPC: hak ULP, gardu ada di master, satu usulan menunggu per gardu (kunci advisory).
- **Butir 2**: terkirim → hanya-baca, status "menunggu persetujuan / disetujui / ditolak
  + alasan"; ditolak → muncul lagi sebagai draf berisi isian lama.
- **Butir 4/22**: foto 1024 px / 0,60, `FotoBanyak`.
- Tidak ada pengisian pekerjaan (tanpa isian inspeksi/pemeliharaan).

### Web — admin

1. **Master Gardu**: kolom/lencana "Gardu khusus", saringan (khusus / bukan / AMG bilang
   khusus tapi belum ditetapkan), tombol **Tetapkan gardu khusus** dan **Kembalikan jadi
   gardu biasa** (`ConfirmDialog` + alasan, butir 8; dicatat di `master_audit`), bisa
   banyak gardu sekaligus.
2. **Persetujuan usulan dari HP**: daftar tabel + modal rincian (butir 7) dengan foto,
   alasan, keterangan → Setujui / Tolak (alasan wajib). Tempatnya: tab di Master Gardu.
3. Toast untuk hasil tindakan (butir 9).

### Dampak ke pekerjaan

- **Penyusun WO** tiga modul (Susun WO manual, terbit otomatis dari rencana, kandidat
  rekomendasi) melewati gardu khusus.
- **WO yang sudah terbit** untuk gardu yang ditetapkan khusus: itemnya **dibatalkan
  otomatis** dengan alasan "gardu khusus" (butir 12) — hilang dari daftar regu dan tidak
  dihitung sebagai WO terbit.
- Rencana Pemeliharaan (Excel ULP) yang memuat gardu khusus: dilewati saat terbit, ada
  keterangan di layar.
- Pekerjaan yang telanjur dikirim tetap diterima (butir 12: pekerjaan tidak boleh hilang).
- Gardu khusus tetap ada di peta, pengukuran, dan modul lain kecuali diputuskan lain.

## Urutan kerja

1. SQL tabel + fungsi + RPC (usulkan, tetapkan, kembalikan, setujui/tolak) + tambalan
   penyusun WO pada definisi hidup (butir 23.7).
2. Web Master Gardu: lencana, saringan, tetapkan/kembalikan, persetujuan.
3. HP tiga modul: tombol + isian + draf + kirim.
4. Uji dengan data nyata, lalu OTA.

## Keputusan user (13 Nov 2026) — jangan ditawar ulang

1. Usulan dari HP **menunggu persetujuan admin** (lewat `master_usulan`); admin web juga
   bisa menetapkan langsung di Master Gardu.
2. WO yang sudah terbit untuk gardu yang ditetapkan khusus **dibatalkan otomatis**
   (alasan "gardu khusus", tidak dihitung WO terbit).
3. Tanda AMG `GRD KHUSUS = YA` **hanya petunjuk**: mulai kosong, saringan di Master Gardu
   untuk menetapkan banyak sekaligus setelah dicek.
4. Yang melewati gardu khusus **hanya tiga modul**: Inspeksi Gardu, Inspeksi JTR,
   Pemeliharaan Gardu. Pengukuran, Optimasi, dll tidak berubah.

Masih perlu dipastikan: nama di layar (tombol HP "Gardu khusus", web "Tetapkan gardu
khusus" / "Kembalikan jadi gardu biasa", lencana "Gardu khusus").
