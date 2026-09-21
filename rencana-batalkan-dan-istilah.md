# Rencana — Membatalkan data keliru, dan mengganti istilah "penyapuan"

Status: **rancangan, belum dikerjakan.** Menunggu aba-aba mulai.
Tanggal: 21 September 2026

## Keputusan yang sudah terkunci (21 Sep 2026)

1. **Tiang TETAP** saat inspeksinya dibatalkan. Tiangnya nyata berdiri di
   lapangan; yang keliru cuma catatan bahwa ia diperiksa pada kesempatan itu.
2. **Nama database ikut disesuaikan** — ternyata kecil, lihat §B3.
3. **Istilahnya: "Inspeksi JTR" / "Inspeksi JTM" + objeknya.**
   ⚠ **"Inspeksi gardu" DICORET.** Yang sudah ada namanya **Pemeliharaan
   Gardu** (modul HARGARDU), dan itu memeriksa gardunya sendiri. Inspeksi JTR
   memeriksa **jaringan di bawah** gardu, bukan gardunya. Dua hal berbeda yang
   tidak boleh berbagi nama.
4. **Pembersihan data uji lewat SQL Editor**, selama masih tahap pengembangan.

Dua pekerjaan yang tidak berkaitan, ditulis bersama karena keduanya menyentuh
layar yang sama (Inspeksi JTM, Inspeksi JTR, HARGARDU) dan lebih murah
dikerjakan dalam satu tarikan.

---

# BAGIAN A — Membatalkan data yang keliru

## A1. Keadaan sekarang

| Objek | Bisa dibuang? | Di mana |
|---|---|---|
| Tiang JTR | ✅ `batalkan_tiang` → `status_hidup = 'batal'` | **HP saja** |
| Tiang JTM | ❌ tidak ada tombolnya | — |
| Inspeksi JTM **kosong** (0 tiang) | ✅ `buang_penyapuan_kosong_jtm` | web |
| Inspeksi JTM **berisi** | ❌ hanya Tolak / Gabung | web |
| Inspeksi JTR | ❌ hanya Tolak | web |
| Pemeliharaan gardu | ❌ hanya Tolak | web |

Ketimpangannya **kecelakaan sejarah, bukan keputusan**: JTR kebagian
`batalkan_tiang` karena modulnya dibangun belakangan, JTM tidak — padahal
keduanya memakai tabel `tiang` yang sama.

## A2. Yang TIDAK dikerjakan, dan kenapa

**Tidak ada DELETE permanen dari UI.** Ini sudah jadi sikap kode ini sejak awal;
komentar di `jtr-koreksi.sql` menyebutnya lugas:

> *"Barisnya tidak dihapus supaya tetap terlihat bahwa pernah ada kekeliruan di
> situ, dan siapa yang membuat serta siapa yang membatalkan."*

Tiga alasan yang membuat sikap itu benar:

1. **Angka bulan lalu ikut berubah surut.** Panjang jaringan (KMS), cakupan
   inspeksi, dan rekap temuan semuanya dihitung dari baris yang ada *sekarang*.
   Menghapus satu tiang hari ini membuat laporan yang sudah dikirim bulan lalu
   tidak bisa direproduksi — tanpa ada yang tahu kenapa angkanya bergeser.
2. **Tiang punya anak.** `induk_id` membentuk pohon; menghapus tiang di tengah
   memutus jalurnya dan panjang seluruh cabang di bawahnya langsung salah.
   `batalkan_tiang` sudah menolak kalau tiangnya masih menyuplai tiang lain —
   perlindungan yang hilang begitu diganti DELETE biasa.
3. **Inspeksi adalah bukti kerja orang.** Regu yang pekerjaannya bisa lenyap
   tanpa bekas akan berhenti percaya pada sistemnya.

**Pembersihan data uji coba tetap lewat SQL Editor** — disepakati 21 Sep 2026.
Selama masih tahap pengembangan, itu justru jalan yang benar: sekali jalan,
diputuskan orang yang tahu apa yang dibuang, tidak meninggalkan tombol yang
menganggur di layar menunggu salah ketuk. Polanya sudah ada di
`scripts/jtr-bersihkan-uji.sql`.

## A3. Yang dikerjakan

