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

*Ditulis 23 September 2026. Tambahkan butir baru di bawah, dengan bentuk yang
sama: aturan, kenapa, cara menerapkan, contoh nyata.*
