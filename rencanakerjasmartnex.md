# Rencana Kerja SMART Mataram

> Dokumen rujukan jangka panjang. Disusun 7 September 2026.
> Setiap tahap bernomor supaya bisa dirujuk langsung ("kerjakan 1.2").
>
> **Revisi 7 Sep 2026:** Inspeksi JTR dinaikkan dari Fase 3 ke **Fase 1** atas arahan
> pemilik pekerjaan. Alasannya: JTR satu-satunya pekerjaan yang masih dikerjakan di
> aplikasi lain, jadi paling mahal dibiarkan, sekaligus bentuk pekerjaan yang belum pernah
> dibuat di SMART (berbasis peta dan koordinat).

---

## Tujuan program

Satu kalimat dari pemilik pekerjaan:

> *"Tidak ada yang benar. Yang dianggap benar nanti adalah inputan dari lapangan yang
> diverifikasi oleh admin. Tujuan saya membuat ini adalah itu: memperbaiki data master
> dengan data real lapangan."*

SMART bukan alat pencatat pekerjaan. SMART adalah **mesin yang membersihkan data master
lewat pekerjaan sehari-hari**. Pencatatan pekerjaan adalah caranya, bukan tujuannya.

### Ukuran keberhasilan utama

**Persentase master yang dikonfirmasi lapangan dalam 12 bulan terakhir.**

Posisi awal gardu (7 Sep 2026): **51%** — 1.247 dari 2.536 gardu belum pernah dilihat
petugas sama sekali. Yang pernah pun median 46 hari lalu, terlama 166 hari.

Posisi awal tiang JTR: **0%** — tabel `tiang` masih kosong sama sekali.

Angka inilah yang harus naik. Semua fitur di bawah dinilai dari sumbangannya ke angka itu.

---

## Aturan yang berlaku di semua tahap

Keputusan yang sudah dikunci. Bukan bahan negosiasi ulang di tengah jalan.

1. **Master tunggal di SMART.** Spreadsheet dipensiunkan. AMG hanya tujuan keluaran,
   bukan sumber kebenaran.
2. **Master yang ada sekarang = garis dasar.** Bukan karena benar, tapi karena harus ada
   titik awal. Lapangan yang mengoreksinya kemudian.
3. **Tidak ada rekonsiliasi massal.** Selisih 411 kVA dan 1.361 penyulang tidak diperbaiki
   borongan. Itu muatan kerja pertama dari fiturnya, bukan utang yang harus dilunasi dulu.
4. **Koreksi master adalah LAPISAN, bukan modul.** Muncul di semua pekerjaan yang menyentuh
   aset, kapan pun data pekerjaan berbeda dari master.
5. **Selisih tersaji inline di layar approval pekerjaan**, bukan di antrean terpisah. Admin
   memutuskan pekerjaan dan koreksi master dalam satu tarikan.
6. **Admin boleh mengubah master langsung**, tapi semua tercatat di audit trail.
7. **Usulan lahir sendiri dari pekerjaan**, tidak ada form "usulan perubahan" terpisah.
   Apa pun yang harus diisi manual akan terlupa diisi.
8. **Satu ketukan pemisah** di HP saat selisih terdeteksi: "baca dari papan nama" atau
   "salah ketik". Ini yang mengubah kebisingan jadi bukti, dan menyelamatkan admin dari
   tenggelam memverifikasi salah ketik.
9. **Bukti melekat**: foto, GPS, siapa, kapan. Admin memutuskan dengan melihat.
10. **Angka turunan jangan pernah diketik.** Panjang, jumlah, realisasi — diturunkan dari
    datanya, bukan diisi orang. Angka yang diketik selalu ketinggalan dari lapangan.
11. **Aplikasi mobile sudah produksi di Play Store.** Semua perubahan bersifat aditif,
    dirilis lewat OTA, dan push OTA dilakukan sendiri oleh pemilik pekerjaan.

