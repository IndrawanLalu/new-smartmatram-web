# Rencana — Enam perbaikan JTM

Status: **Gelombang 1 dan 2 SELESAI** (butir 1, 2, 3, 4) — butir 5 dan 6 belum.
Keempatnya tanpa SQL sama sekali: cukup OTA.
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

## 1. Pilih tiang sebelumnya di peta + modal konfirmasi — SELESAI

### Temuan yang membalik arah perbaikannya

Saat mengerjakan ini saya membaca `tambah_tiang_jtm`, dan **server yang
menerima induk kosong ternyata tidak membiarkan tiangnya tanpa induk** — dia
mencari sendiri:

```sql
-- Induk otomatis = tiang terdekat MILIK PENYULANG INI
IF induk IS NULL THEN
  SELECT t.id INTO induk FROM public.tiang t
  WHERE upper(t.penyulang) = upper(s.penyulang) AND t.status_hidup = 'aktif'
    AND public.jarak_meter(p_lat, p_lng, t.lat, t.lng) <= amb.bentang_maks_wajar_m * 3
  ORDER BY public.jarak_meter(p_lat, p_lng, t.lat, t.lng) LIMIT 1;
END IF;
```

Aturan server adalah **tiang terdekat dari tempat regu berdiri** — dan itu
justru aturan yang BENAR untuk kejadian yang dilaporkan: regu yang kembali ke
PRM-008 memang berdiri di dekat PRM-008.

Yang membuatnya salah adalah HP-nya. `induk = terpilih ?? terakhirId` selalu
mengirim tiang yang terakhir dititik, jadi bawaan HP **menimpa aturan server
yang lebih benar dengan tebakan yang lebih buruk.**

### Yang dikerjakan

| | Dulu | Sekarang |
|---|---|---|
| Bawaan induk | tiang yang terakhir dititik | tiang **terdekat**, sepola aturan server — `bentangMaksM x 3`, angka yang sama |
| Ketukan regu | menang, lalu terpasang terus | menang sampai tiang berikutnya lahir, lalu **dilepas** kembali ke otomatis |
| Keterangan di layar | di dalam kartu tiang terpilih — yang **tidak muncul** kalau regu belum mengetuk apa pun | **bilah induk** tetap di bawah peta: nama induk, jaraknya, dan apakah dia dipilih sendiri atau otomatis |
| Di peta | tidak ditandai | **cincin jingga putus-putus** di tiang induk |

Ketukan sekarang lewat satu fungsi (`ketukTiang`) yang memindahkan pandangan
**dan** sambungannya sekaligus — tidak ada lagi ketukan yang memindahkan satu
tanpa yang lain. Tombol **Lepas** di bilah mengembalikannya ke otomatis.

Cincin induk dikirim ke peta lewat **saluran sendiri** (`window.setInduk`),
bukan ikut di muatan tiang. Sebab: induk bawaan berpindah tiap regu berjalan,
dan kalau dia menumpang di muatan tiang, satu langkah kaki berarti 250 penanda
dihapus lalu digambar lagi. Ini pola yang sudah dipakai `setPosisi` di berkas
yang sama.

### Modalnya TIDAK di setiap penitikan

Ini menyimpang dari yang diminta, dan alasannya: mode nitik dipakai ratusan
kali per segmen. Pertanyaan yang muncul 250 kali berhenti dibaca sejak yang
kesepuluh — memasangnya di mana-mana justru **melemahkan** yang benar-benar
perlu dibaca.

Modalnya muncul pada tiga keadaan yang membuat jalur salah gambar:

1. **Induknya bukan tiang yang terakhir dititik** — inilah kejadian yang
   dilaporkan (regu berjalan kembali ke percabangan), dan juga penitikan
   pertama sesudah layar dibuka.
2. **Bentangnya lebih panjang dari bentang wajar ULP** — `bentangMaksM`, yang
   sudah bisa disetel dari web dan sebelumnya tidak dipakai sama sekali di HP.
3. **Tidak ada tiang lain dalam jangkauan** — tiang baru lahir sebagai pangkal
   jaringan, dan itu disebutkan apa adanya.

Kalau ketiganya tidak berlaku — menyusuri jalur lurus, induk = tiang yang baru
dititik — tidak ada pertanyaan, karena namanya sudah tertulis di bilah.

Kalau Bapak tetap mau modalnya di SETIAP penitikan, itu satu baris: hapus
ketiga syarat di `alasanInduk`.

Ukuran: **kecil**, seperti diperkirakan. Tanpa SQL.

---

## 2. Hapus tiang yang sudah dititik — SELESAI

Pemeriksaan SQL-nya sudah dilakukan: **`batalkan_tiang` memang sudah menolak**
tiang yang punya anak, jadi tidak ada tambahan SQL.

