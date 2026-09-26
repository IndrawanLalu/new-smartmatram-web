# Rancangan — Inspeksi JTM & JTR di HP mengikuti pola kerja lapangan

Disusun 25 September 2026. Fitur terakhir dalam urutan
`rencana-mobile-kerja-lapangan.md` §8. Berlaku `teknisaplikasi.md` butir 1, 2,
5, 6, 14–17. **Keputusan §6 diambil 25 Sep 2026; menunggu "kerjakan J1".**

---

## 1. Keadaan sekarang (diperiksa ke data asli 25 Sep 2026)

| | JTM | JTR |
|---|---|---|
| Satuan kerja | **segmen** (penyapuan per segmen) | **gardu** (penyapuan per gardu) |
| Pemakaian | **11 penyapuan** (10 *Dalam Proses*, 1 Diverifikasi), 1.266 jawaban, 321 tiang, 11 segmen | **0 penyapuan** — belum dipakai lapangan |
| Daftar HP | semua segmen ULP + % diperiksa; tanpa WO | semua gardu ULP, tab Perlu / Selesai; tanpa WO |
| Menilai tiang | **langsung ke server per tiang** (butuh sinyal); hanya tiang BARU yang bisa diantre luring (`@jtm_antrean`) | sama, antrean `@jtr_antrean` + draf satu tiang |
| Kirim | "Selesaikan" = tutup penyapuan → Menunggu persetujuan | sama |
| Koreksi | web "Dikembalikan" (status DB `Ditolak` + alasan) → regu melanjutkan | sama |
| Rekap Kinerja | km disapu; **belum ber-WO** | km disapu; belum ber-WO |

Masalah yang terlihat:
- **Penyapuan menggantung.** 10 dari 11 masih *Dalam Proses*, sebagian sejak
  14–15 Sep. Tidak ada tempat di HP yang mengingatkan "ini belum Anda kirim".
- **Tanpa sinyal tidak bisa menilai tiang yang sudah ada** — justru di ruas
  yang paling sering tanpa sinyal.
- Daftar tanpa target: regu tidak tahu segmen mana yang harus disapu bulan
  ini; Rekap tidak punya angka WO.

## 2. Usulan: sama dengan Perabasan (satuan segmen/gardu, ukuran km)

JTM sudah berbentuk seperti Perabasan: satu segmen dikerjakan beberapa hari,
hasilnya dikirim bertahap, lalu **ditutup**. Jadi polanya dipinjam utuh:

| Tab | JTM (JTR sama, gardu menggantikan segmen) |
|---|---|
| **WO** | segmen WO bulan ini (lihat keputusan a) + penyapuan yang ditutup bulan ini; progres **km** |
| **Belum dikerjakan** | segmen WO yang belum mulai disapu |
| **Sudah dikerjakan** | penyapuan terbuka milik tim login: tiang tersimpan di HP & yang sudah terkirim sementara, tombol **Kirim tiang (N)** dan **Selesai disapu**; penyapuan **dikembalikan** (merah + alasan) |
| **Sudah dikirim** | penyapuan ditutup bulan ini: menunggu persetujuan · disetujui — hanya dilihat |

- Angka tab = **km** (seperti Perabasan).
- **Di luar WO** (keputusan e): tombol tetap di kepala daftar — **Inspeksi
  segmen lain** (JTR: gardu lain) dan **Rintis penyulang baru**. Hasilnya
  masuk tab yang sama (Sudah dikerjakan → Sudah dikirim) bertanda "LUAR WO".
- **Rekap**: km di luar WO tetap dihitung sebagai realisasi, disebut
  terpisah ("+x km di luar WO") — selama master tiang masih dibangun, justru
  bagian inilah yang terbesar.
- Nama petugas = tim login, terkunci. Tanggal = saat dinilai di HP.

## 3. Menilai tiang tersimpan di HP (butir 1 & 6)

Sekarang setiap jawaban tiang langsung naik ke server. Usulan: **penilaian
tiang disimpan di HP dulu** (per penyapuan, id jawaban dari HP), lalu:
- **Kirim tiang (N)** kapan saja ada sinyal — kiriman sementara, penyapuan
  tetap terbuka (sepola keputusan Perabasan no. 1);
