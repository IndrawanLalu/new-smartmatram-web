# Rencana — Kalender Jam Kerja Petugas

*Disusun 7 Oktober 2026. Status: RENCANA, belum ada kode. Menunggu jawaban user
atas pertanyaan di bagian 7.*

Tujuan: menampilkan jam kerja setiap pekerjaan lapangan dalam bentuk kalender —
**jam mulai, jam selesai, dan durasi** — per tim, per hari/minggu/bulan.
Acuan bentuk: `formatexcel/UI_Kalender_Jam_Kerja_Petugas.html` (model kalendernya
saja, warna tetap ikut desain SMART).

---

## 1. Temuan utama: masalahnya di DATA, bukan di kalender

Kalender itu mudah. Yang sulit: **sebagian besar pekerjaan tidak pernah mencatat
jam mulai**, dan jam yang tercatat sering bukan jam kerja yang sebenarnya.
Diperiksa langsung ke database (data 1–7 Okt 2026):

**Pemeliharaan Gardu** — satu-satunya modul dengan mulai (`tgl_padam`, tombol
"Padamkan") dan selesai (`tgl_selesai` = saat Simpan). Tapi isinya:
- Banyak yang **0 menit** (padam 09:40 → simpan 09:41): tombol Padamkan ditekan
  tepat sebelum Simpan, jadi formulir diisi *setelah* pekerjaannya selesai.
- 7 Okt, tim Ancah & Candra: padam 08:57, 09:20, 10:36, 11:28, 11:45 → **semuanya
  disimpan 16:05–16:16**. Lima gardu "dikerjakan bersamaan" selama 4–7 jam.
  Itu bukan kerja paralel, itu input borongan di sore hari.
- 15 dari 46 catatan `tgl_padam` kosong.

**Inspeksi JTM** — jam per tiang (`inspeksi_jtm_titik.dinilai_at`, jam HP saat
tiang dinilai). Ini sumber terbaik, tapi:
- Satu catatan: **109 tiang dalam 42 menit** (2–3 tiang per menit) — bukan
  penyapuan lapangan.
- Satu catatan: tiang pertama 10:47, terakhir 17:25, dengan **jeda 367 menit**
  di tengahnya. Rentang pertama→terakhir akan membaca 6,5 jam kerja.

**Perabasan** — jam per pohon (`perabasan_realisasi.dikerjakan_at`). Polanya
masuk akal (2–7 pohon, 20 menit–1,5 jam).

**Pengukuran Gardu & Tegangan Ujung** — hanya **satu titik jam** per objek
(`jam_pengukuran`, `jam_ukur`). Tidak ada mulai/selesai. Pengukuran jam bisa
diketik ulang regu.

**Hanya tanggal, tanpa jam sama sekali:**
| Pekerjaan | Kolom | Catatan |
|---|---|---|
| Inspeksi JTR | `tgl_mulai`/`tgl_selesai` DATE | `inspeksi_jtr_titik.created_at` = jam server saat Kirim, bukan jam di tiang |
| Pemeliharaan Jaringan | `tgl` DATE | `created_at` = jam Kirim |
| Optimasi Trafo | `tgl_operasi` DATE | |
| Penyeimbangan | `tgl_penyeimbangan` DATE | `created_at` mungkin dekat, belum pasti |
| Tugas temuan (inspeksi) | `tgl_eksekusi` TEXT | |
| JTM tier 2 / WO manual | `selesai_tgl` DATE | |

**Pelayanan gangguan (APKT)** punya jam lengkap (lapor, response, recovery),
tapi petugasnya tercatat `YANTEK MOBILE`, bukan tim. Tidak bisa diletakkan per
tim.

**Kesimpulan:** kalau kalender dibuat langsung dari data apa adanya, ia akan
menampilkan angka yang **terlihat meyakinkan tapi salah** (tim yang bekerja 7
jam padahal input borongan; inspektor yang bekerja 6,5 jam padahal pulang di
tengah). Itu persis yang dilarang `teknisaplikasi.md` butir 6: angka karangan
yang tak bisa dibedakan dari angka benar.

---

