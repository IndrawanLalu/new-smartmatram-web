# Pemeliharaan Gardu (HARGARDU) — rencana rinci

> Bagian **3.1** dari `rencanakerjasmartnex.md`, dipisah karena modulnya paling besar
> di Fase 3. Acuan bentuk isian: `formatexcel/HARGARDU.pdf` (SIMANTEK, gardu MM219,
> 7 September 2026) ditambah empat isian baru dari pemilik pekerjaan.
>
> Disepakati 8 September 2026.

---

## 1. Kenapa modul ini berbeda dari yang lain

Semua modul lain **memakai** master gardu. HARGARDU adalah satu-satunya yang
**membuatnya lengkap.**

Master gardu hari ini berasal dari impor AMG: 2.536 baris, dan tidak satu pun
pernah dikonfirmasi orang yang berdiri di bawah gardunya. Sebagian isinya bahkan
belum punya tempat — volume minyak, tapping, pendingin, jenis gardu, phase,
tegangan primer/sekunder tidak ada kolomnya sama sekali di SMART.

Regu HARGARDU membuka gardu, membaca nama platnya, dan mengukur langsung. Itu
sumber paling dekat dengan kenyataan yang unit ini punya. Karena itu **lapisan
verifikasi bukan pelengkap modul ini — dia inti modulnya.**

---

## 2. Empat prinsip yang mengikat seluruh rancangan

### 2.1 Catatan pemeliharaan adalah sejarah, tidak pernah ditulis ulang

Kalau pemeliharaan tahun ini mencatat 250 kVA dan tahun depan ternyata 200,
laporan tahun ini **tetap berbunyi 250 selamanya**. Yang berpindah ke 200 adalah
masternya.

Ini bukan kerapian arsip. Laporan yang ikut berubah belakangan membuat mustahil
menjawab "sejak kapan trafonya berbeda" — padahal justru pertanyaan itu yang
menentukan apakah trafonya diganti, salah catat, atau hilang.

```
pemeliharaan 2026 : 250 kVA   ← tetap, apa adanya
pemeliharaan 2027 : 200 kVA   ← tetap, apa adanya
master gardu      : 200 kVA   ← berpindah, dengan jejak dari pemeliharaan 2027
```

### 2.2 Kosong langsung terisi, berbeda menunggu persetujuan

| Keadaan master | Perlakuan | Alasan |
|---|---|---|
| Kosong → diisi | **Langsung terisi**, tetap teraudit | Tidak ada yang dirugikan. Menahannya di meja admin justru memperlambat kelengkapan master, dan itu yang ingin dipercepat. |
| Ada → **berbeda** | **Menunggu persetujuan** | kVA berubah berarti trafonya pernah diganti. Angka itu dipakai menghitung persen beban seluruh sistem — tidak boleh bergeser sebelum ada yang membenarkan. |

### 2.3 Tidak diketahui ≠ tidak ada

Ampenan punya 894 gardu. Sebelum semuanya pernah dipelihara, sebagian besar
status tekepnya **tidak diketahui**, bukan "tidak terpasang". Dua hal itu
digabung berarti laporan terlihat bagus persis karena datanya belum ada.

Setiap angka kondisi di dashboard selalu tiga kelompok:

```
Terpasang · Belum terpasang · Belum diperiksa
```

Kelompok ketiga sekaligus jadi ukuran cakupan HARGARDU — satu angka, dua guna.

### 2.4 Daftar isian adalah data, bukan kode — tapi satu daftar untuk semua

Pemilik pekerjaan sudah menambah empat isian sebelum modulnya dibangun, dan
menyebut "mungkin ada tambahan lain juga nanti". Kalau daftarnya ditulis di kode,
tiap tambahan berarti ubah kode → OTA → tunggu semua HP terupdate.

Yang menentukan bukan boleh-tidaknya diubah, melainkan **siapa yang pegang pena
dan berlaku untuk siapa**:

- Daftarnya **satu**, berlaku semua ULP.
- Hanya **UP3** yang bisa mengubah. ULP mengisi, tidak bisa mengarang.

Dengan begitu daftarnya tetap baku sekaligus tidak bergantung kode. Kalau tiap
ULP boleh mengatur sendiri, "rembes" di Ampenan bisa jadi "bocor" di Gerung, dan
angka se-UP3 tidak bisa lagi dijumlahkan — tepat masalah yang ingin dihindari.

