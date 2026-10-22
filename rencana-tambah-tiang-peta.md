# Rencana — Tambah & Pulihkan Tiang JTM dari Peta (22 Okt 2026)

Permintaan user 22 Okt 2026: kalau di lapangan ada tiang yang **lupa / lolos
dititik**, atau admin **salah hapus** di peta, sekarang tidak ada cara
menambahkan tiang langsung di `/peta`.

Status: **RENCANA — menunggu jawaban user (bagian "Perlu diputuskan").**

---

## Keadaan sekarang

- Tiang JTM hanya lahir dari HP (penyapuan / rintis) atau impor.
- "Batalkan tiang (salah input)" di peta (`batalkan_tiang`):
  - status → `batal`, **semua nama penyulangnya dihapus** (tercatat di audit
    `nama_dibuang`), lepas dari batang pinjaman JTR;
  - **ditolak** kalau tiang masih menyuplai tiang lain — jadi admin yang salah
    hapus di tengah jalur pasti sudah memindah induk anak-anaknya dulu.
- Saat ini ada **533 tiang JTM berstatus batal**.

Dua kebutuhan ini berbeda, jadi dua jalan:

## A. Pulihkan tiang (untuk salah hapus)
Lebih baik daripada menambah ulang: id, riwayat inspeksi, foto, peralatan,
dan temuan tetap menempel.

1. Lapisan/daftar **"Tiang dibatalkan"** di `/peta` (titik kelabu bersilang),
   bisa dicari per nama lama / penyulang / tanggal / oleh siapa.
2. Klik → **Pulihkan**: status kembali `aktif`, nama penyulang dikembalikan
   dari audit `nama_dibuang` (kalau nama itu sudah dipakai tiang lain →
   aturan nama dobel: yang lebih dekat pangkal menang), batang pinjaman JTR
   tidak otomatis kembali.
3. **Sambungkan lagi**: induknya diisi lagi (induk lama dari audit sebagai
   usulan), dan — opsional — anak-anak yang dulu dipindah bisa dikembalikan
   ke tiang ini (daftar dari audit `induk_id` sesudah pembatalan).
4. Alasan wajib, tercatat di audit.

## B. Tambah tiang (untuk tiang yang lolos dititik)
Mode baru di panel tiang, pola "Mode geser titik":

1. **Sisipkan di antara A → B** (paling sering: tiang terlewat di tengah
   jalur): klik garis/tiang A, klik letak di peta (atau ketik koordinat).
   Tiang baru jadi anak A, B pindah jadi anak tiang baru. Semua penyulang
   yang lewat A dan B ikut menamai tiang baru (underbuild ikut).
2. **Tambah di ujung / cabang dari A**: tiang baru jadi anak A.
3. **Nama**: lewat mesin penamaan yang sama dengan HP — sisipan diberi
   huruf (`GNS-018a`, seperti data lama), lanjutan diberi nomor berikutnya;
   lalu ditawarkan **Ganti nama (hilir ikut)** kalau mau dirapikan.
4. **Tanda "dititik dari meja"**: `sumber = 'meja'`, belum dikonfirmasi
   lapangan → digambar putus-putus sampai regu menilainya di penyapuan
   berikutnya (pola tiang rencana Survey Jaringan Baru).
5. Atribut (jenis, konstruksi, penghantar) bisa langsung diisi atau dibiarkan
   untuk regu.
6. Penjaga yang sama dengan HP: tolak titik < radius tumpang dari tiang lain
   (kecuali dikonfirmasi "batang berbeda"), segmen ikut diperbarui
   (`segmen_tiang`), audit.

---

## Fase

| Fase | Isi | Rilis |
|---|---|---|
| **T1** | Pulihkan tiang (SQL `pulihkan_tiang` + lapisan/daftar dibatalkan + panel) | SQL + web |
| **T2** | Tambah tiang: sisipkan A→B & tambah dari A (SQL `tambah_tiang_meja` + mode di peta) | SQL + web |
| **T3** | Tanda "belum dikonfirmasi lapangan" tampil di HP penyapuan JTM | OTA |

---

## Perlu diputuskan (user)

1. **Siapa boleh menambah / memulihkan?** Usulan: admin ULP & UP3 (sama dengan
   sunting peta lainnya).
2. **Nama tiang sisipan**: huruf di belakang (`GNS-018a`, seperti data lama)
   atau langsung tawarkan Ganti nama (hilir ikut) supaya bernomor rapi?
3. **JTM saja dulu**, atau JTR juga (JTR punya jurusan & kabel — lebih panjang)?
4. Tiang tambahan dari meja: **wajib dikonfirmasi regu** di penyapuan
   berikutnya (usulan), atau langsung dianggap sah?
