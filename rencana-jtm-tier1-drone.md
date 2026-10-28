# Rencana — Inspeksi JTM "Tier 1 + drone" (28 Okt 2026)

Status: **DIBANGUN 28 Okt (lokal, belum commit)** — SQL `scripts/jtm-tier1-drone.sql` (uji PGlite 19 lulus), web, HP (perlu OTA). Jawaban user di bagian akhir.

## Permintaan user

- Tier 1 punya varian **Tier 1 + drone**.
- Susun WO Inspeksi JTM: ada pilihan WO drone.
- User bisa melihat berapa KMS yang di-WO-kan Tier 1 + drone.
- **WO dan realisasi Tier 1 = Tier 1 + Tier 1 drone** (drone bukan baris kinerja terpisah).
- HP: chip Tier 1 + drone.

## Pola yang ditiru: "Tier 2 + titik" (26 Okt, `jtm-tier2-titik.sql`)

Tier 2 + titik = mode per WO (`wo_inspeksi.titik`), dipilih admin di Susun WO,
item mewarisi dari WO, HP membaca dari WO. Tier 1 + drone memakai bentuk yang sama:
**tier tetap '1'**, ditambah penanda `drone`. Karena tier tetap '1', semua hitungan
Tier 1 yang ada (realisasi km, capaian WO, Rekap Kinerja, SLA, lampiran, PRO NTB,
LM 4DX) otomatis memasukkan drone — tidak ada rumus kinerja yang diubah.

## Rancangan

### D1 — SQL `scripts/jtm-tier1-drone.sql`
1. `wo_inspeksi.drone`, `wo_inspeksi_item.drone` BOOLEAN DEFAULT false;
   CHECK `NOT drone OR tier = '1'`. Pemicu `wo_item_ikut_tier` ikut menyalin `drone`.
2. `inspeksi_jtm.drone` BOOLEAN DEFAULT false — penanda per inspeksi, supaya km
   drone bisa dipisah di rincian (juga untuk inspeksi di luar WO bila diizinkan, P3).
3. `terbitkan_wo_inspeksi_jtm(…, p_drone)` — salin utuh dari definisi terbaru, ★.
4. View daftar WO / item / capaian membawa `drone`.
5. `realisasi_rentang` baris jtm membawa penanda drone di `rincian`
   ("Tier 1 + drone") — tanpa kunci baru, jadi Rekap tetap satu baris Tier 1.

### D2 — Web
- **Susun WO Inspeksi JTM:** chip mode ketiga untuk Tier 1: "Tier 1" / "Tier 1 + drone"
  (seperti chip "Tier 2 + titik").
- **Daftar WO:** lencana "+ drone"; ringkasan atas: *KMS di-WO-kan Tier 1 = n km,
  di antaranya drone m km*.
- **Rekap Kinerja baris Inspeksi JTM Tier 1:** rincian kecil "drone: WO x km ·
  realisasi y km" (pola rincian Pengukuran 27 Okt). Angka utama tidak berubah.
- **Daftar inspeksi & Excel hasil:** tier tampil "1 + drone".
- **LM 4DX:** bila diinginkan, sumber baru "Inspeksi JTM Tier 1 + drone" untuk baris
  "Inspeksi dengan Drone Skyprobe" (lihat P4).

### D3 — HP (`new-smart`, OTA)
- Kartu segmen: "Tier 1 + drone" (seperti "Tier 2 + titik").
- Saringan daftar: chip Semua / Tier 1 / **Tier 1 + drone** / Tier 2.
- Penyapuan membaca mode drone dari WO; inspeksi tersimpan `drone = true`.
- (bila P3 = ya) "Inspeksi segmen lain": chip "Tier 1 + drone".

Urutan: SQL dulu → web → HP (OTA). WO lama tidak berubah (drone = false).

## Pertanyaan untuk user (belum terjawab)

- **P1 Isian:** isian Tier 1 + drone sama persis dengan Tier 1 (semua item + menitik
  tiang), atau lebih ringkas (mis. hanya item yang terlihat dari udara)?
- **P2 Jarak menilai tiang:** pilot drone tidak berdiri di tiap tiang. Apakah syarat
  jarak/radius HP ke tiang dilonggarkan untuk mode drone? Kalau ya, apakah tiang baru
  tetap boleh dititik dari posisi pilot?
- **P3 Di luar WO:** boleh regu memulai Tier 1 + drone tanpa WO (chip di
  "Inspeksi segmen lain"), atau drone selalu lewat WO?
- **P4 LM 4DX:** baris "Inspeksi dengan Drone Skyprobe (Penyulang)" bersatuan
  PENYULANG — diisi otomatis dari drone (hitung penyulang berbeda per hari), atau
  tetap manual?

## Jawaban user (28 Okt)

- P1: isian sama dengan Tier 1, tapi **tiap tiang wajib ≥1 foto drone** (dipilih: per tiang; kamera atau galeri).
- P2: jarak drone **angka sendiri + sakelar** di Pengaturan JTM → Ambang lapangan (bawaan 300 m, 5–5.000).
- P3: boleh di luar WO (chip "Tier 1 + drone" di Inspeksi segmen lain).
- P4: LM 4DX otomatis — sumber khusus "Inspeksi JTM Tier 1 + drone (jumlah penyulang)".