Tiga penjaga supaya penyuntingan tidak merusak catatan lama:

| Aturan | Kenapa |
|---|---|
| Pilihan punya **kode tetap** dan **label yang boleh berubah** | `rembes` kodenya, "Rembes" cuma tulisannya. Mengganti tulisan tidak boleh memecah angka dashboard jadi dua. |
| Pilihan yang **sudah pernah dipakai** hanya bisa dinonaktifkan, tidak dihapus | Menghapusnya membuat laporan lama menunjuk sesuatu yang tidak ada lagi. Itu bukan pembersihan, itu perusakan arsip. |
| Pilihan yang **belum pernah dipakai** boleh dihapus penuh | Salah ketik saat menambah tidak perlu jadi sampah abadi. |

Satu hal yang tidak bisa dijaga sistem: kalau kosakatanya sering diganti-ganti,
angka antar tahun jadi sulit dibandingkan meski semuanya tercatat benar. Itu
disiplin orang. Yang bisa dilakukan kode cuma mencatat kapan dan oleh siapa
daftarnya berubah, supaya kalau angkanya patah, sebabnya bisa ditelusuri.

---

## 3. Bentuk data

### 3.1 `pemeliharaan_gardu` — satu baris per pekerjaan

```
id · gardu_kode · ulp · penyulang
status        Dijadwalkan → Dalam Proses → Selesai → Diverifikasi | Ditolak
tgl_rencana · tgl_padam · tgl_selesai
regu_1 · regu_2            (nama-nama anggota)
lat · lng · akurasi
sumber        jadwal | lapangan
catatan_perbaikan
verified_at · verified_by · verified_note
```

Status memakai kata yang **sama persis** dengan inspeksi JTR. Satu kosakata untuk
satu maksud — petugas tidak perlu belajar dua sistem status di satu aplikasi.

`penyulang` disalin saat pekerjaan dibuat, tidak diambil dari master saat dibaca:
penyulang gardu bisa berpindah, dan laporan lama harus tetap menyebut penyulang
yang benar **saat itu**.

### 3.2 Dua tabel acuan — daftar isian dan pilihannya

```
hargardu_item_ref
  kode (tetap) · nama (boleh diubah) · kelompok
  per_fasa          apakah diisi per R/S/T
  tipe              pilihan | angka | teks
  wajib · urutan · aktif
  tampil_dashboard  ikut jadi angka di halaman utama atau tidak

hargardu_opsi_ref
  item_kode · kode (tetap) · label (boleh diubah) · urutan · aktif
  normal            ← apakah nilai ini dianggap keadaan normal
```

Menambah "Tekep Bushing" = menambah satu baris. Menonaktifkan item yang tidak
dipakai lagi = mengubah satu kolom. Tidak ada rilis aplikasi.

#### Kolom `normal` — inilah yang membuat semuanya jalan

Begitu daftar pilihan boleh diubah orang, kode tidak lagi boleh tahu sendiri mana
yang bagus dan mana yang rusak. Kalau "rusak" ditentukan di kode, menambah pilihan
baru dari halaman pengaturan berarti pilihan itu tidak pernah terhitung sebagai
temuan — dan tidak ada yang tahu, karena angkanya cuma terlihat lebih kecil.

Jadi penilaiannya ikut jadi data:

```
kondisi_trafo   baik      "Baik"                    normal ✓
                rembes    "Rembes"                  normal ✗
                bocor     "Bocor"                   normal ✗
tekep_fco       ada       "Ada"                     normal ✓
                tidak     "Tidak Ada"               normal ✗
jumperan_trafo  a3cs      "A3Cs (berisolasi)"       normal ✓
                a3c       "A3C (telanjang)"         normal ✗
```

Satu kolom ini yang melahirkan tiga hal sekaligus, tanpa satu pun ditulis di kode:

- **Daftar pekerjaan tertunda** — item yang nilainya bukan `normal` pada
  pemeliharaan terverifikasi terakhir.
- **Tiga kelompok di dashboard** — normal / tidak normal / belum diperiksa.
- **Penanda perhatian di formulir mobile** — kartu yang isinya tidak normal
  ditandai, sama seperti formulir tiang JTR.

