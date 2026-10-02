# Audit Inspeksi JTM + Rencana "Titik tiang terkirim otomatis bila ada sinyal"

*2 Oktober 2026. Status: **C1–C5 DISETUJUI SEMUA (rekomendasi), DIKERJAKAN 2 Okt.***

**Yang sudah dikerjakan:**
- SQL `scripts/jtm-kirim-otomatis.sql`: A2 (HINT + kalimat tiang JTR +
  `tiang_jtr_terdekat_jtm`), A4, A5, A8 (tutup/rintis ke nama baru), A9, A10,
  `induk_id` di hasil kirim. Diuji PGlite: 24 pemeriksaan lulus, idempoten.
- HP: A1 (JTM **dan** JTR), kirim otomatis titik (Tahap 1), A2 sisi HP, A3.
  Logika draf diuji di Node dengan penyimpanan dan server tiruan yang
  lambat/acak: 22 pemeriksaan lulus.
- Tanda "JANGAN DIJALANKAN ULANG" di 7 skrip lama; `teknisaplikasi.md` butir 20.

**Belum:** A6 (hak akses, batch terpisah), A7 (Pecah segmen), A11–A12, Tahap 2
(penilaian ikut otomatis), Tahap 3 (JTR). Rekap JTR juga masih menghitung di
bulan inspeksi dimulai (pola A5) — belum diputuskan.

Audit mencakup seluruh alur Inspeksi JTM: HP (`JtmPenyapuanScreen`, `FormTiangJtm`,
`jtmKerja`, `jtmLuring`, `JtmScreen`), fungsi server (`kirim_tiang_jtm`,
`tambah_tiang_jtm`, `nilai_tiang_jtm`, `selesaikan_inspeksi_jtm`,
`mulai_inspeksi_jtm`, `rintis_segmen_jtm`, `tutup_segmen_jtm`, `tumpangi_tiang_jtm`,
`koreksi_titik_tiang_jtm`, `batalkan_tiang`, `putuskan_inspeksi_jtm`,
`tiang_terdekat_jtm`), tampilan `tiang_kondisi_terakhir` / `jtm_temuan`, dan rekap
realisasi. Semua klaim di bawah sudah dicek ke kode dan, bila perlu, ke data hidup
(hanya baca).

---

## A. Hasil audit — urut tingkat bahaya

### KRITIS

**A1. Tiang dan penilaian bisa hilang tanpa jejak saat pengiriman sedang berjalan.**
`kirimDrafJtm` membaca draf sekali di awal, lalu menulisnya kembali dua kali dari
salinan lama itu: saat menulis balik URL foto, dan saat mengosongkan draf
(`simpanDrafSegmenJtm({ ...d, tiang: [] })`). Selama pengiriman berjalan, tombol
"Titik tiang di sini" dan "Nilai" **tetap aktif** (keduanya hanya dikunci `sibuk`,
bukan `mengirim`). Jadi tiang yang dititik atau dinilai selama foto masih
diunggah (bisa semenit lebih di sinyal lemah) ikut terhapus, tanpa pesan apa pun.
Seluruh penulisan draf juga tidak berkunci: dua penulisan yang berdekatan bisa
saling menimpa.
- Pola yang sama ada di JTR: `jtrKerja.ts:343`.
- **Perbaikan:** satu kunci untuk semua penulisan draf; kirim hanya membuang tiang
  yang benar-benar terkirim dan tidak berubah sejak dikirim, dibaca dari draf
  terbaru. **Wajib sebelum kirim otomatis**, karena kirim otomatis membuat
  keadaan ini terjadi terus-menerus.

### TINGGI

**A2. Penjaga tiang berdekatan di HP dan di server melihat tiang yang berbeda.**
Penjaga di HP (`tiang_terdekat_jtm`, dan indeks luringnya) **melewati tiang tanpa
penyulang**, yaitu tiang JTR. Penjaga server (`tambah_tiang_jtm`) memeriksa
**semua** tiang aktif di ULP itu. Akibatnya, kalau regu menitik tiang JTM dalam
10 m dari tiang JTR:
- HP tidak bertanya apa-apa.
- Server menolak dengan "Tiang AM0xx (penyulang <NULL>) sudah berdiri di titik
  ini", dan seluruh kiriman segmen ikut tertolak.
