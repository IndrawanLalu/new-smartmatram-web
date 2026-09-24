# Teknis Aplikasi — aturan yang berlaku di SEMUA modul

Berkas ini dibaca **sebelum membuat fitur baru**, di web maupun di HP.

Isinya bukan gaya penulisan kode — itu sudah ada di `CLAUDE.md`. Isinya **hal-hal
yang berulang kali salah**, ditulis satu kali supaya tidak perlu dikoreksi
berulang kali. Tiap butir lahir dari satu fitur nyata yang harus diperbaiki
setelah jadi. Daftar ini akan bertambah seiring waktu.

Kalau sebuah butir di sini bertabrakan dengan rencana sebuah fitur, yang menang
butir di sini — kecuali user berkata lain untuk fitur itu.

---

## 1. Alur baku pekerjaan lapangan: isi → selesai → periksa → KIRIM

**Aturan.** Petugas mengisi pekerjaan, menyelesaikannya, dan menyimpannya di HP.
Yang tersimpan itu **belum** realisasi. Baru setelah petugas merasa aman dan
menekan **Kirim**, catatan itu naik ke server dan dihitung sebagai realisasi.
Yang tersimpan di HP **dihapus setelah berhasil terkirim** — tidak boleh ada dua
salinan hidup untuk satu pekerjaan.

**Kenapa.** Petugas mengisi sambil berdiri di bawah tiang, satu tangan memegang
HP. Yang langsung terkirim begitu tombol ditekan berarti kesalahan ketik pun
sudah jadi angka di laporan manajemen sebelum sempat dibaca ulang. Jeda antara
"selesai mengisi" dan "saya kirim" itulah satu-satunya tempat petugas sempat
memeriksa pekerjaannya sendiri. Menghilangkan jeda itu memindahkan beban koreksi
ke admin, yang tidak berada di lokasi dan tidak tahu apa yang sebenarnya terjadi.

**Cara menerapkan.**
- Simpanan HP pakai `AsyncStorage`, satu kunci per modul (`@harjar_draf`,
  `@jtm_antrean`, …), berisi daftar draf.
- Tombol di formulir = **Simpan** (ke HP). Tombol **Kirim** berdiri sendiri di
  daftar, bukan di dalam formulir.
- Foto ikut menunggu: simpan URI lokalnya di draf, **unggah saat Kirim**. Foto
  yang diunggah lebih dulu akan jadi sampah di bucket kalau drafnya dibuang.
- Kirim yang gagal **tidak menghapus** drafnya. Berhenti di kegagalan pertama,
  sisanya tetap di HP.
- Daftar harus menunjukkan berapa yang masih menunggu dikirim, dengan kata yang
  jelas: "tersimpan di HP, belum terkirim".

**Contoh nyata.** Pemeliharaan Jaringan (Sep 2026) versi pertama menyimpan
langsung ke server begitu "Simpan" ditekan. Harus dirombak.

---

## 2. Yang sudah dikerjakan HARUS bisa dibuka kembali

**Aturan.** Setiap catatan yang dibuat petugas — draf maupun yang sudah terkirim
— harus bisa dibuka lagi untuk **dilihat**, dan **dikoreksi** kalau ada yang
salah. Formulir yang sekali ditutup tidak bisa dibuka lagi adalah cacat, bukan
kesederhanaan.

**Kenapa.** Kesalahan di lapangan itu normal: penyulang salah pilih, foto
tertukar, angka salah ketik. Kalau tidak ada jalan membukanya kembali, petugas
mengirim ulang pekerjaan yang sama — dan realisasinya terhitung dua kali. Yang
"sederhana" di layar jadi angka yang salah di rapat.

**Cara menerapkan.**
- Draf: ketuk kartunya → formulir yang sama terbuka berisi isian lama, bisa
  diubah, bisa dibuang.
- Sudah terkirim: ketuk kartunya → tampilan rincian **hanya-baca**.
- **Yang sudah terkirim tidak bisa diubah petugas** (diubah 25 Sep 2026,
  keputusan user). Koreksinya lewat admin **"Kembalikan ke petugas"** di web
  beserta alasannya. Yang dikembalikan muncul lagi di HP sebagai draf berisi
  isian lama (tab *Sudah dikerjakan*), diperbaiki, lalu dikirim ulang — dan
  kiriman ulang itu memperbarui catatan yang sama, bukan membuat baru.
- Menghapus catatan yang sudah terkirim: **tidak**. Statusnya jadi `Dibatalkan`
  berikut alasannya — yang dihapus tidak bisa diterangkan lagi.

