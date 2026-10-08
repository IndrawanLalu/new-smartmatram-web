# Rencana — JTR: jurusan panel, jalur kabel, tiang bersama

*Disusun 8 Oktober 2026. Status: RENCANA, belum ada kode. Keputusan yang sudah
diambil user ditandai ✅; yang masih ditanyakan ada di bagian 9.*

---

## 1. Masalah yang dilaporkan

1. **"Asal kabel belum dipilih"** padahal regu tidak salah. Contoh AM104-A4:
   bentang 22 m tidak ikut dihitung.
2. **Dua jurusan panel searah, memakai tiang yang sama.** Contoh user: di gardu
   ada jurusan A dan B, keduanya ke timur, B1–B3 menumpang tiang A. Aplikasi
   hanya kenal satu jurusan per tiang, jadi regu bingung harus memilih apa.
3. **Kabel ke-2 yang berpisah lalu berbelok** (B4_C1, C2, …): di tiang baru
   regu mencatatnya ke-1 → server menganggapnya terputus.
4. **Jalur kedua dari gardu di jurusan yang sama** dinamai `C2a` lalu
   melanjutkan nomor jalur pertama (C8, C9 …) → tak bisa dibedakan.
   ✅ Diputuskan user: format **C2-2, C3-2, …**
5. **Istilah "underbuild" dipahami berbeda** di lapangan dan di sistem.

## 2. Data nyata (8 Okt 2026, dibaca dengan urutan stabil)

| Hal | Angka |
|---|---|
| Tiang JTR aktif | 1.793 di 74 gardu (39 menumpang, 578 bertanda underbuild_tm) |
| Kabel JTR tercatat | 1.892 |
| Tiang membawa ≥ 2 kabel gardu yang sama | **72** tiang di 21 gardu (pola nomor 1+2) |
| Batang membawa kabel lebih dari satu gardu | 38 |
| Batang dengan nomor kabel sama untuk gardu berbeda | 34 (mis. AM104-A3: AM038 ke-1 dan AM012 ke-1) |
| Bentang "asal belum dipilih" | **12**: 9 berpola AM104 (induk membawa tepat satu kabel gardu sama, nomornya beda), 3 benar-benar ambigu |

> Koreksi: sebelumnya disebut 11 bentang (6/4/1). Angka itu terbaca dari
> paginasi tanpa urutan; yang benar 12 (9/3).

## 3. Akar masalah

Sistem tidak punya cara menyatakan **"kabel ini bagian dari jalur mana"**.
Penggantinya dipakai dua hal yang artinya lain:

| Yang dipakai | Arti sebenarnya | Dipakai sistem sebagai |
|---|---|---|
| **Nomor kabel** (ke-1, ke-2) | posisi kabel di batang itu | identitas jalur dari tiang ke tiang |
| **Jurusan tiang** (A–D) | di panel: sirkit keluar · di aplikasi: arah mata angin | satu-satunya jurusan yang lewat tiang itu |

Masalah 1, 2, 3 adalah gejala dari hal yang sama. Masalah 4 soal penamaan,
masalah 5 soal kata di layar.

## 4. Prinsip yang diusulkan

- **P1. Jurusan JTR = jurusan panel** (huruf A/B/C/D seperti tertulis di PHB
  gardu), **bukan arah mata angin**. Sama dengan huruf jurusan di Pengukuran
  Beban dan Tegangan Ujung, sehingga panjang per jurusan bisa dibandingkan
  dengan beban per jurusan.
- **P2. Identitas jalur kabel = gardu + jurusan.** Setiap kabel di setiap tiang
  mencatat jurusannya.
- **P3. Nomor kabel = posisi di batang saja**, unik per batang (lintas gardu).
  Tidak lagi dipakai untuk menyambung.
- **P4. Bentang tersambung** bila tiang hulu membawa kabel **gardu + jurusan
  yang sama**. Nomor hanya dipakai kalau di hulu ada ≥ 2 kabel gardu + jurusan
  yang sama; kalau masih ambigu, regu/admin memilih asal (fitur yang ada).
- **P5. Tiang bersama tetap satu batang, satu data fisik.** Yang bertambah
  hanya kabelnya.

