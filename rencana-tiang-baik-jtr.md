# Rencana — "Tiang baik" sekali ketuk untuk Inspeksi JTR

Status: **SUDAH DIKERJAKAN** (18 September 2026). Web & HP lolos typecheck.
Sisa: jalankan `scripts/jtr-baik.sql` di Supabase, lalu uji lapangan + publikasi OTA.

## Yang BERUBAH perilakunya (bukan cuma bentuk)

Dicatat di depan supaya tidak ada yang mengira ini sekadar penataan ulang layar:

1. **Formulir mulai kosong.** Dulu terbuka sudah terisi "Beton · 9 m · Baik".
   Sekarang jawaban bawaan baru masuk saat tombol "Tiang baik" ditekan.
2. **Simpan ditahan selama masih ada isian wajib yang kosong.** Dulu tidak ada
   pemeriksaan sama sekali — tiang bisa tersimpan dalam keadaan apa pun.
3. **Lembar "ubah tiang" tidak lagi menambal kolom NULL dengan tebakan.** Tiang
   lama yang datanya belum lengkap sekarang tampil kosong apa adanya; satu
   ketukan "Tiang baik" mengisinya, dan ketukan itulah yang dulu tidak pernah
   ada padahal nilainya tetap tertulis ke database.
4. **Kabel underbuild yang baru ditambah mulai kosong**, tidak lagi menyalin
   spesifikasi kabel utama.
5. **Nilai kosong tersimpan sebagai NULL**, bukan string kosong.

Yang **tidak** disentuh: skema tabel `tiang`/`tiang_konduktor`, penurunan temuan
(`inspeksi_jtr_temuan`), penyapuan & penutupannya, persetujuan gardu, koreksi
titik, antrean luring, dan penamaan tiang.

Padanan JTM-nya: `TiangNormal.tsx` + `scripts/jtm-normal.sql` + tombol "Tiang normal"
di `FormTiangJtm.tsx`.

---

## 1. Duduk perkara

Satu tiang JTR diisi lewat **lima langkah berurutan** (`src/components/FormTiang.tsx`,
`JUDUL_LANGKAH`). Satu gardu bisa lima puluh tiang. Padahal isian bawaannya sudah
benar di sebagian besar tiang — yang dikerjakan petugas cuma menekan *Lanjut* empat
kali lalu *Simpan*, lima puluh kali sehari.

Dua kekurangan, dan keduanya nyata:

**a. Tidak ada jalan pintas untuk tiang yang memang normal.**
Di JTM sudah ada: satu ketukan "Tiang normal" mengisi seluruh formulir. Di JTR belum.

**b. Isian bawaannya terkunci di dalam kode aplikasi.**
`ISIAN_BAWAAN` ada di `src/types/jtr.types.ts` — konstanta, bukan data. Mengubah
"arde bawaan = Tidak Ada" berarti rilis OTA baru, dan yang boleh mengubahnya cuma
orang yang memegang repo, bukan orang yang tahu tiang di wilayahnya bentuknya apa.
Itu persis alasan yang ditulis di `jtm-pengaturan.sql` untuk memindahkan daftar
penghantar JTM ke tabel.

---

## 2. Perlakuannya sama persis dengan JTM

**Tidak ada satu pun bagian JTM yang tidak bisa dipakai di JTR.** Papan kendali,
petak yang diketuk untuk lompat, tautan pulang, halaman periksa, tombol sekali-ketuk,
halaman pengaturan bawaan di web — semuanya sama, dan itulah yang dirancang di bawah.

Yang berbeda cuma **tempat penyimpanannya di basis data**, dan perbedaan itu tidak
terlihat oleh siapa pun — tidak oleh petugas, tidak oleh admin:

| | JTM | JTR |
|---|---|---|
| Bentuk formulir | data-driven — `jtm_item_ref` + `jtm_opsi_ref` | kolom tetap di tabel `tiang` |
| Jawaban tersimpan di | `nilai_tiang_jtm` (satu baris per jawaban) | kolom `tiang.*` + tabel anak `tiang_konduktor` |
| Bawaan tersimpan di | `jtm_item_ref.nilai_bawaan` | `jtr_bawaan` (§3.1) |

