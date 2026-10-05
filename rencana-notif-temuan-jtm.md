# Rencana: Notif WA temuan hidup lagi + Kategori temuan JTM

Disusun 6 Okt 2026. **Belum ada yang di-push** — permintaan user: "rencanakan matang dulu".

## Bagian A — Notif WA realtime temuan (sudah dibangun, menunggu persetujuan)

**Penyebab mati.** Sejak Juli notif temuan Urgent / pohon Sangat Tinggi dikirim
`wa-bot/realtime.js` (whatsapp-web.js, login WA sendiri). Di homelab container
`wa-bot` ada di profil compose `bot` yang tidak pernah dinyalakan, dan webhook
Supabase lama sudah dimatikan sejak Juli → **tidak ada pemicu sama sekali**.
Homelab juga tidak punya penjadwal → **pengingat 08/11/15/18 ikut mati**.
Sisi web sehat (diuji di homelab): `/api/wa-notify` 200 dengan secret, gateway
sesi `open`, `WA_USE_GATEWAY=true`, grup WA 4 ULP terisi.

**Perbaikan (kode lokal, belum commit).**
- Container baru **`pekerja`** (`pekerja/`, node:22-alpine, 128 MB):
  1. Supabase Realtime `inspeksi` / `inspeksi_pohon` → hanya yang **baru menjadi**
     Urgent / Sangat Tinggi → `POST http://web:3000/api/wa-notify` (jaringan
     internal Docker, `.env` yang sama = secret tak bisa melenceng).
  2. Jadwal 08/11/15/18 WITA → `POST /api/wa-reminder`.
- `/api/wa-notify` diberi penjaga transisi (`old_record`): perubahan status temuan
  yang sudah Urgent tidak mengirim ulang.
- Diuji lokal: langganan `SUBSCRIBED`.

**Pemasangan.** Blok `pekerja` disalin manual ke compose homelab (jalur gateway di
sana absolut, beda dari repo) → `docker compose up -d --build web pekerja` → log
`realtime: SUBSCRIBED`. Uji akhir dengan satu temuan Urgent di ULP fiktif "UJI"
(tanpa grup → tak ada WA nyata), lalu barisnya dihapus — **hanya bila disetujui**.

## Bagian B — Kategori temuan JTM + WA

Permintaan user: setiap temuan JTM diberi kategori oleh regu (Urgent, Rawan, …);
yang Urgent dikirim WA **saat regu mengirim**; pohon ke grup **Perabasan**, selain
pohon ke grup **Jaringan** — sama dengan temuan inspeksi lama.

### B1. HP — pilih kategori per temuan
- Di kotak temuan (tempat foto & keterangan) muncul pilihan kategori.
- **Wajib** dipilih bila jawabannya temuan — tiang tak bisa disimpan tanpanya,
  sama dengan "temuan wajib berfoto". **Tanpa pilihan bawaan** (isian bawaan
  pernah ditolak user).
- Dibuka lagi (draf / dikembalikan) → kategori lama ikut tampil.

### B2. Data
- `inspeksi_jtm_periksa.kategori_temuan TEXT` (NULL = HP lama / bukan temuan),
  dibatasi CHECK ke daftar kategori.
- Disimpan `kirim_tiang_jtm` **sesudah** penilaian tersimpan — pola yang sama
  dengan `foto_lain`; fungsi penilaian (`_nilai_tiang_jtm_inti`) tetap tidak
  disentuh. Dasar salinan: versi di `scripts/foto-temuan-banyak.sql`.
- View `tiang_kondisi_terakhir` / `jtm_temuan` membawa kategori → web tab Temuan
  (chip + saring), Excel Hasil Inspeksi (kolom & rekap per kategori).
- Tugaskan temuan: prioritas awal mengikuti kategori (Urgent → Urgent, …),
  tetap bisa diubah admin.

