# Rencana — WO Perabasan per Segmen

Status: **rancangan, belum dikerjakan.** Menunggu aba-aba mulai.
Tanggal: 21 September 2026

## Keputusan terkunci (21 Sep 2026)

1. **Satuan WO = SEGMEN, sejak hari pertama.** Tidak ada bentuk kedua yang harus
   dibuang belakangan.
2. **Istilahnya "Perabasan" + objeknya** — "WO Perabasan · Segmen X". Tidak ada
   kata kerja baru, sejalan dengan Inspeksi JTR/JTM.
3. **Satu WO boleh memuat beberapa penyulang, dan boleh beberapa WO sebulan.**
   Ukurannya **total KMS**, bukan jumlah segmen atau bulan penerbitan.

---

## 1. Duduk perkara

Perabasan sekarang hanya mengeksekusi temuan satuan — tidak ada WO harian.
Yang diinginkan: WO berisi segmen beserta km-nya, regu
menyisir segmen itu, pohon dari hasil inspeksi JTM ditampilkan, pohon di luar
daftar boleh ditambahkan dengan foto sebelum–sesudah, lalu segmen ditandai
selesai untuk divalidasi admin.

**Hambatannya: segmen belum terbentuk.** Dan hambatannya dua lapis, bukan satu:

| | |
|---|---|
| Penyulang terdaftar | 82 |
| Penyulang yang sudah punya tiang | **7** — 252 dari 272 tiang ada di SATU penyulang |
| Segmen terbentuk | **8** |
| Tiang sudah masuk segmen | **87 dari 272** |
| Panjang JTM AMPENAN | 9,0 km, **6,26 km belum masuk segmen mana pun** |

Menunggu semuanya matang berarti WO perabasan tidak jalan berbulan-bulan.

---

## 2. Jembatannya: satu segmen per penyulang, dipecah belakangan

Tiap penyulang langsung mendapat **satu segmen "GI X – UJUNG"** yang mewakili
seluruh penyulang, dengan panjang **diketik admin**. WO bisa terbit besok.

Begitu inspeksi JTM menelusuri jalurnya, segmen itu **dipecah** jadi ruas
sungguhan, dan panjangnya beralih sendiri dari ketikan ke hitungan.

```
Hari ini                          Sesudah JTM menelusuri
────────────────────────────      ──────────────────────────────────
GUNUNG SARI                       GUNUNG SARI
 └ GI AMPENAN – UJUNG  12,4 km     ├ GI AMPENAN – REC. BRIMOB  2,0 km
        ↑ diketik                  ├ REC. BRIMOB – LBS PASAR   3,4 km
                                   └ LBS PASAR – UJUNG         7,0 km
                                            ↑ dihitung dari tiang
```

Kenapa ini yang dipilih: **satu konsep saja.** WO, realisasi, dan laporan tidak
berubah bentuknya saat segmen dipecah — yang berubah cuma berapa barisnya.
`segmen.induk_segmen_id` sudah ada untuk mencatat pecahan berasal dari mana.

### 2.1 Panjang: ketikan vs hitungan

`segmen` dapat kolom baru `panjang_manual_km`. Aturannya satu kalimat:

> **Panjang dihitung dari tiang. Kalau segmen belum punya tiang, dipakai angka
> ketikan.** Begitu tiang masuk, hitungan menang — ketikannya tidak dihapus,
> hanya berhenti dipakai.

Di layar, angka ketikan diberi tanda ✎ supaya tidak pernah tertukar dengan yang
dihitung. Tanpa penanda itu, laporan berisi campuran dua jenis angka yang
ketelitiannya berbeda jauh, dan tidak ada yang bisa membedakannya.

---

## 3. Dari mana pohonnya datang

**Satu sumber saja untuk sekarang**, ditambah yang ditemukan regu di lapangan:

| Sumber | Bentuknya | Sambungan ke segmen |
|---|---|---|
| **Inspeksi JTM** | jawaban `vegetasi` = "Berpotensi mengganggu" / "Menyentuh jaringan" pada satu tiang, plus `jenis_pohon` | lewat tiang → `segmen_tiang` → segmen ✅ sudah rapi |
| **Temuan lapangan** | pohon di luar daftar, dititik regu saat merabas | langsung ke item WO-nya |