Akibatnya cuma satu, dan cuma di dalam kode: **daftar field JTR tetap ditulis di
kode**, karena kolom tabelnya memang tetap — sedangkan JTM membacanya dari tabel.
Yang jadi data di JTR adalah **daftar pilihan** dan **jawaban bawaannya**, dan itu
sudah cukup untuk membuat halaman pengaturannya bekerja sama persis dengan JTM.

Membongkar `tiang` jadi bentuk data-driven seperti JTM tidak dikerjakan di sini —
itu berarti menulis ulang `keKolom()`/`keIsian()`, RPC `koreksi_tiang`, dan view
`inspeksi_jtr_temuan`, tanpa satu pun yang berubah di layar.

---

## 3. Rancangan

### 3.1 Basis data — dua tabel kecil

Skrip: `scripts/jtr-baik.sql`. Idempoten, dijalankan manual di Supabase SQL Editor
sesudah `jtr-penyapuan.sql`.

**a. `jtr_ref` — daftar pilihan yang hari ini masih hardcode**

Bentuknya sama persis dengan `jtm_ref` (kategori + kode + label + urutan + aktif),
ditambah satu kolom `normal`.

```sql
CREATE TABLE public.jtr_ref (
  kategori TEXT NOT NULL,   -- jenis_tiang | ukuran_tiang | kondisi_tiang |
                            -- jenis_kabel | ukuran_kabel | kondisi_kabel |
                            -- kondisi_aksesoris | kondisi_andongan |
                            -- kondisi_arde | kondisi_stay |
                            -- jenis_jamperan | kondisi_jamperan | rawan_row
  kode     TEXT NOT NULL,   -- TETAP; inilah yang tersimpan di kolom `tiang`
  label    TEXT NOT NULL,
  normal   BOOLEAN NOT NULL DEFAULT true,  -- false = jawaban ini sebuah temuan
  urutan   INT NOT NULL DEFAULT 100,
  aktif    BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (kategori, kode)
);
```

Isian awalnya persis `JENIS_TIANG`, `UKURAN_TIANG`, `KONDISI_TIANG`, … yang sekarang
ada di `src/types/jtr.types.ts` — supaya hari pertama tidak ada yang berubah bagi
petugas.

Kolom `normal` gunanya sama dengan `jtm_opsi_ref.normal`: menandai jawaban yang
sebenarnya sebuah temuan, supaya halaman pengaturan bisa memperingatkan admin yang
tanpa sadar menjadikan "Miring" sebagai bawaan. **Bukan** sumber kebenaran temuan —
itu tetap view `inspeksi_jtr_temuan` (lihat §6 catatan a).

**b. `jtr_bawaan` — jawaban yang dipasang tombol "Tiang baik"**