**Kenapa terkirim tidak boleh diubah sendiri.** Admin bisa sedang memeriksanya
saat petugas mengubahnya, lalu menyetujui sesuatu yang sudah tidak ada. Lewat
"Kembalikan", selalu jelas siapa yang memegang catatan itu saat ini.

**Contoh nyata.** Pemeliharaan Jaringan (Sep 2026): catatan yang sudah dibuat
tidak bisa dibuka sama sekali. Dilaporkan user. Aturan hanya-baca lahir dari
Pemeliharaan Gardu (25 Sep 2026).

---

## 3. Papan ketik tidak boleh menutupi isian yang sedang diketik

**Aturan.** Di setiap formulir HP, isian yang sedang disentuh harus tetap
terlihat saat papan ketik muncul.

**Kenapa.** Petugas mengetik tanpa bisa melihat apa yang dia ketik. Salah ketik
baru ketahuan setelah papan ketik ditutup — kalau sempat diperiksa.

**Cara menerapkan.**
- Bungkus isi formulir dengan `KeyboardAvoidingView`
  (`behavior={Platform.OS === "ios" ? "padding" : undefined}`) di atas
  `ScrollView`.
- `ScrollView` pakai `keyboardShouldPersistTaps="handled"` — supaya ketukan
  pertama ke tombol lain langsung bekerja, bukan cuma menutup papan ketik.
- Beri ruang bawah yang cukup di `contentContainerStyle` (≥ 40).
- Isian terakhir dalam formulir jangan tombol simpan yang menempel di dasar
  layar tanpa jarak.

**Contoh nyata.** Pemeliharaan Jaringan (Sep 2026). Dilaporkan user.

---

## 4. Ukuran foto bukti: 1024 px / mutu 0,60, sekali kompres

**Aturan.** Foto bukti pekerjaan (sebelum–sesudah, bukti selesai) diunggah pada
**lebar 1024 px, mutu 0,60, JPEG** — satu kali kompresi saja, tepat di titik
unggah. Jangan mengompres dua kali di jalur yang sama.

Yang TIDAK ikut diturunkan: foto yang menilai **kondisi peralatan** (retak
isolator, karat traverse) — JTM dan JTR tetap 1600/0,70 dan 1280/0,70, karena di
situ ketajaman menentukan apa yang bisa dinilai dari fotonya.

**Kenapa.** Angka ini bukan tebakan, ini keputusan Bapak 21 Sep 2026 di modul
perabasan: pada 1280/0,70 satu objek berbiaya ±570 KB, dan dua foto per objek ×
dua puluh objek sehari = 11 MB — justru dari ruas jaringan yang sinyalnya paling
buruk. 1024/0,60 memotongnya jadi sekitar separuh, dan untuk membuktikan "ada,
lalu sudah dikerjakan" 1024 titik masih jelas.

**Cara menerapkan.**
- `ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1024 } }],
  { compress: 0.6, format: JPEG, base64: true })`, lalu base64 → `Uint8Array` →
  `supabase.storage.upload`.
- **Jangan** `fetch(file://)` untuk membaca berkas — gagal di Hermes.
- Pemotretan: `launchCameraAsync({ quality: 0.7 })`. Bukan 1: bitmap penuh dari
  kamera 50 MP memakan memori HP kelas bawah, dan mutu akhirnya toh ditentukan
  pass kedua.
- Modul yang mengunggah DUA foto per objek wajib memakai angka ini.

**Contoh nyata.** Perabasan (21 Sep 2026) lalu Pemeliharaan Jaringan (23 Sep).

---

## 5. Foto draf tinggal di penyimpanan sementara — sebut itu saat gagal

**Aturan.** Selama sebuah catatan menunggu dikirim (butir 1), foto lokalnya ada
di **cache** HP, dan sistem operasi boleh mengosongkannya kapan saja. Alur kirim
harus menerjemahkan kehilangan itu jadi kalimat yang bisa ditindaklanjuti regu,
bukan galat teknis dari pustaka gambar.

**Kenapa.** Draf yang menginap semalam bisa kehilangan fotonya. Regu yang cuma
melihat "manipulateAsync failed" tidak tahu harus berbuat apa, dan yang terjadi
berikutnya biasanya: pekerjaan diinput ulang dari awal, atau dianggap sudah
terkirim padahal tidak.

**Cara menerapkan.**
- Bedakan dua kegagalan: unggah yang gagal karena **jaringan** (coba lagi nanti,
  draf aman) dan foto yang **sudah tidak ada** (harus dipotret ulang).
- Kalimatnya menyebut jalan keluarnya: "buka catatan ini, potret ulang fotonya,
  lalu kirim lagi".