---

## Peta pekerjaan unit vs keadaan sekarang

| Pekerjaan | Keadaan 7 Sep 2026 | Tahap |
|---|---|---|
| **Inspeksi JTR** | **Belum ada — masih di aplikasi lain** | **1** |
| Pengukuran gardu | Live web+mobile, 1.732 pengukuran, **tanpa tahap approval** | 2.1 |
| Penyeimbangan beban | Live web+mobile | 2.4 |
| Optimasi trafo | Hanya label `jenis_pemeliharaan`, datanya tidak ada | 3.2 |
| Pemeliharaan gardu (HARGARDU) | Belum ada | 3.1 |
| Inspeksi gardu | Belum ada | 3.3 |
| Inspeksi JTM tier 1 & 2 | Live, tapi kolom penyulang bermasalah | 4.2 |
| Perabasan | Live | 4.4 |
| Pemeliharaan jaringan | Hanya lewat WO kolom bebas | 4.3 |

---

# FASE 0 — Fondasi

**Kenapa duluan:** setiap modul yang dibangun sebelum fondasi ini ada harus dibongkar lagi
nanti untuk disambungkan. Mengerjakan fondasi belakangan berarti mengerjakan modulnya dua
kali.

**Tidak ada tampilan baru untuk pengguna di fase ini.**

### 0.1 Lapisan koreksi master
- Tabel `master_usulan` — entitas, id, field, nilai master, nilai lapangan, bukti (foto +
  GPS), asal (modul + id record), pengusul, status, penilai, alasan.
- Fungsi pendeteksi selisih — murni, tanpa efek samping, dipakai semua modul.
- Blok UI "Beda dari master" — satu komponen, disisipkan ke layar approval mana pun. Tidak
  muncul sama sekali kalau tidak ada selisih.
- Penerapan ke master dilakukan **trigger di database**, bukan aplikasi.
- Usulan menumpuk, tidak saling menimpa: tiga petugas yang sama-sama bilang 160 adalah bukti
  yang jauh lebih kuat daripada satu orang.
- **Wajib mendukung SIKLUS HIDUP aset, bukan cuma perubahan nilai field.** Karena JTR naik
  ke Fase 1, lapisan ini harus sejak awal bisa menangani tiga jenis usulan:
  **ubah nilai · aset baru lahir · aset dinonaktifkan (dibongkar/diganti).**
  Ini sedikit memperbesar Fase 0, tapi jauh lebih murah daripada menambalnya belakangan.

### 0.2 Audit trail
- Tabel `master_audit` — semua perubahan master, termasuk edit langsung oleh admin.
- Tidak bisa dihapus atau disunting.

### 0.3 Asal-usul per field
- Kolom JSONB di master: tiap field mencatat nilai, siapa, kapan terakhir dikonfirmasi
  lapangan. Satu kolom, bukan tabel baru per field.
- Inilah yang membuat ukuran keberhasilan utama bisa dihitung.

### 0.4 Penegakan wewenang
- Jalankan `scripts/work-order-rls.sql` yang sudah lama dibuat tapi ditahan. **Perlu uji di
  luar jam kerja** — mengikat aplikasi mobile produksi.
- Identitas penyetuju diambil dari `auth.uid()` di sisi server, **bukan teks kiriman klien**
  seperti sekarang. Saat ini `approved_by` bisa ditulis siapa saja.
- RLS per unit menggantikan `USING(true)`.

### 0.5 Katalog pekerjaan jadi master
- 13 jenis pekerjaan sekarang konstanta di dalam kode (`useMorningBrief.ts`).
- Dipindah ke tabel, mengikuti pola tabel `roles`.

**Selesai bila:** master tidak bisa berubah tanpa meninggalkan jejak, dan satu usulan
percobaan dari tiap jenis (ubah nilai, aset baru, aset dinonaktifkan) berhasil mengalir
sampai mengubah master.

