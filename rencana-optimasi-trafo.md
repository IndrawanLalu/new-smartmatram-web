# Rencana — Optimasi Trafo (Fase 3.2)

Status: **disetujui dan DIBANGUN 23 September 2026 — SQL belum dijalankan, HP belum OTA.**
Disusun 23 September 2026. Lihat "Yang dibangun" di akhir berkas.
Induk: [`rencanakerjasmartnex.md`](rencanakerjasmartnex.md) §3.2.

---

## Kenapa modul ini berbeda dari delapan yang lain

Semua pekerjaan lain **melaporkan** keadaan aset. Ini satu-satunya yang
**mengubahnya**. Trafo 100 kVA diganti 160 kVA, dan sejak detik itu setiap
modul yang memakai gardu tersebut — pengukuran, penyeimbangan, pemeliharaan,
AMG — memakai angka yang salah sampai masternya ikut berubah.

Karena itu keluaran modul ini bukan sekadar catatan realisasi. Keluarannya
adalah **koreksi master yang punya bukti dan punya persetujuan**.

## Yang sudah berdiri, tinggal disambung

| Sudah ada | Dipakai untuk |
|---|---|
| `pengukuran_gardu.jenis_pemeliharaan` = `'OPTIMASI TRAFO'` | Label penandaan WO — sudah ada sejak lama, **datanya yang belum pernah ada** |
| Tab **Tindak Lanjut Anomali** di `/admin/pengukuran-gardu` | Tempat admin ULP menerbitkan WO, dari gardu overload/underload |
| `v_wo_pemerataan_terbuka` | Cetakan yang ditiru persis untuk `v_wo_optimasi_terbuka` |
| `master_usulan` | Koreksi kVA — sengaja dibuat generik supaya tidak butuh tabel baru |
| `gardu.data_amg` | Sudah membawa `NO SERI`, `TGL MUTASI`, `TGL OPERASI` |

Tidak ada mekanisme baru yang perlu diciptakan. Yang baru cuma satu tabel dan
satu layar.

---

## Alur

```
Admin ULP                          Regu (HP)                    Admin ULP
─────────                          ─────────                    ─────────
Tindak Lanjut Anomali
  gardu overload/underload
  → tandai "OPTIMASI TRAFO"  ──→   WO Optimasi
                                     kerjakan, foto, simpan
                                     periksa → KIRIM      ──→   Persetujuan
                                                                  master berubah
                                   [+ Optimasi di luar WO]
```

**WO lahir dari data, bukan dari perkiraan.** Gardu yang muncul di tab anomali
sudah membawa persen beban, arus, dan suhunya sendiri — jadi alasan sebuah
trafo diusulkan naik atau turun kapasitas melekat pada pengukurannya, bukan
pada ingatan orang.

**Di luar WO tetap dibuka.** Tombolnya ada di layar WO Optimasi, dan formulirnya
sama persis; bedanya cuma gardunya dipilih sendiri dari master, dan
`pengukuran_id` kosong. Pekerjaan lapangan tidak selalu menunggu kantor, dan
yang tidak punya tempat mencatat akan dicatat di tempat yang salah — atau tidak
sama sekali.

**Alur simpan mengikuti [`teknisaplikasi.md`](teknisaplikasi.md) butir 1:**
isi → simpan di HP → periksa → Kirim. Yang terkirim itulah realisasi.

---

## Tabel `optimasi_trafo`

Satu baris = satu penggantian trafo di satu gardu.

| Kolom | Isi |
|---|---|
| `pengukuran_id` | FK ke pengukuran yang menerbitkan WO. **NULL = pekerjaan di luar WO** |
| `kode_gardu`, `ulp`, `penyulang`, `alamat` | Identitas gardu yang dikerjakan |
| `kva_lama` → `kva_baru` | Inti pekerjaannya |
| `no_seri_lama` → `no_seri_baru` | Yang membedakan "trafo ini" dari "trafo sejenis" |
| `merk_baru`, `tahun_baru` | Ikut terbaca dari papan nama, sekalian melengkapi master |
| `asal_trafo` | `GUDANG` \| `GARDU` |
| `asal_kode_gardu`, `asal_ulp` | Diisi kalau asalnya gardu lain. **Boleh lintas ULP** |
| `tujuan_trafo_lama` | `GUDANG` \| `GARDU` \| `PERBAIKAN` |
| `tujuan_kode_gardu`, `tujuan_ulp` | Diisi kalau langsung dipasang di gardu lain |
| `alasan` | Kenapa dioptimasi — daftarnya data, diatur dari web |
| `tgl_mutasi`, `tgl_operasi` | Nama kolom mengikuti AMG, supaya ekspornya tinggal memetakan |
| `foto_nameplate_lama_url`, `foto_nameplate_baru_url` | **Dua-duanya NOT NULL** |
| `lat`, `lng` | Titik pengerjaan |
| `usulan_id` | FK `master_usulan` — sambungan ke persetujuan |
| `status` | `Selesai` → `Diverifikasi`, atau `Dibatalkan` |