## 5. Model tiang bersama — ✅ nama per jurusan (keputusan user 8 Okt)

**Setiap jurusan menomori deretnya sendiri. Tiang yang dilewati lebih dari satu
jurusan memakai gabungan nama semua jurusannya, diurutkan menurut posisi
kabel.**

Kasus 1 — berangkat bersama dari gardu, lalu berpisah:
```
Gardu ── A2/B2 ── A3/B3 ── A4/B4 ─┬─ A5 ── A6   (A lurus)
                                  └─ B5 ── B6   (B belok)
```
Kasus 2 — berangkat sendiri-sendiri, jumlah tiangnya berbeda, bertemu di tengah:
```
Gardu ── A2 ── A3 ──────────┐
Gardu ── B2 ── B3 ── B4 ────┴── A4/B5
```
- Deret A tetap A2, A3, A4 …; deret B tetap B2 … B5 …, tidak peduli
  tiangnya dipakai bersama.
- **Urutan nama gabungan = posisi kabel**: kabel ke-1 milik A, ke-2 milik B →
  `A4/B5`. ✅ Tiga jurusan → `A4/B5/C3`.
- ✅ **Label = nama gabungan saja**; `.2` tidak ditambahkan untuk tiang bersama
  (posisi kabel sudah terbaca dari urutan nama).
- Satu batang, satu data fisik (P5). Yang per jurusan: **nama** dan **induk**
  (tiang sebelumnya di deret jurusan itu).

**Polanya sudah ada di JTM**: `tiang_kode_penyulang` (nama + induk per
penyulang di batang yang sama, untuk tiang yang dilewati dua penyulang). JTR
meniru pola itu → `tiang_kode_jurusan` (tiang, gardu, jurusan, kode, induk).
View `jtr_tiang` tetap satu baris per (tiang, gardu); nama yang ditampilkan =
gabungan, topologi per jurusan dibaca dari tabel baru. 42 objek SQL yang
membaca `jtr_tiang` tetap diperiksa satu per satu, tapi tidak ada yang tiba-tiba
menerima baris ganda.

## 6. Penamaan

| Keadaan | Nama |
|---|---|
| Tiang pertama jurusan dari gardu | `AM104-B2` (nomor 1 = tiang gardu, aturan lama) |
| Tiang yang dilewati beberapa jurusan | gabungan per posisi kabel: `AM104-A4/B5`, `AM104-A4/B5/C3` |
| ✅ Jalur kedua dari gardu, jurusan sama | `C2-2, C3-2, …` (jalur ke-3: `C2-3 …`) |
| Belokan / cabang / sisipan | aturan lama tetap, per deret jurusan (B4B1, B4_C1, A3a) |

Satu batang tetap satu awalan gardu: `AM104-A4/B5`, bukan `AM104-A4/AM104-B5`.
**Nama yang sudah ada tidak diubah otomatis** (lihat bagian 8 dan F5).

## 7. Tahapan

### F1 — Aturan sambung (cepat, aman, tanpa ubah skema)
- `tiang_gawang_kabel.tersambung` + `usul_asal_kabel_jtr`: bila hulu membawa
  **tepat satu** kabel gardu yang sama → tersambung, berapa pun nomornya.
- Hasil yang diharapkan: **9 dari 12** bentang langsung beres; KMS naik
  sebesar bentang itu. Tiga yang ambigu tetap muncul di usulan.
- HP: pertanyaan "Samakan jadi ke-2?" tidak muncul untuk pola ini (OTA).
- Uji: PGlite dengan salinan data nyata — KMS per gardu sebelum/sesudah; hanya
  gardu yang punya 9 bentang itu yang berubah.

### F2 — Kabel membawa jurusan (server)
- Kolom `tiang_konduktor.jurusan` (NULL = jurusan tiangnya, supaya HP lama
  tetap jalan).
- `tiang_gawang_kabel`, `gardu_jtr_penghantar`, `gardu_jtr_panjang`,
  `jtr_gawang_terputus`, `usul_asal_kabel_jtr`, `tiang_label`,
  `inspeksi_jtr_temuan` membaca jurusan per kabel (P2, P4 menggantikan F1).