### 3.1 ⚠ `inspeksi_pohon` DILUAR CAKUPAN

Disepakati 21 Sep 2026: 5.691 baris warisan itu **tidak dipakai dulu**, digarap
sebagai fitur tersendiri nanti.

Dan memang belum siap dipakai: 131 dari 182 nilai `penyulang`-nya ternyata nama
**keypoint** (`REC. PUSKESMAS KAYANGAN`, `LBSM GH MENO 1`, `FCO KOPANG 1`) —
**3.224 dari 5.691 baris**. Kolom itu mencatat *ruas mana*, bukan *penyulang
mana*, jadi tidak bisa disambungkan ke segmen tanpa pekerjaan pemetaan
tersendiri.

**Jangan dibersihkan lebih dulu.** Justru keypoint itulah petunjuk ruasnya:
saat segmen dibentuk sebagai "REC. A – REC. B", baris berlabel "REC. B" hampir
pasti milik ruas itu. Membersihkannya sekarang membuang satu-satunya keterangan
ruas yang dimiliki 3.224 baris tersebut.

**Akibatnya pada modul ini:** WO perabasan gelombang pertama hanya memuat pohon
dari inspeksi JTM — yang jumlahnya masih sedikit karena JTM baru menelusuri satu
penyulang. Sebagian besar realisasi awal akan berupa **temuan lapangan**, dan
itu wajar: regu merabas apa yang dilihatnya, daftarnya menyusul matang.

---

## 4. Bentuk data

Mengikuti pola `wo_pengukuran` yang sudah hidup — bukan pola ketiga.

```
wo_perabasan            boleh beberapa dalam sebulan, boleh lintas penyulang
  id, ulp, nama, tgl_wo, target_km, status, created_by, created_at

wo_perabasan_item       satu baris per SEGMEN di dalam WO
  id, wo_id, segmen_id, urutan
  ── potret saat terbit (disalin, bukan di-join) ──
  penyulang, segmen_nama, panjang_km, panjang_dari ('hitungan' | 'ketikan')
  ── pelaksanaan ──
  status, tgl_mulai, tgl_selesai, petugas_nama, petugas_uid, catatan
  verified_at, verified_by, verified_note

perabasan_realisasi     satu baris per POHON yang dikerjakan
  id, item_id, pohon_id (NULL = temuan baru di lapangan), tiang_id (NULL),
  jenis_pohon, lat, lng, foto_sebelum_url, foto_sesudah_url,
  petugas_nama, dikerjakan_at, catatan
```

**Kenapa potret identitas disalin**, sama alasannya dengan `wo_pengukuran_item`:
WO adalah dokumen bertanggal. Kalau nama segmen atau panjangnya berubah di
pertengahan bulan, lembar yang sudah dipegang regu tidak boleh ikut berubah.

**`panjang_dari` ikut disimpan.** Tanpa itu, capaian km bulan ini tidak bisa
dibandingkan dengan bulan lalu — sebagian angkanya ketikan, sebagian hitungan,
dan enam bulan lagi tidak ada yang ingat yang mana.

**Status item memakai kosakata yang sama** dengan inspeksi: Dijadwalkan → Dalam
Proses → Selesai → Diverifikasi / Ditolak / Dibatalkan. Bukan demi kerapian —
regu dan admin sudah hafal artinya, dan kata baru berarti mengajari ulang.

### 4.1 KMS, bukan jumlah segmen

Yang diukur **panjangnya**, bukan berapa ruas yang dicentang. Satu segmen 7 km
dan satu segmen 0,3 km bukan pekerjaan yang sebanding, dan menghitungnya
sama-sama "1 segmen selesai" akan membuat capaian terlihat baik justru saat yang
dikerjakan ruas-ruas pendek.

```
capaian_km  = jumlah panjang_km item berstatus Diverifikasi
capaian_%   = capaian_km / target_km
```