- Draf **tidak** dihapus dalam dua-duanya.
- Menyimpan foto ke tempat yang tahan lama butuh `expo-file-system` —
  dependensi native, jadi perlu build baru, **tidak bisa lewat OTA**. Selama
  belum dipasang, penjaga kalimat di atas itulah yang ada.

**Contoh nyata.** Pemeliharaan Jaringan (23 Sep 2026), saat alur draf dipasang.

---

## 6. Server mati harus TERBACA sebagai server mati

**Aturan.** Saat server atau databasenya tidak bisa dihubungi, tidak satu pun
layar boleh tampil seperti biasa dengan data kosong. Tiga hal wajib:

1. **Ada batasnya.** Permintaan yang tidak dijawab harus menyerah sendiri
   (±15 detik), bukan berputar selamanya.
2. **Kosong karena gagal ≠ kosong karena memang tidak ada.** Daftar yang gagal
   dimuat menampilkan keadaan gagal berikut tombol "Muat ulang" — bukan
   "tidak ada pekerjaan hari ini".
3. **Angka nol tidak boleh dikarang.** Kueri yang gagal TIDAK boleh diubah jadi
   `[]` lalu dihitung sebagai 0 di rekap. Rekap yang menampilkan nol realisasi
   padahal databasenya mati adalah laporan palsu, dan tidak ada yang bisa
   membedakannya dari kinerja yang benar-benar nol.

**Kenapa.** Regu yang membuka Tugas lalu melihat daftar kosong akan pulang.
Manajemen yang membuka Rekap Kinerja lalu melihat nol akan menegur unit yang
sebenarnya bekerja. Dua-duanya keputusan salah yang diambil dengan tenang,
karena layarnya tidak kelihatan sedang gagal. Ini makin penting begitu Supabase
pindah ke **self-hosting**: server sendiri lebih sering mati daripada layanan
terkelola, dan matinya sering setengah — HTTP-nya hidup, databasenya tidak.

**Cara menerapkan.**
- Batas waktu dipasang SEKALI di `src/config/supabase.ts` lewat `global.fetch`
  ber-`AbortController`, bukan satu per satu di tiap layar.
- Tiap layar daftar punya tiga keadaan terpisah: `memuat`, `galat`, `kosong`.
  `catch` yang isinya cuma `console.error` sama saja dengan tidak menangani —
  di aplikasi terpasang, console tidak dilihat siapa pun.
- Pesan galat menyebut apa yang terjadi dan apa yang bisa dilakukan: "server
  tidak menjawab — coba lagi sebentar", bukan "Terjadi kesalahan".
- **Jangan menuduh pengguna atau datanya saat sebabnya server.** Contoh salah
  yang pernah ada: galat jaringan saat login berakhir jadi "User tidak memiliki
  role. Hubungi administrator" — regu menelepon admin padahal servernya mati.
- **Sesi lokal jangan dihapus** karena server menolak menyegarkan token. Yang
  boleh mengeluarkan pengguna cuma tombol Keluar. Kalau tidak, regu terkunci di
  luar tepat saat server mati — berikut draf yang belum terkirim.
- Pekerjaan yang sudah diisi tidak boleh hilang karena server mati: itu dijamin
  butir 1 (simpan di HP dulu), dan modul yang belum memakainya jadi rentan.
- Membedakan "HP tanpa sinyal" dari "server mati" butuh `@react-native-community/netinfo`
  — dependensi native, perlu build baru, tidak bisa lewat OTA.

**Contoh nyata.** Audit 23 September 2026: lima layar HP menelan galat ke
console (Beranda, Tugas, Work Order, Riwayat Gardu, Peta Pohon), dan
`useKinerjaYantek` di web mengubah kueri gagal jadi angka nol.

---

## 7. Daftar pekerjaan di web = TABEL, rinciannya = MODAL

**Aturan.** Daftar pekerjaan (WO, catatan lapangan, verifikasi) tampil sebagai
**tabel** berkolom lengkap: 20 baris per halaman, penyaring ULP + periode
(bawaan **bulan berjalan**) + status + cari. Klik baris → **modal detail**.
Semua keputusan admin (verifikasi, koreksi, batal) ada di kaki modal itu.
Bukan kartu bertumpuk, bukan halaman terpisah.

**Kenapa.** Admin memeriksa puluhan pekerjaan sekaligus. Kartu bertumpuk
memaksanya menggulir jauh, tanpa bisa membandingkan satu pekerjaan dengan yang
lain. Modul yang menyimpang dari pola ini harus dibongkar ulang.