```sql
SELECT count(*) INTO jml FROM public.tiang
WHERE induk_id = p_id AND status_hidup = 'aktif';
IF jml > 0 THEN RAISE EXCEPTION
  'Tiang % masih menyuplai % tiang. Pindahkan dulu sambungannya ke tiang lain.', ...
```

### Dua jalan yang berbeda, dan bedanya bukan kerapian

| Tiang | Jalannya | Kenapa |
|---|---|---|
| Sudah di server | `batalkan_tiang` | jejaknya tinggal di `master_audit`, dan nama per penyulangnya dibuang supaya nomornya tidak terkunci selamanya oleh indeks unik |
| Masih di antrean HP | `buangDariAntrean` (baru) | belum pernah ada di server — tidak ada yang bisa dibatalkan, cukup dikeluarkan dari simpanan |

### Tiga penjaga, bukan satu

1. Tiang server yang masih menyuplai tiang server -> ditolak **database**.
2. Tiang antrean yang masih jadi induk tiang antrean lain -> ditolak
   `buangDariAntrean`. Alasannya sama dengan yang dipegang database:
   `kirimAntrean` menukar `indukRef` lewat peta `idLokal -> id sungguhan`, jadi
   induk yang tidak pernah terkirim membuat seluruh sisa jalur lahir sebagai
   pangkal.
3. Tiang **server** yang jadi induk tiang **antrean** -> diperiksa di layar.
   Ini yang tidak dilihat siapa pun: database tidak tahu isi antrean HP, dan
   `buangDariAntrean` tidak dipanggil. Tanpa pemeriksaan ini, penolakannya baru
   muncul jauh nanti saat antrean dikirim, dalam bentuk kegagalan yang tidak
   bisa dihubungkan lagi dengan penghapusan tadi.

Tombolnya di kartu tiang terpilih, berwarna merah — dibedakan dari tiga tombol
bulat di sebelahnya karena hanya yang ini yang membuang pekerjaan. Modalnya
menyebut bahwa ini untuk tiang yang **salah dititik**, bukan tiang yang memang
dicabut di lapangan; itu riwayat yang berbeda.

Ukuran: **kecil.** Tanpa SQL.

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

### BATASAN — petanya hidup DI DALAM alur menumpang

Ditegaskan Bapak 22 Sep: *"tiang yang di underbuild hanya muncul jika user
pilih tiang ini underbuild atau menumpang"*.

Jadi peta tiang sekitar ini **menggantikan `TumpangModal`** — dia tetap muncul
hanya sesudah regu menekan "Tiang ini menumpang". Dia TIDAK dipasang di peta
segmen utama, dan tiang penyulang lain tidak boleh digambar di sana dengan
sendirinya.

Sudah diperiksa, yang sekarang memang begitu: `tiangSekitar` (radius longgar,
lintas penyulang) cuma dipanggil dari `bukaTumpang`, dan `getTiangSegmen` hanya
memulangkan isi `segmen_tiang` — tiang penyulang lain masuk ke situ HANYA lewat
`tumpangiTiang`.

Satu yang terlihat seperti pengecualian tapi bukan: `tiangTerdekat` (radius
sempit, ~10 m) memang memunculkan tiang penyulang lain sebelum menambah tiang.
Itu PENJAGA — "satu batang beton tidak boleh lahir dua kali" — bukan tampilan,
dan `tambah_tiang_jtm` menegakkan hal yang sama di database.

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
| ~~**2**~~ SELESAI | ~~1 · 2~~ | **Selesai 22 Sep.** Ternyata juga tanpa SQL: `batalkan_tiang` sudah menolak tiang beranak, dan aturan induk yang benar sudah ada di `tambah_tiang_jtm` sejak awal — HP-nya yang menimpanya. |
| **3** | 5 | Sedang. Butuh SQL, dan bentuk datanya menentukan apa yang perlu diunduh di gelombang 4. |
| **4** | 6 | Terbesar. Dikerjakan TERAKHIR justru karena butir 4 dan 5 mengubah bacaan mana yang harus disimpan luring — menyimpan lebih dulu berarti menyimpan yang salah lalu mengulang. |

### Kalau kehilangan pekerjaan sudah terjadi sekarang

Urutan di atas menaruh luring paling belakang, dan itu keputusan yang bisa
salah kalau regu **sudah** kehilangan pekerjaan saat uji lapangan.

Ada versi sempit butir 6 yang bisa didahulukan — hanya menyimpan **segmen yang
sedang dibuka beserta tiangnya**, tanpa unduh master seluruh ULP. Itu sekitar
sepersepuluh pekerjaannya dan sudah menghentikan kehilangan yang paling sering.
Sebutkan saja kalau memang sudah kejadian.