`hargardu_ref_audit` mencatat tiap perubahan daftar: siapa, kapan, dari apa ke apa.

**Isi awal** — 21 item, diturunkan dari formulir SIMANTEK dan empat tambahan:

| Kelompok | Item |
|---|---|
| Pengaman | Cut Out (R/S/T: kondisi, jenis, ukuran fuse link) · Arrester (R/S/T: kondisi, jenis) |
| **Tekep** | **Tekep FCO · Tekep Arrester · Tekep Bushing** — Ada / Tidak Ada |
| Bushing | Bushing Primer (R/S/T) · Bushing Sekunder (R/S/T) |
| Trafo | Kondisi Trafo · Minyak Trafo · **Jumperan Trafo (A3C / A3Cs)** |
| PHB TR | LV Board · Dudukan Fuse · Busbar TR · Helbom Saklar · HS Rating |
| Sambungan | Kabel In/Out Let · Schoen In/Out Let · **Sambungan Outlet (Joint Press / Konektor)** |
| Fisik | Papan Injak · Yzer Werk · Lantai Kerja |

Kosakata pilihannya isian awal saja — tebakan dari formulir SIMANTEK ditambah
contoh pemilik pekerjaan (`rembes`, `keropos`). Yang tahu kata sebenarnya yang
dipakai regu adalah orang lapangan, dan merekalah yang menyempurnakannya lewat
halaman pengaturan. Sampai itu, tiap kata yang kurang berarti satu pertanyaan
yang tidak bisa dijawab dashboard.

### 3.3 `pemeliharaan_gardu_periksa` — jawabannya

```
pemeliharaan_id · item_kode · fasa (R|S|T|kosong) · nilai · nilai_angka · catatan
```

Satu baris per item per fasa. Cut out tiga fasa = tiga baris, bukan sembilan kolom.

Inilah yang membuat keluhan lama — *"temuan tidak ada rekapnya"* — selesai dengan
sendirinya: rekap komponen rusak se-ULP jadi satu `GROUP BY`, bukan membaca teks
satu per satu.

### 3.4 `pemeliharaan_gardu_ukur` — pengukuran siang, dua baris

```
pemeliharaan_id · tahap (sebelum | sesudah)
putaran_phasa
arus_r · arus_s · arus_t · arus_n
tegangan_rn · sn · tn · rs · st · tr
pertanahan_arrester · pertanahan_trafo · pertanahan_netral
perjurusan   JSONB, bentuk sama dengan pengukuran_gardu.perjurusan
```

**TIDAK masuk realisasi pengukuran gardu.** Ini pengukuran siang; realisasi
memakai beban puncak. Menggabungkannya merusak dua hal sekaligus: gardu tercatat
"sudah diukur" padahal pengukuran malamnya belum, dan angka siang yang rendah
menutupi trafo yang sebenarnya overload.

Bentuk `perjurusan` sengaja disamakan dengan yang sudah ada — bukan untuk
digabung, tapi supaya perbandingan siang lawan malam tidak perlu penerjemahan.

Dua baris sebelum–sesudah membuat satu angka lahir sendiri tanpa diketik siapa
pun: **selisih ketidakseimbangan**, bukti penyeimbangan bebannya berhasil atau
tidak.

### 3.5 `pemeliharaan_gardu_foto`

20 slot, **10 wajib**: sebelum perbaikan · sesudah perbaikan · nama plat ·
keseluruhan gardu · dan enam foto angka alat ukur (beban R/S/T/N, tegangan R-N,
tegangan R-S).

Nama plat wajib karena dialah yang membuat koreksi kVA bisa dipercaya. Tanpa
foto itu, klaim "kVA-nya beda" tidak bisa diperiksa admin dari belakang meja.

### 3.6 PR — pekerjaan yang tertunda

Pekerjaan yang tidak selesai hari itu: trafo rembes, ganti LV board, dan
sejenisnya.

**Tidak disimpan sebagai tabel tersendiri dengan kategorinya sendiri.** Yang
perlu diperbaiki sudah tercatat di itemnya — `kondisi_trafo = Rembes`,
`lv_board = Keropos` — dan menyimpannya sekali lagi sebagai baris PR berarti dua
salinan dari kebenaran yang sama. Salinan seperti itu selalu berakhir melenceng:
item diperbaiki, baris PR-nya tertinggal terbuka, dan tidak ada yang tahu mana
yang benar.