**Cara menerapkan.**
- Kerangka modal: `app/admin/_components/ModalShell.tsx`, lebar `max-w-4xl`
  untuk detail. Isi yang panjang dipecah ke komponen `Isi…`, dan formulir koreksi
  ke komponen sendiri. Tombol "Simpan koreksi" di kaki modal memakai
  `form={ID_FORM}`.
- **Modal membaca data hidup**: simpan `kunci` baris yang dibuka, lalu cari
  barisnya dari daftar LENGKAP (bukan daftar yang tersaring). Setelah verifikasi,
  status di modal langsung berubah, dan baris yang keluar dari saringan tidak
  ikut menutup modalnya.
- Pekerjaan yang punya "sebelum" dan "sesudah" ditaruh **berdampingan**, bukan
  berurutan. Yang dinilai admin adalah bedanya.
- Kalau ada WO yang belum dikerjakan, WO itu tampil di tabel yang sama dengan
  status "Belum dikerjakan". **WO yang belum dikerjakan selalu tampil, apa pun
  bulan yang dipilih**: itu tunggakan, dan tunggakan yang hilang karena bulan
  berganti tidak akan pernah ditagih.
- Setelah mutasi satu baris, **ambil ulang baris itu saja** dari view lalu tambal
  di tempat. Kolom turunan (beban, jejak, jumlah usulan) dihitung server; jangan
  ditebak di peramban.

- **Urutan tab** (arahan user, 24 Sep 2026): **Daftar pekerjaan → Dashboard
  → tab lain (Peta, Segmen, Susun WO, …) → Pengaturan paling akhir.** Tab
  bergaya `CHIP`.
- **Status verifikasi/persetujuan adalah CHIP penyaring** di baris kedua di
  bawah penyaring utama, lengkap dengan jumlahnya. Bukan tab "Persetujuan"
  tersendiri.
- **Setiap daftar pekerjaan punya kolom WO dan Tgl WO**, diisi dari sumber
  WO-nya (WO modul sendiri, atau temuan inspeksi yang ditugaskan ke regu
  eksekutor di Monitoring Inspeksi, dengan Tgl WO = `inspeksi.assigned_at`).
  Pekerjaan tanpa WO bertanda **"-"**. (Arahan user 24 Sep 2026; sempat
  ditulis "WO belum terbit", lalu diganti.)
- **Tab Dashboard ringkas** berisi empat `StatTile`, satu `TrenBulananArsir`
  (Januari–Desember, batang berarsir dengan garis tahun lalu), dan dua
  `DaftarBatang` (per ULP, per kategori/regu). Ketiganya komponen bersama di
  `app/admin/_components/`. Dashboard mengikuti penyaring ULP dan tahun;
  penyaring bulan disembunyikan di sana karena dashboard selalu setahun.
- Pengecualian: Pengukuran Gardu tetap dengan bentuknya sendiri.

**Contoh nyata.** Optimasi Trafo (24 Sep 2026): versi pertama berupa kartu
dengan `window.prompt`, lalu dirombak total atas permintaan user. Acuan yang
benar sekarang: `app/admin/optimasi-trafo/` (daftar + modal) dan
`app/admin/pemeliharaan-jaringan/` (lengkap dengan tab Dashboard).

---

## 8. Konfirmasi dan alasan: `ConfirmDialog` & `BatalkanModal`, bukan `window.*`

**Aturan.** `window.confirm`, `window.prompt`, dan `window.alert` **tidak
dipakai**. Tindakan yang perlu ditegaskan memakai `ConfirmDialog`. Tindakan yang
butuh alasan (batal, salah input, batalkan WO) memakai `BatalkanModal`.

**Kenapa.** Kotak dialog bawaan peramban tidak bisa diberi gaya, tidak bisa
menerangkan akibatnya, dan di sebagian peramban bisa diblokir diam-diam.
Alasan yang diketik di `prompt` satu baris cenderung asal-asalan, padahal
alasan itu dibaca orang enam bulan kemudian.

**Cara menerapkan.**
- `app/admin/_components/ConfirmDialog.tsx`: `title`, `message` (sebutkan
  **akibatnya**, misalnya "3 isian master gardu akan langsung diubah"),
  `confirmLabel`, `tone="danger"` untuk yang merusak.
- `app/admin/_components/BatalkanModal.tsx`: `judul`, `keterangan` (apa yang
  terjadi), `peringatan` (yang tidak bisa dipulihkan), `labelTombol`.
  `onBatalkan` mengembalikan `Promise<boolean>`. Kalau gagal, modal **tetap
  terbuka** supaya alasan tidak perlu diketik ulang.
