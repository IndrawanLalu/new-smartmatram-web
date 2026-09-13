# Inspeksi JTM — rencana rinci

> Bagian **4.2** dari `rencanakerjasmartnex.md`, ditulis terpisah karena bentuk datanya
> berbeda dari semua modul lain: ini satu-satunya tempat di SMART yang **satu benda
> fisik dipakai bersama oleh dua pemilik**.
>
> Disepakati 11 September 2026, sesudah tiga putaran tanya jawab dengan pemilik pekerjaan.

---

## 1. Kenapa ini bukan sekadar "JTR untuk tegangan menengah"

JTR punya sifat yang membuat bentuk datanya sederhana: **satu tiang selalu milik satu
gardu.** Pohonnya berakar di gardu, bercabang ke jurusan, dan tidak pernah bersinggungan
dengan pohon gardu lain.

JTM tidak begitu. Dua penyulang bisa berjalan di tiang yang sama untuk beberapa gawang,
lalu berpisah. Masing-masing punya **nama segmen sendiri**, dan ruas bersamanya bisa
persis sama awal dan akhirnya. Kata pemilik pekerjaan:

> *"underbuild TM itu beda penyulang, namun nama segmentnya akan berbeda. karena
> underbuild bisa sama tiang awal dan akhirnya. misal penyulang A dan penyulang B hanya
> underbuild beberapa tiang saja."*

Itu satu kalimat, tapi dia yang menentukan seluruh bentuk data di bawah ini: hubungan
**segmen ↔ tiang tidak bisa satu-ke-banyak.**

Satu hal lagi yang khas JTM: **inspeksinya butuh dua koordinat penamaan, bukan satu.**
Penyulang menjawab "listrik ini dari mana", segmen menjawab "ruas yang mana". Tanpa
segmen, temuan JTM kembali jadi seperti hari ini — 2.394 baris dengan koordinat lepas
yang tidak pernah bisa dijumlahkan per ruas.

---

## 2. Keadaan sekarang, terukur

Diperiksa langsung ke basis data dan Sheet pada 11 September 2026.

| Yang ada | Angka | Artinya untuk modul ini |
|---|---|---|
| `inspeksi` (JTM tier 1 & 2 berjalan) | **2.394 baris**, 2025: 389 · 2026: 611 | Temuan titik-lepas. **Tetap hidup**, tidak dimatikan |
| Kosakata temuan | 33 nilai berbeda | Campur aduk kondisi dan pekerjaan: `Isolator Pecah` (104) **dan** `Ganti Isolator` (99); `Pasang Tekep Isolator` dalam 5 ejaan |
| `jalur` | 17 baris | Berbentuk segmen: `REC. MALOMBA - LBS MALOMBA`, `LBS MALOMBA - 3 WAY NK`. Semua AMPENAN |
| `jalur_koordinat` | 165 titik | Rute gambar tangan, bukan tiang |
| `tiang` | **0 baris** | Tabelnya sudah bersiklus hidup penuh dari Fase 1 (JTR) |
| `penyulang_ref` | 82 baris | Calon tempat kode singkat penyulang |
| Sheet tiang referensi | **1.676 tiang, koordinat lengkap**, 11 seksi | Sumber data contoh — **bukan** master |

Dua hal yang terbaca dari isi Sheet dan penting dicatat sebelum impor:

- Kolom `KONSTRUKSI` sudah memuat nilai ganda (`A1; A3`) dan `NO_TIANG` memuat `1 L1`,
  `1 L2`. **Underbuild sudah tercatat di sana**, cuma dijejalkan ke satu sel.
- Kolom `PANJANG` (230 · 39,59 · 16,05) adalah bentang ke tiang berikutnya. Sama seperti
  pelajaran impor JTR: **jangan impor angkanya, hitung sendiri dari koordinat.** Angka
  yang diimpor akan langsung basi begitu satu tiang dikoreksi.

---

## 3. Enam belas keputusan yang sudah dikunci

Ditetapkan pemilik pekerjaan 11 September 2026. **Bukan bahan negosiasi ulang** —
temuan teknis diselesaikan di dalam batasan ini.

