# Rencana — Mode SLD di Peta Jaringan (13 Okt 2026)

Permintaan user 13 Okt 2026: SLD pindah ke **Peta Jaringan** (`/peta`) sebagai
mode; halaman **Peta SLD** (`/admin/peta-gardu`) dihapus.

Keputusan user:
- Nama di layar: **"Mode SLD"**.
- Saat Mode SLD menyala, peta hanya menampilkan **rute/garis + keypoint**
  (seperti Peta SLD sekarang), bukan ribuan tiang.
- **Latar bisa dipilih**, termasuk kosong — di atas peta jalan/citra, garis SLD
  sering tenggelam.
- **Simulasi** (lepas pangkal/keypoint) dan **perhitungan beban & gardu per
  keypoint** ada di Mode SLD.
- Komponen yang dipakai lebih dari satu tempat dijadikan reusable.

Menggantikan `rencana-peta-sld.md` (Fase 1 Peta SLD sudah jalan; fase lanjutannya
dipindah ke bagian "Sesudah rencana ini" di bawah).

---

## Apakah peta jadi berat? — angka nyata (13 Okt 2026)

Yang membuat peta lambat adalah **jumlah benda yang digambar** dan **ubin latar
yang diunduh**, bukan banyaknya baris kode. Diukur dari data produksi dengan
`susunSld` (`lib/sld.ts`):

| | Tiang JTM | Simpul SLD | Turun |
|---|---:|---:|---:|
| OL. BENTEK | 992 | 134 | 86% |
| TOHPATI | 554 | 45 | 92% |
| SANDUBAYA | 390 | 86 | 78% |
| **44 penyulang bertiang** | **3.943** | **633** | **84%** |

- Mode SLD menggambar simpul, bukan tiang → **lebih ringan** dari mode biasa.
- Latar **Kosong** = nol unduhan ubin → **lebih ringan** lagi.
- Kode Mode SLD dimuat dengan `next/dynamic` — hanya diunduh saat mode
  dinyalakan; pembuka peta biasa tidak ikut membayar.
- Data tiang per penyulang diambil **saat penyulang dinyalakan** dan disimpan
  (memilih lagi tidak menarik ulang) — pola `usePetaSld` sekarang.

Risiko yang sebenarnya: **kerapian kode**. `PetaJaringan.tsx` sudah 1.268 baris
(folder `app/peta` ±9.600 baris). Menumpuk Mode SLD ke sana membuat tiap
perubahan berikutnya makin rawan merusak mode lain → **S1 dikerjakan dulu**.

---

## S1 — Rapikan `PetaJaringan.tsx` (tanpa perubahan perilaku) — DIKERJAKAN 13 Okt (belum commit, menunggu dicoba user)

`PetaJaringan.tsx` 1.268 → 416 baris (perakit saja). tsc & eslint bersih.

| Berkas baru | Isi |
|---|---|
| `_hooks/useLapisanNyala.ts` | ULP, `nyala`, `pilihan`, alih/alihBanyak/hanya/tambah, pohon menyala, `AwalPeta` |
| `_hooks/usePilihObjek.ts` | benda terpilih, geser, mode induk/gabung, `pilihTiang`/`pilihGardu`/`pilihKesehatan`, tutup |
| `_hooks/useAntreanPeta.ts` | antrean persetujuan JTR & JTM + gardu portal (saling menutup), buka dari `/peta?jtr=` |
| `_hooks/useLangkahAntrean.ts` | ‹ n/N › generik — 3 salinan jadi 1 |
| `_hooks/useLapisanTambahan.ts` | tegangan ujung, kesehatan gardu, pohon: saklar + bulan + saringan |
| `_hooks/useTulisIsian.ts` | isian JTM di tiang (ukuran/jenis kabel, isian koreksi) |
| `_hooks/useTiangMilik.ts` | peralatan tiang bersama hanya di pemiliknya + tanda "?" |
| `_lib/bingkai.ts` | `bingkaiSekitar` / `bingkaiTitik` / `bingkaiBatas` — lompatan peta yang tersebar 7 tempat |
| `_components/TombolAtas.tsx` | tombol bilah atas + 6 nada (11 salinan kelas/gaya jadi 1) |
| `_components/BilahAtas.tsx` | menu JTM/JTR/Gardu + Geser titik, Nama tiang, Muat ulang, Kembali |
| `_components/BilahKeadaan.tsx` | penghitung objek & pesan zoom kiri bawah |
| `_components/PenelusurAntrean.tsx` + `PenelusurPeta.tsx` | bilah ‹ n/N › (JTR, JTM, portal) |
| `_components/ObjekTerpilih.tsx` + `DialogObjek.tsx` | PanelObjek + semua sambungan sunting + dialog gabung/induk |
| `_components/PanelKanan.tsx` | tumpukan panel kesehatan/pohon/ujung |
| `_components/LegendaIsian.tsx` | legenda warna isian |

