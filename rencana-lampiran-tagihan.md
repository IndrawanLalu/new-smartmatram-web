# Rencana — Realisasi Bulanan (Excel lampiran tagihan)

Dibuat 16 Okt 2026 · status: **DIBANGUN 16 Okt (T1–T4), menunggu SQL `scripts/realisasi-bulanan-lampiran.sql` + uji di peramban**

## Tujuan
Satu unduhan Excel **"Realisasi Bulanan"** per ULP per bulan, untuk lampiran
tagihan mitra. Kembaran Cetak WO di Rekap Kinerja: WO = rencana kerja,
Realisasi Bulanan = pekerjaan yang sudah dikerjakan **dan disetujui**.

## Keputusan user (16 Okt 2026)
1. Hanya pekerjaan **yang sudah disetujui**.
2. **Perabasan di luar WO** dan **tegangan ujung** ikut.
3. Isi tiap jenis = **rincian seperti unduhan modulnya** (contoh: JTR Hasil
   Inspeksi) — rincian hasil inspeksi / pemeliharaan, bukan daftar ringkas.
4. **Volume saja** (tanpa harga / Rp).
5. **Tanpa tanda tangan**, cukup item rinciannya.
6. Nama di layar: **"Realisasi Bulanan"**.
7. **Tanpa tautan foto.**
8. Sheet pertama = **rekap realisasi seperti tabel Rekap Kinerja**.

## Isi Excel
**Sheet 1 "Rekap Realisasi"** — judul "Realisasi Bulanan YANTEK ULP <ULP> —
<Bulan Tahun>", lalu tabel yang sama dengan Rekap Kinerja (angka dari
`rekap_kinerja`, bukan dihitung ulang):

| Jenis pekerjaan | WO terbit | SLA | Realisasi | Belum disetujui | Capaian WO | Capaian SLA | Keterangan |

Satuan ditulis di tiap sel (km / gardu / pekerjaan), tanpa baris total
(satuan bercampur — alasan yang sama dengan TabelKinerja).

**Sheet berikutnya — satu per jenis yang ada realisasinya**, isinya = format
unduhan modul masing-masing, disaring ke pekerjaan disetujui bulan itu:

| Jenis | Format sheet (yang sudah ada) |
|---|---|
| Perabasan (+ di luar WO, bagian terpisah) | `wo-perabasan/_lib/unduhExcel.ts` |
| Pemeliharaan Jaringan | `pemeliharaan-jaringan/_lib/unduhExcel.ts` (kolom foto dibuang) |
| Pemeliharaan Gardu | `hargardu/_lib/unduhExcel.ts` |
| Penyeimbangan Beban | `downloadPenyeimbanganXlsx` (sebelum/sesudah) |
| Optimasi Trafo | `optimasi-trafo/_lib/unduhExcel.ts` (sebelum/sesudah) |
| Pengukuran Beban Gardu | `downloadXlsx` pengukuran gardu |
| Tegangan Ujung | sheet baru: gardu, jurusan, R/S/T, tanggal, petugas, jarak |
| Inspeksi JTM | Hasil Inspeksi per tiang (`lib/jtmHasilExcel.ts`) |
| Inspeksi JTR | Hasil Inspeksi per tiang (`lib/jtrHasilExcel.ts`) |
| JTM Tier 2 / Inspeksi Gardu T1–T2 (dicentang web) | daftar objek sederhana (modulnya belum ada) |

## Kunci rancangan: satu himpunan pekerjaan, satu sumber
Angka di sheet Rekap dan baris di sheet rincian WAJIB himpunan yang sama.
Caranya: `realisasi_rentang` diberi kolom **`sumber_id`** (id baris modul) di
belakang; Realisasi Bulanan mengambil daftar id yang `disetujui` bulan itu,
lalu tiap sheet rincian membaca baris modulnya **berdasarkan id itu** — bukan
menyaring ulang tanggal/status dengan aturannya sendiri. Contoh nyata
perbedaannya: unduhan JTR Hasil Inspeksi kini menyaring `dikonfirmasi_at`
tiang, sedangkan realisasi JTR dihitung dari inspeksi yang dikirim &
disetujui — tanpa id, sheet JTR bisa berisi tiang yang tidak ditagih.

Modal memeriksa sebelum unduh: cacah/KMS tiap sheet rincian = angka Realisasi
di Rekap; bila beda → peringatan per jenis (unduh tetap boleh).

## Tahapan
- **T1 — SQL** `realisasi-bulanan-lampiran.sql`: `realisasi_rentang` + kolom
  `sumber_id` (DROP + CREATE; `realisasi_harian`/`_bulanan` memanggil kolom
  bernama, jadi tidak berubah). Hanya baca.
- **T2 — Pemisahan pembuat sheet**: tiap `unduhExcel` modul dipecah jadi
  `isiLembar(wb, baris)` + pembungkus unduh yang lama → tombol modul tidak
  berubah, Realisasi Bulanan memakai `isiLembar` yang sama (satu format, dua
  pintu; perubahan format modul otomatis ikut).
- **T3 — Pembaca data per jenis** berdasarkan id (paginasi `fetchAllRows`,
  `in` dipecah per 150 id).
- **T4 — Layar**: tombol **"Realisasi Bulanan"** di kepala Rekap Kinerja di
  samping Cetak WO; modal pilih ULP + bulan (bawaan bulan lalu), pratinjau
  jumlah per jenis + peringatan, Unduh Excel. UP3 boleh pilih ULP; lainnya
  ULP sendiri.

## Jawaban tambahan user (16 Okt 2026)
- JTM ringkas **per segmen**, JTR **per gardu**, lalu rincian per tiang.
- Pengukuran & tegangan ujung **satu lembar** (yang masuk realisasi =
  pengukuran yang tegangan ujungnya sudah ada) — unduhan Pengukuran Gardu
  memang sudah memuat kolom tegangan ujung (`denganUjungLapangan`).
- UP3 tetap **per ULP**.

## Yang dibangun
- `scripts/realisasi-bulanan-lampiran.sql` — `realisasi_rentang` + `sumber`,
  `sumber_id` (JTM Tier 2 dari dua tabel, jadi id saja tidak cukup).
- `lembarX(wb, baris, nama)` dipisah dari 8 unduhan modul (tombol modul tetap).
- `lib/hasilInspeksiExcel.tambahHasilInspeksi` (tanpa kolom foto) +
  `isiHasilJtm/isiHasilJtr`; rute `/api/export/jtm?bentuk=isi&segmen=…` dan
  `/api/export/jtr?bentuk=isi&gardu_daftar=…&ulp=…` memulangkan JSON.
- `kinerja-yantek/_lib/ambilLampiran.ts` (baca per id) +
  `_lib/unduhRealisasiBulanan.ts` + `_components/RealisasiBulananModal.tsx`;
  tombol "Realisasi Bulanan" di samping Cetak / Kirim WO. ULP & bulan =
  pilihan Rekap Kinerja di layar; "Semua ULP"/seluruh tahun → diminta pilih.
- Rabas di luar WO & tempelan dicentang: lembar sederhana (modulnya tanpa
  unduhan). Pemeliharaan Jaringan: kolom foto dibuang.