| # | Keputusan |
|---|---|
| 1 | Inspeksi lama **hidup berdampingan**. Laporan temuan lepas (layangan, pohon, laporan warga) tetap jalan; modul baru untuk inspeksi terjadwal per segmen |
| 2 | Penyapuan **boleh berhenti di tengah**. Cakupan diukur dan ditampilkan, tidak dipaksa lengkap |
| 3 | Segmen **terstruktur**: titik awal → titik akhir, bukan nama bebas |
| 4 | **Segmen induk diturunkan dari tiang percabangan**, tidak diketik |
| 5 | Tier 1 dan tier 2 **perlakuannya sama**; yang berbeda hanya daftar itemnya, dan itu diatur di halaman Pengaturan |
| 6 | Master tiang **mulai kosong**. Ada **fitur impor Excel**; Sheet dipakai sekali untuk data contoh lalu ditinggalkan |
| 7 | Underbuild dicatat **sedalam sirkit** — panjang penghantar per penyulang harus bisa dihitung |
| 8 | Pemilik tiang = penyulang yang **konduktornya paling atas** |
| 9 | Menumpang tiang orang: **sistem menawarkan tiang terdekat ±10 m**, regu mengetuk "pakai tiang ini" |
| 10 | Badan tiang dinilai pemiliknya; penumpang menilai miliknya. Ditambah keadaan **"tidak diperiksa"** yang tidak menimpa apa pun |
| 11 | Menutup temuan **wajib memilih sebab**, dan **wajib foto** kalau sebabnya "sudah diperbaiki" |
| 12 | Kode tiang berprefiks per penyulang (`MTR-001`), diatur admin, dibuat sistem kalau kosong, **tidak boleh kembar**. Mengubah prefiks **menomori ulang seluruh tiang penyulang itu**, tercatat di audit |
| 13 | Yang menyapu = role **inspektor** |
| 14 | Tiang tidak bisa dinilai dari jauh: petugas wajib **≤ 50 m** dari titiknya (**bisa disetel**). Sinyal buruk **ditunggu, bukan ditolak** |
| 15 | Web punya **koreksi massal di peta**: geser titik tiang, pilih banyak tiang sekaligus, ubah segmen dan penyulangnya |
| 16 | Koreksi dari belakang meja **tidak pernah** menjadikan tiang "terkonfirmasi lapangan" |

Data contoh pertama: **GUNUNG SARI, 280 tiang** (46 di antaranya menyebut gardu — sekaligus
menguji sambungan tiang JTM ke master gardu).

---

## 4. Bentuk data

### 4.1 Tiga tabel, bukan dua — inilah jawaban underbuild

```
tiang            benda fisik. Satu batang beton = SATU baris, selamanya.
                 penyulang_pemilik · kode · nomor_lama · lat/lng · induk_id
                 jenis · konstruksi · status_hidup (usulan|aktif|diganti|dibongkar)
                 sumber · dikonfirmasi_at (hanya dari lapangan, lihat bab 7)

segmen           milik SATU penyulang.
                 penyulang · ulp · titik_awal(jenis,nama,tiang_id) · titik_akhir(...)
                 nama (dibentuk otomatis) · induk_segmen_id (turunan) · status

segmen_tiang     tiang mana saja yang DIPIKUL segmen itu.   ← penampung underbuild
                 segmen_id · tiang_id · posisi (atas|bawah|…)
```

Tiang `MTR-002` punya **dua baris** di `segmen_tiang`: satu untuk segmen MATARAM, satu
untuk segmen KOPEL A. Tidak ada baris kedua di `tiang` — batangnya cuma satu.

Yang lahir sendiri dari bentuk ini, tanpa satu pun isian tambahan:

- **Underbuild sebagian** — KOPEL A cukup terdaftar di 2 dari 5 tiang. Tidak ada yang
  perlu menyatakan "underbuild mulai di sini, berhenti di sini".
- **Awal dan akhir berimpit** — kalau KOPEL A memakai kelima tiang yang sama, dia tetap
  segmen sendiri dengan nama sendiri. Tidak ada tabrakan.
- **Tiang tetap bernama satu** — saat KOPEL A menumpang, dia menumpang tiang bernama
  `MTR-002`. Tidak lahir nama kedua untuk batang yang sama.