---|---|
| `_hooks/useLapisanNyala.ts` | `ulp`, `nyala`, `alih`, `alihBanyak`, `hanya`, `pilihan` (tanpa `pohon:`) |
| `_hooks/usePilihObjek.ts` | `terpilih`, geser, mode induk/gabung, `pilihTiang`, `pilihGardu`, `tutupObjek`, simpan geser, koreksi JTR |
| `_hooks/useLangkahAntrean.ts` | pola "‹ n/N ›" yang kini ditulis **3 kali** (antrean JTR, JTM, portal): posisi + geser maju/mundur |
| `_components/PenelusurAntrean.tsx` | bilah "‹ n/N ›" di tengah atas (3 salinan → 1) |
| `_components/BilahAtas.tsx` | tiga `MenuKelompok` (JTM/JTR/Gardu) + tombol Nama tiang, Muat ulang, Beranda |
| `_components/PanelKanan.tsx` | tumpukan panel kanan (kesehatan, ujung, pohon, rincian segmen/penyulang) |
| `_lib/kotak.ts` | `kotakSekitar(lat, lng, r)` — `setFokus([[lat-0.0008…]])` kini tersebar ±8 kali |

---

## S2 — Bagian reusable (dipakai mode biasa DAN Mode SLD) — DIKERJAKAN 13 Okt (belum commit)

| Bagian | Dulu | Kini |
|---|---|---|
| **Ikon gardu (rumah)** | ditulis dua kali: `PetaInner` (merah) & `PetaSldInner` (4 warna beban, tanpa pintu) | `app/peta/_lib/ikonPeta.ts` `ikonGardu(warna)`, di-cache per warna — Peta SLD kini memakai rumah yang sama |
| **Ikon keypoint** | `PetaInner` membuat divIcon **per tiang**; `PetaSldInner` membangun sendiri | `useIkonPenanda(penanda, sisi)` — satu ikon per kode penanda |
| **Latar peta** | `LayersControl` Leaflet (citra / jalan) | `useLatarPeta(mode)` (diingat per mode, pola useSyncExternalStore), `LapisanLatar` (ubin), `PilihLatar` (tombol kanan bawah): Kosong gelap · Kosong terang · Peta jalan pudar · Peta jalan · Citra satelit |
| **Kartu angka** | petak di `RingkasSimulasi` | `KartuAngka.tsx` (nada jingga/merah/netral) |
| **Format angka** | `angka()` di `DaftarPenyulang` | `app/peta/_lib/angka.ts` |
| **Hook data SLD** | `app/admin/peta-gardu/_hooks/usePetaSld.ts` | `app/peta/_hooks/useSld.ts` + `muatUlang(menyala)` |
| **Mesin SLD** | `lib/sld.ts` | tetap; fungsi baru di S4 |

Satu-satunya yang berubah di layar mode biasa: pemilih latar kini tombol
"Latar" di kanan bawah (dulu ikon lapisan Leaflet), dengan dua pilihan baru.

