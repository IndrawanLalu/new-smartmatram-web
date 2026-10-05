# Rancangan: Rencana Pengukuran + WO Pengukuran otomatis/manual + pengingat lewat waktu

*5 Oktober 2026. Status: **DIKERJAKAN 5 Okt 2026** — F1–F4 disetujui semua; label
"Kedaluwarsa" diganti "Sudah masuk waktu ukur" (pemeliharaan: "Sudah masuk waktu pemeliharaan").
SQL: `scripts/rencana-pengukuran.sql`.*

Permintaan user: *"buat rancangan rencana pengukuran seperti hargardu, sebagai dasar
saja; jika nanti ada gardu yang sudah lebih waktunya tetap diingatkan saat terbit
WO-nya; ada setingan WO-nya otomatis atau manual."*

Latar: beberapa ULP baru mulai memakai WO Pengukuran. Tanpa riwayat, aturan sistem
("belum pernah diukur dulu, lalu paling lama") hanya memotong daftar gardu sesuai
kuota. Hasilnya bukan siklus yang dipilih ULP sendiri. Pemeliharaan Gardu sudah
punya jalan keluarnya: **Rencana Pemeliharaan** (unggah Excel kisi 12 bulan).
Rancangan ini menyalin pola itu ke pengukuran.

---

## A. Rencana Pengukuran (salinan pola Rencana Pemeliharaan)

**Tempat:** `/admin/pengukuran-gardu` → tab **WO Pengukuran** → kartu tiap ULP
→ bagian **Rencana Pengukuran**. Posisinya sama dengan Rencana Pemeliharaan di
hargardu.

1. **Unduh templat** per ULP berbentuk Excel:
   - baris = seluruh gardu aktif Master Gardu ULP itu;
   - kolom = kisi 12 bulan, mulai bulan pertama yang WO-nya belum terbit;
   - ikut kolom bantu (hanya dibaca, tidak diunggah): penyulang, kVA, beban
     terakhir %, tanggal ukur terakhir.
2. ULP memberi tanda **✓** di bulan gardu itu diukur. Satu gardu boleh ditandai
   berkali-kali; misalnya gardu berbeban tinggi tiap 3 bulan ditandai 4 kali.
3. **Unggah** lalu tampil pratinjau sebelum disimpan:
   - jumlah gardu per bulan, dibandingkan kuota per bulan (peringatan saja);
   - **gardu yang tidak direncanakan sama sekali** dalam 12 bulan (peringatan);
   - **gardu berbeban tinggi yang jarak antar tandanya lebih dari batas umur**
     (mis. batas 3 bulan, tapi hanya ditandai Jan dan Agu), sebagai peringatan;
   - kode yang tidak ada di Master Gardu **ditolak**. Daftarkan di master dulu
     (sama dengan hargardu).
4. **Unggah ulang** hanya mengganti bulan yang WO-nya belum terbit. Bulan yang
   sudah terbit dikunci dan disebutkan.
5. **Hapus rencana** artinya menyerahkan penyusunan kembali ke aturan sistem
   (mulai bulan berjalan, yang belum terbit saja).

Rencana bersifat **dasar**, bukan pengganti aturan. Aturan umur (beban tinggi
tiap N bulan, rendah tiap M bulan) tetap berjalan sebagai **pengingat**
(bagian C).

---

## B. Isi WO saat terbit (satu penyusun di server)

Penyusun tunggal di database, `_susun_wo_pengukuran(ulp, tahun, bulan)`. Dipakai
oleh tombol **Terbitkan WO** dan oleh penerbitan otomatis, jadi hasil keduanya
selalu sama (pola hargardu P3).

| Bulan… | Isi WO | Label di WO / HP |
|---|---|---|
| ada Rencana Pengukuran | gardu rencana bulan itu | **Sesuai rencana ULP** |
| | + sisa WO bulan lalu yang belum terealisasi | **Sisa bulan lalu** |
| tanpa rencana | aturan sistem sekarang: belum pernah diukur → kedaluwarsa → beban tertinggi, dipotong kuota | **Belum pernah diukur** / **Kedaluwarsa** (seperti sekarang) |

- Kuota **tidak memotong** WO dari rencana. Kuota tetap memotong WO dari aturan
  sistem.
- Aturan sistem yang sekarang dihitung di web (`_lib/kandidatWo.ts`) **dipindah
  ke database**. Penerbitan otomatis tidak punya layar web, dan dua salinan
  aturan pasti lama-lama berbeda. Pratinjau di web memanggil fungsi yang sama
  dalam mode "lihat saja".
- **WO yang sudah ada karena tempelan** (Tempel WO di Rekap Kinerja sebelum
  tanggal 1): penyusun **menambahkan** gardu rencana + sisa yang belum ada,
  bukan menolak. Kalau tidak begitu, satu tempelan lebih awal membuat rencana
  bulan itu tidak pernah terbit.

---

## C. Pengingat "lewat waktu ukur"