### 4.2 Dua angka panjang, dua-duanya benar

```
panjang_rute        bentang FISIK, dihitung sekali berapa pun kabel yang lewat
panjang_penghantar  per penyulang: bentang yang KEDUA UJUNGNYA memikul kabel itu
```

Ruas berimpit 500 m menambah 500 m ke KMS MATARAM **dan** 500 m ke KMS KOPEL A, tapi
hanya 500 m ke rute fisik. Dua-duanya angka yang memang ditanyakan orang berbeda:
perencana bertanya rute, pemelihara penyulang bertanya penghantar.

Aturan "kedua ujungnya memikul kabel yang sama" sudah terbukti di JTR, **termasuk
jebakannya**: di JTR bentang pangkal sempat hilang karena ujung satunya bukan tiang. Di
JTM jebakan yang sama muncul di titik awal segmen yang berupa GI atau PLTD — ditangani
sejak awal, bukan ditambal setelah angkanya terlihat aneh.

### 4.3 Satu contoh dijalankan sampai angkanya

```
tiang          MTR-001  MTR-002  MTR-003  MTR-004  MTR-005   KPA-018  KPA-019
segmen MATARAM    ●        ●        ●        ●        ●
segmen KOPEL A             ●        ●                            ●        ●
bentang (m)         38       41       44       39        52        47
```

| Angka | Hasil | Dari mana |
|---|---|---|
| panjang rute | 38+41+44+39+52+47 = **261 m** | tiap bentang sekali |
| penghantar MATARAM | 38+41+44+39 = **162 m** | bentang antar tiang yang dipikul MATARAM |
| penghantar KOPEL A | 41 + 52 + 47 = **140 m** | termasuk bentang MTR-005→KPA-018, karena keduanya memikul KOPEL A |
| tiang bersama | **2** (MTR-002, MTR-003) | tiang dengan >1 penyulang di `segmen_tiang` |

Tidak satu pun angka di tabel itu diketik orang.

### 4.4 Segmen: titik awal dan titik akhir

Jenis titik yang dikenali, diambil dari kosakata yang sudah dipakai di 17 baris `jalur`:

```
GI · PMT · PLTD · REC · LBS · PENG · TIANG (percabangan) · GARDU · UJUNG
```

Nama segmen **dibentuk otomatis** dari keduanya: `REC. MALOMBA – LBS MALOMBA`. Itulah yang
membuat dua orang menyebut ruas yang sama dengan nama yang sama — syarat yang tidak bisa
dipenuhi nama bebas.

**`PENG` = pengambilan**, yaitu percabangan **di dalam** segmen (dipastikan pemilik
pekerjaan 11 Sep 2026). Bedanya dengan REC dan LBS penting, dan bukan sekadar istilah:

| | Memotong segmen? | Kenapa |
|---|---|---|
| REC · LBS · PMT | **Ya** | peralatan hubung — dia yang menentukan bagian mana yang padam saat dibuka |
| PENG (pengambilan) | **Tidak** | cuma titik pengambilan; listriknya tetap satu ruas yang sama |

Jadi pengambilan **tidak memecah** segmen induknya. Yang lahir darinya adalah **segmen
anak** — cabang yang berangkat dari tiang pengambilan itu — dan induknya diturunkan dari
tiang tersebut, persis keputusan nomor 4. Tidak ada isian "segmen induk" yang harus diisi
orang.

Bahwa 17 baris `jalur` memakai `PENG. AM189` sebagai titik ujung tetap sah: itu nama
tempat yang dikenal orang lapangan. Yang tidak boleh adalah **menyimpulkan** ada batas
listrik di sana hanya karena namanya jadi ujung sebuah ruas gambar.

**Segmen induk diturunkan, tidak diketik.** Kalau titik awal sebuah segmen berupa tiang
percabangan, induknya = segmen tempat tiang itu terdaftar. Dua keadaan yang tetap perlu
aturan:

1. **Tiang percabangannya belum ada** — keadaan yang justru biasa di awal (master masih
   kosong). Jalan keluarnya: regu menitik tiang percabangan itu dulu sebagai bagian dari
   segmen induk, baru segmen anak lahir darinya.
