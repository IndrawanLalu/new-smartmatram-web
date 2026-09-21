# Rencana — Master Data: Gardu, Penyulang, Segmen

Status: **rancangan, belum dikerjakan.** Menunggu aba-aba mulai.
Tanggal: 21 September 2026

## Keputusan terkunci (21 Sep 2026)

1. **Tiga master dikumpulkan jadi satu grup** di sidebar.
2. **Gardu, JTM, dan Segmen harus terkait.** Penyulang di gardu tidak boleh
   berbeda dari master; segmen juga.
3. **Nama penyulang BOLEH diganti**, dan semua yang mengikutinya ikut terganti.
   ⚠ Ini **membatalkan** keputusan 21 Sep pagi yang melarang penggantian nama.
   Alasan pembatalannya kuat: tanpa itu, data yang salah sejak awal tidak akan
   pernah bisa dibetulkan — dan kita sudah menemukan bahwa memang ada.
4. **Impor segmen: pilih penyulang dulu.** Kalau belum ada, harus dimasukkan ke
   master penyulang lebih dahulu.
5. **Master Segmen adalah sumber WO** — untuk inspeksi JTM berikutnya maupun
   perabasan.

---

## 1. Kenapa ini mendesak: tiga keretakan yang sudah ada

### a. Master penyulang bolong — 22 penyulang, 704 gardu

| Penyulang | ULP | Gardu |
|---|---|---|
| MVTIC 3G | TANJUNG | 101 |
| DASAN CERMEN | CAKRANEGARA | 87 |
| TANJUNG | TANJUNG | 86 |
| HILBERON | TANJUNG | 85 |
| AIRLANGGA | AMPENAN | 59 |
| DASAN AGUNG | AMPENAN | 53 |
| … 16 lagi | | 280 |

Selama ini bolong, impor segmen akan ditolak untuk 22 penyulang itu — dan
gardunya tidak punya induk yang sah.

### b. Satu penyulang tercatat di dua ULP

`HILBERON` (TANJUNG 85 + AMPENAN 29), `KOPANG`, `PRAYA`, `TANJUNG`. Disepakati:
**itu kesalahan sejak awal**, dibetulkan lewat penggantian nama di master.

### c. ⚠ `inspeksi_pohon.penyulang` sebagian besar BUKAN penyulang

Dari 182 nilai berbeda, **131 adalah nama keypoint** — `REC. PUSKESMAS
KAYANGAN` (287 baris), `LBSM GH MENO 1` (378), `FCO KOPANG 1` (82), dan
seterusnya. Totalnya **3.224 dari 5.691 baris (57%)**.

Kolom itu dipakai mencatat *ruas mana*, bukan *penyulang mana*.

**`inspeksi_pohon` DILUAR CAKUPAN** — disepakati 21 Sep 2026, digarap sebagai
fitur tersendiri nanti. Tidak diikat, tidak dibersihkan, tidak disentuh.

Satu hal yang perlu dicatat untuk saat itu tiba: isinya justru **lebih berharga
dari yang terlihat**. Keypoint adalah batas segmen — saat segmen dibentuk
sebagai "REC. A – REC. B", baris pohon berlabel "REC. B" hampir pasti milik ruas
itu. Jadi jangan dibersihkan lebih dulu; kolom itu satu-satunya keterangan ruas
yang dimiliki 3.224 baris tersebut.

---

## 2. Mengikat ketiganya

Kunci asing **dengan `ON UPDATE CASCADE`** — bukan penjaga buatan sendiri.

```sql
ALTER TABLE gardu  ADD CONSTRAINT gardu_feeder_fk
  FOREIGN KEY (feeder)    REFERENCES penyulang_ref(penyulang) ON UPDATE CASCADE;
ALTER TABLE tiang  ADD CONSTRAINT tiang_penyulang_fk
  FOREIGN KEY (penyulang) REFERENCES penyulang_ref(penyulang) ON UPDATE CASCADE;
ALTER TABLE segmen ADD CONSTRAINT segmen_penyulang_fk
  FOREIGN KEY (penyulang) REFERENCES penyulang_ref(penyulang) ON UPDATE CASCADE;
```