---

# FASE 1 — Inspeksi JTR

**Kenapa naik ke depan:** satu-satunya pekerjaan yang masih dikerjakan di aplikasi lain,
dan bentuk pekerjaan yang belum pernah dibuat di SMART. Juga pemakai paling menuntut untuk
lapisan koreksi — kalau lapisan itu sanggup melayani JTR, dia sanggup melayani semua yang
lain.

### Masalah yang harus diselesaikan (dari pemilik pekerjaan)

Kelimanya **cacat bentuk pekerjaan, bukan masalah kedisiplinan inspektor.** Mengganti orang
atau menambah teguran tidak akan menyelesaikan apa pun.

| Keluhan | Akar sebenarnya |
|---|---|
| Inspektor sering tidak menambah tiang baru | Inspeksi berbasis **titik**, bukan **penyapuan jalur**. Menambah titik = kerja ekstra yang tidak diminta dan tidak terukur |
| Data tiang tidak pernah berubah, yang lama menempel terus | Master tiang **tidak punya siklus hidup**. Tidak ada cara menyatakan tiang diganti/dipindah/dibongkar, jadi orang memilih tidak menyentuhnya |
| KMS JTR tidak sesuai lapangan | **KMS diketik orang.** Angka yang diketik selalu ketinggalan |
| Tidak ada rekap KMS JTR per gardu | Sama — tidak ada hubungan gardu → tiang di master |
| Temuan tidak ada rekapnya | Temuan **tidak menempel pada aset**, hanya teks + koordinat lepas |

### Bentuk penyelesaiannya

**1.1 Master tiang JTR — struktur `gardu → jurusan → rangkaian tiang`**
- Tabel `tiang` yang sudah ada dipakai (isinya masih 0 baris, jadi bebas dibentuk ulang).
  Ditambah: `gardu_kode` + `ulp`, `jurusan` (A/B/C/D/K), `urutan` dalam rangkaian.
- Tiang JTM tetap memakai tabel yang sama lewat `jalur_id` — satu kelas benda, dua cara
  menempel.
- **Siklus hidup**: `usulan → aktif → diganti → dibongkar`, dengan tanggal berlaku.
  **Data lama tidak pernah dihapus**, hanya jadi tidak-aktif. Yang menempel di gardu hanya
  yang aktif — sehingga rekap tahun lalu tetap benar saat dilihat ulang.
- Jurusan dipilih per jurusan gardu, cocok dengan cara `pengukuran_gardu.perjurusan`
  merekam beban A/B/C/D/K sekarang.

**1.2 Impor data awal dari aplikasi lama**
- Ekspor dari aplikasi yang berjalan sekarang jadi isi awal master.
- Semua baris hasil impor bertanda `sumber = impor` dan **belum dikonfirmasi lapangan** —
  jadi ikut terhitung di ukuran keberhasilan, dan menua kalau tidak pernah disapu.
- Kalau ada gardu yang datanya tidak tersedia, inspeksi pertamanya sekaligus jadi pemetaan
  awal. Dua jalur ini hidup berdampingan.

**1.3 KMS turunan — tidak pernah diketik**
- View menghitung panjang JTR per gardu dan per jurusan dari rangkaian **tiang aktif**,
  diurutkan, dimulai dari titik gardu itu sendiri.
- Penghitungnya **sudah ada di SMART** — `haversineMeters` / `totalDistanceM` di peta-gardu,
  yang sekarang dipakai menghitung panjang jalur JTM.
- Begitu tiangnya benar, KMS otomatis benar. Rekap per gardu muncul dengan sendirinya,
  tanpa dibuat sebagai fitur terpisah.

