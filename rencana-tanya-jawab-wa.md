# Rencana — Tanya Jawab WA (@smart)

Disepakati 28 Okt 2026. **Tanpa AI** (belum ada anggaran, takut kena batas pemakaian).
Bot memahami kalimat biasa lewat **kata kunci yang diatur di web**. Fungsi
pengambil data dibuat di kode.

## 1. Keputusan

| # | Keputusan |
|---|-----------|
| K1 | Tanpa AI: kalimat diurai dengan kata kunci, kamus sinonim, dan pencocokan salah ketik. |
| K2 | **Fungsi jawaban** (ambil data + susun balasan) ada di kode. **Kata kunci, sinonim, contoh pertanyaan, aktif/nonaktif** diatur di web. |
| K3 | Nama menu web: **"Tanya Jawab WA"**, di kelompok Pengaturan, dekat "Setting WA Group". |
| K4 | Yang boleh mengatur: **UP3 saja**. Semua role yang bisa membuka menu boleh melihat. |
| K5 | Di **grup**, bot hanya menjawab bila dipanggil **@smart** (diketik biasa, atau mention ke nomor bot). Di **chat pribadi**, bot menjawab semua pesan. |
| K6 | Perintah `#...` lama (`#DATA`, `#beban`, dst.) **tetap jalan** apa adanya. |
| K7 | Semua pertanyaan dicatat ke **riwayat**. Pertanyaan yang tidak dipahami bisa langsung dijadikan kata kunci dari web. |

## 2. Alur satu pesan

```
pesan masuk (wa-webhook)
 ├─ "#..."                → perintah lama (tidak berubah)
 ├─ laporan PENORMALAN    → pencatatan lama (tidak berubah)
 ├─ grup + dipanggil @smart  ┐
 └─ chat pribadi             ┴→ buang "@smart"/mention → URAI → jalankan fungsi → balas
                                                            └→ catat ke riwayat
```

Panggilan **@smart** dikenali bila:
- teks diawali `@smart` atau `smart` (besar/kecil huruf bebas, boleh diikuti `,` `:`); **atau**
- pesan me-mention nomor bot. Payload gateway sudah membawa `raw` →
  `contextInfo.mentionedJid`. Nomor bot dibaca otomatis dari status sesi gateway;
  LID bot (grup WA kini sering me-mention lewat `@lid`) diisi di env
  `WA_BOT_LID` (angka saja, boleh lebih dari satu dipisah koma).

**Gateway tidak perlu diubah.**

## 3. Pengurai (lib/wa/tanya/urai.ts) — tanpa AI

1. **Rapikan**: huruf kecil, buang tanda baca, rapatkan spasi.
2. **Kamus sinonim** (tabel `wa_tanya_kamus`): frasa → bentuk baku. Contoh:
   `bln ini` → `bulan ini`, `kmrn` → `kemarin`, `cakra` → `cakranegara`.
   Frasa terpanjang diganti dulu.
3. **Ambil saringan (slot)** — bawaan, di kode:
   - **ULP**: AMPENAN · CAKRANEGARA · GERUNG · TANJUNG (+ sinonim dari kamus).
   - **Periode**: hari ini, kemarin, minggu ini, minggu lalu, bulan ini, bulan
     lalu, nama bulan (+ tahun opsional: "september 2026"), "N hari terakhir",
     tanggal ("28/10", "28 okt").
   - **Kode gardu**: pola huruf+angka (AM001, GS153), dicocokkan ke master gardu.
   - **Penyulang**: dicocokkan ke master penyulang. Nama berkata banyak juga
     dikenali ("karang ujung"). Kata yang terpakai slot tidak ikut menilai fungsi.
4. **Pilih fungsi**: tiap fungsi punya kata kunci + bobot (tabel
   `wa_tanya_kata`). Skor = jumlah bobot kata yang cocok.
   - **Cocok persis** = bobot penuh.
   - **Salah ketik** = setengah bobot. Jarak edit ≤1 untuk kata 4–6 huruf, ≤2
     untuk kata ≥7 huruf, kata <4 huruf harus persis. Contoh: "overlod",
     "ampenen" tetap terbaca.
   - Frasa ("kelebihan beban") dicocokkan utuh.
5. **Keputusan**:
   - Skor tertinggi ≥ ambang (bawaan 1) dan jelas unggul → jalankan.
   - Dua fungsi seri → balas pilihan bernomor: "Maksud Anda: 1) … 2) …". Balasan
     angka dari pengirim yang sama dalam 5 menit menjalankan pilihannya.
   - Tidak ada yang cocok → balas "belum paham" + 3–5 contoh pertanyaan. Dicatat
     sebagai *tidak dipahami*.