```sql
CREATE TABLE public.jtr_bawaan (
  field      TEXT PRIMARY KEY,   -- 'jenis' | 'tinggi' | 'kondisi' | 'aks_suspension' | …
  nilai      TEXT,               -- NULL = tidak diisi otomatis
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Satu baris per field, sama seperti `jtm_item_ref.nilai_bawaan` satu nilai per item.

**Global, bukan per-ULP — sudah diputuskan.** Sama dengan JTM. Kalau suatu saat
ternyata perlu dibedakan, tinggal tambah kolom `ulp TEXT NOT NULL DEFAULT '*'` dan
pindahkan primary key; pembacaannya jadi "baris ULP kalau ada, kalau tidak baris `*`".
Tidak perlu memindahkan data.

**c. Dua penjaga, meniru `jtm-normal.sql`**

Ini bukan hiasan. Satu salah ketik di halaman pengaturan akan mengisi ratusan tiang
dengan nilai yang tidak dikenal, dan salahnya baru ketahuan jauh dari tempat ia dibuat.

1. `BEFORE INSERT OR UPDATE ON jtr_bawaan` — nilainya wajib pilihan **aktif** milik
   kategori field itu; field berjenis angka wajib berupa angka.
2. `BEFORE DELETE ON jtr_ref` — menolak menghapus pilihan yang sedang dipakai sebagai
   bawaan. Kalau lolos, tombol "Tiang baik" diam-diam berhenti mengisi field itu dan
   tidak ada yang memberi tahu siapa pun.

RLS: `SELECT` untuk `authenticated`, tulis mengikuti pola tabel pengaturan lain.

---

### 3.2 Katalog field — dan yang sengaja TIDAK diberi bawaan

Dikelompokkan mengikuti lima langkah di `FormTiang.tsx`, supaya yang dilihat admin di
web susunannya sama dengan yang dilihat petugas di lapangan (prinsip yang sama dipakai
`useJtmItem.kelompok`).

| Langkah | Field | Kategori `jtr_ref` | Bawaan awal |
|---|---|---|---|
| 1. Tiang | `jenis` | `jenis_tiang` | Beton |
| | `tinggi` | `ukuran_tiang` | 9 |
| | `kondisi` | `kondisi_tiang` | Baik |
| | `underbuild_tm` | ya/tidak | tidak |
| 2. Konduktor | `konduktor_jenis` | `jenis_kabel` | LVTC |
| | `konduktor_ukuran` | `ukuran_kabel` | 3x70+50 |
| | `konduktor_kondisi` | `kondisi_kabel` | Baik |
| 3. Aksesoris & jamperan | `aks_suspension` | `kondisi_aksesoris` | Baik |
| | `aks_large_angle` | `kondisi_aksesoris` | Tidak Ada |
| | `aks_dead_end` | `kondisi_aksesoris` | Tidak Ada |
| | `jamperan_jenis` | `jenis_jamperan` | Tidak Ada |
| | `jamperan_kondisi` | `kondisi_jamperan` | Baik |
| 4. Andongan, arde, stay & ROW | `andongan` | `kondisi_andongan` | Baik |
| | `tarikan_sr` | angka | 0 |
| | `arde_kondisi` | `kondisi_arde` | Tidak Ada |
| | `stay_kondisi` | `kondisi_stay` | Tidak Ada TUI |

**Kolom "bawaan awal" di atas cuma titik mulai — semuanya bisa dikosongkan.**

Tiap field punya dua keadaan yang diatur dari web, sama persis dengan JTM:

| Setelan di web | Arti di lapangan |
|---|---|
| dipilih sebuah nilai | diisi otomatis dengan nilai itu |
| `— tidak diisi otomatis —` | **wajib dipilih petugas**; papan menyatakannya "belum diisi" dan *Simpan* ditahan |

Inilah jawaban untuk "jenis tiang dan kabel harus diisi manual": admin tinggal
mengosongkan bawaan kedua field itu, dan sejak saat itu tidak ada tiang yang bisa
tersimpan sebelum petugas benar-benar memilih jenisnya. Tidak perlu rilis aplikasi,
dan tidak perlu kolom audit apa pun — **penjaganya ada di setelan, bukan di catatan
sesudahnya.**

Warisan dari tiang sebelumnya tetap berlaku untuk field yang dikosongkan: jenis tiang
dipilih sekali di tiang pertama jurusan, lalu terbawa dengan jejak
`dibawa dari AM157-A3` yang sudah ada. Yang dihentikan adalah pengisian **otomatis
dari nilai tetap di kode** — bukan penerusan dari tiang yang barusan benar-benar
dilihat petugas.

**Yang sengaja di luar katalog — tidak boleh punya bawaan sama sekali:**

- **`arde_nilai_ohm`** — angka hasil **pengukuran**. Mengisinya otomatis berarti
  menuliskan hasil ukur yang tidak pernah diambil siapa pun. Alasan yang sama dipakai
  `jtm-normal.sql` untuk nomor peralatan dan nilai pentanahan.
- **`rawan_row`** — larik penghalang. Pohon di satu tiang tidak berarti ada pohon di
  tiang sebelahnya; bawaan yang benar adalah kosong, dan kosong tidak perlu diatur.
- **`catatan_perbaikan`** — teks bebas. Catatan yang terbawa akan menempel pada tiang
  yang tidak ada masalahnya.
- **`huluId` konduktor** — menyatakan hubungan satu tiang tertentu dengan tiang lain,
  bukan sifat jalur. Sudah benar tidak diwariskan hari ini (`isianBerikutnya`).
- **`stay_jenis`** — ada di tabel `tiang` tapi belum ditangkap `IsianTiang`. Di luar
  cakupan pekerjaan ini.

`arde_kondisi` bawaannya tetap **"Tidak Ada"**, bukan "Ada" — alasannya sudah ditulis
di `jtr.types.ts` dan masih berlaku: 95% tiang JTR memang tanpa arde, dan salah ke arah
"tidak ada" masih kelihatan sedangkan salah ke arah "ada" menyembunyikan masalah
keselamatan.

---

### 3.3 Interaksi dengan pewarisan — bagian yang paling mudah keliru

JTR sudah punya pewarisan antar tiang: `isianBerikutnya(sebelum)` membawa **spesifikasi**
(jenis, tinggi, jenis & ukuran kabel, underbuild) dari tiang sebelumnya dan
**mengembalikan kondisi ke normal**.

Aturannya, dan ini tidak boleh terbalik:

> **Pewarisan menang atas bawaan.** Bawaan dari basis data cuma menyemai **tiang
> pertama** satu jurusan. Sesudah ada tiang tersimpan, spesifikasi datang dari tiang
> sebelumnya — karena satu jalur memang seragam, dan itu tebakan yang lebih baik
> daripada rata-rata satu ULP.

Akibatnya di kode: `isianBerikutnya()` berubah tanda tangannya jadi
`isianBerikutnya(sebelum, bawaan)` — tetap fungsi murni, bawaan masuk sebagai argumen,
bukan dibaca dari modul.

Sama seperti `isiNormal` di JTM: **yang sudah diisi tidak pernah ditimpa.** Petugas
yang baru menandai sebuah temuan lalu menekan "Tiang baik" tidak sedang membatalkan
temuannya, dan nilai yang terbawa dari tiang sebelumnya juga tetap.

---

### 3.4 Aplikasi HP — persis model JTM

Tidak ada satu pun bagian model JTM yang tidak bisa dipakai di JTR. Bentuknya
disamakan seluruhnya dengan `FormTiangJtm.tsx`.

**Susunan halaman** — `daftarHalaman`, sama bentuknya dengan JTM:

```
halaman 0   PAPAN KENDALI               tombol "Tiang baik" + petak + catatan
halaman 1   Tiang
halaman 2   Konduktor
halaman 3   Aksesoris & jamperan
halaman 4   Andongan, arde, stay & ROW
halaman 5   PERIKSA & SIMPAN            baris per kelompok, ketuk untuk membetulkan
```

Halaman 1–4 adalah keempat langkah isian yang sudah ada sekarang; yang ditambahkan
papan di depan dan halaman periksa tetap di belakang — persis papan + kelompok +
ringkas milik JTM.

**Isian mulai KOSONG, seperti JTM.** Ini pasangan wajib dari tombolnya. Di JTM tidak
ada satu jawaban pun terisi sebelum petugas menekan "Tiang normal" atau mengisinya
sendiri — itulah yang membuat tombolnya bermakna dan yang membuat "belum diisi" di
petak berarti sesuatu. `ISIAN_BAWAAN` yang sekarang terisi otomatis dihapus perannya
sebagai isian awal; nilainya pindah ke `jtr_bawaan` dan baru masuk saat tombol
ditekan.

Warisan dari tiang sebelumnya (`isianBerikutnya`) **tetap berlaku** dan mengisi
spesifikasi lebih dulu — itu keunggulan JTR yang tidak dimiliki JTM, dan jejak
`dibawa dari AM157-A3` yang sudah ada membuatnya terlihat. Urutannya: warisan mengisi
dulu, tombol "Tiang baik" mengisi sisanya, dan keduanya tidak menimpa apa pun yang
sudah ada isinya.

**Papan kendali** — isinya sama dengan papan JTM:

```
┌────────────────────────────────────────┐
│ Disambung dari AM157-A3 · 38 m         │
├────────────────────────────────────────┤
│  ✓  Tiang baik                         │
│     isi 14 item sekaligus              │
├────────────────────────────────────────┤
│ Ada yang tidak normal? Ketuk bagiannya.│
├──────────────────────┬─────────────────┤
│ Tiang                │ Konduktor       │
│ normal               │ belum diisi     │
├──────────────────────┼─────────────────┤
│ Aksesoris & jamperan │ Andongan, arde… │
│ normal               │ 1 temuan        │
├──────────────────────┴─────────────────┤
│ Catatan …                              │
└────────────────────────────────────────┘
     [ Batal ]           [ Lanjut → ]
