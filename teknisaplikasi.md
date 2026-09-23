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
- Sudah terkirim: ketuk kartunya → tampilan rincian, foto bisa diperbesar.
- Koreksi setelah terkirim boleh, **selama belum diverifikasi admin**. Setelah
  diverifikasi, koreksinya lewat admin — kalau tidak, yang sudah diperiksa bisa
  berubah diam-diam di belakang pemeriksanya.
- Menghapus catatan yang sudah terkirim: **tidak**. Statusnya jadi `Dibatalkan`
  berikut alasannya — yang dihapus tidak bisa diterangkan lagi.

**Contoh nyata.** Pemeliharaan Jaringan (Sep 2026): catatan yang sudah dibuat
tidak bisa dibuka sama sekali. Dilaporkan user.

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

*Ditulis 23 September 2026. Tambahkan butir baru di bawah, dengan bentuk yang
sama: aturan, kenapa, cara menerapkan, contoh nyata.*
