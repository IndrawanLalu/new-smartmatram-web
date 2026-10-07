# Rencana: WO Inspeksi JTM Tier 2 dari Susun WO

*7 Oktober 2026. Status: **DISETUJUI USER (semua keputusan di bawah).***

## Latar

Susun WO Inspeksi JTM selalu menerbitkan **Tier 1**. WO Tier 2 hanya bisa
lewat **Tempel WO** (Excel), yang masuk `wo_manual` dan realisasinya dicentang
manual di Kinerja Yantek. ULP ingin menyusun WO Tier 2 dari master segmen, dan
regu di HP harus bisa membedakan WO Tier 1 dan Tier 2.

Ada ULP yang memakai WO, ada yang langsung menginspeksi tanpa WO. Keduanya
tetap jalan.

## Keadaan sebelum perubahan (dicek ke kode)

| Bagian | Tier 1 | Tier 2 |
|---|---|---|
| Susun WO di aplikasi | ✅ selalu Tier 1 | ❌ |
| Tempel WO | segmen master → modul (HP); sisanya `wo_manual` | seluruhnya `wo_manual`, centang manual |
| Realisasi Rekap Kinerja | inspeksi HP `tier = '1'` | **hanya centang manual** |
| HP: inspeksi di luar WO | pilih Tier 1 / Tier 2 | ✅ |
| HP: buka item WO | dipaksa Tier 1 (`buatBaris(w.segmenId, "1")`) | — |

Dua celah yang sudah ada:

1. **Inspeksi Tier 2 dari HP tidak terhitung di rekap sama sekali.** ULP yang
   langsung menginspeksi Tier 2 mendapat realisasi 0, kecuali dicentang.
2. **Inspeksi Tier 2 bisa menempel ke WO Tier 1.** `jtm_sambung_wo`
   menyambungkan menurut segmen saja; kalau disetujui, `jtm_tutup_item_wo`
   menutup item Tier 1 padahal Tier 1-nya belum dikerjakan.
   Cek: `scripts/cek-jtm-tier-salah-wo.sql` (hanya baca).

## Keputusan user (7 Okt 2026)

| # | Keputusan |
|---|---|
| 1 | Satu segmen **boleh** berada di WO Tier 1 dan WO Tier 2 yang sama-sama terbuka |
| 2 | Realisasi Tier 2 = inspeksi HP Tier 2 (tersambung WO **dan** di luar WO) **ditambah** centang tempelan |
| 3 | Inspeksi Tier 2 lama yang salah menempel: **dicek dulu**, perbaikan diputuskan sesudah melihat hasilnya |
| 4 | Rekap Tier 2 ditambahkan di Beranda HP |
| 5 | **Tempel WO Tier 2 TIDAK berubah**: tetap `wo_manual` + centang. Sumbernya baris Excel, bukan segmen master, dan ULP yang menempel Tier 2 di HP-nya baru menjalankan Tier 1 |
| 6 | Hitungan ganda (tempelan dicentang + segmen yang sama diinspeksi Tier 2 di HP) **dibiarkan, tetapi terlihat**: realisasi Tier 2 dirinci "dari HP" dan "dari centang" |
| 7 | Pilihan tier di Susun WO **wajib dipilih, tanpa bawaan** |

## Dua jalur WO Tier 2

| Jalur | Sumber objek | Di HP? | Realisasi |
|---|---|---|---|
| **Susun WO** (baru) | segmen master | ✅ per tiang | otomatis dari inspeksi HP Tier 2 |
| **Tempel WO** (tetap) | baris Excel | ❌ | centang manual |

## Rancangan

### Database — `scripts/wo-jtm-tier.sql`
- `wo_inspeksi.tier` dan `wo_inspeksi_item.tier` (`'1'`/`'2'`, bawaan `'1'`).
  Item mewarisi tier WO-nya lewat pemicu, jadi fungsi lama yang menyisipkan
  item tanpa menyebut tier tetap benar.
- Unik: satu segmen **per tier** satu item terbuka (dulu: satu segmen).
- `jtm_sambung_wo` hanya ke item **dengan tier yang sama**.
- `terbitkan_wo_inspeksi_jtm(..., p_tier)` — bawaan `'1'`, web lama tetap jalan.
- `tempel_wo` (jtm) hanya melihat WO/item Tier 1.
- `wo_inspeksi_item_status` membawa `tier`.
- `_rekap_kinerja_inti`: `jtm` = WO Tier 1 saja; `jtm2` = WO susun Tier 2 +
  tempelan, realisasi = inspeksi HP Tier 2 + centang. Bentuk keluaran tidak
  berubah (HP membacanya).
- `wo_surat_objek`: item WO Tier 2 ke lampiran `jtm2`.

### Web
- Susun WO JTM: pilih Tier 1 / Tier 2 dulu (wajib). Nama WO disarankan sesuai
  tier. Pemilih segmen hanya menyembunyikan segmen yang terbuka di WO **tier
  yang sama**.
- WO berjalan: kolom tier + saringan Semua / Tier 1 / Tier 2.
- Kinerja Yantek: baris Tier 2 menghitung dari inspeksi + centang; catatannya
  merinci "dari HP" dan "dari centang".

### HP
- Item WO membawa tier; membuka item Tier 2 memulai inspeksi Tier 2.
- Chip "Tier 1"/"Tier 2" di tiap kartu; saringan Semua · Tier 1 · Tier 2 di
  bawah tab (angka tab ikut tersaring, pilihan terakhir diingat).
- Rekap Kinerja Beranda: baris "Inspeksi JTM Tier 2".

## Urutan rilis

1. Jalankan `cek-jtm-tier-salah-wo.sql`, kirim hasilnya — putuskan perbaikan.
2. Jalankan `wo-jtm-tier.sql` (aman: semua bawaan Tier 1).
3. OTA HP — **sebelum WO Tier 2 pertama terbit**. HP lama membuka item Tier 2
   sebagai Tier 1, sehingga inspeksinya tidak tersambung ke WO.
4. Deploy web; baru setelah itu admin menyusun WO Tier 2.