```

Petak dua kolom, sama dengan `s.pPetak` / `s.pPetakItem` JTM, dengan tiga keadaan
yang sama: `belum diisi` · `3/7` · `normal` · `n temuan`, dan warna perhatian untuk
yang bertemuan (`s.pPetakTemuan`).

**Tombol "Tiang baik"** — salinan `isiNormal` JTM, dengan aturan yang sama:
- hanya muncul kalau ada field yang punya bawaan (`bisaNormal > 0`), dan
  menyebutkan jumlahnya: "isi 14 item sekaligus";
- **tidak menimpa** yang sudah diisi petugas maupun yang terbawa dari tiang sebelumnya;
- field yang bawaannya dikosongkan admin **dilewati** — tetap "belum diisi", dan
  petugas harus membuka halamannya. Inilah jawaban untuk "jenis tiang dan kabel harus
  diisi manual" (§3.2).

**Tautan pulang** — tiap halaman 1–5 dapat `← Papan kendali` di baris judulnya, sama
seperti `s.pulang` JTM: halaman itu sering dicapai dengan melompat, jadi jalan
pulangnya harus sependek jalan berangkatnya.

**Tombol Simpan ada DI PAPAN juga**, persis `s.pSimpan` milik papan JTM — lengkap
dengan kotak catatan perbaikan dan baris penghalang ("3 isian belum dijawab · ketuk
petak yang bertanda di atas") tepat di atasnya. **Inilah yang membuat "sekali klik"
benar-benar sekali klik:** ketuk "Tiang baik", ketuk "Simpan tiang", selesai. Tanpa
tombol itu petugas harus menekan *Lanjut* lima kali untuk sampai ke tombol yang sama.

**Halaman "Periksa & simpan"** tetap ada di belakang — baris per kelompok, diketuk
untuk kembali membetulkan. Bahannya sudah ada di `FormTiang.tsx` (`BarisRingkas` +
keempat ringkasan); yang berubah cuma nomor halamannya dan sumbernya, kini satu
`ringkasKelompok` yang dipakai papan DAN halaman ini — satu perhitungan, dua tempat,
supaya keduanya tidak pernah mengatakan hal berbeda.

**Kaki halaman** — sama dengan JTM: `Batal`/`Kembali` di kiri, `Lanjut`/`Simpan tiang`
di kanan, dan tombol kanan baru jadi *Simpan* di halaman terakhir.

**Tombol di layar peta tidak berubah.** "Tambah tiang di posisi saya" tetap satu,
dan sekarang mendarat di papan.

**Lembar "ubah tiang" ikut berubah**, karena `FormTiang` dipakai bersama. Untuk lembar
ubah malah lebih terasa: membetulkan satu ukuran kabel yang salah ketik jadi ketuk
petak → betulkan → simpan, bukan empat kali *Lanjut*.

**Luring.** Penyapuan JTR jalan di tempat tanpa sinyal — sudah ada antrean
(`bacaAntrean`) dan draf (`bacaDraf`). Karena itu:
- bawaan dan daftar pilihan diambil sekali saat layar dimuat, lalu disimpan di
  AsyncStorage;
- kalau pengambilan gagal **dan** belum ada simpanan, dipakai konstanta di
  `jtr.types.ts` sebagai jaring pengaman. Konstanta itu **tidak dihapus** — berubah
  peran jadi cadangan, dan komentarnya diperbarui supaya perannya jelas.

**Draf lama.** `bacaDraf` menyimpan nomor halaman, dan penomorannya bergeser satu.
Tidak merusak apa pun — `kini` sudah dijaga di dalam rentang — dan draf yang
tertinggal paling lama semalam. Cukup disebut, tidak perlu migrasi.

---

### 3.5 Web — tab "Tiang Baik" di `/admin/jtr`

Meniru `app/admin/jtm/_components/TiangNormal.tsx` hampir baris per baris.

`app/admin/jtr/page.tsx` — tambah satu tab di `TABS`:

```ts
{ key: "baik", label: "Tiang Baik", icon: CheckCheck },
```

`app/admin/jtr/_components/TiangBaik.tsx`:
- Kartu kepala: penjelasan singkat + pencacah "Terisi X dari Y item".
- Satu kartu per langkah formulir (Tiang / Konduktor / Aksesoris & jamperan /
  Andongan, arde, stay & ROW).
- Tiap baris: nama field · dropdown pilihan dari `jtr_ref` · opsi
  `— tidak diisi otomatis —`.
- Lencana kuning **"bawaannya sebuah temuan"** kalau pilihan yang dipilih punya
  `normal = false`. Memilihnya sah — jaringan yang memang seluruhnya berkonstruksi
  lama, misalnya — tapi harus terlihat, bukan tersembunyi di balik dropdown tertutup.
- Kalimat pembeda yang sama dengan JTM, karena kebingungannya juga sama:
  *"Ini bukan penanda 'bukan temuan'. Satu field boleh punya banyak jawaban yang
  sama-sama normal. Yang disetel di sini adalah mana yang paling sering benar."*

`app/admin/jtr/_hooks/useJtrBawaan.ts`:
- Membaca `jtr_ref` + `jtr_bawaan` sekali, menyusunnya per kelompok.
- `setBawaan(field, nilai)` — **tulis ke layar dulu, baru ke server** (pola
  `useJtmItem.setBawaan`); kalau server menolak, pesan penjaganya diteruskan apa adanya
  dan layar dikembalikan ke keadaan sebenarnya.
- Pesan galat khusus kalau tabelnya belum ada: *"jalankan scripts/jtr-baik.sql di
  Supabase"* — sama seperti `useJtmItem` menuntun ke `jtm-normal.sql`.

**Hak akses:** setelan ini global dan memengaruhi semua ULP, jadi tabnya dibatasi
`canManageSettings(user.role)` (UP3 + admin). JTM belum dibatasi — itu kekurangan JTM,
bukan alasan mengulanginya.

---

### 3.6 Web — tab "Pengaturan" (fase berikutnya)

Meniru `PengaturanJtm.tsx`: tambah / ubah label / atur urutan / nonaktifkan pilihan di
`jtr_ref`, dengan penanda `normal` per pilihan.

Sengaja **dipisah jadi fase tersendiri**. Fase 1 sudah berguna penuh tanpa ini: tabelnya
tersemai dari konstanta yang ada, web tinggal membacanya. Menambah pilihan baru baru
jadi kebutuhan begitu ada jenis kabel atau penghalang ROW yang belum terdaftar.

---

## 4. Urutan kerja

| Fase | Isi | Hasil yang bisa dilihat |
|---|---|---|
| **1** | `scripts/jtr-baik.sql` — dua tabel, dua penjaga, isian awal dari konstanta | Data siap; belum ada yang berubah bagi siapa pun |
| **2** | Web: tab "Tiang Baik" + `useJtrBawaan` | Admin bisa menyetel bawaan; HP belum membacanya |
| **3** | HP: papan kendali halaman 0, halaman "Periksa & simpan" di belakang, tautan `← Papan kendali`, petak per kelompok | Bentuk JTM sudah terpasang; isian masih dari konstanta |
| **4** | HP: isian mulai kosong, tombol "Tiang baik" (`isiNormal`), `getRefJtr()` + `getBawaanJtr()` + simpanan AsyncStorage | **Sekali ketuk, dan setelan web sampai ke lapangan tanpa rilis** |
| **5** | Web: tab "Pengaturan" untuk `jtr_ref` | Daftar pilihan bisa ditambah sendiri |

Fase 1–2 tidak mengubah apa pun di HP, jadi aman dipasang lebih dulu. Fase 3–4
butuh publikasi OTA (`ota-publish-mobile.md`) dan sebaiknya terbit sekaligus —
fase 3 sendirian akan membuat petugas melewati papan yang semua petaknya sudah
"normal" tanpa pernah ada yang menyatakannya.

---

## 5. Berkas yang disentuh

**Baru — `smart-mataram-next`:**
```
scripts/jtr-baik.sql
app/admin/jtr/_components/TiangBaik.tsx
app/admin/jtr/_hooks/useJtrBawaan.ts
app/admin/jtr/_components/PengaturanJtr.tsx      (fase 5)
app/admin/jtr/_hooks/useJtrRef.ts                (fase 5)
```

**Diubah — `smart-mataram-next`:**
```
app/admin/jtr/page.tsx                — 1–2 tab baru
```

**Diubah — `new-smart` (HP):**
```
src/components/FormTiang.tsx          — INTI PEKERJAAN. JUDUL_LANGKAH → daftarHalaman
                                        (papan + 4 kelompok + ringkas); papan kendali +
                                        petak 2 kolom; tombol "Tiang baik" (isiNormal);
                                        tautan "← Papan kendali"; ringkasKelompok dipakai
                                        di papan DAN ringkas; daftar pilihan dari props;
                                        jejak `bawaan`
