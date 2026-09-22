# Rencana — Enam perbaikan JTM

Status: **Gelombang 1 SELESAI** (butir 3 dan 4) — butir 1, 2, 5, 6 belum.
Tanggal: 22 September 2026

Data masih tahap uji, jadi tidak ada risiko migrasi.

---

## 0. Yang sudah ada — jangan dibangun ulang

Diperiksa langsung di kode, 22 Sep:

| Sudah ada | Di mana |
|---|---|
| Peta segmen + ketuk tiang untuk memilih induk | `JtmPenyapuanScreen` + `LeafletMapJtr` |
| **Antrean luring untuk tiang baru** | `jtmService`: `bacaAntrean`, `tambahAntrean`, `kirimAntrean` — berurutan, dengan pemetaan `idLokal` → id sungguhan |
| Tiang dalam antrean **ikut tergambar di peta** | `semua` di baris 196 menggabungkannya dengan tiang server |
| Fungsi hapus tiang di database | `batalkan_tiang` (dari `batalkan-inspeksi.sql`) |
| Penjaga tiang berdekatan | `tiangTerdekat` + Alert dua pilihan |

**Akibatnya pada rencana:** butir 1, 2, dan 6 jauh lebih kecil daripada
kelihatannya, dan butir 6 bukan soal yang Bapak kira — lihat §6.

---

## 1. Pilih tiang sebelumnya di peta + modal konfirmasi

**Sudah setengah jalan.** Mengetuk tiang di peta sudah memilihnya sebagai
induk. Yang kurang dua hal:

```ts
const induk = terpilih ?? terakhirId;   // ← ini masalahnya
```

Kalau regu tidak mengetuk apa pun, induknya **diam-diam** jadi tiang terakhir
yang dititik. Itu benar 90% waktu — dan 10% sisanya melahirkan jalur yang
salah tanpa ada yang tahu, karena tidak ada satu pun keterangan di layar yang
menyebut tiang mana yang sedang dipakai sebagai induk.

Yang dikerjakan: induk **selalu terlihat** (nama tiangnya di bilah atas), dan
modal konfirmasi sebelum menitik yang menyebutnya apa adanya —
*"Tiang baru akan bersambung dari MTR-014. Benar?"*

Ukuran: **kecil.**

---

## 2. Hapus tiang yang sudah dititik

Fungsi databasenya **sudah ada** (`batalkan_tiang`, minta alasan, dan sudah
membersihkan `tiang_kode_penyulang`). Yang belum: tombolnya di HP.

Satu hal yang perlu diputuskan: **tiang yang punya anak tidak boleh dihapus
begitu saja** — anaknya akan kehilangan induk dan jalurnya terputus. Perlu
diperiksa apakah `batalkan_tiang` sudah menolaknya; kalau belum, itu tambahan
SQL kecil.

Ukuran: **kecil**, plus satu pemeriksaan SQL.

---

## 3. ✅ Tombol lokasi terkini — SELESAI

Tombol mengapung di kanan bawah peta, ketuk → peta melompat ke posisi petugas.

Dikerjakan di `LeafletMapJtr`, **di dalam HTML petanya** — bukan sebagai tombol
React Native yang mengapung di atas WebView. Alasannya: tombol RN berarti satu
pesan menyeberang ke WebView dulu, dan di HP kelas bawah jeda itu cukup lama
untuk membuat orang menekannya dua kali. Di dalam HTML, `map.setView` jalan
seketika.

Dua keputusan kecil yang sengaja:

- Tombol **tetap terlihat sebelum GPS terkunci**, hanya diredupkan. Tombol yang
  muncul-hilang membuat orang mengira aplikasinya rusak; yang redup lalu
  ditekan akan MENGATAKAN kenapa dia belum bisa dipakai.
- Perbesarannya `Math.max(zoom sekarang, 18)` — tidak menarik petugas keluar
  dari perbesaran yang sudah dia atur sendiri.

Letaknya kanan bawah, tidak bertabrakan: sakelar "mode nitik" dan "tumpang" di
layar JTM ada di kanan **atas**.

---

## 4. ✅ Opsi "tetap titik di sini" saat tiang berdekatan — SELESAI

Tanpa SQL, seperti diperkirakan: tidak ada penolakan jarak di
`tambah_tiang_jtm`, penjaganya murni di HP.

`tambah()` dipecah dua: `tambah()` memeriksa, `simpanTiangBaru(pos)`
melahirkan. Pemisahan itu yang membuat pilihan baru bisa memanggil jalur simpan
yang sama persis, bukan menyalinnya.

**Pilihan baru muncul di DUA tempat**, dan yang kedua justru yang lebih sering
kejadian:

| Keadaan | Dulu | Sekarang |
|---|---|---|
| Ada tiang **penyulang lain** di dekat sini | Batal · Tumpangi | Batal · **Tiang lain, bukan itu** · Tumpangi |
| Tiang **segmen ini sendiri** ada di dekat sini | cuma pemberitahuan, mentok | Batal · **Tiang lain, bukan itu** |

Baris kedua itu yang dulu benar-benar mentok — regu menyusuri jalur, dua tiang
bersebelahan memang lebih dekat daripada radius tumpang, dan tidak ada jalan
keluar sama sekali.

### Bagaimana dia dibuat tidak menonjol

Bukan dengan warna — Android tidak memberi warna pada tombol Alert. Dua cara:

1. **Dua ketukan.** Pilihan itu tidak langsung menitik; dia membuka pertanyaan
   kedua yang menyebut akibatnya apa adanya: *lahir tiang baru dengan namanya
   sendiri; kalau ternyata batangnya sama, di peta ada dua tiang bertumpuk dan
   pembatalannya lewat admin.*
