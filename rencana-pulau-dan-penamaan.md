# Rancangan: Menitik dari ujung/tengah ("pulau") + Penamaan JTM baru + Ganti nama mengalir

*5 Oktober 2026. Status: **DIKERJAKAN 5 Okt 2026** — G1–G4 disetujui semua.
SQL `scripts/jtm-penamaan-baru.sql` dijalankan user malam hari, baru web & HP dikirim.*

Masalah yang diselesaikan:

1. **Regu harus melawan arus jalan.** Nama tiang lahir dari induknya, jadi
   menitik harus urut dari pangkal. Di jalan raya itu berarti berjalan melawan
   arus.
2. **Nama JTM terlalu panjang dan menyesatkan.** Aturan sekarang meniru JTR:
   setiap belokan > 60° memulai huruf arah mata angin baru, walaupun bukan
   percabangan. Hasilnya `SND-003B4C2D21A1D19_B1_D13A15B1A17_B4B1A1`.
3. **Nama yang terlanjur salah sulit dibetulkan.** Ganti nama di web hanya
   satu tiang; tiang sesudahnya tidak ikut.

Keputusan user yang sudah dikunci:

- Model pulau untuk **JTM dan JTR**. Pulau disimpan di HP sampai disambungkan.
- Nama JTM: **jalur utama selalu lanjut** (`PRM-001…050`), tidak peduli arah.
  **R/L hanya untuk cabang** di tiang percabangan. Cabang = jalur yang lewat FCO,
  ditentukan regu, bukan dari bentuk jalan.
- R/L diukur **terhadap arah jalur utama yang keluar** dari tiang percabangan.
  Kasus PRM-015: jalur utama belok kanan (PRM-016…), cabang FCO lurus →
  `PRM-015L001`.
- **Angka selalu tiga digit**: `PRM-015R001`. Dua cabang di sisi yang sama:
  `R` lalu `RR` (`PRM-015RR001`).
- Anak tiang percabangan → HP bertanya "jalur utama atau cabang". Cabang yang
  dititik sebelum jalur utama → HP bertanya arah jalur utama (Kanan/Lurus/Kiri).
- Tiang lama dibetulkan lewat **Generate ulang nama** di web. Admin bisa
  **mengganti nama di pangkal, hilirnya ikut**.

---

## A. Model "pulau" — menitik dari ujung atau dari tengah (HP, JTM & JTR)

### A1. Perilaku di lapangan

1. **Mulai biasa (dari pangkal):** tidak berubah sama sekali.
2. **Mulai di ujung atau di tengah:** regu menekan **"Mulai di sini (pulau)"**.
   Tiang pertama yang dititik menjadi **akar pulau**: induknya belum diketahui,
   jadi belum bernama.
3. Selama ada pulau terbuka, di atas tombol titik ada pilihan arah:
   **◂ Ke arah pangkal** / **Ke arah ujung ▸**.
   - **Ke arah pangkal:** tiang baru menjadi **hulu** dari tiang terakhir pulau
     (rantai terbalik). Tiang baru itu menjadi akar pulau yang baru.
   - **Ke arah ujung:** tiang baru menjadi anak dari tiang pulau yang
     dipilih/terdekat, seperti biasa.
   - Regu boleh menyapu ke satu arah, kembali ke akar, lalu ke arah sebaliknya.
     Semuanya tetap satu pulau.
4. Setiap tiang pulau **tetap dinilai di tempat** (menitik = menilai,
   teknisaplikasi butir 20), berlabel **"menunggu sambungan"**.
5. **Sambungkan pulau:** begitu sampai di hulu yang sudah tercatat, regu menekan
   **"Sambungkan pulau"**, lalu memilih:
   - ketuk **tiang yang sudah bernama** di peta/daftar;
   - JTR: **langsung dari gardu**;
   - JTM: **tiang pertama dari GI / pangkal segmen** (tanpa induk).
6. Sesudah disambungkan, HP **mengurutkan ulang** tiang pulau dari pangkal ke
   ujung (induk selalu lebih dulu), lalu kirim otomatis mengirimnya satu per satu.
   Nama turun urut, persis seperti kalau segmen disapu dari pangkal.

### A2. Batasan yang disengaja

- **Satu pulau terbuka per segmen (JTM) / per gardu (JTR).** Pulau kedua baru
  bisa dimulai sesudah yang pertama disambungkan. Ini mencegah dua rantai tanpa
  nama yang membingungkan saat disambungkan.
- **Pulau hanya di HP sampai disambungkan.** Kirim otomatis melewatinya, karena
  urutan namanya belum diketahui. Pengingat muncul saat layar dibuka, di Beranda
  ("1 pulau belum disambungkan"), dan saat regu keluar dari layar.
- **"Selesai di segmen ini" (JTM) / "Selesai" (JTR) ditolak** selama pulau
  belum disambungkan.