Jadi:

```
pemeliharaan_gardu.pr_keterangan   TEKS BEBAS — penjelasan regu apa adanya
                                   ("menunggu material", "perlu padam terjadwal")
```

dan daftar pekerjaan tertunda **diturunkan**, bukan dicatat:

```sql
-- gardu_perlu_perbaikan
-- Item yang keadaannya belum normal pada pemeliharaan TERVERIFIKASI terakhir.
-- Otomatis hilang dari daftar begitu pemeliharaan berikutnya mencatatnya normal.
```

Dua cara mencarinya, dan dua-duanya dipakai:

| Cara | Untuk pertanyaan seperti |
|---|---|
| **Saring per item** — dari `opsi` yang baku | "berapa trafo rembes belum ditangani se-ULP" |
| **Cari teks** — pada `pr_keterangan` dan `catatan_perbaikan` | "gardu mana yang catatannya menyebut 'material'" |

Saringan per item yang jadi angka di dashboard; pencarian teks untuk hal yang
tidak pernah bisa dibakukan.

**Bisa di-WO-kan.** Satu tabel penghubung yang sengaja tipis — menyimpan
penugasan, bukan menyalin temuannya:

```
tindak_lanjut_gardu
  gardu_kode · ulp · item_kode · wo_item_id
  ditugaskan_pada · ditugaskan_oleh
```

Dengan begitu daftar turunan tadi bisa menandai mana yang **sudah di-WO-kan** dan
mana yang masih menganggur, tanpa pernah memegang salinan kedua dari temuannya.

**Saat gardu yang sama dipelihara lagi**, item yang belum normal muncul kembali
di layar regu — bukan karena ada yang mengingat, tapi karena memang begitu
keadaan terakhirnya.

### 3.7 Master gardu diperluas

Kolom baru, semuanya bisa dikoreksi lewat lapisan verifikasi:

```
jenis_gardu · phase · tegangan_primer · tegangan_sekunder
jenis_minyak · volume_minyak · berat_total · tapping · pendingin
```

Naik dari `data_amg` jadi kolom sungguhan (sekarang terkubur di JSONB dan tidak
bisa dikoreksi):

```
no_seri · tahun_pembuatan · arus_primer · arus_sekunder · vector
```

Ditambah penanda kelengkapan:

```
master_terverifikasi_at · master_terverifikasi_dari (pemeliharaan_id)
```

`data_amg` tetap disimpan apa adanya sebagai catatan impor — bukan sumber lagi,
tapi pembanding.

### 3.8 View turunan

| View | Menjawab |
|---|---|
| `gardu_kondisi_terakhir` | Kondisi tiap item per gardu, dari pemeliharaan **terverifikasi** terakhir |
| `hargardu_rekap_item` | Tiga kelompok per item per ULP — bahan dashboard |
| `hargardu_cakupan` | Berapa gardu sudah pernah dipelihara, kapan terakhir, berapa masternya sudah lengkap |
| `pekerjaan_tertunda_terbuka` | PR yang masih menggantung, per ULP dan per kategori |

---

## 4. Alur kerja

```
WEB  jadwalkan gardu bulan ini ──┐
                                 ├──► MOBILE  daftar tugas + boleh ambil
REGU ambil sendiri di lapangan ──┘            gardu di luar jadwal
                                                      │
                                              isi bertahap, foto
                                                      │
                                                   Selesai
                                                      │
                                 WEB  persetujuan per pekerjaan:
                                      • peta sebelum/sesudah
                                      • selisih pengukuran
                                      • KOREKSI MASTER ditampilkan inline
                                                      │
                                        Diverifikasi ─┴─ Ditolak (kembali jadi pekerjaan)
```

Isian mobile memakai alur **bertahap per kelompok**, sama seperti formulir tiang
JTR — bukan satu halaman panjang. Alasannya sudah terbukti di JTR: kartu yang
bisa ditutup membuat satu pekerjaan tersimpan tanpa isinya pernah ditampilkan.

---

## 5. Urutan pengerjaan