- "Batalkan" ≠ "Hapus". Barisnya tetap ada dengan status `Dibatalkan` beserta
  alasannya (lihat juga butir 2).
- **Lapisan z-index** (jangan dilanggar, atau dialog tertimbun):
  peta Leaflet ≤ 1000 · `ModalShell` 2000 · `ConfirmDialog`/`BatalkanModal` 2050
  · Toast 2100.

**Contoh nyata.** Optimasi Trafo (24 Sep 2026): `BatalkanModal` masih `z-50`
dan `ConfirmDialog` `z-[60]`. Keduanya tertimbun kalau dibuka dari dalam
`ModalShell`, lalu dinaikkan ke 2050.

---

## 9. Hasil tindakan dilaporkan lewat Toast

**Aturan.** Setiap tindakan admin yang menyentuh server berakhir dengan toast:
`toast.success(...)` kalau berhasil, `toast.error(pesan dari server)` kalau
gagal. Tidak ada tindakan yang selesai tanpa kabar.

**Cara menerapkan.**
- `const toast = useToast()` dari `app/admin/_components/Toast.tsx`
  (`success` · `error` · `info`). Error bertahan 6 detik, success 3,2 detik.
- Kalimat sukses menyebut **hasilnya**, bukan sekadar "Berhasil". Contoh:
  "Diverifikasi — 2 isian master diperbarui."
- Kalimat gagal = pesan penjaga dari database (`RAISE EXCEPTION` di SQL sudah
  ditulis dalam bahasa lapangan), jadi tidak perlu diterjemahkan ulang.
- Satu pembungkus `jalankan(kerja)` di komponen: set sibuk → toast → matikan
  sibuk. Contoh: `DetailOptimasiModal.tsx`.

---

## 10. Unduhan Excel: satu gaya, isinya = yang tampil

**Aturan.** Setiap tabel pekerjaan punya tombol **Download XLSX** di ujung
kanan baris penyaring. Isinya **persis baris yang sedang tampil**, mengikuti
penyaring yang dipilih.

**Kenapa.** Excel dibawa ke rapat dan dibandingkan dengan layar. Kalau isinya
berbeda dari yang tampil, yang dipercaya salah satunya, dan dua-duanya
berhenti dipercaya.

**Cara menerapkan.**
- Gaya bersama: `lib/xlsxGaya.ts` (`styleCell`, `mergeSet`, `downloadBuffer`,
  warna `CLR_*`). **Jangan menyalin fungsi gaya ke berkas baru.**
- Model: kepala kuning (`CLR_HEADER`), kolom WO biru muda, blok **SEBELUM**
  merah muda (`CLR_PINK`) dan **SESUDAH** hijau (`CLR_GREEN`) berkepala dua
  baris, % beban ≥ 80 disorot merah (`FFCDD2`), baris berselang warna, kolom
  identitas dan kepala dibekukan (`ws.views` frozen), halaman landscape.
- Pembuat Excel ditaruh di `_lib/unduhExcel.ts` halaman itu, dan **dimuat lewat
  `await import(...)` saat tombol ditekan**. exceljs berukuran ratusan KB dan
  kebanyakan kunjungan tidak pernah mengunduh.
- Nama berkas: `Modul_ULP_Periode.xlsx`, misalnya
  `Optimasi_Trafo_AMPENAN_2026-09.xlsx`.
- Contoh lengkap: `app/admin/optimasi-trafo/_lib/unduhExcel.ts`. Model
  sebelum/sesudah yang lebih tua: Rekap Penyeimbangan di
  `pengukuran-gardu/_utils/downloadXlsx.ts`.

---

## 11. Periksa tipe kolom dan data NYATA sebelum menulis SQL

**Aturan.** Sebelum menulis SQL yang menyambung ke tabel lama, periksa dulu
**tipe kolom sebenarnya** dan **bentuk datanya** lewat database, bukan dari
nama kolom atau kebiasaan.

**Kenapa.** Tabel warisan migrasi Firestore tidak bertipe seperti yang
diduga. Menduga membuat skrip gagal di SQL Editor, dan user yang harus
menjalankannya ulang berkali-kali.

**Yang sudah diketahui (24 Sep 2026):**
- `pengukuran_gardu.id` → **TEXT**, bukan UUID. FK harus TEXT.
- `pengukuran_gardu.tanggal_pengukuran` → **TEXT** berformat `YYYY-MM-DD`
  (seluruh 2.170 baris). Dibandingkan dengan `to_char(tgl, 'YYYY-MM-DD')`,
  jangan `<=` langsung dengan DATE.