**Lewat waktu ukur** berarti gardu yang **tidak ada di WO bulan ini** padahal
umur pengukuran terakhirnya sudah melewati batas Pengaturan WO (beban tinggi N
bulan / rendah M bulan), atau gardu yang belum pernah diukur sama sekali.

Pengingat muncul di tiga tempat:
1. **Saat terbit manual**: di pratinjau ada bagian *"N gardu lewat waktu ukur,
   tidak ada di rencana bulan ini"*. Ada tanda centang untuk ikut dimasukkan
   (bawaan: lihat F1).
2. **Sesudah terbit otomatis**: di kartu WO ULP itu muncul pita kuning *"N gardu
   lewat waktu ukur tidak ada di WO ini"* dengan tombol **Lihat** dan **Tambahkan
   ke WO**. Gardu yang ditambahkan berlabel **Lewat waktu ukur**.
3. Di **daftar WO**, gardu yang masuk karena pengingat ini diberi label sendiri,
   supaya terlihat mana yang direncanakan dan mana yang menyusul.

Daftar pengingat dihitung saat dibuka, tidak disimpan. Begitu gardu itu diukur,
gardu itu hilang sendiri dari pengingat.

---

## D. Pengaturan: terbit otomatis atau manual

Di **Pengaturan WO** (panel yang sudah ada) per ULP ditambah satu pilihan:

- **Manual** (bawaan, sama dengan sekarang): WO terbit saat admin menekan
  **Terbitkan WO** setelah melihat pratinjau.
- **Otomatis**: WO terbit sendiri **tanggal 1 pukul 00.10 WITA** (pg_cron, cara
  yang sama dengan WO Pemeliharaan), memakai penyusun bagian B. Tombol
  Terbitkan WO tetap ada sebagai cadangan kalau penjadwal gagal.

Hasil penerbitan otomatis tercatat (`kriteria.otomatis = true`) dan tampil di
kartu WO: *"Terbit otomatis 1 Nov 00.10 — 48 rencana + 6 sisa"*.

---

## E. Perubahan data & tahapan

**SQL (jalankan manual di Supabase, tidak mengganggu lapangan, boleh siang):**
- tabel `rencana_pengukuran` (ulp, gardu_kode, tahun, bulan, catatan), FK ke
  `gardu(kode, ulp)`;
- `simpan_rencana_pengukuran` / `hapus_rencana_pengukuran` (dijaga hak ULP);
- `wo_pengukuran_settings.terbit_otomatis BOOLEAN DEFAULT false`;
- alasan baru di `wo_pengukuran_item`: `rencana`, `sisa`, `lewat_waktu`;
- `_susun_wo_pengukuran` + `terbitkan_wo_pengukuran` (tombol) +
  `pratinjau_wo_pengukuran` (lihat saja) + `lewat_waktu_wo_pengukuran`
  (pengingat) + `tambah_lewat_waktu_wo_pengukuran`;
- pg_cron `wo-pengukuran-otomatis`.

**Tahapan:**
1. **P1 SQL** rencana + pengaturan. Diuji di PGlite dengan data contoh.
2. **P2 web**: unduh/unggah/hapus Rencana Pengukuran (salin komponen hargardu).
3. **P3**: penyusun server + tombol Terbitkan memakai server + pg_cron +
   pengingat lewat waktu.
4. **P4 HP (OTA)**: label alasan baru di layar WO Pengukuran (sekaligus
   membetulkan label "tempelan" yang sekarang tampil kosong). HP tidak perlu
   menulis apa pun ke WO. Realisasi tetap dari view, tidak berubah.

Yang **tidak** berubah: realisasi (pengukuran di bulan WO), satu WO per ULP per
bulan, Tempel WO, Rekap Kinerja & surat WO (membaca tabel yang sama).

---

## F. Yang perlu diputuskan user

1. **Pengingat lewat waktu saat terbit manual:** bawaannya **tidak dicentang**
   (hanya diingatkan, admin memilih), atau **dicentang** (ikut masuk kecuali
   dibuang)? Usul: **tidak dicentang**. Rencana ULP adalah dasarnya, dan WO
   tidak membengkak tanpa sepengetahuan admin.
2. **Saat terbit otomatis**, gardu lewat waktu ukur **hanya diingatkan** (pita +
   tombol Tambahkan), atau **langsung ikut masuk**? Usul: **hanya diingatkan**,
   sama dengan F1.
3. **Nama yang tampil di layar** (mohon dikoreksi bila perlu):
   - bagian: **Rencana Pengukuran**;
   - label WO: **Sesuai rencana ULP** · **Sisa bulan lalu** · **Lewat waktu ukur**;
   - pengaturan: **Terbit WO: Manual / Otomatis (tanggal 1)**.

   Catatan: label lama **Kedaluwarsa** (aturan sistem) dan **Lewat waktu ukur**
   (pengingat) artinya sama, yaitu umur ukur melewati batas. Usul: keduanya
   diseragamkan menjadi **Lewat waktu ukur**.
4. **Pemeliharaan Gardu** sekarang selalu terbit otomatis bila ada rencana.
   Pilihan Otomatis/Manual ikut ditambahkan di sana juga (seragam), atau
   pengukuran saja?