**1.4 Inspeksi sebagai PENYAPUAN, bukan kunjungan titik**
- Satuan pekerjaan = **satu gardu disapu tuntas**, bukan "sekian titik diperiksa".
- Penyapuan tidak bisa ditandai Selesai sebelum setiap tiang aktif dinyatakan salah satu
  dari: **cocok · berubah · tidak ditemukan** — dan setiap celah yang ditandai sudah dijawab.
- **Pendeteksi celah:** kalau jarak antara dua tiang berurutan jauh melebihi bentang wajar,
  aplikasi bertanya *"ada tiang yang belum tercatat di sini?"*. Inilah yang mengubah
  penambahan tiang baru dari kerja ekstra sukarela jadi pertanyaan yang harus dijawab.
  Ringan, tidak perlu rekam jejak GPS, dan tetap jalan tanpa sinyal.

**1.5 Temuan menempel pada tiang**
- Temuan menunjuk `tiang_id`, bukan teks lepas.
- Rekap per gardu, per jurusan, per jenis kerusakan, per urgensi langsung jadi.

**1.6 Mobile — peta per gardu**
- Inspektor memilih gardu, peta menampilkan rangkaian tiang jurusan itu beserta garisnya.
- Pola peta di HP sudah terbukti di layar Peta Pohon; tidak dibangun dari nol.
- Bekerja luring: daftar tiang satu gardu di-cache sebelum berangkat, hasil disimpan sebagai
  draf, dikirim saat dapat sinyal.

**1.7 Persetujuan per GARDU, bukan per tiang** *(ditunda — menunggu sampel data cukup)*
- Satuan persetujuan adalah satu gardu yang sudah disapu tuntas. Admin menyetujui bahwa
  pekerjaan di gardu itu benar dan sesuai — di situlah titik penentunya, bukan di tiap tiang.
- Layar persetujuan menampilkan **peta sebelum dan sesudah** berdampingan, sehingga yang
  berubah langsung terlihat: tiang baru, tiang yang hilang, atribut yang dikoreksi.
- Tidak perlu tabel snapshot. Keadaan pada tanggal berapa pun bisa disusun ulang dari
  `created_at`, `aktif_sampai`, dan `master_audit` yang sudah ada — snapshot berarti satu
  lagi salinan kebenaran yang harus dijaga tetap sinkron.
- Tabel `inspeksi_jtr` + `inspeksi_jtr_titik` sudah dibuat dan penjaga "tidak bisa Selesai
  kalau ada yang terlewat" sudah terpasang; tinggal disambungkan ke mobile dan web.

**1.8 Rekap dan dashboard JTR**
- Panjang JTR per ULP, per gardu, per jurusan — semuanya turunan.
- Rekap temuan per gardu/jurusan/jenis/urgensi.
- Cakupan penyapuan: berapa persen gardu yang JTR-nya sudah disapu dalam N bulan terakhir.

**1.9 Sambungan yang menguntungkan**
- Panjang JTR per jurusan dipasangkan dengan **beban per jurusan** yang sudah direkam
  pengukuran gardu. Membuka analisis yang sekarang tidak mungkin: jurusan yang terlalu
  panjang untuk bebannya, kandidat pemecahan jurusan, dugaan drop tegangan ujung.

**Selesai bila:** aplikasi lama tidak dipakai lagi, KMS JTR per gardu bisa dilihat tanpa ada
yang pernah mengetik angkanya, dan tiang baru yang ditemukan di lapangan masuk ke master
lewat verifikasi admin.

---

# FASE 2 — Gardu: menyambungkan yang sudah mengalir

**Kenapa sesudah JTR:** datanya sudah mengalir tiap hari dan tidak ada yang mendesak.
JTR mendesak karena masih di luar SMART.

### 2.1 Pengukuran Gardu — tahap tinjauan
- **Masalahnya:** pengukuran sama sekali tidak punya tahap approval. Petugas menyimpan, data
  langsung masuk tabel. Padahal di sinilah bukti kVA paling banyak terkumpul.
