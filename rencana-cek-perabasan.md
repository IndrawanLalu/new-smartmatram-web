# Rencana — Cek hasil perabasan dari HP (10 Okt 2026)

Status: **rancangan, belum dikerjakan.** Berlaku `teknisaplikasi.md` butir 1, 2,
4, 14, 15, 17, 19, 22.

## 0. Keputusan user (10 Okt 2026)

| # | Keputusan |
|---|---|
| 1 | Segmen yang dinyatakan **Selesai disisir** oleh regu dicek dari **HP** oleh **admin ULP + peran yang berizin verifikasi WO** (`roles.can_verify_wo` — kini Staff Teknik, TL Teknik, Koordinator), ULP-nya sendiri; UP3 semua ULP |
| 2 | Pengecek turun ke lapangan; pohon yang belum dirabas **dititik**: titik GPS + jenis pohon + **foto 1–3** (catatan boleh kosong) |
| 3 | Pohon yang dititik pengecek masuk sebagai pohon **segmen itu** (seperti pohon inspeksi JTM), dan segmen **dikembalikan ke regu** |
| 4 | Regu **wajib merabas semua** pohon hasil pengecekan (foto sebelum + sesudah) sebelum bisa Selesai disisir lagi |
| 5 | **Persetujuan web tetap ada** — HP untuk cek lapangan, web untuk menerima tanpa turun; status & riwayatnya satu |
| 6 | Pohon dikategorikan: **pohon inspeksi** · **pohon perabasan** · **pohon hasil pengecekan** |

## 1. Keadaan sekarang (dicek 10 Okt)

- Item WO: Dijadwalkan → Dalam Proses → **Selesai** (regu selesai disisir) →
  Diverifikasi / Ditolak. Diputuskan hanya dari web (`putuskan_perabasan_segmen`,
  hak `wajib_boleh_ulp` = UP3 + admin ULP); Ditolak cukup alasan teks.
- Data: 9 segmen Selesai menunggu, 3 Diverifikasi, 11 Dalam Proses.
- Pohon inspeksi = view `perabasan_pohon` (jawaban vegetasi di tiang).
  Pohon perabasan = `perabasan_realisasi` (dirabas regu, termasuk temuan regu
  tanpa tiang).
- HP: admin sudah membuka menu Perabasan, tapi isinya tampilan regu.
  Staff Teknik/TL/Koordinator belum punya menu Perabasan.

## 2. Alur

```
Regu: Selesai disisir ─► [Selesai]
Pengecek (HP): buka segmen → peta: tiang, pohon inspeksi, pohon dirabas (foto)
   ├─ tak ada pohon tertinggal ─► Terima ─► [Diverifikasi]
   └─ titik pohon tertinggal (draf di HP) ─► periksa ─► Kirim
                                             ─► [Ditolak] + "N pohon belum dirabas"
Regu: segmen kembali ke Sudah dikerjakan (merah), tampil 3 macam pohon;
      pohon hasil pengecekan WAJIB dirabas (foto sebelum/sesudah)
      ─► Selesai disisir lagi ─► [Selesai] ─► dicek lagi (putaran 2) …
```

## 3. Data

- Tabel baru **`perabasan_cek_pohon`** — satu baris = satu pohon hasil pengecekan:
  `id` (UUID dari HP, kirim ulang tak menggandakan), `item_id`, `segmen_id`,
  `putaran` (cek ke-berapa), `lat`, `lng`, `jenis_pohon`, `foto_url` (utama) +
  `foto_url_2` + `foto_url_3` (butir 22), `catatan`, `dicek_oleh`, `dicek_uid`,
  `dicek_at`, `realisasi_id` (diisi saat regu merabasnya; NULL = belum).
- `perabasan_realisasi` + kolom **`cek_pohon_id`** — pohon perabasan yang
  menjawab satu pohon hasil pengecekan.
- Pemeriksa hak baru **`wajib_boleh_cek_perabasan(ulp)`**: UP3; admin ULP itu;
  peran `can_verify_wo` dengan unit = ULP itu.

## 4. Fungsi (satu transaksi tiap kirim — butir 17)

| Fungsi | Isi |
|---|---|
| `kirim_cek_perabasan(item, pohon[], catatan, oleh)` | item harus Selesai; pohon kosong → **Diverifikasi**; ada pohon → simpan pohon (idempoten per id) + **Ditolak** dengan alasan otomatis "N pohon belum dirabas (hasil pengecekan)" + catatan; tercatat master_audit |
| `simpan_pohon_perabasan` (ubah) | pohon boleh membawa `cek_pohon_id` → pohon hasil pengecekan itu tertandai dirabas |
| `selesaikan_perabasan_segmen` (ubah) | **ditolak** selama masih ada pohon hasil pengecekan segmen itu yang belum dirabas |
| `putuskan_perabasan_segmen` (web, tetap) | hak diperluas ke pemeriksa baru |

## 5. HP

**Pengecek** — menu **Cek Perabasan** (kunci menu baru, diatur di Kelola Role):

