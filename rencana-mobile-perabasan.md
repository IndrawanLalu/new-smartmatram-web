# Rancangan — Perabasan di HP mengikuti pola kerja lapangan

Disusun 25 September 2026. Fitur keempat dalam urutan
`rencana-mobile-kerja-lapangan.md` §8. Berlaku `teknisaplikasi.md` butir 1, 2,
5, 6, 14–17. **Disetujui 25 Sep 2026** (termasuk dua usulan §6). R1 =
`scripts/perabasan-kerja-hp.sql`.

---

## 0. Keputusan user (25 Sep 2026, jangan ditawar ulang)

| # | Keputusan |
|---|---|
| 1 | Pohon **boleh dikirim sementara** — pohon yang sudah dicatat dikirim kapan saja (foto ikut terunggah) tanpa menutup segmen; "Selesai disisir" yang menutupnya |
| 2 | "Mulai" segmen **dikirim saat ada sinyal** (status *Dalam proses* terlihat di web); tanpa sinyal tidak menghalangi, menyusul |
| 3 | **Rabas di luar WO dicatat** sebagai realisasi harian **tanpa segmen** — KMS-nya tidak dihitung, "jatuhnya seperti pemeliharaan jaringan". Termasuk bantuan lintas ULP yang darurat (Ampenan membantu Cakra) — tetap harus tercatat |
| 4 | Tab *Sudah dikirim* = segmen yang selesai disisir bulan ini |
| 5 | **Angka di tab = total KMS**, bukan jumlah segmen: belum berapa km, sudah berapa km, dst. |

---

## 1. Keadaan sekarang

- **Tiap pohon langsung ke server** saat dicatat; fotonya diunggah saat
  dipotret. Tanpa sinyal tidak bisa mencatat — melanggar butir 1 & 6.
- Mulai & Selesai langsung RPC ke server; Selesai = terkirim.
- Sudah baik: daftar disaring per regu login & disimpan di HP, foto 1024/0,6,
  web sudah punya **Terima / Kembalikan ke regu (Ditolak) / Keluarkan dari WO**.
- Tidak ada jalan mencatat rabas di luar WO.

---

## 2. HP — empat tab (tampilan WO Pengukuran)

Angka di kartu tab = **km** (keputusan 5); pohon di luar WO disebut terpisah
("+3 pohon di luar WO") karena tidak punya km.

| Tab | Isi | Angka |
|---|---|---|
| **WO** | semua segmen WO regu (belum selesai + selesai bulan ini), progres km | total km |
| **Belum dikerjakan** | segmen yang belum dimulai / belum ada pohon tercatat | km |
| **Sudah dikerjakan** | segmen yang sedang disisir: pohon tersimpan di HP & yang sudah terkirim sementara, dengan tombol **Kirim pohon** dan **Selesai disisir**; segmen **dikembalikan** admin (merah + alasan); catatan **di luar WO** yang belum dikirim | km (+ pohon luar WO) |
| **Sudah dikirim** | segmen selesai disisir bulan ini: menunggu diperiksa · diterima · dibatalkan (+ alasan); pohon di luar WO terkirim bulan ini — hanya dilihat | km (+ pohon luar WO) |

- Tombol **"Catat rabas di luar WO"** di tab Sudah dikerjakan (tidak ada
  pencarian segmen — keputusan 3: tanpa segmen).
- Nama regu dari login (butir 16) — sudah begitu.
- Luring: daftar segmen, pohon inspeksi per segmen, dan terkirim disimpan di HP.

## 3. Alur satu segmen

```
Belum ──Mulai (RPC bila ada sinyal)──► Sedang disisir
   catat pohon → tersimpan di HP (foto URI lokal)
   [Kirim pohon] → unggah foto + RPC simpan pohon (boleh berkali-kali)
   [Selesai disisir] → kirim pohon sisa + tutup segmen (satu RPC)
        ▼
   Sudah dikirim — hanya dilihat; koreksi = admin "Kembalikan ke regu"
        │ dikembalikan
        ▼
   Sudah dikerjakan (merah + alasan) — pohon terkirim tetap, bisa tambah/
   hapus pohon, lalu Selesai disisir lagi
```

- **Kunci draf = id item WO** (butir 14): satu segmen satu draf; tiap pohon
  ber-UUID dari HP → kirim ulang tidak menggandakan pohon.
- Kirim pohon = unggah foto (URL ditulis balik ke draf) + satu RPC
  `simpan_pohon_perabasan(item_id, pohon[])` — satu transaksi, idempoten per id
  pohon.
- Selesai disisir = RPC `selesaikan_perabasan_segmen` yang sudah ada, didahului
  kiriman pohon sisa. Segmen tanpa pohon tetap boleh (wajib catatan — sudah
  dijaga database).
- Pohon yang sudah terkirim dari segmen yang **dikembalikan** boleh dihapus
  regu (salah catat) lewat RPC — hanya selama segmen berstatus Ditolak/Dalam
  Proses.

## 4. Rabas di luar WO (baru)

Tabel baru **`perabasan_luar_wo`** — satu baris = satu pohon:
penyulang, **ULP lokasi** (tempat pekerjaan), **regu & ULP regu** (yang
mengerjakan), jenis pohon, titik, **dua foto wajib**, tanggal, catatan,
status `Selesai → Diverifikasi | Ditolak | Dibatalkan`.

- HP: formulir pendek (pilih ULP lokasi & penyulang, jenis pohon, 2 foto,
  titik otomatis), simpan di HP → Kirim (id dari HP, satu RPC).
- Web `/admin/wo-perabasan`: bagian **"Di luar WO"** di daftar (chip), modal
  dengan Terima / Kembalikan / Batalkan — pola sama.
- **Rekap Kinerja**: km tidak berubah (tetap hanya dari WO); keterangan baris
  Perabasan menyebut "+N pohon di luar WO".

## 5. Urutan pengerjaan

| Fase | Isi |
|---|---|
| R1 | SQL: `simpan_pohon_perabasan`, hapus pohon (segmen dikembalikan), `perabasan_luar_wo` + kirim/putuskan, `rekap_kinerja` keterangan luar WO |
| R2 | HP layanan: draf per segmen & luar WO, tembolok, kirim pohon/selesai |
| R3 | HP layar: 4 tab ber-km, formulir luar WO |
| R4 | Web: daftar & modal "Di luar WO" |

## 6. Diputuskan (usulan disetujui 25 Sep 2026)

- **Pohon luar WO dihitung untuk ULP mana di rekap?** Usulan: **ULP regu**
  (yang bekerja); tetap tampil juga di daftar web ULP lokasi supaya admin
  lokasi tahu jaringannya disentuh.
- **Verifikasi luar WO oleh admin ULP mana?** Usulan: admin **ULP lokasi**
  (yang mengenal jaringannya) atau UP3.
