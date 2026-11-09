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

---

# Tahap 2 — Segmen WO dijadikan drone + isian bawaan (RENCANA 9 Nov 2026)

Status: **DIBANGUN 9 Nov (lokal, belum commit)** — SQL `scripts/jtm-drone-segmen.sql` (belum dijalankan), web, HP (perlu OTA SESUDAH SQL). Jawaban: P1 pernah Tier 1 & disetujui · P2 tanpa SLA = total WO Tier 1 · P3 TIDAK boleh menitik · P4 temuan lama terbawa (tidak berpengaruh, yang sama ditimpa) · P5 setuju.

## Permintaan user (9 Nov)

1. Segmen yang **sudah ada di WO** Tier 1 bisa diubah menjadi **Tier 1 + drone** (per segmen, bukan per WO).
2. Jarak isian dari tiang khusus drone, **bawaan 500 m**, diatur di Pengaturan.
3. Drone hanya untuk segmen yang **sudah dititik**.
4. Target drone **bawaan 20 % dari SLA Tier 1** (Tier 1 biasa 80 %). Saat memilih segmen, user melihat
   **sudah berapa % dari SLA** — tidak menghitung manual.
5. Isian sama dengan Tier 1, tapi **semua isian dibawa dari inspeksi terakhir** (jenis konduktor, isolator, …).
6. **Wajib ≥ 1 foto per tiang**, ada temuan atau tidak (sudah ada sejak 28 Okt).
7. Ada temuan → user memilih **di mana** temuannya (mis. isolator flash) → mengubah isian itu → foto
   temuan seperti Tier 1 biasa.

## Keadaan sekarang (diperiksa 9 Nov)

- Drone dipilih **per WO** saat Susun WO (`wo_inspeksi.drone`), item mewarisi saat DIBUAT
  (`trg_wo_item_ikut_tier`, BEFORE INSERT saja). HP membaca `drone` **per item** → mengubah item satu per
  satu aman, tidak tertimpa.
- `jtm_settings.jarak_maks_drone_m` (bawaan 300) + `cek_jarak_drone` sudah ada di Ambang lapangan.
- Isian tiang Tier 1 di HP **mulai kosong**; keadaan terakhir tiap tiang sudah ada (`tiang_kondisi_terakhir`,
  diunduh ke HP `siapkanKondisiSegmen`) tapi hanya dipakai untuk "sebab tutup" temuan.
- Foto drone wajib ≥ 1 per tiang: sudah ada (HP + server).

## Rancangan

### D1 — SQL `scripts/jtm-drone-segmen.sql`
1. `jtm_settings.target_drone_persen` (bawaan 20, 0–100). `jarak_maks_drone_m`: bawaan → **500**;
   nilai yang tersimpan **300** (belum pernah diubah) ikut dinaikkan ke 500.
2. View/fungsi **segmen layak drone** per item WO Tier 1: `sudah_dititik` (definisi = P1) + alasan bila tidak.
3. RPC `atur_drone_item(p_item_ids, p_drone)` — UP3 / admin ULP-nya; hanya item **Tier 1**, **belum dikerjakan**
   (belum ada inspeksi terkirim), dan (menyalakan) **sudah dititik**. Menolak dengan alasan per item.
4. RPC ringkas **capaian rencana drone** per ULP-bulan: SLA Tier 1 (`sla_rekap 'jtm'`), KMS item drone,
   % dari SLA, target % (setelan), KMS Tier 1 biasa. Tanpa SLA → dibandingkan dengan total WO Tier 1 (P2).
5. Ringkasan WO / Rekap Kinerja rincian drone dihitung dari **item** (`wo_inspeksi_item.drone`), bukan WO.

### D2 — Web (WO Inspeksi JTM)
- Di daftar item WO Tier 1: centang per segmen / pilih banyak → **Jadikan Tier 1 + drone** / **Kembalikan ke
  Tier 1**. Segmen yang belum dititik / sudah dikerjakan: tombolnya mati + alasannya.
- Pita di atas daftar: *SLA Tier 1 136 km · drone 21,4 km (**15,7 %** dari SLA, target 20 %) · Tier 1 biasa
  114,6 km (84,3 %)* — ikut berubah langsung saat segmen dicentang (sebelum disimpan).
- Pengaturan JTM → Ambang lapangan: jarak drone bawaan 500 m (sudah ada barisnya) + **Target drone (% SLA)**.
- Susun WO "Tier 1 + drone" (seluruh WO) tetap ada.

### D3 — HP (OTA)
- Segmen drone: isian **terisi dari keadaan terakhir** tiap tiang (`tiang_kondisi_terakhir`, sudah ada di HP
  untuk luring). Item tanpa keadaan terakhir → kosong, wajib diisi seperti Tier 1.
- Formulir tiang drone, langkahnya:
  1. **Foto drone** (wajib ≥ 1).
  2. **Ada temuan?** — bawaan *Tidak ada temuan*: isian bawaan disimpan apa adanya, selesai.
  3. *Ada temuan* → pilih **bagian/item** (Konstruksi, Isolator, Konduktor, …) → isian item itu terbuka untuk
     diubah (mis. Isolator → Flash) → foto temuan seperti Tier 1. Bisa lebih dari satu temuan.
  Isian lain tetap tersembunyi/terkunci (ringkasan "dibawa dari inspeksi 12 Okt").
- Jarak menilai = ambang drone (500 m).
- Aturan yang tetap: temuan lama yang masih terbuka tetap tercatat sampai diubah (sebab tutup seperti biasa, P4).

### Urutan
SQL → web (bisa dipakai segera: centang drone + persen SLA) → HP (OTA). Uji: satu segmen Ampenan yang sudah
dititik dijadikan drone, dinilai di HP tanpa temuan + dengan satu temuan isolator.

## Pertanyaan untuk user (belum terjawab)

- **P1 "Sudah dititik"** artinya apa? (a) segmen pernah diinspeksi Tier 1 & **disetujui** (tiang & koordinat
  lengkap dari penitikan) — saran; (b) segmen punya tiang berkoordinat berapa pun; (c) lainnya.
- **P2 SLA tidak ada** (ULP tanpa SLA Tier 1 bulan itu): persen dihitung terhadap total WO Tier 1 — setuju?
- **P3 Tiang baru di segmen drone**: boleh menitik tiang baru (pilot di lokasi), atau mode drone hanya menilai
  tiang yang sudah ada?
- **P4 Temuan lama yang masih terbuka** ikut terbawa sebagai temuan (sampai regu menyatakan sudah
  diperbaiki/lainnya) — setuju? Atau drone tidak boleh menutup temuan lama?
- **P5 Batas ubah**: segmen boleh diubah drone ↔ biasa selama belum dikerjakan (belum ada inspeksi terkirim);
  yang sedang dikerjakan di HP (draf) ikut berubah saat HP memuat ulang — setuju?