- **Yang dikerjakan:** hanya baris yang **berbeda dari master** yang naik ke layar tinjauan.
  Yang cocok lewat diam-diam seperti sekarang.
- Beban admin kecil: dari 388 gardu yang diukur berulang, hanya 9% angkanya bentrok.
- Sinyal `kva_beda` sudah dihitung di view `gardu_master_state`, sekarang berhenti sebagai
  lencana. Tinggal disambungkan ke usulan.

### 2.2 Jalur koreksi penyulang di HP
- **Field yang benar-benar buta.** Penyulang tidak pernah diketik petugas — disalin dari
  baris Sheet. Sampai hari ini **belum ada satu pun kesaksian lapangan tentang penyulang**,
  padahal 31% baris pengukuran, 65% inspeksi, dan 73% inspeksi pohon memakai nama penyulang
  yang tidak dikenal master gardu.

### 2.3 Koreksi koordinat
- Master punya koordinat untuk 82% gardu, Sheet hanya 33%. Titik yang salah atau kosong
  dikoreksi dari titik pengukuran yang sudah direkam (`lokasi_lat/lng`).

### 2.4 Penyeimbangan beban — sambung ke lapisan

### 2.5 Pensiunkan Sheet `dataGarduProbis`
- Tambahkan **33 gardu yang hanya ada di Sheet** (28 Cakranegara, 5 Ampenan) ke master.
- Bangun jalur **"usulan gardu baru"** dari lapangan.
- Putuskan 8 gardu yang hanya ada di master dan 8 kode yang ULP-nya berbeda antar sumber.
- Pindahkan sumber gardu di **mobile** dan **Peta Aset** ke master Supabase.
- Cakupan koordinat Peta Aset naik dari 33% ke 82%.

---

# FASE 3 — Gardu: modul yang belum ada

### 3.1 Pemeliharaan Gardu (HARGARDU)
→ **Rencana rincinya di [rencana-hargardu.md](rencana-hargardu.md)** (disepakati 8 Sep 2026).

- Modul penuh dari nol: web (rencana + approval) dan mobile (pelaksanaan).
- **HARGARDU adalah satu-satunya sumber data master gardu yang lengkap.** Semua modul
  lain memakai master gardu; hanya modul ini yang membuatnya lengkap. Karena itu
  lapisan verifikasi bukan pelengkap — dia inti modulnya.
- Kasus yang disebut pemilik pekerjaan: **kVA di lapangan berbeda dari master saat
  pemeliharaan** → otomatis jadi usulan koreksi.
- Catatan pemeliharaan tidak pernah ditulis ulang. Pemeliharaan berikutnya mengoreksi
  MASTER-nya, bukan laporan lama.

### 3.2 Optimasi Trafo
- **Prioritas tinggi meski modulnya baru.** Ini satu-satunya pekerjaan yang **sengaja
  mengubah aset**. Kalau trafo diganti dan tidak tercatat, master langsung salah — dan semua
  pekerjaan lain yang memakai gardu itu ikut salah.
- Terstruktur: kVA lama → baru, nomor seri lama → baru, tanggal mutasi, alasan.
- Ekspor AMG sudah membawa `NO SERI`, `TGL MUTASI`, `TGL OPERASI` di kolom `data_amg`.

### 3.3 Inspeksi Gardu (tier 1 & 2)
- Sesudah 3.1 karena banyak isian kondisi fisiknya sama.

---

# FASE 4 — Jaringan JTM

### 4.1 Master jaringan
- **Master penyulang yang sungguhan.** Sekarang: master gardu mengenal 50 nama,
  `penyulang_ref` 77 nama (hanya 48% cocok), inspeksi 139 nama, inspeksi pohon 172 nama.
  Empat kosakata berbeda untuk benda yang sama.
