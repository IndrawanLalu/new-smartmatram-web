# Rencana — Survey Jaringan: jenis Rekonduktor JTR

23 Nov 2026. Status: WEB DIBANGUN 23 Nov (belum commit), SQL `survey-jaringan-7.sql` BELUM dijalankan; HP belum.

## Keputusan user (23 Nov)

1. Menu & layar "Survey Jaringan Baru" → **"Survey Jaringan"** (nama tabel/fungsi DB tetap).
2. Survey punya dua jenis: **Jaringan Baru** (yang ada) dan **Rekonduktor JTR**.
3. Lingkup rekonduktor: **kabel + aksesoris saja** (tiang tetap).
4. Suspension / Fixed (dead end) / LA (large angle) per tiang: **dari data inspeksi JTR**
   (`tiang_konduktor.aks_*` — kondisi selain "Tidak Ada" = ada); yang kosong diisi manual.
5. **Boleh beberapa ruas** per survey, tiap ruas boleh ukuran kabel pengganti berbeda; material dijumlah.

## Alur di peta (/peta?survey=…, jenis Rekonduktor JTR)

1. Pilih gardu → tiang JTR gardu itu tampil.
2. Klik tiang awal lalu tiang akhir → jalur ditelusuri PER KABEL lewat
   `tiang_konduktor.induk_tiang_id` dari tiang akhir mundur ke arah gardu sampai tiang awal.
   Di tiang percabangan, yang terpilih otomatis cabang menuju tiang terakhir; kabel (jurusan +
   nomor) ikut terkunci supaya kabel lain di tiang bersama tidak terbawa. Dua tiang tidak satu
   jalur → ditolak dengan pesan jelas.
3. Panjang ruas = jumlah `panjang_m` gawang (tiang_gawang_kabel).
4. Tabel per tiang: Treckschoer / Drugschoer (bawaan `tiang.stay_jenis`), Kontramast (manual,
   belum pernah tercatat), jumlah SR (bawaan `tiang.tarikan_sr`) → CCO/joint SR–JTR per SR,
   Suspension / Fixed / LA (bawaan inspeksi). Semua bisa diubah.
5. Kabel pengganti (jenis × ukuran dari jtr_ref) dipilih per ruas.

## Material

Pola `jtr_material_ref` (pekerjaan baru `rekonduktor`, disunting UP3): kabel (kabel_m × faktor),
suspension, fixed, LA, treckschoer, drugschoer, kontramast, CCO (per SR). Tampil di rincian survey
dan di tabel gambar survey PDF (lib/gambarSurvey/LembarPdf) + tabel per tiang.

## SQL

`scripts/survey-jaringan-7.sql`: jenis `REKONDUKTOR`, kolom `gardu_kode` + `ruas` (jsonb, salinan beku
per tiang), material bawaan rekonduktor, view daftar + `rekon_*`, fungsi `simpan_survey_rekonduktor`.
Wajib jalan sebelum build.

## Tambahan user (23 Nov, saat dibangun)

- Kabel untuk bon material = **panjang titik + 5% andongan** (faktor 1,05 di `jtr_material_ref`).

## Yang dibangun (web)

- `lib/rekonduktorJtr.ts` — telusuriJalur (mundur per kabel dari tiang akhir), buatRuas (isian bawaan),
  materialRekonduktor. `lib/bacaJtrGardu.ts` — bacaan DB bersama peta & PDF.
- Peta: `/peta?rekonduktor=<id|baru>` — useRekonduktorPeta, PanelRekonduktor, KartuRuasRekon,
  LapisanRekonduktor, PilihLatarSurvey (dipakai juga PanelSurvey).
- Daftar `/admin/survey-jaringan`: tombol Jaringan Baru / Rekonduktor JTR, RincianSurvey bercabang,
  RingkasRekonduktor; PDF GambarRekonduktorPdf (lembar 1 gambar + material, lembar 2 rincian per tiang).
- Pengaturan Analisis JTR: material bawaan pekerjaan "Rekonduktor JTR" + dasar per aksesoris.
- Diuji: penelusuran (percabangan, klik terbalik, beda cabang ditolak, kabel sejajar → pilihan) di Node;
  SQL -7 di PGlite (idempoten, penolakan, material awal tidak tertimpa).