Satu tindakan seragam bernama **"Batalkan"**, bukan "Hapus". Wajib beralasan,
tercatat di `master_audit`, barisnya tetap ada tapi tidak ikut dihitung dan
tidak muncul di daftar.

### A3.1 Tiang JTM bisa dibatalkan

`batalkan_tiang` **sudah bekerja** di tabel `tiang` yang sama — tinggal dipasang
tombolnya. Satu hal yang harus ditambahkan ke fungsinya: ikut mengurus
`tiang_kode_penyulang`.

Tiang JTM punya nama di tiap penyulang yang melewatinya. Membatalkan tiangnya
tanpa menyentuh baris-baris itu meninggalkan nama yang menunjuk tiang yang sudah
dinyatakan tidak pernah ada — dan nomor itu tidak akan pernah bisa dipakai lagi
oleh tiang berikutnya, karena indeks uniknya masih memegangnya.

- Nama dibuang, bukan disimpan. Tiang `batal` artinya **tidak pernah ada**,
  jadi namanya juga tidak pernah ada.
- Jejaknya tetap utuh di `master_audit` — di situlah sejarahnya tinggal.

### A3.2 Tiang JTR bisa dibatalkan dari web

Sekarang hanya bisa dari HP, sehingga admin yang melihat salah input dari
mejanya harus menelepon petugas untuk membuka aplikasi. Tombolnya ditaruh di
tab **Jaringan JTR** (`RekapJtr`) dan di **Daftar Tiang** JTM.

### A3.3 Inspeksi berisi bisa dibatalkan

"Ditolak" **bukan** pembatalan — dia mengembalikan gardunya jadi pekerjaan, dan
itu memang gunanya. Yang belum ada: menyatakan *"inspeksi ini salah gardu / uji
coba, buang dari hitungan"*.

Status baru **`Dibatalkan`** pada `inspeksi_jtr` dan `penyapuan_jtm`:

| Status | Artinya | Ikut dihitung cakupan? |
|---|---|---|
| Selesai | petugas menyatakan tuntas | ya |
| Diverifikasi | admin menyetujui | ya |
| Ditolak | salah kerja, **ulangi** | tidak — gardunya kembali jadi pekerjaan |
| **Dibatalkan** | salah gardu / uji coba, **jangan diulang** | tidak, dan hilang dari daftar |

Tiang yang sudah dinilai di dalamnya **tidak ikut dibatalkan**. Tiangnya nyata
berdiri di lapangan; yang keliru cuma catatan bahwa ia diperiksa pada
kesempatan itu. Membatalkan keduanya sekaligus akan membuang pekerjaan menitik
yang sebenarnya benar.

### A3.4 Pemeliharaan gardu bisa dibatalkan

Pola yang sama lewat `putuskan_pemeliharaan`, ditambah cabang `Dibatalkan`.

### A3.5 Penyaring "tampilkan yang dibatalkan"

Wajib ada. Kalau yang batal tidak pernah bisa dilihat lagi, tidak ada cara
memeriksa apakah pembatalannya sendiri keliru — dan pembatalan yang salah jadi
kesalahan yang tidak bisa dibetulkan siapa pun.

Bentuknya satu kotak centang di bilah saring, mati secara bawaan.

## A4. Berkas — Bagian A

**Baru:**
```
scripts/jtm-jtr-batalkan.sql     batalkan_tiang diperluas; status Dibatalkan
                                 untuk inspeksi_jtr, penyapuan_jtm, pemeliharaan
```

**Diubah — web:**
```
app/admin/jtm/_components/DaftarTiang.tsx        tombol Batalkan
app/admin/jtm/_components/DaftarPenyapuan.tsx    Batalkan + saring "tampilkan dibatalkan"
app/admin/jtr/_components/RekapJtr.tsx           tombol Batalkan tiang
app/admin/jtr/_components/ApprovalGardu.tsx      Batalkan inspeksi
app/admin/hargardu/_components/PersetujuanHargardu.tsx
app/admin/*/\_hooks/*                             fungsi batalkan + saring
```

**Diubah — HP:** tidak ada. Tombol batal tiang JTR yang sudah ada tetap.

---

# BAGIAN B — "Penyapuan" diganti

## B1. Keputusan