- Peta "Tiang ini menumpang" juga menyaring tiang gardu, jadi tidak ada jalan
  keluar selain menghapus titiknya.

Saat ini ada 345 tiang JTR ber-ULP. Belum ada pasangan JTM–JTR dalam 15 m, tapi
2 tiang yang dinyatakan "dua batang berbeda" ternyata dibandingkan dengan tiang
JTR. Server memang sudah menghitungnya. Ini akan terjadi begitu inspeksi JTM
masuk ke wilayah yang JTR-nya sudah disapu.
- **Perbaikan:** satu aturan untuk kedua penjaga. Pilihannya ada di C3.

**A3. "Ubah" pada tiang yang sudah terkirim membuka formulir KOSONG** (melanggar
butir 2). Isian lama hanya dibaca dari draf HP, sedangkan draf dikosongkan
sesudah "Kirim sementara". `kondisi` juga tidak menolong, karena hanya berisi
inspeksi yang sudah Diverifikasi. Regu harus mengisi ulang semuanya, termasuk
memotret ulang foto temuan.
- **Perbaikan:** bila tidak ada draf, muat isian tiang itu dari server
  (`inspeksi_jtm_periksa` lengkap dengan sebab tutup dan foto, ditambah catatan
  titik), selama inspeksinya masih Dalam Proses.

**A4. Kirim ulang penilaian meninggalkan jawaban lama.** `nilai_tiang_jtm` hanya
menimpa item yang ikut dikirim, tidak menghapus item yang sudah tidak ada.
Contohnya: "jumperan = ada" beserta tiga kondisi jumperannya terkirim, lalu
diubah jadi "tidak ada". Tiga baris jumperan lama tetap tersimpan, dan setelah
disetujui ikut masuk keadaan terakhir tiang dan daftar temuan. Catatan tiang
juga tidak bisa dikosongkan (`COALESCE`).
- **Perbaikan (SQL):** kiriman ulang = isian lengkap tiang itu. Baris yang tidak
  ada lagi di kiriman dihapus. Aman, karena satu titik = satu inspeksi = satu
  segmen. Penumpang dan pemilik tidak pernah berbagi titik.

### SEDANG

**A5. Realisasi KMS JTM dihitung di bulan inspeksi DIMULAI** (`created_at`),
bukan bulan dikirim. Segmen yang dimulai 30 Sep dan dikirim 3 Okt masuk realisasi
September, dan baru muncul setelah rapat September lewat.
- **Perbaikan:** hitung di bulan `tgl_selesai` (saat "Selesai di segmen ini").
- Ini tidak mengubah angka yang sudah ada, karena seluruh 21 inspeksi JTM saat
  ini dibuat dan dikirim di Oktober.

**A6. Fungsi server penting belum memeriksa hak.** Fungsi-fungsi ini berjalan
sebagai pemilik database dan terbuka untuk semua akun yang sudah masuk, tanpa
memeriksa role maupun ULP:
- `putuskan_inspeksi_jtm`: regu bisa menyetujui inspeksinya sendiri lewat
  panggilan langsung.
- `batalkan_tiang`, `koreksi_titik_tiang_jtm`, `tumpangi_tiang_jtm`,
  `tutup_segmen_jtm` dan `rintis_segmen_jtm`: bisa menyentuh ULP lain.

Hanya `kirim_tiang_jtm` yang memeriksa ULP.
- **Perbaikan:** satu pemeriksa hak bersama (ULP sendiri; menyetujui hanya
  admin/UP3), dikerjakan bersama butir RLS di `ui-audit-backlog`.

**A7. Segmen raksasa yang masih terbuka:** GI SANDUBAYA - UJUNG (160 tiang) dan
GI GI SABELIA - UJUNG (340 tiang). Satu segmen = satu inspeksi, dan inspeksi baru
bisa dikirim kalau semua tiangnya sudah dinilai. Akibatnya:
- pekerjaannya berhari-hari di HP;
- realisasi baru muncul di hari terakhir.