2. **Tiang percabangan dipikul lebih dari satu penyulang** — induknya adalah segmen
   **penyulang yang sama** dengan segmen anak. Percabangan penyulang A tidak pernah
   berinduk pada segmen penyulang B meski tiangnya sama.

### 4.5 Penamaan tiang

```
MTR-001          penyulang MATARAM, tiang ke-1
MTR-005_B1       cabang ke timur dari MTR-005 — huruf dari arah mata angin nyata
MTR-005a         sisipan di tengah bentang
```

Bentuk dan mesinnya **sama persis dengan JTR** (trigger penamaan, arah dihitung dari
koordinat, bukan dipilih orang). Yang baru cuma prefiksnya:

- `penyulang_ref.kode_singkat`, **unik se-UP3**.
- Kosong → sistem membuatkan dari namanya (`MATARAM` → `MTR`, `KOPEL A` → `KPA`), lalu
  admin boleh mengoreksi di Pengaturan.
- Mengubah prefiks **menomori ulang seluruh tiang penyulang itu** dan tercatat di audit.
  Aman karena kode cuma label — identitas sebenarnya UUID, jadi tidak ada inspeksi atau
  temuan yang putus.

**Tiang yang pindah penyulang** (lewat koreksi massal, bab 7) mendapat nomor baru yang
**menyambung di akhir penomoran penyulang tujuan**: `MTR-007…MTR-046` jadi
`KPA-113…KPA-152`. Tiang penyulang tujuan yang lain **tidak tersentuh sama sekali** —
tidak ada riak ke laporan yang sudah dicetak. Harganya jujur disebut di sini: nomornya
jadi tidak urut geografis, ada lompatan di tengah penyulang.

**`nomor_lama`** menyimpan nomor tiang yang sudah ada sebelumnya (dipastikan pemilik
pekerjaan: penomoran di Sheet adalah **nomor tiang lama**, bukan nomor urut pembuat
survei). Diisi saat impor dan boleh diisi regu di lapangan kalau tiang punya plat.
Dipakai untuk mencocokkan dengan dokumen lama — bukan untuk rekap.

---

## 5. Penilaian: satu benda, satu keadaan

Tiga aturan yang bekerja bersama. Menghapus salah satunya membuat dua yang lain bocor.

### 5.1 Satu benda, satu keadaan berlaku

Tidak ada dua catatan untuk satu tiang. Kalau tiap penyulang menyimpan penilaiannya
sendiri, "berapa tiang miring di Ampenan" jadi pertanyaan yang punya dua jawaban — dan
dashboard harus memilih salah satu tanpa dasar.

### 5.2 Yang menimpa hanya penilaian yang benar-benar dilakukan

Tiap item punya keadaan ketiga: **tidak diperiksa**. Itulah keadaan bawaan item badan
tiang pada formulir regu penumpang.

Yang dibatasi adalah **kewajiban mengisi, bukan hak melaporkan**. Regu KOPEL A yang cuma
lewat tidak wajib menilai badan tiang MTR-002 — tapi kalau dia **melihat** tiang itu
sekarang miring, dia mencatatnya, dan itu yang berlaku. Kata pemilik pekerjaan: *"kondisi
tiang bisa berbeda setelah beberapa hari."*

### 5.3 Menutup temuan harus punya sebab

Kalau isian baru mengubah temuan terbuka jadi normal, aplikasi memperlihatkan dulu
temuannya — *"tiang miring, tercatat 12 Agu oleh regu Ahmad"* — lalu meminta satu sebab:

| Sebab | Akibat |
|---|---|
| **Sudah diperbaiki** | **wajib foto.** Klaim perbaikan harus bisa diperiksa admin dari belakang meja |
| **Ternyata tidak ada** (salah catat) | temuan tertutup, tercatat sebagai koreksi |
| **Tidak saya periksa** | penimpaan dibatalkan; keadaan lama tetap berlaku |

Ini yang menutup lubang yang disebut pemilik pekerjaan: temuan yang hilang hanya karena
inspeksi berikutnya menjawab "tidak ada temuan". Sekarang hilangnya selalu punya sebab,
pelaku, tanggal, dan — untuk klaim perbaikan — foto.