- `gardu.no_seri` baru terisi sejak `optimasi-trafo.sql`. Sebelumnya nomor seri
  hanya ada di `data_amg->>'NO SERI'`, dan 110 di antaranya kembar.

**Cara menerapkan.** Kueri kecil lewat REST dengan service key (hanya baca):
ambil beberapa baris, dan hitung pola formatnya kalau kolomnya teks.
`CREATE OR REPLACE VIEW` hanya boleh **menambah kolom di akhir**, jadi view
yang diperluas harus mempertahankan urutan kolom lamanya.

---

## 12. WO yang tidak jadi dikerjakan dibatalkan dengan alasan, bukan dihapus

**Aturan.** WO yang salah terbit, atau yang masalahnya sudah beres dengan cara
lain (pecah beban, manuver), **dibatalkan** dengan alasan wajib. WO itu tetap
tersimpan, hilang dari daftar tugas regu, dan **tidak dihitung sebagai WO
terbit** di Rekap Kinerja.

**Kenapa.** Kalau dihapus atau penandanya dikosongkan, gardunya muncul lagi
sebagai anomali "belum di-WO" dan alasannya hilang. Kalau tetap dihitung,
capaian unit turun karena pekerjaan yang memang tidak perlu dikerjakan.

**Cara menerapkan.**
- Tabel pembatalan sendiri (contoh: `optimasi_wo_batal`, PK = id WO) dan
  fungsi SQL penjaga: WO yang sudah dikerjakan tidak bisa dibatalkan (yang
  dibatalkan catatannya, lewat "Salah input").
- **Pekerjaan tidak boleh hilang.** Kalau regu telanjur mengirim draf untuk WO
  yang sudah dibatalkan, catatannya diterima sebagai "di luar WO".
- **Satu gardu, satu pekerjaan, satu baris.** Catatan "di luar WO" untuk gardu
  yang punya WO terbuka dikaitkan otomatis ke WO itu oleh server.

**Contoh nyata.** Optimasi Trafo (24 Sep 2026): AM053 dicatat di luar WO
padahal WO-nya terbuka, lalu muncul dua baris di tabel.

---

## 13. Jangan tarik semua data sekaligus, dan jangan ada data yang tak tampil

**Aturan.** Dua hal yang kedengarannya berlawanan tapi harus berlaku
**bersamaan**:

1. **Tidak menarik seluruh data sekaligus.** Halaman memuat data sebatas
   penyaring yang dipilih (bawaan: **bulan berjalan**), bukan seluruh isi tabel
   "supaya gampang disaring di peramban". Tidak ada pilihan "semua tahun" /
   `?all=true` untuk data yang terus bertambah.
2. **Tidak ada baris yang ada di database tapi tidak tampil.** Setiap kueri
   yang mengisi daftar atau angka rekap harus mengambil **semua** baris dalam
   rentang yang dipilih, lewat paginasi, bukan terpotong diam-diam.

**Kenapa.** Yang pertama: data tumbuh setiap hari. Halaman Yantek dulu
menarik seluruh data di setiap kunjungan, 20 MB setelah lima bulan, dan
diperkirakan ±145 MB per tahun kalau sebulan 10.000 WO. Halaman seperti itu
tidak mati mendadak, tapi makin lambat sampai berhenti dibuka.
Yang kedua: **PostgREST memotong jawaban di 1.000 baris tanpa memberi tahu**,
dan `.limit(500)` memotong di 500. Dua-duanya tidak menghasilkan galat. Yang
terlihat hanya angka yang lebih kecil atau daftar yang lebih pendek, dan tidak
ada yang bisa membedakannya dari data yang memang sedikit.

**Cara menerapkan.**
- **Batasi rentang di kueri** (server), bukan di peramban setelah semuanya
  ditarik: `.gte/.lte` tanggal, `.eq("ulp")`. Kalau data per bulan besar, muat
  per bulan dan simpan di cache selama halaman terbuka (contoh: halaman Yantek,
  `?month=YYYY-MM`).
- **Tarik seluruh baris dalam rentang itu** dengan
  `fetchAllRows(() => kueriBaru())` dari `lib/supabasePaginate.ts`. Pembangun
  kueri harus dibuat **baru** di setiap panggilan (fungsi, bukan objek), dan
  urutannya **diakhiri kolom unik** (`.order("id")`). Tanpa itu, baris
  bertanggal sama bisa tertukar antarhalaman.
- **`.limit(n)` dilarang** untuk daftar atau rekap. Kalau memang harus
  dibatasi (misalnya "30 terakhir" di HP), layar wajib mengatakannya:
  "menampilkan 30 terbaru dari 412", dengan `count: "exact"`.
