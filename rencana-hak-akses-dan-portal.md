# Rencana: Hak akses fungsi JTM (A6) + Gardu portal = dua tiang

*2 Oktober 2026. Status: **SEDANG DIKERJAKAN — dijeda.***

Keputusan akhir: C1 & C2 = semua keputusan dan kerja web hanya UP3 + admin ULP;
C3 = nomor berikutnya, isian disalin, dibuat HP saat Simpan; C5 = 27 portal lama
dikoreksi admin lewat peta; 5 pasang manual hanya ditautkan.

Selesai & teruji (belum dijalankan / commit): SQL `scripts/jtm-hak-akses-portal.sql`
(31 uji PGlite), HP pasangan portal (13 uji + 22 uji regresi). Sisa: web peta
(daftar portal belum berpasangan + tombol Buat pasangan portal), lalu SQL → push → OTA.

---

## A. Hak akses fungsi server JTM (audit A6)

### A1. Keadaan sekarang (diperiksa per fungsi, definisi terakhir)

Sudah dijaga: `kirim_tiang_jtm` (ULP sendiri), `batalkan_segmen_rintisan`,
`tugaskan_temuan_jtm`, `impor_segmen`, `ubah_nama_segmen`, `ubah_titik_segmen`,
`ubah_panjang_manual_segmen`, `geser_titik_tiang`, `ubah_atribut_tiang`.

**Belum dijaga sama sekali** (siapa pun yang punya akun, ULP mana pun):

| Golongan | Fungsi | Dipanggil dari |
|---|---|---|
| Lapangan | `rintis_segmen_jtm`, `tutup_segmen_jtm`, `tumpangi_tiang_jtm`, `koreksi_titik_tiang_jtm`, `tandai_percabangan_jtm`, `batalkan_tiang` | HP (tutup juga web) |
| Lapangan (dalam) | `tambah_tiang_jtm`, `nilai_tiang_jtm`, `mulai_inspeksi_jtm`, `selesaikan_inspeksi_jtm` | lewat `kirim_tiang_jtm`, tapi juga bisa dipanggil langsung |
| Koreksi meja | `ubah_induk_tiang_jtm` | web, tab Tiang |
| Keputusan admin | `putuskan_inspeksi_jtm` (setujui / kembalikan), `batalkan_inspeksi_jtm`, `gabung_inspeksi_jtm`, `buang_inspeksi_kosong_jtm`, `ubah_kode_tiang_jtm`, `nomori_ulang_penyulang_jtm`, `gabung_segmen`, `impor_tiang_jtm` | web |

Akibat terburuknya: akun regu bisa **menyetujui inspeksinya sendiri** lewat
panggilan langsung, dan akun ULP mana pun bisa membatalkan atau menggeser tiang
ULP lain. Tidak ada tombolnya di aplikasi, tapi pintunya terbuka.

### A2. Siapa yang SEKARANG melakukan apa (data hidup, `master_audit` + putusan)

- Semua tindakan tercatat **di ULP pelakunya sendiri** — aturan "ULP sendiri"
  tidak mengunci siapa pun.
- Tindakan lapangan dilakukan oleh `inspektor` (CAKRA, TANJUNG, AMPENAN) dan
  `INSP_JTR`. Keputusan oleh `admin`.
- ⚠ **Akun `inspektor` AMPENAN 2× melakukan koreksi meja** (ganti induk /
  nama / percabangan dari tab Tiang di web). Lihat keputusan C2.

### A3. Usulan aturan

Dua pemeriksa bersama, satu tempat (bukan disalin ke tiap fungsi):

- **`wajib_boleh_ulp(ulp)`** — SUDAH ADA, dipakai 28 skrip: UP3, atau admin ULP
  itu. Untuk **keputusan admin**.
- **`wajib_kerja_ulp(ulp)`** — BARU: akun yang perannya punya menu `jtm` atau
  `jtr` (data-driven dari tabel `roles`; kini UP3, admin, inspektor,
  INSPEKSI_JTM, INSP_JTR), dan unitnya = ULP objek (UP3 semua ULP). Untuk
  **tindakan lapangan**.

| Fungsi | Pemeriksa |
|---|---|
| rintis, tutup, tumpangi, koreksi titik, percabangan, batalkan tiang, tambah, nilai, mulai, selesaikan | `wajib_kerja_ulp` |
| ubah induk (koreksi meja) | tergantung C2 |
| putuskan, batalkan / gabung / buang inspeksi, ubah nama tiang, nomori ulang, gabung segmen, impor tiang | `wajib_boleh_ulp` |

Kalimat penolakannya menyebut siapa yang boleh, seperti `wajib_boleh_ulp`
sekarang. HP tidak perlu OTA: hanya server yang berubah, dan HP sudah
menampilkan pesan server apa adanya.

### A4. Cara aman (sudah go live)

- Fungsi disalin otomatis dari definisi terakhirnya, lalu disisipi satu baris
  pemeriksa. Pola yang sama dengan `jtm-kirim-otomatis.sql`.
- Diuji di PGlite per peran: admin ULP lain ditolak, inspektor ULP sendiri
  boleh, HARGAR ditolak, UP3 boleh.
- Sebelum dijalankan, saya cek sekali lagi peran tiap pelaku 7 hari terakhir
  terhadap aturan baru. Kalau ada yang akan terkunci, saya lapor dulu.

---

## B. Gardu portal = dua tiang

### B1. Keadaan sekarang (data hidup)

- Tanda gardu berasal dari isian penilaian `gardu` (Tidak ada / Cantol /
  Portal / Beton) dan `nomor_gardu`. Pemicunya menulis `penanda = 'gardu'`
  di master tiang. Hasilnya **40 tiang bertanda gardu: 35 portal, 5 cantol.**
