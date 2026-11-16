# Rencana — Inspeksi JTM: posisi kabel di tiang bersama (Di atas / Di bawah)

16 Nov 2026 · permintaan user · **DIBANGUN 16 Nov** (SQL `scripts/jtm-posisi-kabel.sql` belum dijalankan, belum commit; uji PGlite 34/34)

Catatan bangun (beda dari rancangan di bawah):
- Hak koreksi HP = akun ber-sesi + ULP segmen (sama dengan `kirim_tiang_jtm`); TIDAK disyaratkan inspeksi berjalan.
- Penanda percabangan induk batang baru yang dinyalakan pemicu dikembalikan seperti semula (tanda itu ikut menentukan nama tiang berikutnya).
- Jalur lain di tiang itu yang ikut induk batang diberi induk khusus = induk lamanya (HP membaca induk mentah).
- Penolakan dengan pesan jelas (semua diuji): arah berlawanan (melingkar), induk tiang hilir akan bergeser, tiga jalur + "Di bawah" dari HP, belum ditumpangi, sesi/ULP, server belum dipasangi (HP: "Di atas" tidak diam-diam jadi "Di bawah").

## Masalah

Pemilik batang tiang JTM = penyulang yang **pertama kali menitik** tiang itu
(`tiang.penyulang`, `tiang_kode_penyulang.utama = true`, `segmen_tiang.posisi = 'atas'`).
Kalau jalur yang sebenarnya di bawah (underbuild) disapu lebih dulu, dialah yang jadi
pemilik. Jalur pemilik yang datang belakangan hanya bisa "Tumpangi X" — `tumpangi_tiang_jtm`
mengirim `p_posisi = 'bawah'` tetap, dan sengaja tidak memindah kepemilikan. Akibatnya isian
badan tiang (`jtm_item_ref.milik = 'tiang'`) jatuh ke jalur yang salah, koreksi master
(`jtm_koreksi_master`) hanya dari pemilik yang salah, induk batang mengikuti jalur yang salah.

Data 16 Nov 2026: `segmen_tiang.posisi` 19.059 `atas`, 3.627 `bawah`;
`tiang_kode_penyulang` 19.062 pemilik, 3.460 menumpang (409 berinduk khusus).

## Keputusan user (16 Nov 2026) — jangan ditawar ulang

1. **Tidak ada mode baru.** Inspektor menitik dan mengisi seperti biasa, walaupun jalurnya
   sebenarnya di bawah.
2. Saat jalur yang satunya diinspeksi di tiang yang sama (bulan depan atau kapan pun), HP
   bertanya posisi kabelnya: **Di bawah** (menumpang seperti sekarang) / **Di atas** (jalur
   ini jadi pemilik, yang lama menumpang).
3. **"Di atas" di HP langsung memindah pemilik** (pilihan a); web bisa membetulkan.
4. Di layar inspektor posisi tiang (di atas / di bawah) harus **jelas terlihat** supaya bisa
   dikoreksi. UI HP sempit — elemen baru ditaruh hati-hati, sebisa mungkin di tempat yang
   sudah ada.
5. Fungsi yang sudah ada tidak boleh terganggu.
6. Nama disetujui: pertanyaan **"Posisi kabel segmen ini di tiang itu?"**, pilihan
   **Di bawah** / **Di atas**; tombol web **Tetapkan pemilik tiang**.
   Jangan istilah "kabel kami / dia" — inspektornya satu orang.

## Rancangan

### Inti: memakai yang sudah ada

- **Posisi** = `segmen_tiang.posisi` (sudah ada, CHECK `atas|tengah|bawah`). Pemilik =
  `atas`. Tidak ada kolom baru.
- **Arti pemilik tidak berubah** (`tiang.penyulang` + `utama`). Fitur ini hanya
  menambah satu cara **menukar** pemilik, dengan nama dan induk tiap jalur dijaga tetap.

### SQL `scripts/jtm-posisi-kabel.sql`