- **Selesai disapu** = kirim sisa + tutup penyapuan dalam urutan yang sama.

Tiang BARU (nitik) sudah punya antrean luring; antrean itu disatukan dengan
draf penilaian, jadi satu kiriman membawa "tiang baru + jawabannya" berurutan.
Foto temuan ikut menunggu sebagai URI lokal, diunggah saat Kirim (butir 5).
Satu RPC per kiriman: `kirim_tiang_jtm(penyapuan, tiang[])` — idempoten per
id, memakai ulang pemeriksaan `nilai_tiang_jtm` (butir 17).

⚠ **Ini perombakan terbesar di seluruh urutan** (`JtmPenyapuanScreen` 1.661
baris, `FormTiangJtm`, antrean). Peta, jarak, rintis, tumpang, dan papan
kendali formulir TIDAK berubah — yang berubah hanya ke mana tombol Simpan
menulis.

## 4. WO inspeksi (keputusan a)

Pilihan yang menentukan isi tab WO dan angka Rekap:
1. **WO terbit dari web**, sepola **WO Perabasan**: admin memilih segmen
   (disarankan yang paling lama tidak diinspeksi — urutan ini sudah ada di
   Susun WO Perabasan), menugaskan ke tim, target km. Rekap mendapat "WO
   terbit km".
2. **Jatuh tempo otomatis**: segmen yang belum disapu ≥ N bulan (N disetel di
   Pengaturan) otomatis masuk WO bulan itu. Nol kerja admin, tapi tidak ada
   penugasan ke tim.
3. **Tanpa WO**: tab WO = semua segmen ULP (seperti sekarang). Rekap tetap
   "belum ber-WO".

## 5. Web

- Tab **Susun WO** di `/admin/jtm` (dan `/admin/jtr`) bila pilihan a-1.
- JTR: tab **Temuan** sepola JTM (tugaskan ke HARJAR → masuk alur Harjar baru).

## 6. Keputusan user (25 Sep 2026, jangan ditawar ulang)

| # | Keputusan |
|---|---|
| a | **WO inspeksi terbit dari web, pola WO Perabasan**: admin memilih segmen (JTM) / gardu (JTR), diurutkan paling lama tidak diinspeksi, menugaskan ke tim, target km. Rekap mendapat angka WO terbit |
| b | **Penilaian tiang disimpan di HP dulu**, dikirim sementara lewat "Kirim tiang (N)"; "Selesai disapu" = kirim sisa + tutup penyapuan (sepola Perabasan) |
| c | **JTR dikerjakan bersamaan dengan JTM**, sekalian tab Temuan JTR → tugaskan ke HARJAR |
| d | **Sudah dikerjakan = semua penyapuan terbuka se-ULP, milik tim login di atas** (bukan hanya tim login) |
| e | **Pekerjaan di luar WO tetap penuh** (user: "JTM dan JTR baru mulai titik baru"): WO hanya TARGET, bukan pagar. Regu tetap bisa memulai inspeksi segmen/gardu mana pun, **merintis** penyulang yang belum punya tiang, dan **nitik tiang baru** — semuanya lewat tombol yang selalu terlihat di daftar (bukan tersembunyi di pencarian), dan semuanya ikut alur simpan-di-HP → kirim yang sama |
| f | **Tiang JTM & JTR satu batang satu baris, lintas jaringan** (26 Sep 2026, user: "jangan sampai tiang itu di JTR terhitung, di JTM juga terhitung padahal tiang yang sama"). JTR mendapat penjaga radius + **"Tiang ini menumpang"** seperti JTM (peta tiang terdekat); sebelum tiang JTM ada, regu JTR menitik biasa + centang "memikul JTM" (`underbuild_tm`), dan penjaga JTM memaksa regu JTM menumpanginya nanti. **Keanggotaan JTR dipisah** ke tabel sendiri (gardu, jurusan, induk, nama JTR) supaya satu batang bisa ada di pohon JTM dan pohon JTR — bahkan dua gardu — tanpa saling menimpa. Hitungan: jumlah BATANG = baris unik (sekali); daftar tiang tiap jaringan memuatnya bertanda "dipikul bersama"; KMS per jaringan dari kabelnya sendiri |
| g | **Radius penjaga JTR = radius tumpang JTM per ULP** (satu angka, satu aturan) |
| h | **Penjaga radius = PERTANYAAN, bukan larangan** (26 Sep 2026, user: "ada tiang JTR yang memang ada di sebelahnya tiang JTM, bahkan jaraknya hanya 0.2 meter"). GPS tidak bisa membedakan dua batang berdampingan; regu memilih "menumpang di tiang X" atau "batang lain di sebelahnya". Yang kedua lahir sebagai batang baru dan tercatat `tiang.beda_dari_tiang_id` untuk diperiksa admin — tidak menghalangi kiriman |

