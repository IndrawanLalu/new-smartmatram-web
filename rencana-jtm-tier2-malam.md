# Rencana: Inspeksi JTM Tier 2 = inspeksi malam di tiang yang sudah ada

*21 Oktober 2026. Status: **MENUNGGU PERSETUJUAN USER**.*

## Latar

Tier 2 diinspeksi malam hari / saat beban puncak. Selama ini Tier 2 boleh
merintis segmen dan menambah tiang. Akibatnya 36 dari 37 segmen ber-Tier 2
belum pernah di-Tier 1: regu menitik tiang di malam hari, padahal hasilnya
tidak bagus.

Isian Tier 2 sekarang = semua item Tier 1 (`tier = '12'`) + 4 item khusus
Tier 2: andongan, baut & mur, suhu sambungan, dan nilai pentanahan (nonaktif).
Jadi Tier 2 lebih panjang dari Tier 1, kebalikan dari kebutuhan.

## Keputusan user (21 Okt)

| # | Keputusan |
|---|---|
| 1 | WO Tier 2 hanya untuk segmen yang Tier 1-nya **Diverifikasi** (169 segmen saat ini) |
| 2 | Isian Tier 2 seperti usulan (tabel di bawah), **tetap bisa diatur di Pengaturan** |
| 3 | Item mana yang ikut Tier 1 / Tier 2 **diatur di Pengaturan** |
| 4 | **Semua tiang wajib dinilai**; batas jarak (radius) tetap berlaku |

## Rancangan

### A. Pengaturan (web, Inspeksi JTM → Pengaturan → Isian & pilihan)
- Tiap item mendapat pilihan **Tier 1 · Tier 2 · Keduanya**. Kolom `tier` sudah
  ada (`'1'`, `'2'`, `'12'`) dan HP sudah menyaringnya. Yang ditambahkan hanya
  tombolnya di web, serta pilihan tier saat menambah item.
- Isi awal (SQL):
  - Semua item `'12'` menjadi `'1'`, jadi Tier 2 tidak lagi menanyakannya.
  - Item lama khusus Tier 2 (andongan, baut & mur, suhu sambungan) dinonaktifkan.
  - Admin bisa mengembalikan semua itu lewat tombol tier dan aktif.
- **Ambang ΔT** (°C) diatur di Pengaturan, sebagai saran kategori temuan.

### B. Isian Tier 2 baru (data di `jtm_item_ref`, kelompok "Pemeriksaan malam", per tiang)

| Item | Isian | Muncul bila |
|---|---|---|
| Hasil pemeriksaan | Normal / Ada kelainan (= temuan) | selalu, **wajib** |
| Titik panas di | Tidak ada / Isolator / Jumperan-sambungan / Peralatan / Arrester | Ada kelainan |
| Suhu titik panas (°C) | angka | titik panas ≠ Tidak ada |
| Suhu pembanding (°C) | angka (fasa lain yang normal) | titik panas ≠ Tidak ada |
| Suara | Tidak ada / Desis (korona) / Dengung / Letupan | Ada kelainan |
| Flashover / percikan | Tidak terlihat / Terlihat | Ada kelainan |

- "Ada kelainan" adalah pilihan bertanda Temuan. Akibatnya:
  - foto temuan wajib (sampai 3, bisa foto termal);
  - regu memilih kategori Urgent/Rawan/Biasa;
  - temuannya masuk ke alur tugaskan regu yang sudah ada.
- **ΔT = suhu titik panas − suhu pembanding**, dihitung HP dan web.
  - HP **menyarankan** kategori dari ambang ΔT: <10 tanpa saran, 10–25 Biasa, 25–40 Rawan, >40 Urgent; flashover terlihat = Urgent.
  - Regu tetap bisa mengganti kategori. Mesin temuan tidak diubah.
- Tier 2 tidak menulis master tiang. Pemicu master hanya untuk item ber-`master_field`, dan item itu tidak ada di Tier 2.
- Rekap data penyulang mengambil jawaban terakhir **per item**, jadi tidak hilang. Kedua hal ini sudah dicek.

### C. Hanya tiang yang sudah ada
- **Server:**
  - `rintis_segmen_jtm` menolak Tier 2.
  - `kirim_tiang_jtm` menolak tiang baru, sisipan, dan geser titik pada inspeksi Tier 2.
  - Inspeksi Tier 2 hanya bisa dibuat untuk segmen yang Tier 1-nya Diverifikasi, baik dari WO maupun di luar WO.
- **HP (OTA):**
  - Pada Tier 2, tombol rintis, tambah tiang, sisip, geser titik, dan tumpangi disembunyikan.
  - Pilihan "Tier 2" di luar WO hanya menampilkan segmen yang sudah dititik.
  - Segmen yang belum dititik diberi keterangan "Belum dititik Tier 1".
- **Susun WO Tier 2 (web):**
  - Segmen tanpa Tier 1 Diverifikasi tetap terlihat, tapi tidak bisa dipilih.
  - `terbitkan_wo_inspeksi_jtm` ikut menolaknya.

### D. Tampilan hasil (web)
- Detail inspeksi Tier 2 menampilkan kolom ΔT.
- Excel Hasil Inspeksi Tier 2 diberi kolom suhu, suhu pembanding, ΔT, suara, dan flashover.

### E. Data lama
- 37 segmen yang sudah ber-Tier 2 dibiarkan sebagai riwayat dan tetap terhitung di realisasi.
- Tiang yang dititik lewat Tier 2 tetap menjadi tiang segmennya.

## Urutan rilis
1. SQL `jtm-tier2-malam.sql`:
   - item & pilihan baru, isi awal tier, ambang ΔT;
   - penjaga server (rintis, kirim tiang, mulai inspeksi, terbitkan WO).
   Diuji PGlite dengan memanggil fungsinya.
2. OTA HP: tombol Tier 2 disembunyikan, saran kategori ΔT, saringan segmen.
3. Web: tombol tier di Pengaturan, ambang ΔT, Susun WO, detail, dan Excel.

⚠ SQL dulu baru OTA. HP lama yang mencoba menambah tiang di Tier 2 akan
ditolak server dengan pesan yang jelas.