**Kenapa asal-usul trafo dicatat.** Trafo tidak lahir dan tidak hilang; dia
berpindah. Satu trafo yang turun dari gardu A dan naik di gardu B adalah satu
benda yang sama, dan tanpa `no_seri` berikut asalnya, dua catatan itu tidak
akan pernah bisa disambungkan. Begitu asalnya tercatat, riwayat sebuah trafo
bisa dibaca mundur dari masternya — dan itu yang membuat pertanyaan "trafo
gardu ini dulu dari mana" punya jawaban.

**Lintas ULP memang diizinkan.** Kode gardu tidak unik lintas ULP (GR160,
KE022, KE105, KE108, LA132, GS239 masing-masing muncul di dua ULP), jadi asal
dan tujuan selalu disimpan berpasangan `kode + ulp`. Tanpa itu, trafo yang
datang dari Gerung akan tercatat berasal dari gardu Cakra bernomor sama.

---

## Yang terjadi pada master

Setelah catatan terkirim, satu `master_usulan` dibuat otomatis:

- `entitas` = `gardu`, `entitas_kode` = kode gardu, `field` = `daya`
- `nilai_lama` = kVA lama, `nilai_baru` = kVA baru
- `diterapkan_langsung` = **false**

Aturan itu sudah tertulis di `master-usulan-schema.sql`: *"Dipakai untuk nilai
yang memicu tindakan atau uang — kVA trafo, daya, penyulang. Salah di situ
menggerakkan orang dan barang, jadi lebih baik menunggu."* Modul ini tidak
membuat pengecualian untuk dirinya sendiri.

Nomor seri ikut dalam usulan yang sama. Perlu satu kolom `no_seri` di master
gardu — sekarang nilainya cuma menumpang di dalam `data_amg`, dan yang
menumpang tidak bisa dijadikan acuan.

**Master gardu ASAL tidak diubah otomatis.** Kalau trafo diambil dari gardu
lain, gardu itu pasti sedang dikerjakan juga — dan menebak apa yang terpasang
di sana dari formulir gardu tetangga adalah cara tercepat merusak dua baris
master sekaligus. Yang dilakukan: gardu asal **ditandai perlu diperiksa**, dan
muncul di daftar admin sebagai "trafonya diambil, isian sekarang belum
dipastikan".

---

## Yang berubah di layar

**Web**
1. Tab Tindak Lanjut Anomali — penandaan `OPTIMASI TRAFO` mulai berarti:
   muncul jumlah WO terbit dan yang sudah dikerjakan.
2. Halaman baru `/admin/optimasi-trafo` — daftar pekerjaan, verifikasi,
   pengaturan daftar alasan, dan tautan ke usulan masternya.
3. Rekap Kinerja — baris "Optimasi Trafo" berhenti berstatus `belumAda`:
   WO terbit dari jumlah penandaan bulan itu, realisasi dari catatan terkirim.

**HP**
4. Menu baru untuk role baru (nama role dan label menunya belum ditetapkan).
5. Layar WO Optimasi: daftar WO terbuka + tombol **Optimasi di luar WO**.
6. Formulir: gardu, kVA lama→baru, no seri lama→baru, asal trafo, tujuan trafo
   lama, alasan, dua foto papan nama, titik. Draf di HP, kirim setelah diperiksa.

---

## Urutan kerja

| # | Langkah | Hasil |
|---|---|---|
| 1 | SQL: tabel `optimasi_trafo`, `optimasi_alasan_ref`, kolom `gardu.no_seri`, view `v_wo_optimasi_terbuka`, RPC simpan + verifikasi + pembuat `master_usulan` | Fondasi |
| 2 | Role baru + menu (web `MOBILE_MENUS`, HP `menuConfig`) | Regu bisa diberi akses |
| 3 | HP: layar WO Optimasi + formulir + draf | Regu bisa bekerja |
| 4 | Web: halaman `/admin/optimasi-trafo` + verifikasi | Admin bisa memeriksa |
| 5 | Sambung ke Tindak Lanjut Anomali + Rekap Kinerja | Angkanya hidup |

---

## Yang sudah diputuskan (23 September 2026)