---|---|---|
| **Ikon gardu (rumah)** | ditulis dua kali: `PetaInner` (merah) & `PetaSldInner` (4 warna beban) | `app/peta/_lib/ikonPeta.ts`: `ikonGardu(warna)` di-cache per warna |
| **Ikon keypoint** | dua kali membangun `divIcon` dari `htmlPenandaJtm` | `useIkonPenanda(penanda, ukuran)` di berkas yang sama |
| **Latar peta** | `LayersControl` tetap di `PetaInner` (citra / jalan) | `LatarPeta.tsx`: Kosong gelap · Kosong terang · Peta jalan pudar · Peta jalan · Citra satelit; pilihan diingat **per mode** (localStorage, dibungkus try/catch) |
| **Kartu angka** | `Angka` di `HasilLepasPanel` + petak di `RingkasSimulasi` | `KartuAngka.tsx` (gaya gelap peta) |
| **Format angka** | `angka()` di `DaftarPenyulang` | pindah ke `app/peta/_lib/angka.ts` |
| **Hook data SLD** | `app/admin/peta-gardu/_hooks/usePetaSld.ts` | `app/peta/_hooks/useSld.ts` (isi sama, + `muatUlang`) |
| **Mesin SLD** | `lib/sld.ts` | tetap di `lib/` (murni, teruji) + fungsi baru S4 |
| **Excel gardu padam** | `lib/sldExcel.ts` | tetap |

"Peta jalan pudar" = ubin OpenStreetMap yang sama dengan filter CSS
(abu-abu + redup) — **tanpa penyedia peta baru**, tanpa biaya.

---

## S3 — Mode SLD: tampilan

- Tombol **Mode SLD** di bilah atas (paling kiri, menonjol). Alamat ikut
  berubah: `/peta?mode=sld` — bisa dibagikan, dan jadi tujuan alamat lama.
- Selama menyala:
  - **Disembunyikan** (bukan dipadamkan): tiang, JTR, lapisan gardu, pohon,
    tegangan ujung, kesehatan, antrean persetujuan, alat sunting. Mematikan
    Mode SLD memunculkan lagi pilihan lapisan yang tadi — pola "Segmen ini saja".
  - Menu JTM/JTR/Gardu diganti alat Mode SLD: **Label**, **Beban di keypoint**,
    **Latar**.
  - Panel kiri: hanya folder JTM, dan pilihan penyulangnya **sama** dengan
    mode biasa (satu `nyala`, bukan daftar kedua). Tiap penyulang diberi angka
    ringkas dari `peta_sld_penyulang`: KMS, gardu, kVA, beban, gangguan 12 bln.
    Penyulang yang belum dititik tetap tampil, bertanda "belum dititik".
- Digambar (`LapisanSld.tsx`, dimuat dinamis, di **MapContainer yang sama** —
  posisi & zoom tidak melompat saat berganti mode):
  - garis per simpul (warna per penyulang), pangkal **P**, keypoint (bentuk &
    warna dari Pengaturan JTM), gardu (rumah berwarna menurut % beban), titik
    ujung. Percabangan tidak digambar (hanya belokan garis).
- Latar bawaan Mode SLD: **Kosong**; mode biasa tetap **Peta jalan**.
- Panel kanan: kartu ringkas per penyulang yang menyala + peringatan data
  (`RingkasSldPanel`, sudah ada) — mis. OL. BENTEK saat ini **5 pangkal** =
  bagian jaringan yang belum tersambung ke pangkal utama.

---

## S4 — Simulasi + beban & gardu per keypoint

- **Klik pangkal / keypoint** → simulasi lepas (`lepas()` di `lib/sld.ts`,
  sudah ada): hilir merah tebal; KMS padam, gardu padam, kVA terpasang, beban
  terukur, **zona langsung** (sampai keypoint berikutnya), keypoint hilir
  (klik = pindah simulasi), daftar gardu + Unduh Excel. Instan, tanpa server.