| # | Pekerjaan | Alasan urutannya |
|---|---|---|
| 1 | SQL: skema + perluasan master + `hargardu_item_ref` beserta isi awalnya | Semua bergantung ke sini |
| 2 | Mobile: pelaksanaan bertahap + foto + PR | Bagian terbesar, dan yang menghasilkan data |
| 3 | Web: persetujuan + koreksi master inline | **Tidak boleh tertinggal** — tanpa ini master tidak pernah terkoreksi, dan itu tujuan modulnya |
| 4 | Web: dashboard tiga kelompok + cakupan | Output yang diminta pemilik pekerjaan |
| 5 | PR: daftar, pencarian, tombol jadikan WO | Menutup lingkaran temuan |
| 6 | Web: pengaturan item pemeriksaan (UP3) | Supaya penambahan berikutnya tidak lewat saya |
| 7 | Web: penjadwalan bulanan | Paling bisa ditunda — regu sudah bisa jalan tanpa jadwal |

---

## 6. Yang sudah diputuskan, jangan dibuka lagi

**Kapan master lengkap — bukan pertimbangan.** Kata pemilik pekerjaan: *"jangan
pikirkan kapan datanya lengkap, itu risiko saya. berjalan saja."* SLA-nya berubah
tiap tahun, jadi menghitung 45 bulan atau 22 bulan tidak mengubah apa pun yang
kita bangun. Modul ini dibuat supaya jalan terus, bukan supaya selesai pada
tanggal tertentu — dan tidak perlu ada jalur pintas melengkapi master dari
belakang meja.

**Persetujuan satu lapis, seragam dengan inspeksi JTR.** Tidak ada sampling
berjenjang meski SIMANTEK punya. Satu kosakata status, satu cara menyetujui, satu
hal yang perlu dipelajari petugas.

**Kategori PR tidak dibakukan.** Keterangannya teks bebas; yang dibakukan justru
`opsi` tiap item pemeriksaan, karena dari situlah saringan dan angka dashboard
diambil.

**Daftar item dan pilihannya: satu untuk semua ULP, hanya UP3 yang bisa
mengubah.** Bukan per-ULP — kalau tiap unit mengarang kosakatanya sendiri, angka
se-UP3 tidak bisa dijumlahkan lagi.

---

# 7. Urutan rincian — mengikuti bentuk fisik gardu

> Ditetapkan pemilik pekerjaan 9 September 2026. **Urutan ini berlaku di web
> maupun di mobile**, jadi ditulis sekali di sini dan dipakai dua tempat.

Rincian dibaca dari ATAS TRAFO KE BAWAH, urut seperti orang memeriksa gardu
sungguhan. Di web: **data di kiri, foto di kanan**, satu bagian satu baris.

| # | Bagian | Isinya | Foto |
|---|---|---|---|
| 1 | **Data Gardu** | kVA, nomor seri, merk, tahun, phase, tegangan, arus, vector, minyak, berat, tapping, pendingin | nama plat |
| 2 | **FCO** | cut out R/S/T (kondisi, jenis, ukuran fuse link) + **tekep FCO** | fco |
| 3 | **Arrester** | arrester R/S/T (kondisi, jenis) + **tekep arrester** | arrester |
| 4 | **Jumperan** | jumperan trafo (A3C / A3Cs) | — |
| 5 | **Bushing** | bushing primer R/S/T, bushing sekunder R/S/T + **tekep bushing** | bushing primer, bushing sekunder |
| 6 | **Trafo & fisik** | kondisi trafo, minyak trafo, papan injak, yzer werk, lantai kerja | trafo |
| 7 | **PHB TR** | LV board, dudukan fuse, busbar, helbom saklar, HS rating, reting fuse per jurusan, **beban per jurusan**, **jurusan tersedia**, **jurusan terpakai** | PHB TR, isi PHB TR, helbom, NH fuse, beban R/S/T/N |
| 8 | **Inlet** | ukuran kabel, **jenis kabel**, ukuran schoen, **jenis schoen** | — |
| 9 | **Outlet** | sama seperti inlet | — |
| 10 | **Sambungan Outlet Gardu** | **per jurusan A/B/C/D** — joint press / konektor | — |
| 11 | **Pentanahan** | nilai arrester / trafo / netral + **jenis kabel pentanahan** | — |