- **5 portal sudah dititik manual oleh regu sebagai dua tiang**, dan
  **dua-duanya ditandai gardu** dengan nomor yang sama, berjarak 1,9–6,3 m.
  Akibatnya gardu tercatat ganda:

  | Tiang | Nomor gardu | Jarak |
  |---|---|---|
  | MTR-017_B2 + MTR-017_B2_A1 | Mm167 | 1,9 m |
  | OLBTK-003D8 + OLBTK-003D9 | Tj044 / Tj44 | 2,3 m |
  | OLBTK-003D23C6D9C3 + C4 | Tj087 | 2,5 m |
  | OLBTK-003D19 + OLBTK-003D20 | Tj072 | 4,3 m |
  | OLBTK-003D23C6_B15C11 + C11C1 | Tj061 | 6,3 m |

  Namanya pun tidak seragam: ada yang memakai nomor berikutnya (D19→D20), ada
  yang memakai nama cabang (_A1, C1).
- Sekitar 30 portal lainnya masih satu tiang.

### B2. Perilaku (keputusan user 2 Okt 2026: C3 = nomor berikutnya, isian disalin)

1. Regu menilai tiang (mis. `PRM-012`), memilih **Gardu = Portal**, lalu
   **Simpan**. Saat itu juga **HP melahirkan tiang kedua**:
   - 2 m dari `PRM-012`, **searah jalur** (induk → PRM-012);
   - **isian penilaiannya disalin** dari PRM-012, termasuk foto, gardu =
     portal, dan nomor gardu;
   - ikut terkirim otomatis seperti titik lain (butir 20) dan mendapat nama
     dari aturan penamaan biasa.
2. **Nama:** di jalur yang sedang dirintis, tiang kedua itu anak pertama
   PRM-012 yang searah jalur, jadi namanya **`PRM-013`**. Tiang jaringan
   berikutnya otomatis menyambung dari PRM-013 (yang terdekat) dan menjadi
   PRM-014.
   ⚠ Di jaringan yang **sudah ada** (PRM-013 sudah dipakai tiang berikutnya),
   aturan penamaan memberinya nama sisipan **`PRM-012a`**. Nama tiang lain
   tidak digeser.
3. **Satu kali saja:** HP tidak membuat tiang ketiga kalau pasangannya sudah
   ada (`tiang.pasangan_portal_dari`). Selama isian pasangannya belum diubah
   sendiri, mengubah isian PRM-012 ikut memperbarui salinannya.
4. Isian PRM-012 diubah dari Portal ke yang lain sementara pasangannya ada →
   HP bertanya "hapus PRM-013 (pasangan portal)?".
5. Cantol / beton tetap satu tiang.
6. Penjaga tiang berdekatan tidak menolak pasangan portal terhadap tiang
   gardunya sendiri (dikirim sebagai "batang berbeda", tercatat).
7. Gardu tidak terhitung ganda: simulasi padam di peta mencocokkan tiang
   bertanda gardu ke gardu terdekat lalu menghapus duplikat per kode gardu
   (sudah diperiksa).
8. Karena isiannya disalin, pasangan **sudah dinilai**: tidak ada tambahan
   kerja sebelum "Selesai" (C4 tidak diperlukan lagi).

### B3. Data yang sudah ada (C5, perlu dikonfirmasi)

| ULP | Portal masih satu tiang | Sudah dua tiang (dititik manual) |
|---|---|---|
| AMPENAN | 25 | 1 pasang |
| TANJUNG | 1 | 4 pasang |
| GERUNG | 1 | – |

5 pasang manual dibiarkan: bentuknya sudah sama dengan model baru (dua tiang,
keduanya bertanda gardu).

Untuk 27 portal satu tiang (semuanya sudah dikirim / disetujui), pasangan yang
dibuat sekarang:
- bernama sisipan (`MTR-012a`, `PRM-002a`, …);
- **tanpa salinan penilaian**, karena tidak boleh menambah isi inspeksi yang
  sudah disetujui. Kondisinya terisi saat inspeksi berikutnya.

### B4. Urutan

SQL lebih dulu (kolom `pasangan_portal_dari`, `kirim_tiang_jtm` meneruskannya,
data tiang segmen membawanya ke HP), lalu OTA HP (lahirkan pasangan saat
Simpan, salin isian, tanya saat diubah), lalu peta web menampilkan keterangan
"pasangan portal".

---

## C. Keputusan yang dibutuhkan

| No | Pertanyaan | Pilihan | Rekomendasi |
|---|---|---|---|
| C1 | Siapa yang boleh **menyetujui / mengembalikan / membatalkan** inspeksi JTM | a. UP3 + admin ULP itu · b. + TL Teknik & Staff Teknik (punya hak setujui WO) | **a**: kedua peran itu tidak punya menu JTM |
| C2 | **Ganti induk** tiang dari web (koreksi meja) | a. juga regu inspeksi ULP itu (seperti yang sudah terjadi) · b. admin saja | **a**. Ganti nama tiang & penomoran ulang tetap admin saja |
| C3 | Nama tiang kedua portal | **DIPUTUSKAN: b** — nomor berikutnya (`PRM-013`), dibuat saat tiang pertama disimpan, isian disalin | — |
| C4 | Tiang kedua wajib dinilai sendiri? | **GUGUR** — isiannya disalin, jadi sudah dinilai | — |
| C5 | 27 portal satu tiang yang sudah ada | a. buatkan pasangan sekarang (nama sisipan, tanpa salinan penilaian) · b. hanya AMPENAN (25) · c. tidak — regu menitik saat inspeksi berikutnya | menunggu konfirmasi (lihat B3) |