⚠ **Yang harus diawasi setelah jalan:** foto wajib bisa mendorong regu memilih "ternyata
tidak ada" supaya lolos. Sebarannya perlu dilihat setelah sebulan; kalau "ternyata tidak
ada" mendadak jadi sebab terbanyak, itu gejala, bukan kebetulan.

### 5.4 Temuan tetap DITURUNKAN

Seperti HARGARDU: tidak ada tabel temuan tersendiri. Temuan = item yang nilainya bukan
`normal` pada inspeksi terverifikasi terakhir. Itu sebabnya tidak akan ada baris temuan
yang tertinggal terbuka setelah barangnya betul-betul diperbaiki — keluhan lama yang
sekarang terbukti angkanya: pada inspeksi JTR lama, `Approve` = "Tidak" pada 562 dari 562
baris.

---

## 6. Penjaga jarak — tiang tidak bisa dinilai dari jauh

Petugas wajib berada **paling jauh 50 m** dari titik tiang yang sedang dinilai. Di atas
itu tombol simpan mati. Angkanya **disetel**, bukan ditulis di kode — 50 m cocok untuk
jalan kota, belum tentu cocok untuk ruas kebun yang tiangnya di seberang jurang.

```
jarak_maks_nilai_m      50    batas menilai tiang
akurasi_minimum_m       25    di atas ini pembacaan GPS dianggap belum layak dipakai
bentang_maks_wajar_m   100    pemicu pertanyaan "ada tiang belum tercatat?"
```

Disimpan per ULP dengan baris `ALL` sebagai nilai jatuh-tempat — pola yang sudah dipakai
`anomali_settings` dan `wo_pengukuran_settings`, jadi tidak ada mekanisme pengaturan baru
yang perlu dipelajari.

**Dua keadaan yang kelihatan sama di layar tapi berbeda sebabnya, dan tidak boleh
disamakan pesannya:**

| Keadaan | Yang ditampilkan | Kenapa dibedakan |
|---|---|---|
| Jarak > 50 m, akurasi baik | "Anda 120 m dari MTR-004. Dekati tiangnya." | Memang terlalu jauh |
| Akurasi pembacaan > ±25 m | "Sinyal GPS belum cukup baik — tunggu sebentar." | **Bukan salah petugas.** Menuduh orang yang sebenarnya sudah berdiri di bawah tiang adalah cara tercepat membuat dia berhenti memakai aplikasi |

Dua jalan keluar yang selalu tersedia, dan keduanya mengoreksi sebab yang berbeda:

1. **Tunggu kuncian GPS** — sebabnya satelit. `watchPositionAsync` sudah berjalan
   (pelajaran bug JTR: membaca GPS sekali saat layar dibuka membuat semua tiang tercatat
   di koordinat yang sama), jadi angka jaraknya bergerak jujur saat petugas melangkah.
2. **Koreksi posisi tiang** — sebabnya titik masternya yang salah, bukan orangnya.
   Petugas yang sedang berdiri di bawah tiang menekan "titik tiang ini salah", dan
   koordinatnya berpindah ke posisinya sekarang. Ini **konfirmasi lapangan** yang sah:
   panjang bentang ikut terhitung ulang, dan tiang itu ditandai pernah dilihat orang.

---

## 7. Koreksi massal di web — peta

Satu kesalahan di awal penyapuan tidak berhenti di satu baris. Kalau regu salah memilih
segmen saat mulai, **seluruh tiang hari itu** menempel di tempat yang salah — dan
membetulkannya satu per satu berarti kesalahan itu dibiarkan saja.

Yang disediakan di peta web:

- **Geser titik tiang** untuk memperbaiki koordinat yang jelas meleset.
- **Pilih banyak tiang** (kotak/laso, atau dari hasil saringan penyulang/segmen/tanggal
  penyapuan).
- **Ubah segmen dan penyulangnya sekaligus** untuk seluruh yang terpilih.

Empat aturan yang menempel padanya:

| Aturan | Kenapa |
|---|---|
| Koreksi meja **tidak** menyalakan penanda "terkonfirmasi lapangan" | Penanda itu yang menggerakkan angka kelengkapan master. Kalau bisa dinyalakan dari belakang meja, angkanya berhenti berarti apa-apa dalam sebulan |
| Pemilik tiang **ikut berpindah** kalau tiang itu tidak dipikul segmen penyulang lain | Kalau cuma satu penyulang yang lewat, pemiliknya memang penyulang itu — tidak ada yang perlu ditanyakan |
| Tiang yang **juga dipikul segmen lain** disebutkan sebelum disimpan | "3 dari 40 tiang terpilih juga dipikul KOPEL A." Pemindahan massal tidak boleh diam-diam mengubah jaringan orang lain |
| Tiap tiang yang berubah **tercatat sendiri-sendiri di audit** | Satu tindakan massal tetap harus bisa ditelusuri per benda: siapa, kapan, dari apa ke apa |

Panjang rute dan panjang penghantar **tidak perlu diperbarui** — keduanya view, jadi
angkanya sudah benar begitu titiknya berpindah. Itu untung yang lahir dari keputusan
"angka turunan jangan pernah diketik", bukan dari kerja tambahan di sini.

---

## 8. Daftar item awal — draf, bukan ketetapan

Diturunkan dari tiga sumber: kosakata temuan yang sudah dipakai di 2.394 baris `inspeksi`,
kolom Sheet tiang referensi, dan bentuk fisik tiang JTM. **Kosakatanya pasti kurang** —
yang tahu kata sebenarnya yang dipakai regu adalah orang lapangan, dan mulai hari pertama
mereka bisa menyempurnakannya sendiri lewat halaman Pengaturan.

Urutan kelompok mengikuti cara orang memeriksa tiang: **dari atas ke bawah.**

| # | Kelompok | Item | Tier |
|---|---|---|---|
| 1 | **Tiang** | Kondisi tiang (tegak · miring · retak · keropos · patah) · Jenis tiang (beton 9/11/13 m · besi · kayu) · Papan nomor tiang (ada · tidak) | 1 |
| 2 | **Konstruksi & travers** | Konstruksi (A1 · A2 · A3 · A4 · …) · Kondisi travers (baik · miring · korosi · bengkok) · Baut & mur (lengkap · kurang · kendor) | 1 · baut→2 |
| 3 | **Isolator** | Jenis (tumpu · tarik) · Bahan (keramik · polimer) · Kondisi (baik · pecah · flashover · retak · kotor) · Tekep isolator (ada · tidak) | 1 · kondisi halus→2 |
| 4 | **Konduktor** *(per sirkit)* | Jenis (AAAC 150 · AAACS 240 · A3C · A3CS · NA2XSEYBY) · Kondisi (baik · rantas · kendor · serabut · putus) · Andongan (normal · kendor · terlalu tegang) | 1 · andongan terukur→2 |
| 5 | **Jumperan & sambungan** | Kondisi jumperan (baik · longgar · korosi) · Jenis sambungan (joint press · konektor · lilit) · **Suhu sambungan** (angka, °C — thermovision) | 1 · suhu→2 |
| 6 | **Pengaman** | Arrester (ada · tidak) + kondisi · Cut out/FCO kondisi · Tekep konduktor (ada · tidak) | 1 |
| 7 | **Pentanahan** | Pentanahan (ada · tidak) · Kondisi kawat · **Nilai pentanahan** (angka, ohm) | ada/tidak→1 · nilai→2 |
| 8 | **Skur / stay** | Ada · tidak · Kondisi (baik · kendor · korosi · putus) | 1 |
| 9 | **Peralatan hubung di tiang ini** | Jenis (LBS · REC · FCO seksi · tidak ada) · Kondisi · Nomor peralatan | 1 |
| 10 | **ROW & lingkungan** | Vegetasi (aman · menyentuh · berpotensi) · Layangan (ada · tidak) · Jarak bangunan (aman · terlalu dekat) · Akses regu | 1 |

Yang **tidak** dimasukkan sebagai item, dan alasannya: `Ganti Isolator`, `Pemasangan Tekep
Gardu`, `Perbaikan Traverst` — itu **pekerjaan**, bukan kondisi. Pekerjaan diturunkan dari
kondisi, persis seperti di HARGARDU. Mencatat dua-duanya berarti dua salinan dari
kebenaran yang sama, dan salinan seperti itu selalu berakhir melenceng.