2. **Urutan tombol.** Android memetakan tombol **terakhir** ke tombol utama —
   yang paling kanan, tempat jempol jatuh. Jadi "Tumpangi" ditaruh paling
   belakang, dan jalan keluarnya duduk di tengah. (Ini sempat salah urutan:
   menaruh pilihan baru di belakang justru menjadikannya yang paling menonjol.)

### Satu perubahan ikutan

`tiangTerdekat` gagal (butuh sinyal) sekarang **tidak lagi menggagalkan
penitikan** — penjaganya dilewati dan tiangnya masuk antrean luring. Tiang
bertumpuk masih bisa dibereskan; setengah hari kerja yang hilang tidak.

Ukuran: **kecil** — tepat seperti diperkirakan.

---

## 5. Tiang menumpang: di peta, bukan daftar

Sekarang `tiangSekitar` memulangkan daftar. Yang diminta: petanya, supaya regu
yakin dia sedang berdiri di dekat tiang yang mana — **beserta jalurnya**.

### ⚠ Soal lag yang Bapak sebut — nyata, dan ini sebabnya

Menggambar "tiang terdekat beserta jalurnya" bisa berarti menarik seluruh
tiang satu penyulang. Satu penyulang bisa ratusan tiang, dan WebView Leaflet
mulai tersendat di sekitar 300–500 penanda.

Tiga cara membatasinya, dan yang benar menurut saya **yang ketiga**:

| Cara | Masalahnya |
|---|---|
| Tarik semua tiang penyulang | Lag, dan sebagian besarnya di luar layar |
| Tarik radius tetap (mis. 200 m) | Jalurnya terpotong di tepi — regu tidak bisa melihat ke arah mana jaringan menuju |
| **Radius + bentang yang kedua ujungnya di dalam radius** | Jalur terlihat utuh di sekitar petugas, jumlahnya terbatas sendiri oleh radiusnya |

Yang ketiga itu pola yang **sudah dipakai** `perabasan_segmen_bentang` — dan
sudah terbukti di peta perabasan. Jadi bentuknya sudah ada contohnya.

Butuh SQL baru: satu fungsi `tiang_sekitar_peta_jtm(ulp, lat, lng, radius)`
yang memulangkan tiang **dan** bentangnya sekaligus, supaya HP tidak menarik
dua kali.

Ukuran: **sedang.** SQL + komponen peta baru.

---

## 6. ⚠ Luring: bukan yang Bapak kira — yang hilang BUKAN tiangnya

Ini temuan terpenting dari analisis ini.

**Tiang yang dititik saat luring TIDAK hilang.** Antreannya sudah ada,
tersimpan di HP, tergambar di peta dengan label "menunggu nama", dan dikirim
berurutan begitu sinyal kembali — lengkap dengan pemetaan induk supaya nama
tiang tetap benar.

Yang hilang adalah **bacaan masternya**:

```
getSegmen()      → daftar segmen
getTiangSegmen() → tiang yang SUDAH ada di segmen itu
getAmbang()      → radius tumpang
getItem()        → daftar item pemeriksaan
tiangTerdekat()  → penjaga tiang berdekatan  (RPC, wajib sinyal)
```

Kelimanya memanggil server saat layar dibuka. Jadi kalau regu membuka layar
**tanpa sinyal**, yang muncul peta kosong — bukan karena tiangnya hilang, tapi
karena tiang yang sudah ada tidak pernah termuat. Dan `tiangTerdekat` yang
gagal berarti penjaga tiang berdekatan mati diam-diam.

### Yang dikerjakan

Unduh master per ULP ke HP: `segmen`, `tiang` + bentangnya, `penyulang`,
`jtm_item_ref`, `ambang`. Lalu:

- Semua bacaan di atas **membaca simpanan lokal lebih dulu**, server cuma
  menyegarkan.
- `tiangTerdekat` dihitung **di HP** dari tiang yang terunduh — itu cuma
  hitungan jarak, tidak perlu server sama sekali.
- Tombol **Unduh master** dengan tanggal unduhan terakhir, dan tombol
  **Kirim** untuk antrean.

### Ukuran dan risikonya

**Terbesar dari keenamnya**, dan yang paling mengubah cara layar membaca data.
Satu ULP bisa ribuan tiang — perlu diukur dulu berapa besar berkasnya dan
berapa lama menyimpannya di AsyncStorage (kalau terlalu besar, SQLite).

---

## Urutan yang saya usulkan

| Gelombang | Butir | Alasan |
|---|---|---|
| ~~**1**~~ ✅ | ~~3 · 4~~ | **Selesai 22 Sep.** Hampir gratis, tidak ada SQL — cukup OTA. |
| **2** | 1 · 2 | Kecil, dan keduanya menyentuh alur yang sama (menitik & membatalkan), jadi lebih murah dikerjakan sekali jalan. |
| **3** | 5 | Sedang. Butuh SQL, dan bentuk datanya menentukan apa yang perlu diunduh di gelombang 4. |
| **4** | 6 | Terbesar. Dikerjakan TERAKHIR justru karena butir 4 dan 5 mengubah bacaan mana yang harus disimpan luring — menyimpan lebih dulu berarti menyimpan yang salah lalu mengulang. |

### Kalau kehilangan pekerjaan sudah terjadi sekarang

Urutan di atas menaruh luring paling belakang, dan itu keputusan yang bisa
salah kalau regu **sudah** kehilangan pekerjaan saat uji lapangan.

Ada versi sempit butir 6 yang bisa didahulukan — hanya menyimpan **segmen yang
sedang dibuka beserta tiangnya**, tanpa unduh master seluruh ULP. Itu sekitar
sepersepuluh pekerjaannya dan sudah menghentikan kehilangan yang paling sering.
Sebutkan saja kalau memang sudah kejadian.