1. **`_tukar_pemilik_tiang_jtm(tiang, penyulang_baru, sebab, nama)`** — inti, satu
   transaksi, dipakai HP dan web:
   - `tiang_kode_penyulang`: jalur baru `utama = true`, pemilik lama `false`.
   - `tiang.penyulang` = jalur baru; `tiang.kode` = nama tiang itu **di jalur baru** (sudah
     ada — tidak ada nama baru lahir; indeks unik `tiang_kode_unik_jtm` tetap terpenuhi
     karena `tiang_kode_penyulang_unik`).
   - Induk efektif tiap jalur (`COALESCE(kp.induk_id, tiang.induk_id)`) **sama sebelum dan
     sesudah**: induk batang baru = induk jalur baru; pemilik lama dan jalur lain yang tadinya
     "ikut batang" diberi induk khusus = induk batang lama.
   - `segmen_tiang.posisi`: segmen aktif jalur baru → `atas`, jalur lama → `bawah`.
   - Audit `master_audit` (sebelum/sesudah, sebab: `hp` / `web`).
2. **`tumpangi_tiang_jtm_posisi(segmen, tiang, dari, posisi, nama)`** — pembungkus baru:
   `PERFORM tumpangi_tiang_jtm_dari(...)` (tidak diubah), lalu bila `posisi = 'atas'` →
   `_tukar_pemilik_tiang_jtm`. HP yang belum OTA tetap memanggil fungsi lama.
3. **`atur_posisi_tiang_jtm(segmen, tiang, posisi, nama)`** — koreksi dari HP:
   - jalur ini bukan pemilik + `atas` → tukar ke jalur ini;
   - jalur ini pemilik + `bawah` → tukar ke satu-satunya jalur lain; bila jalurnya lebih
     dari dua → tolak: "Tiang ini dilewati N jalur — tetapkan pemiliknya di web.";
   - hak sama dengan menumpang (akun regu / ULP segmen, inspeksi segmen masih berjalan).
4. **`pratinjau_pemilik_tiang_jtm(tiang)` + `tetapkan_pemilik_tiang_jtm(tiang, penyulang,
   alasan, nama)`** — web, `wajib_boleh_ulp`, alasan wajib.

Tidak ada tambalan pada fungsi hidup yang sudah ada — semuanya fungsi BARU yang memanggil
yang lama. (Bila pemeriksaan definisi hidup menemukan pembaca `segmen_tiang.posisi` yang
butuh penyesuaian, dicatat di sini dulu sebelum disentuh.)

### HP — Inspeksi JTM (UI sempit: sebisa mungkin memakai tempat yang sudah ada)

**A. Pertanyaan posisi — saat menumpang** (dua jalan masuk yang sudah ada: penjaga
"Di sini sudah ada tiang → Tumpangi X", dan tombol "Tiang ini menumpang" → daftar tiang
sekitar). Sesudah tiang dipilih, SATU dialog lagi (Alert, 3 tombol — batas Android):

```
Posisi kabel segmen ini di tiang itu?
AMP-045 · 4 m. Di atas = segmen ini jadi pemilik tiang;
isian badan tiang ikut ditanyakan.
        [Batal]   [Di atas]   [Di bawah]
```

"Di bawah" di posisi tombol utama (paling kanan) — keadaan paling sering, sama dengan
sekarang. Penghalang titik lokal (`tumpangiPenghalang`) ikut bertanya dengan cara yang sama.

**B. Posisi selalu terlihat — tanpa elemen baru**, mengganti teks yang sudah ada:

| tempat (sudah ada) | sekarang | jadi |
|---|---|---|
| Kartu tiang terpilih (`pilihAnak`) | `· dipikul bersama · milik X` | `· bersama, di atas` / `· bersama, di bawah` |
| Baris daftar tiang (`barisAnak`) | `· milik X` | `· di bawah` (dan `· di atas` bila bersama) |
| Kepala formulir (`s.anak`) | `X · Anda menumpang` | `X · di bawah` / `di atas` |
| Catatan atas formulir (penumpang) | "Tiang ini milik X. Yang Anda nilai hanya kabel …" | "Kabel segmen ini di bawah. Yang dinilai hanya konstruksi, konduktor, aksesoris, sambungan, dan ROW." |