Penandaan tier ikut pola `hargardu_item_ref`: satu kolom `tier` (1 · 2 · keduanya) di
tabel acuan. Memindahkan satu item dari tier 2 ke tier 1 = mengubah satu kolom, tanpa
rilis aplikasi.

---

## 9. Yang ditulis balik ke master

Sama aturannya dengan HARGARDU, dan alasannya sama:

| Keadaan master | Perlakuan |
|---|---|
| Kosong → diisi | **Langsung terisi**, tetap teraudit |
| Ada → **berbeda** | **Menunggu persetujuan** |

Yang berpindah dari inspeksi ke master:

- **Tiang** — jenis, konstruksi, koordinat (koreksi), status hidup (tiang diganti/dibongkar).
- **Segmen** — penghantar dan ukurannya, titik awal/akhir kalau ternyata berbeda, daftar
  tiang yang dipikul.
- **Panjang** — tidak pernah ditulis. Selalu dihitung dari rantai tiang aktif.

---

## 10. Satu daftar Perlu Perbaikan, dua sumber

Karena inspeksi lama tetap hidup, temuannya harus bertemu di satu tempat — kalau tidak,
"berapa temuan JTM belum ditangani" jadi pertanyaan berjawab dua angka.

```
jtm_perlu_perbaikan   (view)
  ├── dari PENYAPUAN  — diturunkan dari item yang bukan normal, menempel tiang & segmen
  └── dari LAPORAN    — baris `inspeksi` yang statusnya belum Selesai, koordinat lepas
  kolom `asal` membedakan keduanya
```

Satu pintu ke WO, memakai penghubung tipis yang sudah terbukti di HARGARDU
(`tindak_lanjut_*`: menyimpan penugasan, bukan menyalin temuan).

---

## 11. Alur kerja

```
WEB    daftar segmen + jadwalkan ──┐
                                   ├─► MOBILE  pilih PENYULANG → pilih SEGMEN → tier
REGU   ambil sendiri di lapangan ──┘           (segmen belum ada? buat sendiri di tempat)
                                                        │
                                          susuri: tiap tiang dititik atau ditumpangi
                                          formulir per tiang mengikuti kelompok 1-10
                                                        │
                                              boleh berhenti, lanjut hari lain
                                                        │
                                                     Selesai  (cakupan tercatat apa adanya)
                                                        │
                                   WEB   persetujuan: peta, foto, koreksi master inline
                                                        │
                                          Diverifikasi ─┴─ Ditolak
```

Status memakai kosakata yang **sama persis** dengan JTR dan HARGARDU:
`Dijadwalkan → Dalam Proses → Selesai → Diverifikasi | Ditolak`. Satu kosakata untuk satu
maksud — petugas tidak perlu belajar tiga sistem status di satu aplikasi.

---

## 12. Urutan pengerjaan

| # | Pekerjaan | Keadaan | Alasan urutannya |
|---|---|---|---|
| 1 | SQL: `segmen`, `segmen_tiang`, perluasan `tiang` untuk JTM, `kode_singkat` penyulang, penamaan otomatis | ✅ ditulis & diuji lokal | Semua bergantung ke sini |
| 2 | SQL: acuan item + opsi (pola HARGARDU) + view panjang & cakupan | ✅ ditulis & diuji lokal | Bentuk jawabannya harus ada sebelum formulir dibuat |
| 3 | Web: **impor Excel tiang** + data contoh GUNUNG SARI | ✅ ditulis & diuji lokal | Supaya hasilnya bisa dilihat sebelum regu disuruh jalan |
| 4 | Web: master segmen — daftar, buat, gabung, peta | ✅ ditulis | Regu perlu memilih segmen sejak ketukan pertama |
| 5 | Mobile: penyapuan — pilih penyulang & segmen, titik/menumpang tiang, **penjaga jarak 50 m**, koreksi posisi tiang, formulir per tiang | ✅ ditulis, **belum OTA** | Bagian terbesar, dan yang menghasilkan data |
| 6 | Web: persetujuan + koreksi master inline | 🔲 | Tanpa ini master tidak pernah terkoreksi |
| 7 | Web: **koreksi massal di peta** — geser titik, pilih banyak, pindah segmen & penyulang | 🔲 | Sesudah ada data nyata dari lapangan; sebelum itu tidak ada yang perlu dikoreksi |
| 8 | Web: dashboard cakupan + KMS per penyulang, dan **satu daftar Perlu Perbaikan** | 🔲 | Output yang diminta |
| 9 | Web: pengaturan item per tier + ambang jarak (UP3) | 🔲 | Supaya penambahan berikutnya tidak lewat saya |