**`ON UPDATE CASCADE` itulah yang membuat penggantian nama bekerja.** Satu
`UPDATE penyulang_ref SET penyulang = …` dan Postgres sendiri yang merambat ke
setiap anaknya — tidak ada daftar tabel yang harus diingat, tidak ada yang bisa
terlewat, dan tabel baru yang memasang kunci asing ini otomatis ikut terurus.

Menulis sepuluh `UPDATE` dengan tangan akan bekerja hari ini dan gagal diam-diam
pada tabel kesebelas yang dibuat enam bulan lagi.

### 2.1 Yang ikut diganti tapi TIDAK bisa dipasangi kunci asing

Empat tabel memikul nama penyulang sebagai teks lepas dan isinya belum tentu
sah. Ini digarap **penggantian nama secara eksplisit**, dan daftarnya ditulis di
badan fungsinya supaya terlihat:

| Tabel | Baris | Kenapa tanpa kunci asing |
|---|---|---|
| `inspeksi` | 2.466 | warisan, belum diperiksa kesahihannya |
| `ml_outage_events` | 2.091 | diisi pipeline ML dari sumber luar |
| `daily_feeder_risk` | 5.740 | keluaran ML, dibangun ulang tiap hari |

`inspeksi_pohon` (5.308 baris) **tidak ikut sama sekali** — di luar cakupan.
Nama penyulang di situ akan tertinggal memakai nama lama sesudah penggantian.
Itu disengaja dan harus diingat saat fitur pohonnya digarap nanti.

### 2.2 Yang TIDAK ikut berubah saat nama diganti

**Kode tiang.** Nama tiang mengikuti `kode_singkat` (MTR-014), bukan nama
penyulang. Mengganti "MATARAM" jadi "MATARAM 1" **tidak** menyentuh satu pun
nama tiang. Kalau prefiksnya juga mau diganti, itu tindakan terpisah lewat
`ubah_kode_singkat_penyulang` yang sudah ada — dan tindakan itulah yang menomori
ulang tiang.

Dua hal yang tampak mirip padahal berbeda jauh akibatnya; di layar keduanya
harus dipisah jelas, jangan jadi satu tombol.

---

## 3. Master Penyulang — yang ditambahkan

Tab **Penyulang** yang sudah ada (21 Sep) dipindah jadi menu tersendiri, plus:

- **Ganti nama penyulang — SELALU dilingkupi satu ULP** (§7). Pratinjaunya
  menyebut apa yang berubah dan apa yang tidak, dihitung sebelum tombolnya
  ditekan, bukan dilaporkan sesudahnya.
- **Tambah penyulang** (sudah ada) — dipakai melengkapi 22 yang bolong.
- **Kolom "gardu"** — berapa gardu yang memakai penyulang ini.
- **Penanda ⚠ "memasok gardu di ULP lain"** — inilah yang membuat empat kasus
  §1b terlihat sendiri tanpa perlu diingat.

---

## 4. Master Segmen — menu baru

### 4.1 Isi tabelnya

| Kolom | Dari mana |
|---|---|
| Penyulang · Nama segmen | `segmen` |
| **Sumber** — 🔵 lapangan / ⚪ impor | `segmen.sumber`, **sudah ada** |
| Panjang km + penanda ✎ kalau ketikan | `segmen_panjang` / `panjang_manual_km` |
| Jumlah tiang | `segmen_panjang` |
| **Terakhir diinspeksi** · umur bulan | `inspeksi_jtm` status Diverifikasi |
| **Terakhir dirabas** · umur bulan | realisasi perabasan (modul berikutnya) |

Dikelompokkan per penyulang, disaring per ULP.

**Umur bulan itulah gunanya master ini**: yang paling lama tidak disentuh naik
sendiri ke atas, dan WO berikutnya tinggal mencentang dari situ — bukan
diingat-ingat orang.

### 4.2 Impor segmen

Tempel dari Excel, sepola `ImporTiang`:

```
Penyulang  |  Nama segmen             |  Panjang (km)
GUNUNG SARI|  GI AMPENAN – REC.BRIMOB |  2,03
```