- **Tabel di layar dipaginasi** (20 baris per halaman, butir 7). Paginasi layar
  menjaga DOM tetap ringan; paginasi kueri menjaga datanya lengkap. Keduanya
  berbeda dan keduanya perlu.
- **Daftar yang tumbuh satu baris per hari juga kena batas 1.000.** Contoh:
  daftar tanggal Yantek akan kehilangan tanggal terbarunya setelah ±2,7 tahun
  kalau tidak dipaginasi.
- Angka rekap dihitung dari **data yang sama** dengan yang ditampilkan. Jangan
  satu dari kueri terbatas dan yang lain dari kueri penuh.

**Contoh nyata (24 Sep 2026).**
- Yantek: `?all=true` di setiap kunjungan → sekarang per bulan, dan "Semua
  Tahun" dihapus.
- Optimasi Trafo: `.limit(500)` → sekarang `fetchAllRows`.
- Pemeliharaan Jaringan: `.limit(500)` tanpa periode → sekarang penyaring
  bulan (bawaan bulan berjalan) + `fetchAllRows`.
- Ekspor inspeksi (`app/api/export/inspeksi`): unduhannya terpotong di 500
  baris. Sekarang barisnya selalu lengkap; yang dibatasi hanya **foto yang
  disematkan** (> 500 baris → foto jadi tautan, dan berkasnya menyebutkannya).
  Kalau sesuatu memang harus dibatasi demi ukuran, batasi yang **berat**, bukan
  **barisnya**.

---

## 14. Kunci penyimpanan = satuan data yang masuk

**Aturan.** Sebelum menentukan PRIMARY KEY atau kunci `upsert`, tanyakan:
**satu kiriman itu mewakili apa?** Kuncinya harus memuat setiap pembeda
kiriman. Kalau satu tarikan = satu tanggal **untuk satu posko**, kuncinya
`(tanggal, id_posko)`, bukan `tanggal`.

**Kenapa.** Kunci yang kurang satu kolom tidak menghasilkan galat. `upsert`
berjalan mulus, dan kiriman kedua **menimpa** kiriman pertama tanpa jejak. Yang
tahu hanya orang yang kebetulan membuka data yang hilang.

**Cara menerapkan.**
- Cari pembeda kiriman di parameter tarikannya (posko, ULP, penyulang, jenis),
  bukan hanya di tanggalnya.
- Hapus juga mengikuti kunci yang sama: admin ULP hanya menghapus data
  ULP-nya, dan ini **dipaksa di server**, bukan cuma disembunyikan di layar.
- Pemulihan data lama memakai `resolution=ignore-duplicates`, supaya tidak
  menimpa kiriman yang lebih baru.

**Contoh nyata.** Yantek (24 Sep 2026): tabel `yantek_harian` berkunci
`tanggal` saja. User menarik Ampenan lalu Cakra, dan Ampenan 1–24 Sep hilang.
Berkas JSON lama (satu berkas per tanggal) punya cacat yang sama, hanya belum
ketahuan.

---

## 15. Daftar kerja di HP = empat tab, tampilan WO Pengukuran

**Aturan.** Setiap fitur kerja lapangan di HP punya daftar dengan empat tab:

| Tab | Isi | Ketuk |
|---|---|---|
| **WO bulan ini** | seluruh pekerjaan WO bulan berjalan + progres | formulir / lihat |
| **Belum dikerjakan** | WO yang belum disentuh + draf yang belum lengkap ("sedang diisi") | formulir |
| **Sudah dikerjakan** | tersimpan di HP, belum dikirim (WO maupun di luar WO) + yang dikembalikan admin (label merah + alasan). Tombol **Kirim** per kartu dan **Kirim semua** | formulir, bisa diubah |
| **Sudah dikirim** | terkirim bulan ini se-ULP, dengan nama tim dan status persetujuan | hanya-baca (butir 2) |

Pekerjaan **di luar WO** dikerjakan lewat pencarian: hasil yang tidak ada di tab
aktif muncul di bagian "Gardu lain / objek lain". Tampilannya meniru layar
**WO Pengukuran**: kepala dengan progres WO, kartu angka yang sekaligus jadi
tab, kotak cari + urutan Terdekat, kartu bergaris warna tahap.

Luring mengikuti butir 6: daftar disimpan di HP dengan spanduk "data dari HP,
terakhir diperbarui …"; tanpa salinan sama sekali → keadaan gagal, bukan kosong.

**Kenapa.** Regu perlu menjawab tiga pertanyaan tanpa berpikir: apa tugas saya
bulan ini, apa yang belum saya kirim, dan apa yang sudah diterima. Tiap modul
yang menyusun daftarnya sendiri-sendiri membuat regu belajar ulang di tiap
menu — dan yang paling sering terlewat justru draf yang belum dikirim.