## 2. Prinsip yang diusulkan

1. **Setiap blok kerja membawa "mutu waktunya"**, dan kalender menampilkannya.
   Tidak ada durasi yang ditampilkan seolah terukur padahal ditebak.
2. **Jam diambil dari HP saat kejadian**, bukan jam server saat Kirim, dan bukan
   isian yang diketik.
3. **Durasi = jumlah waktu kerja yang tercatat, dipotong di jeda panjang**, bukan
   selisih pertama→terakhir.
4. **Total jam sehari per tim = gabungan blok** (yang tumpang-tindih tidak
   dihitung dua kali).
5. Pekerjaan yang hanya bertanggal tetap tampil — di **pita "sepanjang hari"**
   di atas kisi jam, tanpa durasi. Tidak ada pekerjaan yang hilang dari
   kalender karena datanya kurang (butir 13).

### Tiga tingkat mutu waktu

| Tingkat | Arti | Tampilan |
|---|---|---|
| **Terukur** | mulai & selesai dari jam HP pada kejadiannya | blok penuh, durasi tampil |
| **Diperkirakan** | hanya satu titik jam; durasi dari standar per jenis | blok bergaris putus, durasi bertanda "±" |
| **Tanpa jam** | hanya tanggal | pita sepanjang hari, tanpa durasi, tidak ikut total jam |

Ditambah satu bendera: **diragukan**. Contohnya: input borongan (beberapa objek
disimpan dalam beberapa menit dengan mulai yang berjauhan), durasi 0 menit,
laju tak wajar (> 1 tiang per menit), blok tumpang-tindih pada tim yang sama.
Blok yang diragukan tetap tampil, bertanda oranye, dan bisa disaring.

---

## 3. Aturan hitung per jenis pekerjaan (usulan)

| Jenis | Mulai | Selesai | Mutu sekarang | Setelah perubahan HP (F2) |
|---|---|---|---|---|
| Pemeliharaan Gardu | `tgl_padam` | `tgl_selesai` | Terukur, **sering diragukan** | mulai saat formulir dibuka di lokasi |
| Inspeksi JTM | tiang pertama | tiang terakhir, **dipecah bila jeda > J menit** | Terukur | (sudah baik) |
| Perabasan | pohon pertama | pohon terakhir, dipecah bila jeda > J | Terukur | foto sebelum pohon pertama = mulai |
| Pengukuran Gardu | `jam_pengukuran` | + standar (mis. 15 mnt) | Diperkirakan | jam buka formulir → jam Simpan |
| Tegangan Ujung | `jam_ukur` | + standar | Diperkirakan | sama |
| Inspeksi JTR | — | — | Tanpa jam | jam HP per tiang (seperti JTM) |
| Pemeliharaan Jaringan | — | — | Tanpa jam | jam foto sebelum → jam foto sesudah |
| Optimasi Trafo | — | — | Tanpa jam | jam foto sebelum → jam foto sesudah |
| Penyeimbangan | — | — | Tanpa jam | jam buka → Simpan |
| Tugas temuan | — | — | Tanpa jam | jam foto sebelum → sesudah |
| JTM tier 2 (WO manual) | — | — | Tanpa jam | ikut WO manual, belum ada di HP |

**Jam foto sebelum/sesudah** sebagai mulai/selesai: wajar karena foto sebelum
diambil saat tiba dan foto sesudah saat pekerjaan beres, dan HP sudah memotretnya
(butir 4). Cukup dicatat jamnya saat dipotret, lalu dikirim bersama draf.

Gabungan blok dalam satu tim per hari: jeda di bawah **G menit** (perjalanan
antar-objek) dihitung sebagai kerja; jeda lebih panjang (istirahat, pulang)
tidak.

---

## 4. Rancangan layar (web)

Satu halaman baru. Nama menu **belum ditetapkan**, menunggu jawaban user
(pertanyaan 7.1).