| Tab | Isi |
|---|---|
| Perlu dicek | segmen Selesai di ULP-nya (km) |
| Sedang dicek | draf pengecekan di HP, belum dikirim (Kirim per kartu) |
| Sudah diputuskan | bulan ini: diterima / dikembalikan + jumlah pohon |

Layar satu segmen: peta (tiang, pohon inspeksi, pohon dirabas + foto) →
**"+ Pohon belum dirabas di sini"** (GPS, jenis, foto 1–3, catatan) → simpan di
HP → **Terima** (bila tak ada pohon) atau **Kembalikan ke regu (N pohon)** →
periksa → Kirim. Draf berkunci item + putaran, bercap pemilik (butir 14, 19).

**Regu** — segmen dikembalikan menampilkan tiga kelompok pohon; pohon hasil
pengecekan bertanda jelas (foto pengecek dilihat), dirabas dengan foto
sebelum/sesudah; tombol Selesai disisir terkunci sampai semuanya dirabas.

## 6. Web

- Modal item WO Perabasan: daftar pohon dalam tiga kelompok + putaran cek.
- Peta /peta lapisan Pohon: pohon hasil pengecekan sebagai sumber ketiga.

## 7. Urutan

| Fase | Isi |
|---|---|
| C1 | SQL: tabel, kolom, hak, 3 fungsi + uji PGlite |
| C2 | HP pengecek: menu, 3 tab, layar cek, draf, kirim |
| C3 | HP regu: tiga kelompok pohon, wajib rabas, kunci Selesai disisir |
| C4 | Web: modal tiga kelompok + lapisan peta |

## 8. Dijawab user (10 Okt 2026)
- Nama di layar: menu **"Cek Perabasan"**; tab **Perlu dicek / Sedang dicek /
  Sudah diputuskan**; tombol **"+ Pohon belum dirabas di sini"**; kategori
  **pohon inspeksi / pohon perabasan / pohon hasil pengecekan**.
- Admin ULP di HP: **keduanya tetap** — menu Perabasan (tampilan regu) dan
  Cek Perabasan.

## 9. Status
- **C1 selesai 10 Okt** — `scripts/perabasan-cek.sql` (belum dijalankan): hak
  `wajib_boleh_cek_perabasan`, `wo_perabasan_item.cek_ke`, tabel
  `perabasan_cek_pohon` + view `perabasan_cek_pohon_status` (dirabas, foto rabas),
  `perabasan_realisasi.cek_pohon_id` (unik), `kirim_cek_perabasan`,
  `simpan_pohon_perabasan` / `selesaikan_perabasan_segmen` /
  `putuskan_perabasan_segmen` diperbarui. Uji PGlite 23 skenario lulus.
- **C2 selesai 10 Okt (HP, belum commit/OTA)** — `src/services/cekPerabasan.ts`
  (daftar + tembolok, draf `@cek_rabas_draf_v1` bercap pemilik, `kirimCek`,
  `ringkasCek`), `CekPerabasanScreen` (Perlu dicek / Sedang dicek / Sudah
  diputuskan, angka km), `CekPerabasanSegmenScreen` (peta + 3 macam pohon,
  "+ Pohon belum dirabas di sini", Terima / Kembalikan ke regu),
  `FormPohonCek` (GPS, jenis, foto 1–3), `PetaSegmenRabas` + penanda segitiga
  `cek`, menu `cekPerabasan`. Web: `lib/roles.ts` MOBILE_MENUS +cekPerabasan;
  `scripts/menu-cek-perabasan.sql` (admin, UP3, can_verify_wo).
  ⚠ C3 (regu) WAJIB ikut OTA yang sama — tanpa itu segmen yang dikembalikan
  dengan pohon hasil pengecekan tidak bisa diselesaikan regu.
- **C3 selesai 10 Okt (HP, belum commit/OTA)** — regu: `PerabasanSegmenScreen`
  menampilkan "Pohon hasil pengecekan — N wajib dirabas" paling atas (foto
  pengecek, catatan, tombol Rabas/Lanjut), segitiga di peta (ketuk → rabas),
  formulir "Rabas pohon hasil pengecekan" (jenis & titik terisi dari
  pengecek), `DrafPohon.cekPohonId` ikut terkirim, Selesai disisir ditahan di
  HP bila masih ada sisa (server juga menahan). Disiapkan luring untuk segmen
  Ditolak. tsc bersih.
- **C4 selesai 10 Okt (web, belum commit)** — modal segmen WO Perabasan:
  `PohonSegmenRabas` + `usePohonSegmenRabas` (hasil pengecekan paling atas
  dengan foto pengecek & foto sesudah regu; perabasan sebelum–sesudah;
  inspeksi dengan tanda "tanpa laporan rabas"); `ambilRealisasi` lama dibuang.
  Peta /peta lapisan Pohon: sumber ketiga **"Dari hasil pengecekan"** (yang
  belum dirabas, tidak per bulan), ikon segitiga merah "!", popup foto 1–3.