- Fungsi penamaan server **tidak menerima tiang tanpa induk di tengah jaringan**.
  Pulau baru dikirim sesudah tersambung, jadi tidak ada perubahan server untuk
  pulau.

### A3. Data di HP

Pada baris draf tiang baru (`baru`):

- `pulauId` — tiang ini anggota pulau yang belum disambungkan;
- induk antar-anggota tetap memakai `indukLokal`. Rantai terbalik = induk tiang
  sebelumnya diganti menunjuk tiang yang baru dititik.

`sambungkanPulau(pulauId, ke)`:

- akar pulau mendapat induk (`indukId` tiang server / gardu / pangkal);
- `pulauId` dibuang dari semua anggota;
- draf diurutkan topologis (induk lebih dulu);
- kirim otomatis dipicu.

Semua lewat antrean penulisan draf yang sudah ada (`antreSimpan`).

---

## B. Aturan penamaan JTM yang baru (server)

### B1. Aturan

Untuk tiang baru **C** dengan induk **J** (nama J di penyulang ini = **K**):

| Keadaan | Nama C |
|---|---|
| J tanpa induk (pangkal penyulang) | `SINGKAT-001` (berikutnya `-002`, …) |
| C **jalur utama** (bukan cabang) | lanjutan garis K: awalan K tanpa angka terakhir + (angka K + 1), tiga digit. `PRM-015` → `PRM-016`; `PRM-015L007` → `PRM-015L008` |
| C **cabang** (ditandai regu / jawaban "cabang") | K + **sisi** + `001`. Sisi = `R`/`L` terhadap arah jalur utama keluar dari J. Sisi yang sama sudah dipakai cabang lain dari J → `RR`/`LL` |
| C disisipkan di antara J dan anak J yang sudah ada | tetap aturan sisipan sekarang: `PRM-015a` |

**Belokan tidak lagi memberi huruf.** Huruf hanya lahir di percabangan.

### B2. Menentukan sisi R/L

Urutan sumber:

1. **Arah jalur utama sudah diketahui** (J punya anak jalur utama): sisi = di
   kanan atau kiri arah J → anak utama.
2. **Belum ada anak utama:** jawaban regu "Jalur utama ke arah mana?"
   (Kanan/Lurus/Kiri). Arahnya dihitung dari arah datang (induk J → J), lalu
   sisi cabang ditentukan terhadapnya. Jawaban disimpan di
   `tiang.arah_utama_dari_sini` pada J, sehingga cabang berikutnya dan
   *Generate ulang* memakai jawaban yang sama.
3. **Tidak ada keduanya** (data lama): terhadap arah datang.

### B3. Penanda cabang

- `tiang.cabang_baru = true` pada tiang pertama cabang (kolom sudah ada; tombol
  "Cabang baru" di HP sudah mengisinya).
- `tiang.percabangan = true` pada J (sudah ada; ditandai otomatis saat cabang
  lahir).

### B4. Pengaman di server

Kalau anak jalur utama kedua dikirim ke J yang sudah punya lanjutan utama
(HP lama, atau regu salah jawab), tiangnya **tidak ditolak** (pekerjaan tidak
boleh hilang). Tiangnya **dinamai sebagai cabang**, J ditandai percabangan, dan
hasil kirim membawa catatan yang ditampilkan HP: *"PRM-015 sudah punya lanjutan
jalur utama (PRM-016), jadi tiang ini dinamai cabang PRM-015R001. Kalau
terbalik, admin bisa menukarnya di web."*

### B5. Yang tidak berubah

- **Nama tiang lama tidak disentuh** sampai admin menjalankan *Generate ulang*.
- Melanjutkan garis lama mempertahankan lebar angkanya (`PRM-024_A17` →
  `PRM-024_A18`). Tiga digit berlaku untuk garis baru. Setelah *Generate ulang*,
  semuanya seragam tiga digit.
- Nama per penyulang untuk tiang yang ditumpangi (underbuild) tetap per
  penyulang (`tiang_kode_penyulang`), memakai aturan yang sama.
- **JTR tidak berubah**: arah mata angin + jurusan.

---

## C. Ganti nama di web — sekali di pangkal, hilir ikut

### C1. Satu mesin penamaan untuk semuanya

Fungsi server `susun_nama_jtm(penyulang, ulp, mulai_tiang, nama_mulai)`:

- menelusuri pohon tiang penyulang itu dari `mulai_tiang`, jalur utama lebih
  dulu, lalu cabang (urut sisi R sebelum L);
- menamai ulang semuanya dengan aturan B;
- **hanya menghitung** (pratinjau): mengembalikan daftar tiang, nama lama, nama
  baru, dan catatan.

`terapkan_nama_jtm(...)` menulis hasilnya dalam **satu transaksi**:

- nama sementara dulu supaya tidak bentrok dengan indeks unik;
- lalu nama baru;
- **satu baris audit per tiang yang berubah**;
- UP3 / admin ULP saja (`wajib_boleh_ulp`).

### C2. Tiga pintu di web (peta + tab Tiang JTM)

1. **Ganti nama (hilir ikut):** admin mengetik nama baru di satu tiang, misalnya
   `PRM-015` → `PRM-020`. Pratinjau menampilkan semua tiang di hilirnya yang ikut
   berubah (`PRM-016` → `PRM-021`, `PRM-015L001` → `PRM-020L001`, …), lalu
   **Terapkan**. Pilihan **"Hanya tiang ini"** tetap ada untuk koreksi satu tiang.
2. **Jadikan cabang / Jadikan jalur utama:** pada anak tiang percabangan, untuk
   menukar mana yang utama dan mana yang cabang. Pratinjau nama hilir kedua
   jalur, lalu Terapkan.
3. **Generate ulang nama penyulang:** seluruh penyulang dari pangkalnya, dengan
   pratinjau dan ringkasan ("312 tiang, 287 berubah, terpanjang `PRM-024R003L002`").
   Ini pintu untuk membetulkan nama lama seperti SANDUBAYA.

### C3. Aman untuk data lain

- Temuan, WO, penilaian, peta, dan segmen terhubung lewat **ID tiang**, bukan
  nama, jadi tidak terpengaruh.
- Label segmen yang menyebut nama tiang (mis. `TIANG PRM-015 …`) **ikut
  diperbarui** dalam transaksi yang sama.
- Pratinjau **memperingatkan** kalau ada tiang yang namanya sudah dipakai di
  dokumen WO yang terbit (nama lama tetap tercatat di audit).

---

## D. Katalog pesan (semua penolakan dan pertanyaan)

Prinsip: setiap pesan menyebut **apa yang terjadi**, **kenapa**, dan **apa yang
bisa dilakukan sekarang**, dengan tombol jalan keluarnya. Tidak ada pesan teknis
mentah.

### D1. HP — pulau

| Situasi | Pesan | Tombol |
|---|---|---|
| Mulai pulau padahal masih ada pulau terbuka | **"Masih ada pulau yang belum disambungkan"** — 7 tiang di sekitar PRM-040 menunggu disambungkan ke hulu. Sambungkan dulu sebelum memulai pulau baru, supaya urutan namanya tidak tertukar. | Tunjukkan pulau · Batal |
| "Selesai di segmen ini" dengan pulau terbuka | **"Belum bisa selesai: ada pulau yang belum disambungkan"** — 7 tiang belum punya nama karena belum tersambung ke hulu. Sambungkan pulaunya dulu. | Tunjukkan pulau · Tutup |
| Sambungkan ke tiang yang jauh (> 3× bentang wajar) | **"Tiang PRM-012 berjarak 420 m dari ujung pulau"** — biasanya ada tiang di antaranya yang belum dititik. Tetap sambungkan? | Batal · Ya, sambungkan |
| Sambungkan ke tiang di dalam pulau itu sendiri | **"Tiang itu bagian dari pulau ini"** — pilih tiang hulu yang sudah bernama (bertanda biru), atau gardu/pangkal. | Tutup |
| Sambungkan ke tiang yang belum bernama (masih di antrean) | **"PRM-… belum bernama"** — tunggu namanya turun (otomatis begitu ada sinyal), lalu sambungkan lagi. | Tutup |
| Keluar layar dengan pulau terbuka | **"Pulau belum disambungkan"** — 7 tiang tersimpan di HP dan belum terkirim. Aman ditinggal, tapi jangan hapus aplikasi atau ganti HP sebelum disambungkan. | Tetap di sini · Keluar |
| Pengingat saat layar dibuka | Pita kuning: **"1 pulau (7 tiang) menunggu disambungkan"** — ketuk untuk melihat. | — |

### D2. HP — percabangan (JTM)

| Situasi | Pesan | Tombol |
|---|---|---|
| Menitik anak tiang percabangan tanpa "Cabang baru" | **"Ini jalur utama atau cabang?"** — PRM-015 adalah tiang percabangan. Cabang = jalur yang lewat FCO percabangan. | Jalur utama · Cabang (lewat FCO) |
| Memilih cabang, jalur utama belum dititik | **"Jalur utama dari PRM-015 ke arah mana?"** — dilihat dari arah datang (dari PRM-014). Dipakai untuk menentukan nama cabang R/L. | Kiri · Lurus · Kanan |
| Memilih "Jalur utama" padahal sudah ada lanjutan utama | **"PRM-015 sudah punya lanjutan jalur utama (PRM-016)"** — satu tiang hanya punya satu lanjutan utama. Kalau tiang ini lewat FCO, pilih Cabang. Kalau justru PRM-016 yang cabang, minta admin menukarnya di web. | Jadikan cabang · Batal |
| Server menamai sebagai cabang (pengaman B4) | Pemberitahuan sesudah nama turun: **"Dinamai cabang PRM-015R001"** — PRM-015 sudah punya lanjutan jalur utama. Kalau terbalik, admin bisa menukarnya di web. | Mengerti |