```
┌ Kepala: ◀ Minggu 5–11 Okt 2026 ▶   [Hari | Minggu | Bulan]   ULP ▾   Tim ▾   Jenis ▾ ┐
├──────────────┬─────────────────────────────────────────────────────────────────────┤
│ Ringkasan    │      Sen 5   Sel 6   Rab 7 (hari ini)   Kam 8 ...                  │
│ minggu ini   │ Seharian [JTR GS-12] [Optimasi AM053]   ← pita "tanpa jam"          │
│              │ 07:00 ──────────────────────────────────────────────                │
│ Total jam    │ 08:00   ┌Hargardu┐                                                 │
│  terukur 41j │         │AM104   │   ┌JTM PRM ±┐                                   │
│  perkiraan 6j│         │08:44–  │   │         │  ← garis putus = diperkirakan     │
│ Per jenis    │ 09:00   └────────┘   └─────────┘                                   │
│ Per tim      │  ...      ⚠ diragukan (oranye)                                      │
│ Diragukan: 7 │ 12:00 ░░░░░ istirahat ░░░░░                                          │
└──────────────┴─────────────────────────────────────────────────────────────────────┘
```

- **Tampilan Minggu** (bawaan): kisi jam 06:00–22:00 (melebar bila ada blok di
  luar itu). Blok diletakkan **sesuai jam dan tinggi = durasi** (berbeda dari
  contoh HTML yang menaruh kartu per baris jam tetap). Blok bertumpuk berdampingan.
- **Tampilan Hari**: kolom = **tim**, bukan hari, sehingga terlihat siapa
  mengerjakan apa sepanjang hari.
- **Tampilan Bulan**: kotak per tanggal berisi total jam per tim + jumlah
  pekerjaan.