Fitur "Pecah segmen" yang sudah diusulkan sebelumnya tetap direkomendasikan
(terpisah dari rencana ini). Nama "GI GI SABELIA" adalah salah isi: jenis GI
ditambah nama yang berawalan GI. Bisa dirapikan dari web (Ubah titik ujung).

**A8. Skrip SQL lama bisa membalikkan perilaku yang sekarang.**
- `nilai_tiang_jtm` punya dua versi. `jtm-inspeksi-fungsi.sql` (tanpa simpan
  foto temuan) ternyata berkas yang lebih baru daripada `jtm-temuan.sql`.
- Badan `mulai_inspeksi_jtm`, `putuskan_inspeksi_jtm` dan `gabung_inspeksi_jtm`
  hanya ada di berkas lama dengan nama lama (diganti lewat `ALTER … RENAME`).

Kalau `jtm-inspeksi-fungsi.sql` dijalankan ulang:
- foto temuan berhenti tersimpan;
- penjaga "semua tiang wajib dinilai" hilang dari tutup segmen;
- lahir `tambah_tiang_jtm` versi lama sebagai fungsi kembar.

`tutup_segmen_jtm` dan `rintis_segmen_jtm` juga masih memanggil pembungkus yang
ditandai **SEMENTARA** (`selesaikan_penyapuan_jtm`, `mulai_penyapuan_jtm`). Kalau
pembungkus itu dibuang, dua fungsi ini ikut patah.
- **Perbaikan:**
  - arahkan ke nama baru;
  - tandai skrip yang sudah digantikan dengan "JANGAN DIJALANKAN ULANG";
  - simpan satu potret fungsi JTM yang hidup (`scripts/jtm-fungsi-kini.sql`,
    disalin dari `pg_get_functiondef`).

### RENDAH

- **A9.** `mulai_inspeksi_jtm` membuka kembali inspeksi **Selesai** (yang sedang
  menunggu persetujuan) ke Dalam Proses, lewat "Rintis" yang melanjutkan
  rintisan. Hal ini bertentangan dengan `kirim_tiang_jtm` yang menolaknya.
  Saat ini tidak ada kasus hidup. Perbaikan: jangan sentuh yang Selesai, dan
  tolak dengan kalimat "menunggu persetujuan".
- **A10.** Kiriman ulang yang `id_hp`-nya milik tiang yang sudah **dibatalkan**
  tetap diterima, sehingga penilaian tercatat di tiang batal. Perbaikan: tolak
  dengan pesan.
- **A11.** `tutup_segmen_jtm` memilih inspeksi tanpa melihat tier, dan hitungan
  "N tiang" ikut menghitung tiang yang batal.
- **A12.** "Rintis" yang melanjutkan rintisan mengambil rintisan terbuka
  **terbaru** di penyulang itu, termasuk milik regu lain di cabang lain. Jarang
  terjadi; dicatat saja.
- **A13.** Tumpangi, perbaiki titik, tandai percabangan, dan hapus tiang hanya
  bisa dilakukan saat ada sinyal (tidak masuk antrean). Ini sudah sesuai: semua
  itu koreksi master, bukan isian. Dicatat supaya tidak dianggap celah.

---

## B. Rencana: titik tiang terkirim otomatis bila ada sinyal

### B1. Yang berubah bagi regu

1. "Titik tiang di sini" tetap **tersimpan di HP dulu**, sama seperti sekarang,
   jadi tanpa sinyal pun aman.
2. Begitu tersimpan dan ada sinyal, titiknya langsung dikirim di latar. Dalam
   beberapa detik, "menunggu nama" di peta dan daftar berganti jadi
   **namanya** (mis. `AM-B12`).
3. **Penilaian tetap menunggu**, sama seperti sekarang: dikirim lewat "Kirim
   sementara" atau "Selesai di segmen ini" (rekomendasi C1).