**Istilah khususnya dibuang.** Yang dipakai: **"Inspeksi"** ditambah objeknya.

| Sekarang | Jadi |
|---|---|
| Penyapuan gardu AM001 | **Inspeksi JTR · Gardu AM001** |
| Penyapuan segmen X | **Inspeksi JTM · Segmen X** |
| 3 dari 27 tiang belum disapu | 3 dari 27 tiang **belum diperiksa** |
| Terakhir disapu 12 Sep | Terakhir **diinspeksi** 12 Sep |
| Selesaikan penyapuan gardu ini | **Selesaikan inspeksi gardu ini** |
| Cakupan: 62% gardu disapu 12 bulan terakhir | 62% gardu **diinspeksi** 12 bulan terakhir |

**Di dalam menu Inspeksi JTR, "JTR"-nya boleh dilesapkan** — konteksnya sudah
jelas. Yang wajib lengkap adalah layar yang mencampur keduanya: dashboard,
morning brief, dan notifikasi WA. Di situ "Inspeksi · Gardu AM001" tidak
memberi tahu apa pun tentang jaringan mana yang diperiksa.

## B2. Dua hal berbeda, dua kata — tanpa istilah baru

Kekhawatiran yang sah: "inspeksi" juga dipakai untuk temuan per titik. Dibedakan
lewat **objeknya**, bukan lewat kata kerja khusus:

```
INSPEKSI <objek>   satu gardu / satu segmen, tuntas   ← satuan pekerjaan
diperiksa          satu tiang di dalamnya             ← satuan isian
```

Jadi "inspeksi gardu" vs "tiang diperiksa". Ketuntasan tidak lagi dipikul satu
kata aneh, melainkan kalimatnya: *"27 dari 27 tiang diperiksa — inspeksi gardu
ini tuntas."*

Kebetulan yang membantu: tabel JTR **sudah** bernama `inspeksi_jtr`, bukan
`penyapuan_jtr`. Jadi arah ini mendekatkan layar ke nama yang sudah dipakai
database, bukan menjauhkannya.

## B3. Yang diganti — termasuk nama database

**Teks yang dibaca orang.** 233 kemunculan di 33 berkas web, 118 di 16 berkas HP.

**Nama database — ternyata kecil.** Tabel intinya **sudah** bernama benar
(`inspeksi_jtm`, `inspeksi_jtr`); "penyapuan" cuma tersisa di satu view, tujuh
fungsi, dan lima kolom view:

| Sekarang | Jadi |
|---|---|
| view `jtr_penyapuan` | `jtr_inspeksi` |
| `mulai_penyapuan_jtm` | `mulai_inspeksi_jtm` |
| `selesaikan_penyapuan_jtm` | `selesaikan_inspeksi_jtm` |
| `putuskan_penyapuan_jtm` | `putuskan_inspeksi_jtm` |
| `gabung_penyapuan_jtm` | `gabung_inspeksi_jtm` |
| `buang_penyapuan_kosong_jtm` | `buang_inspeksi_kosong_jtm` |
| `selesaikan_penyapuan` (JTR) | `selesaikan_inspeksi_jtr` |
| `jtm_tiang_tersapu` | `jtm_tiang_diperiksa` |
| kolom `terakhir_disapu` | `terakhir_inspeksi` |
| kolom `pernah_disapu` | `pernah_diinspeksi` |
| kolom `disapu_12_bulan` | `diinspeksi_12_bulan` |
| kolom `penyapuan_selesai` | `inspeksi_selesai` |
| kolom `penyapuan_dibuang` | `inspeksi_dibuang` |

`selesaikan_penyapuan` diberi akhiran `_jtr` sekalian — sekarang dia satu-satunya
yang tidak menyebut modulnya, padahal ada kembarannya di JTM.

**TIDAK diganti: nama berkas dan pengenal di dalam kode aplikasi**
(`JtrPenyapuanScreen.tsx`, `usePenyapuan.ts`, variabel `penyapuan`). Itu murni
urusan dalam, tidak pernah dibaca siapa pun selain kita, dan menggantinya cuma
menghasilkan diff besar tanpa satu pun perbedaan yang terlihat.

### ⚠ Bahaya khusus penggantian nama fungsi