Tiang yang hanya dilewati satu jalur: tidak ada teks posisi (seperti sekarang).

**C. Koreksi posisi — satu tempat:** teks posisi di kepala formulir dibuat bisa diketuk
(ikon kecil `swap-vertical` di sebelahnya, hanya pada tiang bersama dan bukan hanya-lihat)
→ dialog yang sama seperti A dengan posisi sekarang disebut → `atur_posisi_tiang_jtm`.
Perlu sinyal; gagal → pesan dengan jalan keluarnya, isian di formulir tidak hilang.
Sesudah berhasil, formulir memilah isian ulang: jadi pemilik → isian badan tiang muncul;
jadi di bawah → isian badan tiang disembunyikan (jawaban yang sudah diisi tetap di draf,
tidak terkirim sebagai isian penumpang).

Pemilahan isian **tidak berubah aturannya** (`FormTiangJtm`: menumpang = pemilik ≠ jalur
segmen ini); yang berubah hanya pemiliknya, dan itu dibaca ulang dari server.

### Web

- /peta, panel tiang bersama: baris posisi tiap jalur (di atas / di bawah) + tombol
  **Tetapkan pemilik tiang** → modal pratinjau (jalur yang lewat, nama di tiap jalur, induk
  — semuanya tetap) → alasan (butir 8) → Toast (butir 9).

## Tidak mengganggu — yang dipastikan sebelum membangun

| yang ada | kenapa aman | cara memastikan |
|---|---|---|
| `tumpangi_tiang_jtm`, `tumpangi_tiang_jtm_dari`, `kirim_tiang_jtm`, `tambah_tiang_jtm` | tidak diubah; fungsi baru memanggilnya | — |
| HP lama (belum OTA) | memanggil fungsi lama → perilaku lama | — |
| Penamaan (`susun_nama_jtm`), nama per jalur | penukaran tidak melahirkan nama; induk efektif dijaga | PGlite: nama + induk efektif SEMUA jalur di tiang itu dan hilirnya, sebelum = sesudah |
| `peta_tiang` (garis per jalur pakai induk efektif) | induk efektif sama → garis sama | PGlite pada salinan definisi hidup |
| `jtm_koreksi_master` (hanya pemilik) | setelah tukar, pemilik baru yang mengoreksi — memang tujuannya | PGlite |
| `lepas_tumpang_jtm` (tolak pemilik), batalkan tiang, pecah segmen, ujung/pangkal segmen | arti pemilik tetap; dicek pemakaian `utama` & `posisi` di definisi hidup | daftar pemakai dari `pg_proc` sebelum SQL ditulis |
| Rekap per penyulang (jumlah tiang milik) | angka berpindah ke pemilik yang benar — memang tujuannya | — |
| Penolakan drone / Tier 2 / tiang berdekatan / dua batang berbeda | tidak disentuh | — |
| Inspeksi jalur lama yang sedang berjalan saat pemilik ditukar | HP-nya membaca pemilik baru saat muat ulang; isian badan tiang dari bukan-pemilik tidak menyentuh master (penjaga yang ada) | PGlite |

Sebelum menulis SQL (butir 11, 23.7): ambil definisi HIDUP fungsi/view yang membaca
`utama`, `segmen_tiang.posisi`, `tiang.induk_id`; periksa `tiang.feeder` (ikut ditukar atau
tidak); data nyata tiang bersama berposisi `tengah`.

## Urutan kerja

1. SQL + uji PGlite pada salinan definisi hidup.
2. Web: posisi di panel tiang + Tetapkan pemilik tiang.
3. HP: dialog posisi (3 jalan masuk), teks posisi di 4 tempat yang sudah ada, koreksi di
   kepala formulir.
4. Rilis: SQL → web → HP (OTA).