- **Penyulang dipilih dulu dari daftar master** — bukan diketik. Yang belum ada
  tidak bisa dipilih, dan pesannya menunjuk ke Master Penyulang.
- Baris masuk dengan `sumber = 'impor'`, panjang jadi `panjang_manual_km`.
- Segmen yang lahir dari inspeksi JTM tetap `sumber = 'lapangan'` dan panjangnya
  dihitung dari tiang — **impor tidak pernah menimpa yang lahir dari lapangan.**

### 4.3 Nilai `sumber` ditegaskan

Sekarang isinya `manual` dan `lapangan`. Ditambah `impor`, dan `manual`
dipertahankan apa adanya — dua baris lama memakainya, dan menulis ulang nilai
lama demi kerapian adalah persis yang kita larang di tempat lain.

---

## 5. Letak menu

```
Analitik
  Dashboard · Advanced · SMART Learning · Efektivitas Inspeksi

▸ MASTER DATA                    ← grup baru
    Master Gardu                 (pindah dari Monitoring)
    Master Penyulang             (keluar dari tab JTM)
    Master Segmen                (baru)

Monitoring
  Monitoring Inspeksi · Pengukuran Gardu · Command Center
  Peta Aset · Peta Jaringan
  Inspeksi JTR · Jaringan JTM · Pemeliharaan Gardu

Operasional
  Work Order · Morning Brief · …
```

Tab **Segmen** di dalam Jaringan JTM tetap — yang itu alat kerja JTM (merintis,
menggabung). Master Segmen adalah daftar acuan yang melayani JTM **dan**
perabasan; menaruhnya di dalam JTM menyembunyikannya dari regu rabas.

---

## 6. Urutan kerja

| Fase | Isi | Butuh | Keadaan |
|---|---|---|---|
| **1** | Web: grup Master Data + Master Penyulang jadi menu; kolom gardu, penanda ULP silang, daftar yang belum terdaftar | `master-penyulang.sql` + deploy | **selesai** 21 Sep |
| **2** | SQL: `ganti_nama_penyulang()` — dilingkupi satu ULP, memisah kalau perlu | SQL Editor | **selesai** 21 Sep · diuji 14 skenario di PostgreSQL 17 lokal |
| **3** | Web: layar ganti nama + pratinjau per ULP | deploy | |
| **4** | Lengkapi 22 penyulang yang bolong, betulkan 4 nama ULP silang | **kerja Bapak**, lewat layar | |
| **5** | SQL: kunci asing `ON UPDATE CASCADE` ke `penyulang_ref` | SQL Editor | |
| **6** | SQL + Web: Master Segmen + impor segmen | SQL + deploy | |
| **7** | WO Perabasan di atas Master Segmen (`rencana-wo-perabasan.md`) | SQL + deploy + OTA | |

⚠ **Urutannya berubah 21 Sep.** Semula Fase 2 adalah "betulkan 4 nama ULP
silang", padahal alat penggantinya baru lahir di fase sesudahnya. Membetulkan
nama tanpa fungsi itu berarti UPDATE tangan di SQL Editor pada empat tabel —
persis yang ingin dihindari. Jadi fungsinya dibuat lebih dulu, baru dipakai.

**Fase 5 tidak bisa mendahului Fase 4.** Kunci asing akan menolak terbentuk
selama masih ada 704 gardu yang penyulangnya tidak dikenal. Itu bukan
penghalang — itu justru alasan kunci asingnya dipasang.

**Grup Master Data dibuat di Fase 1, bukan di fase belakangan.** Master Gardu
ikut pindah sekarang supaya tidak dua kali berpindah tempat — menu yang
berpindah dua kali membuat orang berhenti percaya letaknya.

---

## 7. Ganti nama penyulang — selalu dilingkupi satu ULP

**Admin ULP boleh** — disepakati 21 Sep 2026. UP3 semua penyulang, admin ULP
hanya unitnya sendiri.

### 7.1 ⚠ Koreksi rancangan: penggantian TIDAK merambat ke ULP lain