src/types/jtr.types.ts                — ISIAN_BAWAAN jadi cadangan (bukan lagi isian awal);
                                        isianBerikutnya(sebelum) tetap, tidak perlu bawaan
src/services/jtrService.ts            — getRefJtr() + getBawaanJtr() + simpanan AsyncStorage
src/screens/JtrPenyapuanScreen.tsx    — isian awal kosong; muat ref & bawaan lalu
                                        teruskan ke FormTiang. Tombol kaki TIDAK berubah
```

---

## 6. Catatan dan risiko

**a. View temuan tetap hardcode.** `inspeksi_jtr_temuan` menyebut `kondisi <> 'Baik'`,
`andongan <> 'Baik'`, `arde_kondisi = 'Putus'` langsung di SQL. Menambah pilihan baru
lewat `jtr_ref` **umumnya tetap benar** — pilihan kondisi tiang baru apa pun akan
terhitung temuan karena bukan 'Baik'. Yang bisa meleset: pilihan baru pada
`kondisi_arde` (view hanya mengenali 'Putus'). Kalau nanti ada, view-nya perlu diubah
menyusul `jtr_ref.normal`. Disebut di sini supaya tidak jadi kejutan; tidak dikerjakan
sekarang karena belum ada pilihan barunya.

**b. Tiang lama tidak ikut berubah.** Menyetel bawaan hanya memengaruhi tiang yang
dicatat **sesudahnya**. Tidak ada penulisan ulang atas data yang sudah ada — dan itu
memang yang benar.

**c. Keputusan — semuanya sudah terkunci** *(18 Sep 2026)*

1. **Perlakuannya sama persis dengan inspeksi JTM.** Papan kendali, petak dua kolom,
   tautan pulang, halaman "Periksa & simpan", tombol sekali-ketuk, isian mulai kosong,
   halaman pengaturan bawaan. Tidak ada bagian JTM yang ditinggalkan, dan tidak ada
   bentuk lain yang diusulkan. ✅
2. **Bawaan global**, sama dengan JTM. ✅
3. **Field yang wajib diisi manual** — mis. jenis tiang dan jenis/ukuran kabel —
   diatur dengan mengosongkan bawaannya di web. Tombol "Tiang baik" melewatinya,
   petaknya tetap "belum diisi", dan petugas harus membukanya sendiri. ✅
4. **Tidak ada kolom audit `tiang.diisi_cepat`.** Penjaganya ada di setelan, bukan di
   catatan sesudahnya. ✅

Tidak ada lagi yang menunggu jawaban. Rencana ini siap dikerjakan begitu Anda
mengatakan mulai.
