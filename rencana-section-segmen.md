# Rencana — Penyulang → Section → Segmen (22 Okt 2026)

Permintaan user 22 Okt 2026:
- Model jaringan menjadi **Penyulang → Section → Segmen**.
- **Section** = bagian penyulang **di antara keypoint**.
- **Segmen** ada **di dalam satu section** — pangkal & ujungnya bebas, namanya
  bebas, asal tidak keluar dari section-nya.
- Fitur **pecah section** (memotong section menjadi segmen-segmen).

Status: **RENCANA — keputusan inti dijawab user 22 Okt; menunggu aba-aba mulai X1.**

### Keputusan user (22 Okt 2026)
- **Batas section hanya REC / LBS / LBSM** (+ pangkal GI/PLTD/GH). FCO, PENG,
  3Y **bukan** batas section — beda dengan keypoint Mode SLD (semua penanda
  kecuali gardu); definisi section ditulis sendiri, Mode SLD tidak diubah.
- **Nama section otomatis** dari keypoint hulunya (`REC. MALOMBA`; section
  pertama = nama pangkal, mis. `GI AMPENAN`).

---

## Keadaan sekarang (diukur 22 Okt 2026)

| | |
|---|---|
| Segmen aktif | **1.396** — impor 1.144 (**1.047 di antaranya `PENG→PENG`**), tempelan WO 196, lapangan 56 |
| Nama segmen | dibentuk **trigger dari kedua ujungnya** (`segmen_susun_nama`); bebas hanya untuk sumber `impor`/`tempelan`; unik per penyulang |
| Tiang ber-penanda | recloser 31 · lbs 20 · lbsm 29 · fco 109 · peng 39 · 3y 3 · gardu 628 |
| Keypoint di Mode SLD | `lib/sld.ts` — **semua penanda kecuali gardu** (fco & peng ikut) |
| Segmen dipakai oleh | Inspeksi JTM (HP & web), WO JTM bertier, `jtm_cakupan`, `segmen_panjang`, Rekap Data Penyulang, Realisasi Bulanan, perabasan per segmen, Copy to PRO NTB |

Segmen adalah **satuan kerja** di hampir semua modul JTM. Karena itu rencana ini
**tidak mengubah arti segmen** — section ditambahkan sebagai lapisan di atasnya.

---

## Rancangan

### 1. Section DITURUNKAN, bukan diketik
Sama dengan prinsip `induk_segmen_id`: daftar yang diketik orang pasti melenceng
dari kenyataan. Section dihitung dari pohon tiang penyulang:

- Penelusuran dari pangkal penyulang (GI/PLTD/GH). **Setiap tiang keypoint
  membuka section baru** ke arah hilirnya.
- Section = semua tiang dari keypoint hulunya sampai sebelum keypoint
  berikutnya (persis "zona langsung" simulasi lepas di Mode SLD — satu mesin,
  `lib/sld.ts` + padanan SQL).
- **Identitas section = (penyulang, tiang keypoint hulunya)**. Stabil selama
  keypoint itu ada; menambah keypoint baru di tengah otomatis membelah section.
- **Nama section dibentuk otomatis** dari keypoint hulunya (mis.
  `REC. MALOMBA`), atau `GI AMPENAN` untuk section pertama.
- Disimpan sebagai tabel hasil hitung (`section`, `section_tiang`) yang
  diperbarui saat keypoint/induk tiang berubah — supaya peta & rekap cepat
  (pelajaran `peta_gardu`/`master_gardu_jtr`: jangan dihitung ulang per baris).

### 2. Segmen di dalam section
- `segmen.section_id` — diturunkan dari tiang-tiangnya.
- **Aturan:** semua tiang segmen harus dalam satu section. Ditegakkan saat
  segmen dibuat/diubah (server menolak, dengan nama tiang yang keluar).
- **Pangkal & ujung bebas** — boleh tiang biasa, tidak harus peralatan.
- **Nama bebas** — trigger `segmen_susun_nama` tidak lagi menimpa nama yang
  diketik admin (nama otomatis tetap jadi usulan bawaan).

### 3. Pecah section (fitur utama di `/peta`)
1. Klik section di peta → panel **Section**: daftar segmen di dalamnya,
   panjang, jumlah tiang, **tiang yang belum masuk segmen mana pun**.
2. **Pecah**: klik tiang-tiang batas di peta → pratinjau segmen yang terbentuk
   (warna per segmen, panjang, jumlah tiang) → ketik nama tiap segmen → Terapkan.
3. **Gabung** dua segmen bersebelahan dalam satu section.
4. Semua lewat pratinjau, tercatat di `master_audit`, pola "Generate ulang nama".

### 4. Data lama
- **Laporan "Segmen melewati keypoint"**: segmen impor yang tiangnya ada di
  dua section atau lebih. Diselesaikan admin lewat Pecah — **tidak dipecah
  otomatis** (inspeksi & WO lama menempel di segmen itu).
- Inspeksi/WO yang sudah ada **tetap di segmennya**; riwayat tidak berpindah.

### 5. Yang tidak berubah
Inspeksi JTM, WO, HP, rekap tetap per **segmen**. Section hanya menambah:
pengelompokan di peta & daftar, dan rekap per section (opsional, fase akhir).

---

## Fase

| Fase | Isi | Rilis |
|---|---|---|
| **X1** | SQL: definisi keypoint, `section` + `section_tiang` + fungsi susun, `segmen.section_id`, laporan "segmen melewati keypoint" | SQL |
| **X2** | `/peta`: lapisan Section (warna per section, nama di pangkal), panel Section | web |
| **X3** | Pecah / gabung segmen di dalam section + nama bebas + penjaga "tetap satu section" | SQL + web |
| **X4** | Daftar Segmen web & HP dikelompokkan per section; rekap per section | web + OTA |

---

## Masih terbuka (dipakai usulan kalau tidak dijawab)

1. ~~Batas section~~ — dijawab: REC/LBS/LBSM.
2. ~~Nama section~~ — dijawab: otomatis.
3. **Segmen harus menutup seluruh section tanpa celah?** (usulan: tidak wajib,
   tapi tiang tanpa segmen ditampilkan sebagai "belum masuk segmen").
4. **Nama segmen**: tetap unik per penyulang (usulan), atau cukup unik per section?
5. Istilah di layar: **"Section"** apa adanya, atau "Seksi"?