1. **Role baru `OPTIMASI`**, label menu di HP **"Optimasi Trafo"** — sama dengan
   baris di Rekap Kinerja dan nanti di sidebar web. Satu pekerjaan, satu kata di
   semua layar. Diberikan lewat Kelola Role, jadi tidak menunggu rilis.
2. **Tujuan trafo lama WAJIB diisi**, bawaannya `GUDANG` karena itu yang paling
   sering. Pilihannya: Gudang · Gardu lain · Perbaikan. Tidak ada "belum tahu" —
   jejak yang berlubang tidak akan pernah ditagih kelengkapannya oleh siapa pun.
3. **Daftar alasan** diisi awal dengan: Beban lebih (overload) · Beban rendah
   (underload) · Trafo rusak/terbakar · Pengembangan jaringan · Lainnya.
   Disunting sendiri dari web, sepola kategori Pemeliharaan Jaringan — daftar
   pilihan itu DATA, bukan kode.

Cakupan pekerjaannya sendiri: **uprating/downrating kapasitas trafo**, bukan
pemindahan gardu dan bukan gardu sisip baru. Yang membuat jejak perpindahan
terbaca adalah kolom asal dan tujuan, bukan pekerjaan kedua di gardu seberang.

---

## Yang dibangun (23 September 2026)

Nomor seri disepakati sebagai **kunci** yang menyambungkan perpindahan trafo.

| # | Berkas | Isi |
|---|---|---|
| 1 | `scripts/optimasi-trafo.sql` | `seri_norm()`, isi `gardu.no_seri` dari `data_amg`, `optimasi_alasan_ref`, `optimasi_trafo`, `v_wo_optimasi_terbuka`, `cari_trafo_seri()`, simpan/ubah/verifikasi/batalkan, `optimasi_trafo_daftar`, `riwayat_trafo`, role `OPTIMASI` |
| 2 | `lib/roles.ts`, `app/admin/_nav.ts`; HP `menuConfig.ts`, `BottomTabNavigator.tsx` | Menu `optimasiTrafo` di Kelola Role, sidebar, dan HP |
| 3 | HP `OptimasiScreen.tsx`, `components/FormOptimasi.tsx`, `services/optimasiService.ts`, `optimasiDraf.ts` | WO + draf + terkirim, formulir, koreksi |
| 4 | `app/admin/optimasi-trafo/` | Daftar, verifikasi = terapkan ke master, pengaturan alasan |
| 5 | `useKinerjaYantek.ts`, `PenyeimbanganTab.tsx`, `usePenyeimbangan.ts` | Baris Rekap Kinerja hidup; status WO optimasi di Tindak Lanjut Anomali |

**Keadaan data yang menentukan desain.** `gardu.no_seri` sudah ada (dari
`hargardu-schema.sql`) tapi baru terisi 1 dari 2.536. `data_amg->>'NO SERI'`
terisi 2.420; 76 di antaranya bukan nomor seri ("0", "1") dan tidak disalin.
**110 nomor seri dipakai lebih dari satu gardu (235 gardu).** Karena itu
pencarian nomor seri tidak pernah memilih sendiri kalau hasilnya lebih dari
satu — dan tiap optimasi yang membaca papan nama menghapus satu kembaran.

**Yang menyimpang dari rencana di atas:**
- `usulan_id` tidak dibuat. Satu optimasi melahirkan beberapa usulan (daya,
  no_seri, merk, tahun_pembuatan), jadi disambung lewat
  `master_usulan.sumber_modul = 'optimasi_trafo'` + `sumber_id`.
- Usulan dibuat saat KIRIM dan disusun ulang tiap koreksi; **verifikasi
  catatan = menyetujui semua usulannya** dalam satu transaksi.
- Gardu asal tidak "ditandai" dengan kolom. Statusnya DITURUNKAN: jejak
  `bersambung` kalau di gardu seberang ada catatan dengan nomor seri yang
  sama, `terbuka` kalau belum, `dipastikan` kalau admin menyatakannya.
  Berlaku juga untuk tujuan "gardu lain".
- Formulir HP punya satu isian tanggal yang mengisi `tgl_mutasi` dan
  `tgl_operasi` sekaligus.
- Nomor seri lama boleh kosong HANYA dengan centang "papan nama tidak
  terbaca" (trafo terbakar) — dijaga CHECK di database.
- Foto papan nama 1024 px / 0,6 (teknisaplikasi.md butir 4). Formulir
  meminta dipotret dari dekat; kalau di uji lapangan nomor seri tidak terbaca
  di ukuran itu, angka ini yang pertama ditinjau.

**Urutan menyalakan:** jalankan `scripts/optimasi-trafo.sql` → deploy web →
OTA HP → beri role `OPTIMASI` ke regu lewat Kelola Role → regu keluar-masuk.