4. Tanpa sinyal, titik menunggu diam-diam dengan label "menunggu sinyal". Titik
   dicoba lagi otomatis saat sinyal kembali, saat titik berikutnya disimpan,
   atau saat layar dibuka lagi.
5. Kalau server **menolak**, tiangnya ditandai merah dan ditunjukkan, dan pesan
   langsung muncul saat regu masih berdiri di situ. Untuk penolakan "sudah ada
   tiang di titik ini", pilihannya sama dengan penjaga di HP: **Tumpangi X** /
   **Dua batang berbeda** / **Hapus titik ini**. Pengiriman otomatis berhenti
   sampai regu memilih, supaya penolakan yang sama tidak terulang terus.
6. Tiang yang sudah bernama lalu ternyata salah titik: **Hapus = dibatalkan**
   (jalan yang sudah ada). Jejaknya tercatat dan nomornya dilepas untuk tiang
   berikutnya.
7. "Kirim sementara" dan "Selesai di segmen ini" tetap ada. Menutup segmen
   rintisan tidak lagi perlu "Kirim sementara dulu", karena tiang penutupnya
   sudah bernama.

### B2. Kenapa ini mengurangi kesalahan, dan apa yang tidak

**Kesalahan yang berkurang:**
- **Tiang bertumpuk / ditolak (kasus BENTEK).** Penjaga server memeriksa setiap
  titik saat itu juga, termasuk terhadap titik yang baru saja dikirim. Regu
  tahu di tiang itu, bukan 50 tiang kemudian ketika seluruh kiriman tertolak.
- **Induk dan penomoran keliru.** Nama turun dari induknya. Nama yang langsung
  terlihat membuat salah sambung ketahuan di tiang berikutnya, bukan saat admin
  memeriksa.
- **Dua regu di penyulang yang sama.** Tiang regu A langsung terlihat oleh
  penjaga regu B, sehingga tidak lahir tiang kembar.
- **Pekerjaan yang hilang bila HP rusak, hilang, atau direset** berkurang:
  titiknya sudah di server.
- Percabangan, hapus, perbaiki titik, dan tutup segmen tidak lagi
  memunculkan pesan "kirim dulu, tiang ini belum punya identitas".

**Yang tidak berubah:**
- Tempat tanpa sinyal tetap memakai antrean HP, sama seperti sekarang.
- Regu yang memilih induk yang salah tetap salah. Hanya saja lebih cepat
  terlihat.

### B3. Hubungannya dengan teknisaplikasi.md butir 1 dan 17

**Butir 17** berbunyi "Tidak ada baris server sebelum petugas menekan Kirim".
Rencana ini adalah pengecualian, dan berkas itu sendiri menyebut pengecualian
harus diputuskan user. Alasan pengecualian ini tetap menjaga maksud butir 1 dan 17:

- **Maksud butir 1:** kesalahan jangan sampai jadi *angka di laporan
  manajemen* sebelum dibaca ulang. Titik tiang tidak masuk angka mana pun:
  - realisasi JTM hanya menghitung inspeksi Selesai/Diverifikasi;
  - temuan (`jtm_temuan`) hanya dari inspeksi Diverifikasi.

  Yang langsung berubah hanya master tiang (nama dan titik di peta). Ini sudah
  terjadi hari ini lewat "Kirim sementara", dan koreksinya lewat Hapus
  (dibatalkan, bertanda).
- **Maksud butir 17:** jangan ada catatan setengah jadi. Kirim per titik tetap
  **satu transaksi** per tiang.
- **Penilaian (pekerjaannya) tetap mengikuti butir 1** sepenuhnya.

Usulan butir baru **20 — "Titik tiang (aset yang ditemukan di lapangan) boleh
terkirim otomatis begitu ada sinyal; penilaian tetap menunggu Kirim"**, ditulis
setelah disetujui.

### B4. Rancangan teknis (HP)

**Draf (`jtmKerja.ts`):**
- `denganKunciDraf(fn)` menjadi satu antrean janji (promise chain) untuk SEMUA
  penulisan `@jtm_draf_v1`. Ini juga menutup A1.