## 6b. Master tiang tunggal JTM + JTR (keputusan f, 26 Sep 2026)

User: *"intinya, akan ada master tiang dan tidak akan ada tiang dobel, baik JTR
maupun JTM."*

**Keadaan:** `tiang` sudah satu baris per batang, tapi pohon JTR (gardu,
jurusan, induk, nama) ditulis ke kolom yang SAMA dengan pohon JTM (`induk_id`,
`kode`). Satu batang tidak bisa berada di dua pohon → JTR tidak bisa menumpang
di tiang JTM, dan menitik JTR tanpa penjaga bisa melahirkan batang kembar.
Data JTR baru 3 tiang uji — memindahkannya murah SEKARANG.

**Susunan baru:**

| Lapis | Isi | Tabel |
|---|---|---|
| **Master tiang** | batang fisik: titik, jenis, tinggi, kondisi, atribut & kabel (JTR), status hidup | `tiang` (tetap) |
| Keanggotaan JTM | segmen + nama per penyulang + induk JTM | `segmen_tiang`, `tiang_kode_penyulang`, `tiang.induk_id` (tetap) |
| **Keanggotaan JTR** | gardu, jurusan, **induk JTR**, **nama JTR** — boleh >1 gardu per batang | **`tiang_jtr` (baru)** |

- **Penjaga radius lintas jaringan** (radius tumpang JTM per ULP): menitik JTM
  maupun JTR di dekat batang yang SUDAH ADA (jaringan mana pun) memunculkan
  PERTANYAAN — menumpang, atau batang lain di sebelahnya (keputusan h).
- **JTR menumpang** = baris baru di `tiang_jtr` untuk batang yang sudah ada;
  namanya lahir dari aturan penamaan JTR yang sama (dipindah dari pemicu
  `tiang` ke `tiang_jtr`).
- Semua tampilan JTR (panjang kabel, temuan, daftar inspeksi, peta, HP)
  membaca pohon dari `tiang_jtr`, bukan dari kolom `tiang`.
- **Hitungan:** jumlah batang = baris `tiang` (sekali); daftar tiang tiap
  jaringan memuatnya bertanda "dipikul bersama"; KMS per jaringan dari
  kabelnya sendiri.

**Urutan J5 diubah:** J5t (SQL master tiang JTR: `tiang_jtr`, penamaan,
tampilan, penjaga, menumpang, pindah 3 tiang uji) → J5a (WO JTR + kiriman HP,
di atas `tiang_jtr`) → J5b HP → J5c web (Susun WO gardu, tab Temuan JTR).

## 7. Urutan pengerjaan (setelah keputusan)

| Fase | Isi |
|---|---|
| J1 | SQL: WO inspeksi (bila a-1/a-2), `kirim_tiang_jtm` idempoten, rekap |
| J2 | HP layanan: draf penilaian per penyapuan + antrean tiang baru disatukan, tembolok WO |
| J3 | HP layar: daftar 4 tab ber-km; `JtmPenyapuanScreen` menulis ke draf |
| J4 | Web: Susun WO |
| J5 | JTR mengikuti J1–J4 (bila c = bersamaan), + tab Temuan JTR |