Panggilan Supabase berupa **string**: `supabase.rpc("mulai_penyapuan_jtm", …)`.
Acuan yang terlewat **tidak** ketahuan saat `tsc` maupun `pnpm build` — dia gagal
saat tombolnya ditekan, di lapangan.

Karena itu urutannya dibalik dari kebiasaan: **fungsi lama dibuat sebagai
pembungkus yang memanggil yang baru**, hidup berdampingan satu rilis. HP yang
belum sempat OTA tetap bekerja. Pembungkusnya dibuang di rilis berikutnya,
sesudah dipastikan tidak ada lagi yang memanggilnya.

Tanpa jembatan ini, HP petugas yang belum memperbarui akan gagal menyimpan
pekerjaan sehari penuh — dan gagalnya baru ketahuan saat mereka menekan simpan
di ujung hari.

## B4. Cara mengerjakan — bukan cari-ganti buta

Ganti massal `penyapuan` → `inspeksi` akan merusak nama fungsi dan tabel yang
justru harus tetap. Urutannya:

1. Kumpulkan kemunculannya, pisahkan **string yang dibaca orang** dari
   **pengenal kode**.
2. Ganti hanya yang pertama, berkas per berkas.
3. Periksa yang tersisa: `grep -rin "penyapu\|menyapu\|disapu"` pada JSX dan
   literal string harus kosong; pada nama fungsi/tabel boleh tetap ada.
4. `tsc --noEmit` di kedua proyek, lalu `pnpm build`.

Perhatikan bentuk kalimatnya, jangan cuma katanya: *"Mulai penyapuan"* → *"Mulai
inspeksi"* benar, tapi *"Gardu belum pernah disapu"* → *"Gardu belum pernah
diinspeksi"*, bukan *"belum pernah diinspeksi gardu"*.

## B5. Berkas — Bagian B

**Web (33 berkas)** — terbanyak di:
```
app/admin/jtm/_components/DaftarPenyapuan.tsx
app/admin/jtm/_hooks/usePenyapuan.ts
app/admin/jtr/_components/ApprovalGardu.tsx · RekapJtr.tsx
app/admin/jtr/_hooks/useJtrRekap.ts
```

**HP (16 berkas)** — terbanyak di:
```
src/screens/JtmPenyapuanScreen.tsx · JtrPenyapuanScreen.tsx
src/screens/JtmScreen.tsx · JtrScreen.tsx
src/components/FormTiang.tsx · FormTiangJtm.tsx
src/config/menuConfig.ts · src/navigation/BottomTabNavigator.tsx
```

`menuConfig.ts` dan `BottomTabNavigator.tsx` menentukan nama menu di HP — itu
yang paling sering dibaca petugas, jadi periksa dua berkas itu lebih teliti.

---

# Urutan kerja

| Fase | Isi | Butuh |
|---|---|---|
| **1** | `scripts/jtm-jtr-batalkan.sql` | SQL Editor |
| **2** | Web: tombol Batalkan + saring "tampilkan dibatalkan" | deploy web |
| **3** | SQL: nama baru + pembungkus nama lama | SQL Editor |
| **4** | Ganti istilah + nama fungsi di web | deploy web |
| **5** | Ganti istilah + nama fungsi di HP | OTA |
| **6** | SQL: buang pembungkus nama lama + sunting `rintis_segmen_jtm` & `tutup_segmen_jtm` | SQL Editor, **sesudah OTA menyebar** |

Fase 4 dan 5 sebaiknya **terbit berdekatan** — selama belum, layar web dan HP
memakai dua kata untuk hal yang sama, dan itu justru lebih membingungkan
daripada satu kata aneh yang konsisten.

Fase 6 **jangan buru-buru.** Pembungkusnya kecil dan tidak mengganggu; biarkan
sampai Bapak yakin semua HP sudah memperbarui. Di HP, OTA baru aktif sesudah
force-close dua kali — jadi selalu ada petugas yang masih menjalankan versi lama
berhari-hari sesudah publikasi.

Fase 1–2 berdiri sendiri dan boleh lebih dulu.

---

# Tidak ada lagi yang menunggu jawaban

Keempat keputusannya sudah terkunci di kepala berkas ini. Rencana ini siap
dikerjakan begitu Bapak bilang mulai.