6. **Saringan wajib kosong** (mis. "beban gardu" tanpa kode) → bot bertanya balik
   singkat ("Gardu mana? contoh: beban gardu AM001").
7. Saringan yang tidak disebut pakai **bawaan fungsi** (mis. periode = bulan ini,
   ULP = semua).

Balasan selalu dibuka dengan **apa yang dipahami bot**, supaya penanya tahu
bila salah tangkap. Contoh: `🔎 Gardu overload · AMPENAN · Okt 2026`.

## 4. Fungsi jawaban tahap awal (lib/wa/tanya/fungsi/*.ts)

Data diambil langsung dari Supabase (service role), memakai view/RPC yang sudah
dipakai web. **Tidak memakai** `/api/agent` lama, karena sebagian membaca tabel lama.

| Kode | Fungsi | Saringan | Balasan |
|------|--------|----------|---------|
| `gardu_overload` | Gardu overload (beban ≥ batas) | ULP, periode | daftar teratas + jumlah |
| `kartu_gardu` | Kartu gardu (sama #DATA) | gardu (wajib) | gambar |
| `beban_gardu` | Pengukuran terakhir gardu | gardu (wajib) | teks |
| `tegangan_ujung` | Tegangan ujung di bawah batas | ULP, periode, gardu | daftar |
| `gangguan_penyulang` | Gangguan / padam penyulang | ULP, penyulang, periode | jumlah + daftar |
| `temuan_urgent` | Temuan urgent belum selesai (JTM/JTR/pohon) | ULP, penyulang | daftar |
| `temuan_terbuka` | Rekap temuan terbuka per kategori | ULP, penyulang | ringkasan |
| `inspeksi_jtm` | Realisasi inspeksi JTM (tier 1, + drone, tier 2) vs WO | ULP, penyulang, periode | km |
| `perabasan` | Realisasi perabasan vs WO | ULP, periode | km/titik |
| `realisasi_harian` | Realisasi harian (gambar laporan yang sudah ada) | ULP, tanggal | gambar |
| `bantuan` | Contoh pertanyaan per fungsi | — | teks |

Setiap fungsi di kode mendaftarkan: kode, nama tampil, saringan yang dipakai
(dan mana yang wajib), periode bawaan, kata kunci bawaan (untuk benih tabel), dan
contoh pertanyaan bawaan.

Daftar teks dibatasi ±15 baris + "dan N lainnya". Bila ada, disertakan tautan ke
halaman web yang relevan.

## 5. Tabel (scripts/wa-tanya.sql, idempoten)

```
wa_tanya_fungsi   kode PK, nama, aktif, ambang NUMERIC DEFAULT 1, catatan,
                  updated_at, updated_by
                  — diisi SENDIRI oleh server saat fungsi baru di kode pertama
                    kali terlihat (baris + kata kunci + contoh bawaan); sesudah
                    itu hanya diubah dari web.
wa_tanya_kata     id, fungsi_kode FK, kata TEXT (huruf kecil, boleh frasa),
                  bobot NUMERIC DEFAULT 1, UNIQUE(fungsi_kode, kata)
wa_tanya_kamus    id, dari TEXT UNIQUE, jadi TEXT       — sinonim umum
wa_tanya_contoh   id, fungsi_kode FK, teks, urutan
wa_tanya_riwayat  id, waktu, dari (nomor), grup (jid|null), nama (pushName),
                  teks, teks_rapi, fungsi_kode|null, saringan JSONB, skor,
                  hasil ('dijawab'|'tidak_dipahami'|'pilihan'|'galat'),
                  ditangani BOOL DEFAULT false
```

- **RLS**: baca untuk semua yang login; tulis `wa_tanya_*` hanya UP3. Riwayat
  ditulis oleh server (service role). Web hanya membaca riwayat dan menandai
  `ditangani`.
- **Masa simpan riwayat**: 90 hari. Yang lebih lama dibuang sesekali saat
  webhook menulis (±1 dari 50 pertanyaan). Tidak perlu penjadwal.
- Kata kunci dimuat webhook dengan **cache 60 detik**, jadi perubahan dari web
  berlaku ±1 menit kemudian tanpa build ulang.

## 6. Halaman web `/admin/settings/tanya-wa` — "Tanya Jawab WA"

Empat tab:

1. **Fungsi** — tabel fungsi: nama, aktif (sakelar), jumlah kata kunci, jumlah
   dipakai 30 hari, dan "tidak dipahami" terkait. Klik baris → panel kanan:
   - **Kata kunci**: chip + bobot (1 / 2 / 3), tambah/hapus.
   - **Contoh pertanyaan**: daftar, tambah/hapus/urutkan.
   - Saringan yang dipakai fungsi ini (hanya baca, dari kode).
2. **Kamus** — tabel `dari → jadi`, tambah/ubah/hapus, cari.
3. **Riwayat** — pertanyaan masuk, saring: *tidak dipahami* (bawaan) / semua /
   per fungsi / per tanggal. Tiap baris *tidak dipahami* punya tombol
   **"Ajarkan"**: pilih fungsi + pilih kata dari pertanyaan itu (chip yang bisa
   diklik) → disimpan jadi kata kunci, baris ditandai ditangani.
4. **Uji coba** — kotak teks + pilihan "seolah dari grup / pribadi". Tampil:
   - teks setelah dirapikan;
   - saringan terbaca (ULP, periode, gardu, penyulang);
   - skor tiap fungsi (urut);
   - **balasan persis** seperti di WA (gambar ditampilkan).

   Uji coba **tidak** dicatat ke riwayat dan tidak mengirim WA. Lewat route
   `/api/wa-tanya/uji` (cek sesi UP3/admin), memakai pengurai & fungsi yang sama
   dengan webhook.

## 7. Keamanan & beban

- Daftar grup/nomor yang diizinkan **tetap** memakai env yang sudah ada
  (`WA_ALLOWED_GROUPS`, `WA_ALLOWED_DMS`).
- **Batas laju**: satu pengirim maksimal 10 pertanyaan per menit (di memori
  proses). Lebihnya diabaikan diam-diam.
- Data yang dijawab bersifat ringkasan operasional, sama dengan perintah `#`
  sekarang. Tidak ada tulis data dari tanya-jawab.

## 8. Tahapan

| Tahap | Isi | Uji |
|-------|-----|-----|
| **T1** ✅ dibangun 28 Okt | SQL tabel + benih; `lib/wa/tanya/` (pengurai, daftar fungsi, 4 fungsi: overload, kartu gardu, beban gardu, bantuan); webhook: @smart + chat pribadi + riwayat | Uji unit pengurai (node): ±40 kalimat contoh termasuk salah ketik; coba di grup uji |
| **T2** ✅ dibangun 28 Okt | Halaman web: tab Fungsi, Kamus, Uji coba (`/api/wa-tanya/fungsi` isi benih + info kode, `/api/wa-tanya/uji`) | Ubah kata di web → berlaku di WA ±1 menit |
| **T3** ✅ dibangun 28 Okt | Tab Riwayat + "Ajarkan"; pilihan bernomor saat seri (5 menit, di memori proses) | |
| **T4** ✅ dibangun 28 Okt | Fungsi sisanya: cari gardu (alamat), tegangan ujung, gangguan (Sheets gangguanPenyulang — koreksi user: BUKAN gangguan_realtime), temuan terbuka/urgent, realisasi pekerjaan (bulan = rekap_kinerja; hari/minggu = realisasi_bulanan; "realisasi hari ini" = gambar Realisasi Harian) | Bandingkan angka dengan halaman web masing-masing |

Fungsi baru di kemudian hari = satu berkas di `lib/wa/tanya/fungsi/` + daftar di
indeks. Baris tabelnya muncul sendiri (benih), lalu kata-katanya diatur di web.

## 9. Tidak dikerjakan sekarang

- AI / bahasa bebas penuh.
- Pesan lokasi, foto, suara.
- Persetujuan dari WA.
- Mengenali nomor sebagai petugas tertentu. Kolom `dari` di riwayat sudah
  disiapkan untuk itu nanti.

## 10. Perlu dicek saat membangun

- Bentuk `mentionedJid` saat bot di-mention di grup (nomor `@s.whatsapp.net`
  atau `@lid`). Bila `@lid`, isi `WA_BOT_LID`.
- Batas "overload" dan "tegangan ujung di bawah batas" memakai ambang yang sudah
  dipakai web (bukan angka baru).

### Tanya balik ULP/periode (28 Okt, dibangun)
- ULP tidak disebut: grup milik satu ULP → ULP grup; grup UP3 / chat pribadi → bot bertanya (Semua ULP / 4 ULP).
- Periode tidak disebut → selalu ditanya (Hari ini / Minggu ini / Bulan ini / Tahun ini). Kode gardu disebut → tidak ditanya.
- Langkah tanya balik tidak dicatat di Riwayat; jawaban akhirnya dicatat dengan pilihannya, plus saran "Lain kali bisa langsung: @smart …".