Rancangan saya sebelumnya keliru. Saya mengira satu nama penyulang = satu
penyulang fisik, jadi menggantinya harus merambat ke mana-mana. Bapak
membetulkan: `HILBERON` di TANJUNG dan `HILBERON` di AMPENAN itu **dua
penyulang berbeda yang kebetulan bernama sama** — kesalahan sejak awal. TANJUNG
yang menggantinya jadi "TANJUNG KOTA" tidak boleh menyentuh punya AMPENAN.

Jadi tindakannya selalu berbunyi **"ganti nama X di ULP Y"**, bukan "ganti nama
X". Dan hasilnya dua macam, ditentukan data — bukan dipilih pemakai:

| Keadaan | Yang terjadi |
|---|---|
| Nama itu cuma dipakai di ULP yang menggantinya | **Ganti nama biasa.** Baris masternya berganti nama, `ON UPDATE CASCADE` merambat ke seluruh anaknya. Riwayat dan identitasnya utuh. |
| Nama itu juga dipakai ULP lain | **Pisah.** Baris master BARU dibuat untuk ULP penggantinya; hanya baris milik ULP itu yang berpindah. Nama lama tetap hidup memikul sisanya. |

Pemisahan dikerjakan begini — urutannya penting, induk baru harus ada lebih
dulu supaya kunci asingnya tidak menolak:

```sql
INSERT INTO penyulang_ref (penyulang, ulp) VALUES (baru, ulp_ini);
UPDATE gardu  SET feeder    = baru WHERE feeder    = lama AND ulp = ulp_ini;
UPDATE tiang  SET penyulang = baru WHERE penyulang = lama AND ulp = ulp_ini;
UPDATE segmen SET penyulang = baru WHERE penyulang = lama AND ulp = ulp_ini;
```

Ketiga tabel itu punya kolom `ulp` sendiri, jadi pelingkupannya tepat. Tanpa
kolom itu pemisahan mustahil — dan itulah sebabnya tabel yang tidak punya `ulp`
tidak ikut dipisah.

### 7.2 ⚠ KOREKSI: ada 11 nama silang ULP, bukan 4

Diperiksa ulang 21 Sep 2026 sebelum menulis fungsinya. Angka "4" di bagian lain
berkas ini **salah** — itu cuma yang kebetulan ikut terlihat.

Keempat yang disebut semula ternyata **belum terdaftar di master sama sekali**,
sehingga tidak muncul di `penyulang_pakai`. Tujuh lainnya sudah terdaftar dan
belum pernah terlihat dari layar mana pun:

| Nama | Terdaftar? | Sebaran gardu | Tiang/segmen |
|---|---|---|---|
| HILBERON | tidak | TANJUNG 85 · AMPENAN 29 | — |
| TANJUNG | tidak | TANJUNG 86 · AMPENAN 6 | — |
| PRAYA | tidak | CAKRANEGARA 43 · GERUNG 17 | — |
| KOPANG | tidak | CAKRANEGARA 25 · AMPENAN 10 | — |
| CEMARA | ya (AMPENAN) | CAKRANEGARA 73 · AMPENAN 53 | — |
| GERUNG | ya (GERUNG) | GERUNG 90 · CAKRANEGARA 31 | — |
| MATARAM | ya (AMPENAN) | AMPENAN 41 · CAKRANEGARA 24 | — |
| PAGUTAN | ya (AMPENAN) | AMPENAN 170 · CAKRANEGARA 6 | — |
| BUNG KARNO | ya (AMPENAN) | AMPENAN 23 · CAKRANEGARA 5 | — |
| CAKRA KOTA | ya (CAKRANEGARA) | CAKRANEGARA 83 · **AMPENAN 1** | 1 tiang · 1 segmen |
| LEMBAR | ya (GERUNG) | GERUNG 42 · **CAKRANEGARA 1** | — |

**Tiga baris terakhir kemungkinan bukan kasus yang sama.** Satu gardu nyasar di
ULP sebelah lebih mungkin berarti **ULP gardu itu yang salah ketik**, bukan ada
penyulang kedua bernama sama. Memisahkannya justru melahirkan penyulang palsu
berisi satu gardu. Yang bisa membedakan cuma orang yang tahu jaringannya —
datanya tidak bisa.