Foto pekerjaan (sebelum, proses, sesudah, keseluruhan gardu) berdiri sendiri di
atas sebagai bukti pekerjaannya terjadi — bukan milik salah satu bagian.

---

## 7.1 Tiga hal yang tidak bisa diwakili bentuk data sekarang

### a. Sambungan outlet harus PER JURUSAN

Sekarang satu gardu satu nilai. Kata pemilik pekerjaan: *"perjurusan ya bukan
hanya satu, karena bisa berbeda"* — dan memang begitu: jurusan A bisa joint
press sementara jurusan C masih konektor. Satu nilai memaksa regu memilih salah
satu, dan angka dashboard "berapa gardu masih pakai konektor" jadi tidak bisa
dipercaya.

Kolom `fasa` di `pemeliharaan_gardu_periksa` hanya menerima R/S/T. Yang
dibutuhkan bukan kolom baru, melainkan **kolomnya digeneralisasi**:

```
hargardu_item_ref.per_fasa (BOOLEAN)  →  dimensi TEXT: tunggal | fasa | jurusan
pemeliharaan_gardu_periksa.fasa       →  bagian TEXT: R S T | A B C D | -
```

Sekali diganti, item apa pun bisa dinilai per fasa ATAU per jurusan tanpa
skema disentuh lagi — termasuk item yang belum terpikirkan hari ini.

### b. Tujuh isian belum ada

| Isian | Bagian | Bentuk |
|---|---|---|
| `jurusan_tersedia` | PHB TR | angka |
| `jurusan_terpakai` | PHB TR | angka |
| `kabel_inlet_jenis` | Inlet | pilihan |
| `schoen_inlet_jenis` | Inlet | pilihan |
| `kabel_outlet_jenis` | Outlet | pilihan |
| `schoen_outlet_jenis` | Outlet | pilihan |
| `pentanahan_jenis_kabel` | Pentanahan | pilihan |

Kosakata pilihannya **belum boleh saya karang**: dari kosakata itulah saringan
dan angka dashboard diambil, dan pilihan yang salah membuat pertanyaan tidak
bisa dijawab — tanpa galat, cuma tidak ketemu.

### c. Kelompok item ditata ulang

Tujuh kelompok sekarang (Pengaman, Tekep, Bushing, Trafo, PHB TR, Sambungan,
Fisik) disusun menurut jenis barangnya. Yang diminta disusun menurut **urutan
memeriksanya**, dan tekep pecah masuk ke bagiannya masing-masing — tekep FCO
bersama FCO, bukan berkumpul dengan tekep lain.

Ini murni memindahkan `kelompok` dan `urutan` di tabel acuan. Kode item tidak
berubah, jadi catatan pemeliharaan yang sudah ada tetap terbaca.

---

## 7.2 Akibatnya pada data yang sudah ada

Ada **satu** pemeliharaan sungguhan (AM251, 40 jawaban, 14 foto). Penggantian
nama kolom `fasa` → `bagian` memakai `ALTER TABLE ... RENAME`, jadi datanya ikut
pindah utuh — tidak ada yang perlu diketik ulang.

Yang berubah artinya cuma `sambungan_outlet`: yang tercatat sekarang satu nilai
tanpa jurusan. Dia tetap tersimpan sebagai `bagian = '-'` dan akan terbaca
sebagai "belum dirinci per jurusan" sampai gardu itu dipelihara lagi.

---

## 7.3 Urutan pengerjaan

| # | Pekerjaan |
|---|---|
| 1 | SQL: generalisasi `fasa` → `bagian`, `per_fasa` → `dimensi` |
| 2 | SQL: tujuh isian baru + penataan ulang kelompok & urutan + pemetaan foto ke bagiannya |
| 3 | Web: rincian dua kolom — data kiri, foto kanan, urut 1–11 |
| 4 | Mobile: langkah mengikuti urutan yang sama (otomatis, karena langkah dibuat dari kelompok) |

Mobile hampir tidak perlu disentuh: langkahnya sudah dibuat dari daftar
kelompok di database, jadi menata ulang kelompok akan menata ulang langkahnya
sendiri. Yang perlu ditambah cuma kemampuan menilai per JURUSAN, bukan cuma
per fasa.