- Tiap tiang draf diberi `versi` yang naik setiap kali disimpan.
  Kirim (manual maupun otomatis) membuang tiang hanya kalau `versi`-nya sama
  dengan saat dikirim. Yang diubah di tengah pengiriman tetap tinggal dan ikut
  putaran berikutnya.
- Tulis balik URL foto dilakukan ke draf **terbaru**, bukan ke salinan lama.

**Fungsi baru `kirimTitikJtm(meta, nama)`:**
- Mengambil titik baru yang menunggu, urut sesuai waktu dititik (induk selalu
  lebih dulu).
- **Satu RPC per titik**, supaya penolakan bisa ditunjuk ke tiangnya. Berhenti
  di kegagalan pertama (butir 1).
- Sesudah berhasil:
  - tiang draf yang sudah dinilai diubah jadi "penilaian untuk tiang server"
    (`tiangId` = id baru);
  - yang belum dinilai dibuang dari draf;
  - anak-anak yang menunjuk `indukLokal` lama dialihkan ke `indukId` baru;
  - `alias` lama→baru dicatat di draf.
- Penolakan dicatat di tiangnya (`galat`). Sinyal mati tidak dianggap galat,
  titik itu cukup menunggu.

**Satu pengiriman per segmen:** penanda "sedang mengirim" disimpan per kunci
segmen di modul, dan dipakai bersama oleh kirim manual dan kirim otomatis.
Kalau ada pemicu baru saat pengiriman berjalan, satu putaran lagi dijadwalkan
sesudahnya.

**Layar (`JtmPenyapuanScreen`, hook kecil `useKirimTitik`):**
- Pemicu pengiriman:
  - sesudah titik tersimpan;
  - saat NetInfo berubah jadi tersambung (NetInfo sudah ada di build 1.4.0);
  - saat layar dibuka.
- Hasil yang berhasil **ditambal di tempat** (aturan CLAUDE.md no. 9), tanpa
  memuat ulang segmen. Segmen 340 tiang tidak boleh dimuat ulang setiap titik.
  Yang ditambal: tiang baru ditambah ke daftar, lalu `terpilih`, `indukPilihan`
  dan `terakhirId` dipetakan lewat `alias`. Tanpa pemetaan itu, pertanyaan
  "bukan tiang terakhir yang Anda titik" muncul keliru.
- Formulir yang sedang terbuka untuk tiang yang namanya baru turun: Simpan
  memetakan id lewat `alias`, jadi tidak muncul "tiang ini tidak ada lagi di HP".
- Label tiang: menunggu sinyal · mengirim… · ditolak (merah, ketuk untuk
  pilihan).
- Bilah antre berbunyi "N penilaian tersimpan di HP · M titik menunggu sinyal",
  dengan tombol "Kirim sementara" tetap ada.
- A3 ikut dikerjakan: "Ubah" memuat isian dari server bila draf kosong.

### B5. Perubahan server (satu skrip, diuji di PGlite dulu)

- `kirim_tiang_jtm`: hasil per tiang ditambah `induk_id`, supaya HP bisa
  menambal garis induknya tanpa memuat ulang.
- `tambah_tiang_jtm`: penolakan tiang berdekatan membawa `HINT` berisi id dan
  nama tiang yang menghalangi. HP membacanya untuk menawarkan "Tumpangi X",
  bukan menebak dari kalimat.
- Ikut dalam skrip yang sama:
  - A2 (sesuai C3);
  - A4 (hapus jawaban basi);
  - A5 (realisasi di bulan dikirim);
  - A8 (tutup dan rintis memanggil nama baru);
  - A9;
  - A10.
- A6 (hak akses) **dipisah**: menyentuh banyak fungsi dan perlu matriks
  role yang disepakati.

### B6. Kasus tepi yang sudah dipikirkan

- **Induk masih di antrean, anak dititik:** urutan kirim menjamin induk lebih
  dulu. Server juga sudah bisa mencari induk lewat `id_hp`.