- **Pisahkan seksi dari penyulang.** Kolom `penyulang` di inspeksi sebenarnya dipakai
  merekam seksi atau zona proteksi — FCO Kandang Kaok, LBS PLTD Trawangan, Rec. Melempo,
  Kopel A/C/E. Bukan data sampah; itu konsep yang lebih halus yang dijejalkan ke field yang
  sama karena tidak ada tempat lain.
  → Butuh dua kolom: `penyulang` (menunjuk master) dan `seksi`.
- Tiang JTM memakai struktur siklus hidup yang sama dengan yang dibangun di Fase 1.

### 4.2 Inspeksi JTM tier 1 & 2 — dirapikan
→ **Rencana rincinya di [rencana-inspeksi-jtm.md](rencana-inspeksi-jtm.md)** (disepakati 11 Sep 2026).

- Penyapuan per **segmen**, bukan temuan titik lepas. Penyulang menjawab "dari mana",
  segmen menjawab "ruas yang mana".
- **Satu tiang bisa dipikul dua penyulang** (underbuild beda penyulang, nama segmennya
  berbeda) — inilah satu-satunya tempat di SMART yang hubungan aset ↔ pemiliknya
  banyak-ke-banyak. Tiga tabel: `tiang` · `segmen` · `segmen_tiang`.
- Inspeksi lama **tetap hidup berdampingan**; temuannya bertemu di satu daftar Perlu
  Perbaikan dengan penanda asal.

### 4.3 Pemeliharaan Jaringan — keluar dari WO kolom bebas
### 4.4 Perabasan — disambungkan ke master jaringan

---

# FASE 5 — Menutup lingkaran

### 5.1 AMG sebagai keluaran perubahan master
- Sekarang agen lokal hanya mengirim pengukuran. Diperluas: perubahan master yang sudah
  disetujui ikut mengalir ke AMG. Lingkarannya jadi utuh.

### 5.2 Penggiringan otomatis
- WO memprioritaskan data yang paling basi dan paling disengketakan, memakai asal-usul per
  field dari 0.3. Mesin menggiring dirinya sendiri.

### 5.3 Dashboard kualitas data
### 5.4 Notifikasi ke verifikator dan approver

---

## Utang teknis yang ikut dibereskan sambil jalan

| Utang | Ikut di |
|---|---|
| `work-order-rls.sql` belum dijalankan | 0.4 |
| Identitas penyetuju berasal dari teks klien | 0.4 |
| Tidak ada audit trail | 0.2 |
| Katalog pekerjaan hardcode | 0.5 |
| Migrasi visual `peta-gardu` | 1.6 |
| 2 lint error di pengukuran-gardu (`setState` dalam `useEffect`) | 2.1 |
| `<img>` mentah, belum `next/image` | 2.1 |
| Foto bukti jadi orphan di Storage saat status dibatalkan | 3.1 |
| `addRow` hitung urutan di klien → tabrakan dua admin | 3.1 |
| Modal monitoring-inspeksi belum pakai `ModalShell` | 4.2 |
| `InspeksiKPI` 7 query count terpisah | 4.2 |
| Migrasi visual `advanced-dashboard`, `scoreboard` | akhir |
| Apps Script write-back perlu redeploy | kapan saja |

---

## Yang sengaja TIDAK dikerjakan

- **Rekonsiliasi massal master.** Sudah diputuskan: lapangan yang mengoreksi.
- **Sinkron dua arah dengan Google Sheet.** Sheet dipensiunkan, bukan disinkronkan.
- **AMG sebagai sumber kebenaran.** Sudah diputuskan sebaliknya.
- **Rekam jejak GPS inspektor.** Pendeteksi celah antar tiang sudah cukup, jauh lebih ringan,
  dan tetap jalan tanpa sinyal.
- **Drag-and-drop di papan Kanban WO.**
- **Dark mode.**

---

## Jebakan yang sudah diketahui — jangan tersandung dua kali

1. **Kode gardu tidak unik lintas ULP.** Enam kode muncul di dua ULP berbeda. Kunci selalu
   `(kode, ulp)`, tidak pernah `kode` saja.