**Cara menerapkan.**
- Tab dihitung dari tiga sumber: WO (server), draf (HP), terkirim (server).
  Satu kartu = satu objek; tahapnya diturunkan, tidak disimpan.
- Status di tab WO memakai keadaan **di bulan WO**, bukan catatan terakhir
  kapan pun — objek masuk WO justru karena catatan terakhirnya sudah lama.
- Bulan WITA dihitung manual (UTC + 8 jam), bukan `toLocaleDateString` dengan
  `timeZone` — Hermes tidak menjaminnya, dan hasilnya diam-diam NaN.

**Contoh nyata.** Pemeliharaan Gardu (25 Sep 2026), permintaan user; urutan
penerapan berikutnya: Pengukuran → Optimasi → Perabasan → Harjar → JTM/JTR.

---

## 16. Nama petugas = tim yang dipilih saat login

**Aturan.** Nama petugas pada setiap pekerjaan diambil dari tim yang dipilih
saat masuk (`user.petugasName`, mis. "Budi & Andi"), **ditampilkan terkunci**
di formulir, dan **tidak ada isian nama/regu yang diketik**. Akun tanpa tim
(admin/UP3 uji coba) memakai email.

**Kenapa.** Nama yang diketik ulang melahirkan dua versi untuk orang yang sama
("Masri", "masri", "Masri S") — rekap per tim jadi pecah, dan push notif yang
dialamatkan per nama tidak sampai.

**Cara menerapkan.**
- Formulir menampilkan "Petugas (dari login)" dengan ikon gembok; ganti tim =
  keluar lalu masuk lagi.
- Server menerima nama dari kiriman dan menyalinnya ke kolom lama bila ada
  (mis. `regu_1`), supaya layar web yang membaca kolom itu tetap benar.
- Layar web menampilkan kolom **Petugas** = nama tim; isian regu terketik hanya
  sebagai cadangan untuk catatan versi HP lama.

**Contoh nyata.** Pemeliharaan Gardu (25 Sep 2026): isian Regu 1/Regu 2
diketik bebas; diganti nama tim login.

---

## 17. Kirim = unggah foto dulu, lalu SATU transaksi di server

**Aturan.** Tidak ada baris server sebelum petugas menekan **Kirim**. Kirim
terdiri dari dua langkah:

1. Unggah foto satu per satu dengan kabar kemajuan ("foto 3 dari 10"); URL yang
   berhasil **ditulis balik ke draf** — kirim ulang setelah putus tidak
   mengunggah dua kali.
2. **Satu RPC** yang menyimpan seluruh catatan (kepala, jawaban, ukur, foto,
   koreksi master, status) dalam satu transaksi: jadi seluruhnya, atau tidak
   sama sekali.

**Kenapa.** Kiriman berupa lima panggilan berurutan meninggalkan catatan
setengah jadi di server saat sinyal putus di panggilan ketiga — tampil
"sedang dikerjakan" selamanya, dan kiriman ulangnya menabrak sisa itu.

**Cara menerapkan.**
- Id catatan dibuat HP saat draf lahir (`uuidAcak()`), sekaligus jadi nama
  folder fotonya. Pekerjaan yang dikembalikan admin memakai id lamanya,
  sehingga RPC memperbarui baris yang sama.
- RPC **memakai ulang** fungsi validasi yang sudah ada (isian wajib, koreksi
  master), bukan menyalinnya.
- RPC yang sama menjaga: hak per ULP, objek harus ada di master, yang sudah
  terkirim tidak bisa diubah, dan **objek yang sama tidak bisa dikirim dua regu
  di periode yang sama** (dengan kunci advisory, bukan pemeriksaan di layar).
- Tanggal kerja = saat regu menekan Simpan di HP (dipotong ke `now()` bila jam
  HP di masa depan), bukan saat sinyal akhirnya ada.
- Foto URI lokal yang sampai ke RPC ditolak dengan pesan — lebih baik gagal
  daripada tersimpan tautan mati.

**Contoh nyata.** `kirim_pemeliharaan_gardu` (25 Sep 2026,
`scripts/hp-kirim-rekap.sql`).

---

*Ditulis 23 September 2026, butir 7–14 ditambahkan 24 September 2026, butir 2
diubah dan butir 15–17 ditambahkan 25 September 2026.
Tambahkan butir baru di bawah, dengan bentuk yang sama: aturan, kenapa, cara
menerapkan, contoh nyata.*