- **Kirim terputus sesudah server menerima tapi sebelum HP tahu:** kiriman ulang
  tidak melahirkan tiang kedua (`id_hp`), dan HP menerima nama yang sama.
- **Dua HP, satu segmen:** kunci advisory per segmen sudah ada di server.
  Penjaga jarak sekarang melihat tiang regu lain lebih cepat.
- **Regu membuka "Selesai di segmen ini" saat masih ada titik menunggu sinyal:**
  Selesai tetap mengirim semuanya dalam satu transaksi, seperti sekarang.
- **Penilaian menginap berhari-hari di HP (segmen raksasa):** bilah antre
  menunjukkan umur penilaian tertua ("sejak kemarin"). Ini menjadi dorongan
  untuk "Kirim sementara" di akhir hari, tanpa memaksa.
- **Akun lain di HP yang sama:** cap pemilik draf (butir 19) tetap berlaku untuk
  kirim otomatis. Yang dikirim hanya draf milik akun yang masuk.

### B7. Uji sebelum OTA

- **SQL:** PGlite untuk A4, A9, A10, hasil `induk_id`, HINT, dan rekap A5.
- **HP:** `tsc`, lalu skenario tangan:
  1. Mode pesawat, titik 5 tiang, lalu sinyal dinyalakan: nama turun berurutan
     dan garis induk benar.
  2. Titik dan nilai di tengah pengiriman: tidak ada yang hilang (A1).
  3. Titik dalam 10 m dari tiang lain: muncul pilihan Tumpangi / Dua batang /
     Hapus.
  4. Formulir terbuka saat nama turun: Simpan tetap berhasil.
  5. Hapus tiang yang sudah bernama: tercatat dibatalkan.
  6. Tutup segmen rintisan tanpa "Kirim sementara".
  7. "Ubah" tiang terkirim: isian lama muncul (A3).
  8. Ubah "jumperan" jadi tidak ada lalu kirim ulang: baris lama hilang (A4).

### B8. Urutan rilis

1. SQL `scripts/jtm-kirim-otomatis.sql` dijalankan user di SQL Editor.
2. OTA HP (runtime 1.4.0): A1 (JTM **dan** JTR), A3, sisi HP dari A2, dan
   Tahap 1 kirim otomatis.
3. `teknisaplikasi.md` butir 20, ditambah catatan di `rencana-mobile-jtm-jtr.md`.
4. Push web.
5. Setelah uji lapangan, putuskan apakah penilaian juga ikut terkirim otomatis
   (Tahap 2), lalu terapkan mesin yang sama ke JTR (Tahap 3).

---

## C. Keputusan yang dibutuhkan

| No | Pertanyaan | Pilihan | Rekomendasi |
|----|-----------|---------|-------------|
| C1 | Yang terkirim otomatis | **a.** titik + nama saja, penilaian tetap menunggu Kirim · **b.** titik + penilaian (foto ikut terunggah di latar) | **a**: sesuai maksud awal, perubahan butir 1 paling kecil, hemat kuota. b bisa jadi Tahap 2 setelah uji. |
| C2 | Cakupan | **a.** JTM dulu, JTR menyusul dengan mesin yang sama · **b.** JTM + JTR sekaligus | **a**. Perbaikan A1 di JTR tetap ikut sekarang. |
| C3 | Tiang JTR dalam 10 m saat menitik JTM | **a.** HP ikut bertanya ("Ada tiang JTR gardu X, 2 m — batang lain?"), jawaban tercatat untuk admin · **b.** server mengabaikan tiang JTR seperti HP | **a**: penjaga "satu batang tidak lahir dua kali" tetap utuh, dan kasus JTR di sebelah JTM (0,2 m) tetap lolos lewat "batang lain". |
| C4 | Realisasi KMS JTM | **a.** bulan dikirim (`tgl_selesai`) · **b.** tetap bulan dimulai | **a**. Tidak mengubah angka yang ada (semua Oktober). |
| C5 | Pengecualian butir 1/17 untuk titik tiang (butir 20 baru) | setuju / tidak | setuju; tanpa ini rencana B tidak dikerjakan. |