### 12.1 Enam SQL yang menunggu dijalankan di Supabase

Diperiksa langsung ke basis data 13 September 2026: **belum satu pun terpasang.**
Prasyaratnya sudah lengkap (`jtr-schema.sql`, `jtr-penamaan.sql`, `master_audit`,
`penyulang_ref`), jadi tidak ada yang perlu dijalankan lebih dulu. Urutannya wajib,
dan ketiganya idempoten — ragu sudah terjalan atau belum, jalankan ulang saja.

```
1. scripts/jtm-schema.sql            segmen · segmen_tiang · jtm_settings · penamaan
2. scripts/jtm-acuan.sql             33 item + 111 pilihan
3. scripts/jtm-view.sql              panjang rute vs penghantar, segmen_ringkas
4. scripts/jtm-impor.sql             impor_tiang_jtm · gabung_segmen
5. scripts/jtm-inspeksi-schema.sql   tabel penyapuan · kondisi terakhir · perlu perbaikan
6. scripts/jtm-inspeksi-fungsi.sql   mulai/nilai/tambah/tumpangi/koreksi/selesai/putuskan
```

Sesudah itu, dua langkah supaya hasilnya langsung terlihat: impor tab `GUNUNG SARI`
lewat **Jaringan JTM → Impor Tiang**, dan tambahkan menu `jtm` ke role **inspektor**
lewat Kelola Role.

---

## 13. Empat yang sempat menggantung — sudah dijawab

Dijawab pemilik pekerjaan 11 September 2026, ditulis di sini supaya tidak ada yang
mengira ini tebakan saya.

| Yang ditanyakan | Jawaban | Akibatnya di rencana |
|---|---|---|
| Arti `PENG.` | **Pengambilan** — percabangan **di dalam** segmen | Pengambilan tidak memotong segmen; cabangnya jadi segmen anak (bab 4.4) |
| Nomor tiang di Sheet | **Nomor tiang lama** | Masuk sebagai `nomor_lama`, bukan dibuang (bab 4.5) |
| 17 baris `jalur` | **Dibiarkan** — "saya belum tau itu segment apa" | Tetap jadi lapisan gambar peta. Tidak dipindah jadi segmen, tidak dihapus |
| Siapa yang menyapu | Role **inspektor** | Menu `inspeksi-jtm` ditambahkan ke role inspektor lewat Kelola Role |

---

## 14. Yang masih harus diawasi setelah jalan

Bukan pertanyaan terbuka — keputusannya sudah diambil. Ini hal yang baru bisa dinilai
setelah ada data nyata, dan lebih baik ditulis sekarang daripada ditemukan lagi nanti.

1. **Foto wajib bisa mendorong regu memilih "ternyata tidak ada".** Kalau setelah sebulan
   sebab itu jadi yang terbanyak saat temuan ditutup, itu gejala — bukan kebetulan.
2. **Ambang 50 m di ruas sulit.** Kalau permintaan koreksi posisi tiang menumpuk di satu
   ruas, kemungkinan besar yang salah koordinat masternya, bukan ambangnya.
3. **Nomor tiang yang tidak urut geografis** sesudah koreksi massal. Konsekuensi yang
   sudah disepakati; yang perlu dilihat adalah apakah regu di lapangan terganggu olehnya.
4. **Penyulang yang belum punya kode singkat.** Sistem membuatkan otomatis, dan tabrakan
   singkatan (`KEDIRI`/`KEDIRI 2`) akan muncul justru saat penyapuan sudah jalan.