- `simpan_konduktor_tiang` / `ubah_kabel_jtr` / `kirim_tiang_jtr` menerima
  jurusan per kabel; penjaga: jurusan kabel harus jurusan yang ada di gardu itu.
- Tabel `tiang_kode_jurusan` (pola `tiang_kode_penyulang` JTM): nama + induk
  per jurusan di batang yang sama; nama tampil = gabungan per posisi kabel.
- `jtr_kode_baru` per deret jurusan; ✅ jalur kedua dari gardu → `C2-2 …`.
- Penjaga nomor kabel unik per batang (P3) **hanya untuk data baru**.
- Uji PGlite: seluruh gardu tanpa tiang bersama → KMS identik dengan sekarang.

### F3 — HP (OTA)
- Pilihan jurusan: **"Jurusan (huruf di panel gardu)"**, tanpa arah mata
  angin. Peringatan "jalur menuju TIMUR tapi Anda memilih A" **dihapus**.
- Di tiang milik jurusan lain: tombol **"Dilewati jurusan B juga"** → menambah
  kabel jurusan B di tiang itu, tanpa membuat tiang baru.
- Isian kabel: tiap kabel ada **jurusan** (bawaan = jurusan yang sedang
  disapu) dan **kabel gardu lain di batang ini** tampil (hanya-baca) supaya
  posisi ke-N konsisten.
- Ikut di sini (sudah dibahas): tampilan JTR = JTM (bilah alat + bilah ungu
  "belum tersambung"), "Dari gardu" memeriksa jarak, tombol mulai dari ujung
  tidak hilang saat ada kiriman menunggu.

### F4 — Web
- Panjang per jurusan dari kabel; peta JTR berwarna per jurusan kabel.
- Koreksi per kabel: ubah jurusan kabel (admin).
- Daftar "perlu dipastikan" (bagian 8) dengan tombol Terapkan.
- Excel Hasil Inspeksi JTR: kolom jurusan per kabel.

### F5 — Generate ulang nama JTR (menyusul)
- Seperti JTM: pratinjau → Terapkan, per gardu, untuk membetulkan nama lama
  (C2a/C8 → C2-2/C3-2, dsb.). Dikerjakan setelah F2–F4 stabil.

## 8. Data lama

- **Jurusan tiang yang ada dianggap jurusan panel.** Tidak ada cara mengetahui
  huruf panel dari data; regu membetulkannya saat inspeksi berikutnya dengan
  "Pindah jurusan" yang sudah ada (nama ikut berubah A→B).
- **72 tiang dengan 2 kabel gardu yang sama**: kabel ke-1 = jurusan tiangnya;
  kabel ke-2 **ditandai "jurusan belum dipastikan"** → daftar di web untuk
  admin, dan muncul di HP saat tiangnya diinspeksi. Tidak ditebak.
- **34 batang dengan nomor kabel kembar lintas gardu**: dibiarkan, ditandai;
  dibetulkan saat batangnya diinspeksi (P3 hanya mengikat data baru).
- **Nama tiang lama tidak berubah** sampai F5 dijalankan admin.
- Tidak ada data yang dihapus.

## 9. Pertanyaan untuk user

1. ✅ Model & nama tiang bersama: nama per jurusan, gabungan per posisi kabel
   (bagian 5–6).
2. **Jurusan K (khusus)** masih dipakai? Di panel hanya A–D.
3. **Kata di layar** (aturan: tanya dulu):
   - pilihan jurusan: "Jurusan (huruf di panel gardu)"?
   - tombol tiang bersama: "Dilewati jurusan B juga"?
   - **dua kabel dari jurusan yang SAMA di satu tiang** (jarang): tetap `.2`?
   - `underbuild_tm` di layar: "Ada JTM di atasnya" (supaya tidak tertukar
     dengan tiang bersama jurusan)?
4. **Urutan**: F1 dulu (cepat, 9 bentang beres), baru F2–F4?

## 10. Di luar rencana ini

- Inspeksi JTM, penamaan JTM.
- Kalender jam kerja (`rencana-kalender-jam-kerja.md`, ditunda).