- **Beban per keypoint** — fungsi baru `bebanKeypoint(graf, gardu)`: SATU kali
  jalan dari ujung ke pangkal (bukan simulasi per keypoint), tiap keypoint &
  pangkal mendapat: KMS hilir, jumlah gardu hilir, kVA terpasang, beban terukur
  (+ "x/y gardu diukur"), gardu ≥80%. Dipakai di:
  - label di bawah keypoint (saklar **Beban di keypoint**);
  - tabel **Keypoint** di kartu penyulang (klik = peta menuju + simulasi).
  Beban = pengukuran TERAKHIR gardu di hilirnya (keputusan 5 Okt).
- **Satu mesin simulasi.** Kini ada dua yang bisa memberi angka berbeda untuk
  alat yang sama:

  | | Peta (mode biasa) | Peta SLD |
  |---|---|---|
  | Mesin | server `simulasi_buka_alat` | browser `lib/sld.ts` |
  | Pohon | induk batang pemilik | **induk per penyulang** (titik pertemuan benar) |
  | Gardu | gardu terdekat ≤100 m dari tiang berpenanda gardu | **kode gardu di tiang** |
  | Portal | dihitung 2 bentang | bentang ke pasangan portal 0 km |
  | Peralatan tiang bersama | tidak membaca pemilik | membaca pemilik |

  Yang dipakai: **mesin SLD** (lebih sesuai data sekarang). Tombol **Simulasi**
  di panel tiang mode biasa → menyalakan Mode SLD untuk penyulang itu dan
  langsung mensimulasikan tiang tersebut. `useSimulasiBuka`, `LapisanSimulasi`,
  `RingkasSimulasi` dihapus. Fungsi `simulasi_buka_alat` di database dibiarkan
  (tidak dipanggil lagi); dibuang dengan skrip terpisah bila sudah yakin.
  Akibat yang perlu diketahui: tiang gardu yang **belum diberi kode gardu**
  tidak lagi "ditebak" dari gardu terdekat — dihitung "tanpa kode" dan disebut
  di peringatan, supaya datanya dibetulkan.

---

## S5 — Pensiunkan `/admin/peta-gardu`

- Hapus folder `app/admin/peta-gardu/` (page, `PetaSldInner`, `DaftarPenyulang`,
  `HasilLepasPanel`, `RingkasSldPanel`, `usePetaSld`) — isinya sudah pindah di
  S2–S4.
- Menu samping: buang "Peta SLD" (Peta Jaringan tetap).
- `next.config.ts`: `/admin/peta-gardu` → `/peta?mode=sld` (tautan & markah
  lama tidak putus). Hak akses tidak berubah: menu web tidak disaring per role
  untuk kedua alamat ini (diperiksa: `roles.menus` hanya memuat kunci HP).
- Komentar yang menyebut `/admin/peta-gardu` (±8 berkas) diperbarui.
- **Tanpa SQL baru.** View `peta_sld_penyulang` tetap dipakai.

---

## Urutan & pemeriksaan

S1 → S2 → S3 → S4 → S5, satu commit per tahap; tiap tahap: `tsc`, `eslint`, dan
dibuka di peramban lokal sebelum lanjut. S1 & S2 tidak mengubah tampilan — kalau
ada yang berubah, itu kesalahan.

## Sesudah rencana ini (dari `rencana-peta-sld.md`, belum)

- Status **NC/NO** keypoint, titik pertemuan sebagai sambungan NO ke penyulang
  tetangga, **simulasi manuver** (lepas X + tutup Y), isolasi seksi.
- Gangguan APKT/Sheet ditempel ke seksi, skor ML, usulan keypoint baru, ENS.
- Skema SLD otomatis (bukan geografis) berdampingan dengan peta, PDF A3.
- Pembenahan segmen impor (penyulang yang belum bertiang).