- Garis **jam sekarang** di kolom hari ini.
- Klik blok → **modal rincian** (pola butir 7): jenis, objek, tim, mulai,
  selesai, durasi, mutu waktu dan alasannya ("dihitung dari 26 tiang, dipecah
  di jeda 10:58–17:05"), tautan ke catatan aslinya.
- Panel kiri: total jam (terukur dan perkiraan dipisah), per jenis, per tim,
  jumlah blok diragukan.
- Warna per jenis mengikuti token desain yang ada, bukan warna contoh.
- Tombol **Download XLSX** (butir 10): satu baris per blok.
- Tombol "Jadwal Baru" di contoh **tidak** dibuat: kalender ini merekam yang
  sudah dikerjakan, bukan jadwal. (Rencana WO bisa menyusul sebagai lapisan
  terpisah, bila diminta.)

Data dimuat **per minggu atau per bulan yang tampil** (butir 13), dari satu
fungsi SQL.

---

## 5. Arsitektur

**Server — satu fungsi `jam_kerja(p_ulp, p_dari, p_sampai)`**, pola sama dengan
`realisasi_harian`. Hanya baca. Mengembalikan blok:
`ulp, tim, jenis, objek, mulai, selesai, menit, mutu, diragukan, alasan, sumber_id`.
- Pemecahan di jeda, deteksi borongan dan tumpang-tindih semuanya di SQL, supaya
  web, Excel, dan (nanti) rekap memakai hitungan yang sama.
- Ambang (J, G, durasi standar per jenis) disimpan di tabel pengaturan kecil,
  bukan dikode mati, supaya bisa diubah dari web tanpa rilis.
- Jam selalu **WITA** (`AT TIME ZONE 'Asia/Makassar'`); blok yang melewati
  tengah malam dipotong per tanggal.
- Nama tim = `petugas_nama` (butir 16). Catatan lama yang berisi
  "Administrator", "HARGARDU", "INSPEKSI JTM" tetap tampil apa adanya.

**HP — perubahan kecil, semuanya lewat OTA** (tanpa dependensi native):
mencatat jam saat kejadian ke draf (`dibuka_at`, `foto_sebelum_at`,
`foto_sesudah_at`, `dinilai_at` per tiang JTR), lalu dikirim lewat RPC yang
sudah ada. Kolom baru boleh NULL: HP versi lama tetap berjalan dan catatannya
masuk tingkat "Tanpa jam".

---

## 6. Tahapan

| Fase | Isi | Butuh SQL | Butuh OTA |
|---|---|---|---|
| **F1** | Fungsi `jam_kerja` + halaman kalender (Minggu/Hari/Bulan, pita sepanjang hari, modal, ringkasan) dengan data yang ADA sekarang, lengkap dengan mutu & bendera diragukan | ya | tidak |
| **F2** | HP mencatat jam kejadian untuk modul "Tanpa jam" dan memperbaiki Pemeliharaan Gardu; RPC kirim menerimanya | ya | ya |
| **F3** | Rekap jam per tim per bulan, Excel, dan (bila diminta) masuk ke Rekap Kinerja / WA harian | mungkin | tidak |

F1 sudah berguna begitu jadi: memperlihatkan pekerjaan mana yang belum punya jam
dan mana yang diragukan. Itu sekaligus bahan untuk F2.

---

## 6a. Daftar perubahan lengkap supaya semua pekerjaan "Terukur"

### Aturan bersama di HP (dibuat sekali, dipakai semua modul)
- **`mulai_at`** dicap otomatis saat objek pertama kali dibuka di formulir
  (bukan tombol, tidak bisa diketik, tidak berubah kalau draf dibuka ulang).
- **`selesai_at`** = saat Simpan (sudah ada sebagai `tglSimpan` di sebagian
  modul).
- **Jam foto**: `PhotoPicker`/`FotoBanyak` mencatat jam saat dipotret.
- **Jam HP saat Kirim** ikut dikirim. Server membandingkannya dengan jamnya
  sendiri, dan selisih > 5 menit menandai catatan "jam HP tidak tepat".

### Per modul
| Modul | HP | Server (kolom + RPC) |
|---|---|---|
| Pemeliharaan Gardu | `mulai_at` saat formulir dibuka; `tgl_padam` tetap sebagai jam padam | `pemeliharaan_gardu.mulai_at`; `kirim_pemeliharaan_gardu` |
| Inspeksi JTM | tidak ada | tidak ada (dipecah di jeda oleh `jam_kerja`) |
| Inspeksi JTR | **tidak ada**: HP sudah mengirim `disimpan` (jam HP per tiang), server membuangnya | `inspeksi_jtr_titik.dinilai_at`; `kirim_tiang_jtr` menyimpannya |
| Perabasan WO | tidak ada (jam per pohon sudah ada) | tidak ada |
| Perabasan luar WO | `mulai_at`/`selesai_at` | kolom + `kirim_perabasan_luar_wo` |
| Pemeliharaan Jaringan | jam foto sebelum & sesudah (`FormHarjar`) | kolom + `kirim_pemeliharaan_jaringan` |
| Optimasi Trafo | jam foto sebelum & sesudah (`FormOptimasi`) | kolom + `simpan_optimasi_trafo` |
| Pengukuran Gardu | `mulai_at`/`selesai_at` **di samping** jam ukur yang diketik (jam ukur tetap: itu jam beban, bukan jam kerja) | kolom + `kirim_pengukuran_gardu` |
| Tegangan Ujung | `mulai_at`/`selesai_at` | kolom + `kirim_tegangan_ujung` |
| Penyeimbangan | `mulai_at`/`selesai_at`; ⚠ HP menulis langsung ke tabel, belum lewat draf + RPC (butir 1/17) | kolom |
| Tugas temuan (eksekusi) | jam foto sebelum & sesudah (`inspectionService`) | kolom di `inspeksi` |
| JTM tier 2 / WO manual | dicentang admin di web, tidak ada kerja HP | tetap "Tanpa jam" kecuali dipindah ke HP |
| Pelayanan gangguan (APKT) | — | petugas di APKT hanya "YANTEK MOBILE"; butuh sumber tim lain |

### Server
- Kolom baru semuanya **NULL-able**: HP versi lama tetap bisa mengirim, dan
  catatannya masuk tingkat "Tanpa jam". Data lama tidak diisi mundur (tidak
  boleh dikarang).
- RPC menerima kunci baru, memotong jam di masa depan ke `now()`, menolak
  `selesai < mulai`.
- `jam_kerja(p_ulp, p_dari, p_sampai)` + tabel `jam_kerja_setelan` (J, G,
  durasi standar per jenis).

### Web
- Halaman kalender + modal + Excel, kode menu baru di `roles.menus`.

### Urutan rilis
SQL → web → OTA. Tidak perlu APK baru.

### Di luar kode
Mutu jam bergantung pada **kapan regu mengisi**. Kalau formulir tetap diisi
sore hari di kantor, cap otomatis pun mencatat jam sore. Perlu arahan ke regu:
buka formulir di lokasi, saat mulai bekerja.

---

## 6b. Kasus khusus (diperiksa ke data nyata, 7 Okt 2026)

**Aturan dasar yang menjawab sebagian besar kasus:** blok kerja dibentuk dari
**jam kejadian per objek** (per tiang, per pohon, per gardu), dikelompokkan per
**(tim, tanggal WITA)**. Tidak pernah dari jam Kirim, jam "Selesai segmen",
`created_at`, atau rentang `tgl_mulai`→`tgl_selesai`.

### A. Pekerjaan lintas hari
| # | Kasus | Data nyata | Aturan |
|---|---|---|---|
| A1 | Satu segmen perabasan dikerjakan beberapa hari | 2 dari 7 segmen; satu segmen 3→7 Okt, pohon pada 3, 5, 6, 7 Okt (4 Okt kosong) | Satu blok per hari, dari pohon hari itu, berlabel "Segmen X · hari ke-2 dari 4". Hari tanpa pohon = tanpa blok. Durasi segmen = jumlah blok harian, bukan 3→7 Okt |
| A2 | Inspeksi JTM satu segmen beberapa hari | 7 dari 49 inspeksi | Sama dengan A1, dari jam tiang |
| A3 | Kerja melewati tengah malam (gangguan/darurat) | belum ada | Blok dipotong di 24:00, berlanjut di tanggal berikutnya, saling tertaut |
| A4 | Mulai hari ini, Simpan besok (lupa simpan) | belum ada | Bila rentang melewati malam dan tidak ada jam kejadian di antaranya → **diragukan**, tidak digambar 20 jam |

### B. Jam kirim / selesai ≠ jam kerja
| # | Kasus | Data nyata | Aturan |
|---|---|---|---|
| B1 | "Selesai segmen" ditekan borongan di sore hari | 7 Okt: 8 inspeksi JTM yang dikerjakan 10:31–16:45 semuanya "selesai" 17:27–17:30 | `inspeksi_jtm.tgl_selesai` **tidak dipakai**; pakai jam tiang terakhir |
| B2 | Kirim malam / esok hari (sinyal, pulang dulu) | JTR & lainnya hanya menyimpan jam Kirim | Selesai = jam Simpan di HP. JTR: simpan jam tiang yang sudah dikirim HP |
| B3 | Dikembalikan admin, dikirim ulang beberapa hari kemudian | — | Jam mulai/selesai **tidak berubah** saat dibuka ulang; jam koreksi dicatat terpisah |
| B4 | Penilaian tiang JTM diubah ulang | `dinilaiAt` di HP diisi ulang setiap Simpan tiang | Koreksi memindahkan jam tiang. Bisa diterima karena Simpan wajib dekat tiang (jarak dicek), tapi perlu `pertama_dinilai_at` bila ingin jam asli |

### C. Kerja malam yang SAH
| # | Kasus | Data nyata | Aturan |
|---|---|---|---|
| C1 | Pengukuran gardu & tegangan ujung saat beban puncak | **514 dari 624** pengukuran sejak 1 Sep diukur ≥ 18:00 | Bukan anomali. Kisi kalender sampai 23:00 dan melebar otomatis |
| C2 | Gangguan / pekerjaan darurat malam | — | Sama, plus A3 |
| C3 | Lembur | — | Bisa diberi tanda "di luar jam dinas" (ambang di pengaturan), **bukan** diragukan |

### D. Jam yang tidak bisa dipercaya
| # | Kasus | Data nyata | Aturan |
|---|---|---|---|
| D1 | Input borongan di sore hari | Hargardu 7 Okt: 5 gardu padam pagi, semua disimpan 16:05–16:16 | diragukan; F2 mencegah dengan jam mulai otomatis di lokasi |
| D2 | Diisi bukan di lokasi | JTM aman: jarak petugas–tiang p99 = 40 m (dicek di HP). Modul lain menyimpan lat/lng tapi tidak dicek | Jam mulai dicatat **bersama posisi**; jauh dari objek → "tidak di lokasi" |
| D3 | Jeda panjang dalam satu sesi | JTM: jeda 367 menit dalam satu inspeksi | Dipecah jadi dua blok bila jeda > J |
| D4 | Terlalu cepat | 109 tiang dalam 42 menit | diragukan (laju per jenis di pengaturan) |
| D5 | Jam HP salah | — | Selisih jam HP–server saat Kirim > 5 menit → tanda |
| D6 | Satu tim di dua tempat pada jam yang sama | Hargardu 7 Okt (akibat D1) | Tumpang-tindih → diragukan; total jam tidak dihitung dua kali |

### E. Siapa yang bekerja
| # | Kasus | Aturan |
|---|---|---|
| E1 | Satu segmen dikerjakan bergantian dua tim | Blok dibentuk dari tim per objek (`perabasan_realisasi.petugas_nama`), bukan tim di kepala WO |
| E2 | Anggota tim berpisah ke dua lokasi | Kalender per **tim** (nama login, butir 16), bukan per orang; tampil sebagai tumpang-tindih |
| E3 | Akun umum ("Administrator", "HARGARDU", "INSPEKSI JTM") | Tampil berlabel "akun umum", bisa disaring keluar |
| E4 | HP dipakai bergantian | Tim diambil dari pemilik draf (butir 19) |

### F. Status pekerjaan
| # | Kasus | Aturan |
|---|---|---|
| F1 | Dibatalkan | Tidak tampil (bisa dimunculkan pudar lewat penyaring) |
| F2 | Belum disetujui / dikembalikan | Tetap tampil (kerjanya terjadi), berlabel status |
| F3 | Masih di HP, belum dikirim | **Tidak terlihat server.** Kalender hari ini selalu belum lengkap; layar wajib mengatakannya. JTM sebagian tampil karena titik tiang terkirim otomatis |
| F4 | Istirahat siang / Jumat | Tidak perlu aturan khusus: tanpa catatan = jeda, dipotong oleh J/G |

---

## 7. Pertanyaan untuk user (perlu dijawab sebelum mulai)

1. **Nama menu dan judul halaman.** Contoh: "Kalender Kerja", "Jam Kerja
   Petugas", "Log Jam Kerja". Letaknya menu sendiri atau tab di Kinerja
   Pelayanan Teknik?
2. **Jam kerja dihitung bagaimana?**
   a. jumlah blok kerja saja (perjalanan tidak dihitung), atau
   b. blok yang berjeda ≤ G menit digabung (perjalanan antar-objek ikut
      dihitung, istirahat tidak) — **usulan**, dengan G = 30 menit dan
      J = 30 menit.
3. **Durasi standar** untuk pekerjaan satu-titik-jam: Pengukuran Gardu dan
   Tegangan Ujung, berapa menit per gardu/jurusan?
4. **Pelayanan gangguan (APKT)** ikut ditampilkan? Jamnya lengkap, tapi
   petugasnya hanya "YANTEK MOBILE", jadi hanya bisa tampil per ULP, bukan per
   tim.
5. **Pemeliharaan Gardu**: input borongan seperti 7 Okt akan tampil bertanda
   "diragukan". Apakah di F2 HP perlu **mencegahnya** (misalnya mulai tercatat
   otomatis saat formulir dibuka dan tidak bisa ditekan ulang), atau cukup
   ditandai?
6. Siapa yang boleh melihat: admin & UP3 saja, atau juga tim eksekutor untuk
   timnya sendiri?
7. **Jam dinas** untuk tanda "di luar jam dinas" (C3): berapa? Dan apakah
   pengukuran malam (beban puncak) dikecualikan karena memang tugasnya malam?
8. Koreksi penilaian tiang JTM (B4): cukup jam terakhir, atau perlu jam penilaian
   pertama disimpan juga?