### D3. Web — ganti nama

| Situasi | Pesan |
|---|---|
| Nama baru sudah dipakai tiang lain di luar hilir | **"Nama PRM-020 sudah dipakai tiang lain di penyulang PERUMNAS"** (disebut tiangnya + tautan ke peta). Pilih nama lain, atau ganti nama tiang itu dulu. |
| Format nama tidak sesuai | **"Nama harus diakhiri tiga angka"** — contoh: PRM-020, PRM-015R001. |
| Ada tiang di hilir yang namanya bentrok dengan tiang di luar hilir | Pratinjau menandai baris merah: **"PRM-021 sudah dipakai PRM-… di cabang lain"**; Terapkan dinonaktifkan sampai dibereskan. |
| Bukan UP3 / admin ULP itu | **"Anda tidak berhak mengubah nama tiang ULP AMPENAN"** — yang boleh: UP3 dan admin ULP itu sendiri. |
| Data berubah di antara pratinjau dan terapkan | **"Jaringan berubah sejak pratinjau dibuat"** (ada tiang baru dari lapangan) — pratinjau dimuat ulang otomatis; periksa lalu Terapkan lagi. |
| Berhasil | Toast: **"Nama diterapkan — 41 tiang berubah, tercatat di audit."** |

---

## E. Perubahan data & server (ringkas)

- `tiang.arah_utama_dari_sini` (TEXT 'kanan'/'lurus'/'kiri', di tiang
  percabangan): jawaban regu, dipakai B2.
- Fungsi penamaan baru `jtm_nama_anak(...)` + pemicu `tiang_buat_kode_jtm`
  ditulis ulang memakai aturan B. **Mulai berlaku untuk tiang yang lahir sesudah
  SQL dijalankan**; nama lama tidak disentuh.
- `kirim_tiang_jtm` meneruskan `cabang` (sudah ada) dan `arah_utama`, dan
  hasilnya membawa `catatan` (pengaman B4).
- `susun_nama_jtm` (pratinjau) dan `terapkan_nama_jtm` (tulis), menggantikan
  `nomori_ulang_penyulang_jtm` (dibungkus pemeriksa hak, dibiarkan sebagai
  pembungkus lama).
- Fungsi-fungsi itu dipasang dengan pola yang sama dengan
  `jtm-hak-akses-portal.sql`: fungsi hidup tidak disalin manual.

---

## F. Tahapan rilis & uji

1. **SQL** (`scripts/jtm-penamaan-baru.sql`): aturan B, pratinjau/terapkan,
   kolom.
   - Uji PGlite: kasus PRM-015, huruf Y, RR, cabang di dalam cabang, sisipan,
     underbuild, dan pengaman B4.
   - Uji **pada salinan data SANDUBAYA & PERUMNAS yang sebenarnya**: pratinjau
     *Generate ulang*, panjang nama terpanjang sebelum → sesudah.
2. **Web**: pratinjau + terapkan (tiga pintu C2). Bisa dipakai segera untuk
   membetulkan nama lama.
3. **HP (OTA)**: pulau JTM + JTR, pertanyaan percabangan, catatan B4, pesan D1–D2.
   - Uji Node dengan penyimpanan & server tiruan: rantai terbalik, pulau dua arah,
     urutan kirim topologis, satu pulau per segmen, Selesai tertahan, tanpa sinyal.
4. `teknisaplikasi.md`: butir baru "Nama tiang JTM: utama lanjut, R/L hanya di
   percabangan; menitik boleh dari ujung/tengah lewat pulau".

---

## G. Yang perlu diputuskan

| No | Pertanyaan | Rekomendasi |
|---|---|---|
| G1 | *Generate ulang*: tiang sisipan lama (`PRM-012a`) ikut dirapikan menjadi berurutan (nomor sesudahnya bergeser)? | **Ya**: tujuan generate ulang adalah urutan yang bersih |
| G2 | Ganti nama "hilir ikut" juga dibuat untuk **JTR** (sekarang hanya satu tiang)? | **Ya, menyusul** sesudah JTM berjalan; mesinnya serupa |
| G3 | Satu pulau terbuka per segmen/gardu (A2) | **Setuju**: paling sedikit kemungkinan salah sambung |
| G4 | Urutan pengerjaan: SQL → web (pembetulan nama lama) → HP (pulau) | **Setuju**: admin bisa langsung merapikan SANDUBAYA sementara HP dikerjakan |