### B3. WA saat regu mengirim
- `inspeksi_jtm_periksa` masuk publication realtime + `REPLICA IDENTITY FULL`.
- Pekerja menangkap baris yang **baru menjadi** Urgent (INSERT, atau UPDATE dari
  bukan-Urgent). Kirim ulang penilaian yang sama tidak memicu apa pun.
- Ditahan ±30 detik per tiang lalu diteruskan **satu pesan per tiang** ke route
  web baru `/api/wa-notify-jtm` — tiang dengan tiga temuan urgent = satu WA.
- Isi: nama tiang (di penyulang itu), penyulang, segmen, ULP, daftar temuan
  urgent (isian · keadaan · keterangan), petugas, tautan lokasi, foto pertama.
- Grup: temuan pohon (isian Pohon / Nama pohon / Posisi pohon) → kategori grup
  `perabasan` ULP; selain itu → `jaringan`. Tiang yang punya keduanya = dua pesan.
- **Cegah WA dobel:** baris `inspeksi` yang lahir dari "Tugaskan" temuan JTM
  (`source='inspeksi_jtm'`) tidak lagi dikirim sebagai temuan baru — WA-nya sudah
  terkirim saat regu mengirim.

### B4. Yang sengaja tidak dikerjakan
- Penilaian yang kemudian ditolak / dibatalkan admin tidak "menarik" WA yang
  sudah terkirim.
- JTR belum (bisa menyusul dengan pola yang sama).

## Keputusan user (6 Okt 2026)
1. Kategori: **Urgent · Rawan · Biasa** (wajib dipilih bila jawabannya temuan,
   tanpa pilihan bawaan).
2. **Hanya Urgent yang dikirim WA**; Rawan & Biasa tercatat (tab Temuan, Excel).
3. **Pengingat 08/11/15/18 ikut menyebut temuan Urgent JTM** yang belum ditugaskan.
4. Temuan **pohon tetap dipilih regu** kategorinya (tidak diturunkan dari jawaban).
5. Grup: pohon → Perabasan, selain pohon → Jaringan. WA saat regu mengirim.

## Urutan rilis
1. Bagian A: push → pasang `pekerja` di homelab → uji (temuan uji ULP "UJI").
2. Bagian B: SQL (kolom, view, kirim_tiang_jtm, publication) → push web (route
   `wa-notify-jtm`, tab Temuan, Excel) → bangun ulang `pekerja` → **OTA HP**
   (pilihan kategori). Urutan ini aman: HP lama tak mengirim kategori → tak ada WA.

## Status pembangunan (6 Okt 2026)
- **Bagian A** ter-push `ead57b3` — menunggu dipasang di homelab (blok `pekerja` di compose).
- **Bagian B dibangun, BELUM commit:**
  - SQL `scripts/jtm-kategori-temuan.sql` (kolom + kirim_tiang_jtm ◆ + view kecil
    `jtm_kategori_temuan` + publication). Uji PGlite lulus (6 cek baru + uji lama).
  - Web: `/api/wa-notify-jtm` (satu pesan per tiang, pohon → perabasan),
    `lib/wa/kirimGrup.ts`, `/api/wa-notify` & pekerja melewati `source='inspeksi_jtm'`,
    pekerja kanal kedua `temuan-jtm` (ditahan 30 dtk per tiang), pengingat + temuan
    Urgent JTM belum ditugaskan (satu pesan ringkas per grup), tab Temuan (chip &
    saring kategori, prioritas awal Urgent→Urgent / Rawan→Scheduled / Biasa→Normal),
    Excel (kategori di kolom Temuan & rekap).
  - HP: pilihan kategori wajib di kotak temuan (tanpa bawaan), penjaga simpan,
    dibuka lagi memuat kategori; salinan tiang kedua portal TIDAK membawa kategori
    (cegah dua WA untuk satu temuan).
- Urutan: pasang & uji A → SQL B → push web + bangun ulang `web pekerja` → OTA HP.
  ⚠ OTA HP setelah SQL (HP membaca kolom `kategori_temuan` saat membuka penilaian).