Jadi urutannya: betulkan dulu ULP gardu yang nyasar (lewat Master Gardu), baru
sisanya dipisah sebagai penyulang senama yang sungguhan.

### 7.2b ⚠ KOREKSI: nama penyulang hidup di 19 kolom, bukan 3

Bagian 7.1 menyebut `gardu`, `tiang`, dan `segmen`. Diperiksa langsung ke basis
data: ada **19 kolom di 18 tabel**. Tiga belas ikut berganti nama, enam sengaja
tidak. Daftarnya beserta alasan satu per satu ada di fungsi
`penyulang_ikut()` — bukan tertanam di badan fungsi penggantinya, supaya bisa
ditinjau orang dan tabel ke-19 tahun depan tidak diam-diam tertinggal.

Yang **tidak** ikut, beserta sebabnya: `inspeksi_pohon` (di luar cakupan),
`padam_apkt` dan `ml_outage_events` (dokumen dari sumber luar; impor berikutnya
menulis nama lama lagi), `daily_feeder_risk` (keluaran model, ditulis ulang tiap
malam), `gangguan_realtime` (salinan pesan dispatcher), `jalur` (gambar peta
warisan).

`pengukuran_gardu` ikut, tapi tabelnya **tidak punya kolom ULP** — jadi pada
pemisahan barisnya tidak bisa dilingkupi dan sengaja dibiarkan memakai nama
lama. Pratinjau menyebutkannya sebagai "tidak terlingkup", bukan
menyembunyikannya.

### 7.2c ⚠ BUG: satu nama tidak bisa didaftarkan dua ULP

`penyulang_ref.penyulang` itu primary key. Artinya TANJUNG dan AMPENAN **tidak
mungkin** sama-sama punya baris `HILBERON` — salah satunya harus ganti nama
lebih dulu.

`simpan_penyulang` versi lama tidak tahu itu: diberi nama yang sudah ada dengan
ULP berbeda, dia **diam-diam memindahkan baris masternya**. Lewat tombol
"Masukkan ke master" di Fase 1 akibatnya nyata — menekan HILBERON/TANJUNG lalu
HILBERON/AMPENAN tidak menghasilkan dua penyulang; yang kedua merebut baris yang
pertama, dan 85 gardu TANJUNG berinduk ke AMPENAN tanpa satu pun pesan.

Sudah ditutup di `ganti-nama-penyulang.sql` bagian 7, dengan pesan yang menyebut
jalan keluarnya.

### 7.3 Pratinjau wajib menyebut yang TIDAK berubah

```
HILBERON → TANJUNG KOTA        (ULP TANJUNG)

  Berubah           TANJUNG     85 gardu · 0 tiang · 0 segmen
  TIDAK berubah     AMPENAN     29 gardu tetap memakai HILBERON
  ──────────────────────────────────────────────────────────────
  Karena nama ini juga dipakai ULP lain, penyulang BARU dibuat
  untuk TANJUNG. Berlaku seketika; tidak ada tombol pengembali.
```

Baris "TIDAK berubah" itu yang paling penting di layar ini. Tanpanya, admin
TANJUNG mengira sudah membetulkan seluruh kekeliruan — padahal separuhnya masih
berdiri di ULP sebelah.

### 7.4 Prefiks penyulang baru

Penyulang hasil pemisahan mendapat `kode_singkat` sendiri, dibuat sistem dari
namanya. Karena keempat kasus di atas belum punya satu tiang pun, **tidak ada
nama tiang yang ikut berubah**. Kalau kelak pemisahan dilakukan pada penyulang
yang sudah bertiang, penomoran ulangnya tindakan terpisah lewat
`ubah_kode_singkat_penyulang` — dan itu harus disebut di layar, bukan terjadi
diam-diam.

Nama lama, nama baru, ULP, dan jumlah baris yang berpindah tercatat di
`master_audit`. Itu satu-satunya jalan pulang, jadi jangan sampai tidak tercatat.