2. **Batas 1.000 baris PostgREST.** Setiap pengambilan data penuh wajib lewat `fetchAllRows`.
   Pernah menyebabkan data terpotong diam-diam. **Untuk tiang ini akan sangat terasa** —
   jumlahnya jauh lebih banyak daripada gardu.
3. **Mobile sudah produksi.** Perubahan aditif, rilis OTA, dan OTA di-push sendiri oleh
   pemilik pekerjaan.
4. **kVA di HP tidak pernah diisi otomatis.** Itu yang membuat kesaksian lapangan sah sebagai
   bukti. Jangan sekali-kali membuatnya terisi otomatis dari master.
5. **Status jangan ditulis kalau bisa diturunkan.** WO Pengukuran membuktikan pola ini.
6. **Penyeimbangan punya baris pembawa di `pengukuran_gardu`** yang bukan pengukuran rutin.
   Selalu saring `hasil_penyeimbangan_id IS NULL`.
7. **Leaflet tanpa clustering mulai berat di atas ~200 marker.** Tiang akan jauh melewati itu
   — peta JTR harus dibatasi per gardu, bukan menampilkan seluruh ULP sekaligus.

---

## Urutan ringkas

```
0.1 Lapisan koreksi master (+ siklus hidup aset)   ← mulai di sini
0.2 Audit trail
0.3 Asal-usul per field
0.4 Penegakan wewenang + RLS
0.5 Katalog pekerjaan jadi master
--------------------------------- fondasi selesai
1.1 Master tiang JTR (gardu → jurusan → rangkaian)
1.2 Impor data awal dari aplikasi lama
1.3 KMS turunan
1.4 Inspeksi sebagai penyapuan + pendeteksi celah
1.5 Temuan menempel pada tiang
1.6 Mobile peta per gardu
1.7 Persetujuan per gardu (peta sebelum/sesudah) — ditunda
1.8 Rekap & dashboard JTR
1.9 Sambungkan panjang jurusan ↔ beban jurusan
--------------------------------- JTR keluar dari aplikasi lain
2.1 Pengukuran → tahap tinjauan
2.2 Koreksi penyulang di HP
2.3 Koreksi koordinat
2.4 Penyeimbangan → sambung
2.5 Pensiunkan Sheet + usulan gardu baru
--------------------------------- gardu yang sudah ada, selesai
3.1 Pemeliharaan Gardu
3.2 Optimasi Trafo
3.3 Inspeksi Gardu
--------------------------------- gardu lengkap
4.1 Master jaringan (penyulang + seksi)
4.2 Inspeksi JTM dirapikan
4.3 Pemeliharaan Jaringan
4.4 Perabasan disambungkan
--------------------------------- jaringan lengkap
5.1 AMG sebagai keluaran
5.2 Penggiringan otomatis
5.3 Dashboard kualitas data
5.4 Notifikasi
```

---

## Riwayat keputusan

| Tanggal | Keputusan |
|---|---|
| 7 Sep 2026 | Master tunggal di SMART, spreadsheet dipensiunkan, AMG hanya keluaran |
| 7 Sep 2026 | Master yang ada sekarang jadi garis dasar; lapangan yang mengoreksi |
| 7 Sep 2026 | Koreksi master adalah lapisan lintas-pekerjaan, tersaji inline di layar approval |
| 7 Sep 2026 | Admin boleh mengubah master langsung, dengan audit trail |
| 7 Sep 2026 | **Inspeksi JTR naik ke Fase 1** — masih di aplikasi lain, paling mahal dibiarkan |
| 7 Sep 2026 | Tiang JTR dikelompokkan **per jurusan gardu (A/B/C/D/K)** |
| 7 Sep 2026 | Data awal tiang **diimpor dari aplikasi lama**, ditandai belum dikonfirmasi lapangan |
