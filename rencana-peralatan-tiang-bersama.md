# Rencana — Peralatan & gardu di tiang bersama (10 Okt 2026)

## Masalah
Satu tiang dipakai dua penyulang (menumpang/underbuild). Gardu dan peralatan di
tiang itu **tampil di kedua lapisan peta** dan **terhitung di kedua penyulang**
(Rekap Data). Padahal satu peralatan = satu pemilik; jumlahnya harus 1.

## Fakta (data hidup, 10 Okt)
- Isian `gardu` & `peralatan_hubung` = milik **tiang** (hanya regu pemilik batang
  yang mengisi), disimpan di `tiang.penanda` / `gardu_di_tiang` / `nama_peralatan`.
  **Tidak ada catatan peralatan itu milik penyulang mana.**
- `peta_tiang` cabang JTM: satu baris per `tiang_kode_penyulang`, tiap baris
  membawa `t.penanda` → ikon & label muncul di semua penyulang tiang itu.
  Pemakai `peta_tiang`: `/peta` (usePetaIsi), SLD (`lib/sld.ts`, usePetaSld).
  Tab Peta JTM (`useTiangJtm`) membaca `tiang` + `tiang_kode_penyulang` sendiri.
- Seluruh database: **8 tiang bersama** berperalatan/bergardu.

| Tiang | Peralatan | Pemilik tiang | Penyulang lain | Jenis |
|---|---|---|---|---|
| AMP-002R104 | LBSM KONCO | AMPENAN | GUNUNG SARI berakhir | pertemuan |
| PRM-024R008 | LBS Sampoerna | PERUMNAS | BATU DAWA berakhir | pertemuan |
| GNS-014/017/018 | Gardu AM225/AM340/AM153 | GUNUNG SARI | AMPENAN lewat | feeder master = AMPENAN |
| GNS-008, GNS-026 | Pengambilan | GUNUNG SARI | AMPENAN lewat | pemilik belum diketahui |
| GNS-033 | FCO Seksi | GUNUNG SARI | AMPENAN lewat | milik AMPENAN (kata user) |

## Keputusan user (10 Okt)
1. **Peralatan milik penyulang yang memakainya**, bukan pemilik tiang (contoh:
   FCO GNS-033 milik AMPENAN walau tiangnya GUNUNG SARI).
2. **Gardu di tiang bersama** ikut feeder di master gardu — **hanya untuk tiang
   bersama**; gardu di tiang biasa tetap ikut penyulang tiangnya.
3. **Titik pertemuan dikenali otomatis**: tiang berperalatan hubung tempat kabel
   penyulang lain **berakhir** (tidak ada tiang lanjutan di penyulang itu).
   Tampil di **kedua** lapisan peta, **dihitung sekali** di pemilik tiang.

## Rancangan

### 1. Database (`scripts/jtm-peralatan-tiang-bersama.sql`)
- Kolom `tiang.penanda_penyulang TEXT NULL` — pemilik peralatan (non-gardu) di
  tiang bersama, diisi admin/UP3. NULL = belum ditentukan.
- Fungsi `atur_pemilik_peralatan(p_tiang, p_penyulang, p_oleh)` — penyulang harus
  salah satu penyulang tiang itu; hak `wajib_boleh_ulp`; tercatat `master_audit`.
- View `jtm_pemilik_penanda` (tiang_id, penyulang, tampil, hitung, status):
  - tiang tidak bersama → pemilik = penyulang tiang (seperti sekarang);
  - **gardu** di tiang bersama → feeder master bila salah satu penyulangnya,
    selain itu pemilik tiang;
  - **pertemuan** (peralatan hubung + penumpang berakhir) → tampil di semua,
    dihitung di pemilik tiang;
  - **peralatan lain** di tiang bersama → `penanda_penyulang`; bila NULL →
    status `belum_ditentukan` (lihat pertanyaan T1).
- `peta_tiang`: kolom baru **di belakang** `penanda_tampil BOOLEAN` (penanda tidak
  dikosongkan — SLD tetap membaca penanda apa adanya dan memutuskan sendiri).
- `rekap_data_jtm`: peralatan & gardu memakai `hitung` dari view yang sama;
  **sekaligus** buang tiang batal & tiang yang sudah keluar dari segmennya
  (5 tiang batal masih terhitung — bug).

### 2. Web
- `/peta`: ikon penanda, label kode gardu / nama peralatan hanya digambar bila
  `penanda_tampil`; tiang lain di lapisan itu jadi bulatan biasa.
- Panel tiang (tiang bersama berperalatan, admin/UP3): baris **"Peralatan milik
  penyulang ___"** + pilihan penyulang tiang itu (lihat T2 untuk kata-katanya).
- Tanda "?" otomatis untuk peralatan di tiang bersama yang belum ditentukan
  pemiliknya (pola sama dengan induk loncat).
- Tab Peta JTM: aturan tampil yang sama (baca view).
- SLD: ikut `penanda_tampil` (pertemuan tetap di kedua SLD = sakelar NO/NC).

### 3. HP — tidak diubah di tahap ini
Regu penumpang tetap tidak mengisi peralatan (milik tiang). Penentuan pemilik
dari web saja. Bila nanti perlu dari HP → tahap terpisah.

## Data yang perlu dibereskan admin (bukan bagian kode)
- **AM232** tercatat di dua tiang berjarak 211 m: PRM-024R006 (PERUMNAS) &
  BTW-022 (BATU DAWA) — salah satu salah kode. **CN295** di dua tiang 669 m.
- 11 kode gardu lain di dua tiang berjarak 1–13 m (OL. BENTEK, BATU DAWA) —
  kemungkinan portal belum dipasangkan.

## Pertanyaan terbuka
- **T1**: peralatan di tiang bersama yang pemiliknya belum ditentukan (sekarang
  GNS-008, GNS-026) — selama belum dipilih, tampil & dihitung di mana?
- **T2**: kata di layar untuk pilihan pemilik ("Peralatan milik penyulang").
- **T3**: GNS-033 FCO → langsung diisi AMPENAN lewat skrip, atau admin pilih di peta?

## Uji
PGlite data hidup: 8 tiang di atas → tampil/hitung sesuai tabel; jumlah
peralatan & gardu per penyulang = fisik; peta_tiang baris lain tak berubah.

## Status 10 Okt 2026 — DIBANGUN (belum commit)
Jawaban user: T1 = usul (tampil di semua dengan "?", sementara dihitung di
pemilik tiang); T2 = "Peralatan milik penyulang"; T3 = GNS-033 diisi lewat skrip.
Pelaksanaan beda dari rancangan: `peta_tiang` TIDAK diubah — view kecil
`jtm_pemilik_penanda` dibaca sekali per halaman (`lib/milikPenanda.ts`) dan
diterapkan di /peta, Peta SLD, tab Peta JTM; Rekap Data memakai view yang sama.
- SQL: `scripts/jtm-peralatan-tiang-bersama.sql` lalu `scripts/jtm-rekap-data.sql`.
- Uji PGlite data hidup: 16 baris view sesuai tabel; hak ULP, penyulang lain &
  gardu ditolak; rekap: peralatan per jenis = fisik (fco 27, lbs 13, lbsm 9,
  peng 27, recloser 8); 5 tiang batal tak terhitung (2.233 → 2.228 tiang).
- Sisa data: AM232 tetap terhitung di PERUMNAS & BATU DAWA (dua tiang berbeda)
  sampai kodenya dibetulkan.