Karena itu pula `wo_perabasan` **tidak dikunci per bulan**: satu WO boleh terbit
kapan saja dengan target KMS-nya sendiri, dan boleh memuat segmen dari beberapa
penyulang sekaligus. Bedanya dengan `wo_pengukuran` (yang satu per bulan)
disengaja — di sana satuannya gardu yang sebanding, di sini kilometer yang tidak.

⚠ **Capaian km dari segmen ber-panjang ketikan tidak sebanding** dengan yang
dihitung dari tiang. `panjang_dari` yang membuatnya bisa dipisah saat dibaca —
kalau tidak, capaian bulan ini dan bulan lalu diam-diam mengukur hal berbeda.

---

## 5. Alur di layar

**Web — admin**
1. **Master Segmen** — segmennya sudah ada dari impor (`rencana-master-data.md`).
2. Menu baru **WO Perabasan**: pilih ULP → isi target KMS → centang segmen dari
   penyulang mana pun. **Total km berjalan terlihat saat mencentang**, beserta
   berapa km di antaranya yang masih berupa angka ketikan.
3. Tab **Persetujuan**: item berstatus Selesai divalidasi — sama bentuknya
   dengan Persetujuan JTR/JTM/HARGARDU yang sudah ada.

**HP — regu PERABASAN**
1. Daftar segmen di WO bulan berjalan, dengan km dan jumlah pohon menunggu.
2. Buka satu segmen → peta + daftar pohon dari inspeksi JTM.
3. Tiap pohon: **foto sebelum → kerjakan → foto sesudah**.
4. Tombol **"Pohon di luar daftar"** — titik GPS, jenis, dua foto.
5. **"Selesaikan perabasan segmen ini"** → masuk antrean validasi admin.

Foto sebelum–sesudah **wajib** untuk tiap pohon yang dilaporkan, dengan alasan
yang sama seperti foto temuan inspeksi: realisasi tanpa bukti tidak bisa
diverifikasi, dan tidak bisa dibandingkan dengan keadaan sesudahnya.

---

## 6. Urutan kerja

| Fase | Isi | Butuh | Keadaan |
|---|---|---|---|
| **1** | SQL: `segmen.panjang_manual_km` + view panjang yang memilih hitungan-atau-ketikan | SQL Editor | **selesai** 21 Sep (`scripts/master-segmen.sql`) |
| **2** | Web: Master Segmen + impor segmen per penyulang (`rencana-master-data.md`) | deploy web | **selesai** 21 Sep |
| **3** | SQL: tabel WO + fungsi terbitkan/selesaikan/putuskan | SQL Editor | **selesai** 21 Sep (`scripts/wo-perabasan.sql`) · diuji 15 skenario |
| **4** | Web: menu WO Perabasan — terbitkan & persetujuan | deploy web | **selesai** 21 Sep |
| **5** | HP: layar perabasan per segmen + realisasi pohon + foto | OTA |

Fase 1–2 sudah berguna sendiri walau WO belum ada: segmen membuat angka panjang
JTM per ULP berhenti nol, dan Master Segmen jadi tempat melihat ruas mana yang
paling lama tidak disentuh.

---

## 7. Yang perlu diperhatikan

**a. Segmen seluruh penyulang bisa menetap lebih lama dari yang direncanakan.**
Kalau JTM tidak kunjung menelusuri, WO perabasan tetap jalan di atas angka
ketikan bertahun-tahun. Itu bukan kegagalan — tapi harus terlihat: halaman
Segmen menampilkan berapa persen panjang yang masih berupa ketikan per ULP.

**b. Temuan lapangan tidak punya `tiang_id`.** Yang dari inspeksi JTM punya.
Artinya laporan "pohon per tiang" hanya lengkap untuk yang berasal dari inspeksi.
Disebut di sini supaya tidak jadi kejutan saat ada yang bertanya.

---

## 8. Tidak ada lagi yang menunggu jawaban

Ketiga keputusannya sudah terkunci di kepala berkas ini. Panjang segmen datang
dari impor di `rencana-master-data.md`, yang memang sekalian membawa km-nya.

Yang perlu ada lebih dulu: **Master Segmen** (fase 5 di rencana itu). WO ini
tidak bisa dibangun di atas delapan segmen.
