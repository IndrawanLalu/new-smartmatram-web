# Rencana — Usulan Perbaikan JTR → pilih titik pecah → material → WO

20 Okt 2026. Lanjutan Analisis JTR (F1 anomali, F3 rencana, peta).
Status: P1 dibangun (a794ff5). P2–P4 dibangun 20 Okt — SQL `scripts/jtr-usulan-perbaikan.sql`. P5 belum.

## Alur besar

```
Analisis JTR (tabel)                    Peta
  baris merah/kuning ──► Rincian ──► Lihat di peta ──► klik tiang mana pun
                          │                            "Hitung pecah di sini"
                          ▼                                   │
                 Pilihan titik pecah (bandingkan)  ◄──────────┘
                          │ pilih satu
                          ▼
                 Simpan sebagai USULAN  (angka dibekukan saat itu)
                          │ isi / periksa material
                          ▼
                 Jadikan WO  ──► regu sesuai jenis pekerjaan
                          │
                          ▼
                 Selesai di HP ──► usulan Selesai ──► WO ukur ulang (bukti hasil)
```

## P1 — Pilihan titik pecah (tanpa SQL)

Untuk jenis **Tambah jurusan**, rincian tidak lagi satu jawaban, tapi daftar pilihan:

| Pilihan | Artinya |
|---|---|
| Kabel terpendek | titik dengan kabel baru paling pendek yang kedua sisinya ≤ batas |
| Percabangan | percabangan terbaik (yang sekarang dipilih) |
| Paling seimbang | arus jurusan baru ≈ jurusan lama |
| Dekat gardu + pemerataan | pecah di percabangan dekat gardu, sisa kelebihan diselesaikan dengan pemerataan fasa (mis. GS219-B di B3, kabel 32 m) |

Setiap pilihan menampilkan:
- tiang pecah, dan apakah itu percabangan;
- panjang kabel baru;
- arus jurusan baru dan lama (A, juga % dari batas), ditandai Aman / Mendekati batas / Lewat batas;
- tarikan SR dan tiang yang pindah;
- lintasan terjauh jurusan lama dan baru;
- perkiraan jatuh tegangan turun %;
- slot jurusan PHB-TR.

**Pilih sendiri titik potong.** Di peta, klik tiang mana pun di jurusan itu lalu tekan
"Hitung pecah di sini". Di rincian, ada juga kotak cari kode tiang. Angkanya dihitung
dengan rumus yang sama. Titik yang melewati batas tetap boleh dipilih, tapi ditandai
merah beserta alasannya; keputusan di tangan user.

Peta menampilkan semua pilihan bernomor (1, 2, 3…). Pilihan yang sedang dilihat
menyorot gawang yang pindah.

## P2 — Usulan tersimpan (SQL baru)

Tabel `jtr_usulan_perbaikan`, satu baris per gardu + jurusan + pekerjaan:
- gardu, jurusan, jenis pekerjaan, tiang pecah (bila ada);
- **angka dibekukan** saat disimpan (arus, kabel, SR, % turun) — pengukuran berikutnya
  akan mengubah analisis, usulan harus tetap menunjukkan dasar keputusannya;
- material (daftar, lihat P3);
- status: Usulan → Di-WO-kan → Selesai / Batal;
- rujukan WO, pembuat, waktu.

Di tabel Analisis JTR: kolom/lencana "Usulan tersimpan" / "Di-WO-kan" per jurusan, supaya
jurusan yang sudah diurus tidak diusulkan dua kali.

## P3 — Material

Material **diisi otomatis sebagai perkiraan**, lalu user memeriksa dan mengubahnya
sebelum WO terbit. Daftar material dan rumus banyaknya diatur di Pengaturan Analisis JTR
(UP3), bukan ditulis mati di kode.

Perkiraan bawaan (contoh, user yang menetapkan daftar sebenarnya):

| Pekerjaan | Material | Banyaknya dihitung dari |
|---|---|---|
| Tambah jurusan | kabel LVTC (ukuran sama dengan jurusan) | panjang kabel baru + cadangan % |
| | penggantung / suspension clamp | jumlah tiang yang dilalui |
| | strain / dead-end clamp | ujung-ujung tarikan |
| | konektor di titik pecah | tetap |
| | NH fuse + rel jurusan PHB-TR | bila slot jurusan penuh |
| Ganti kabel | kabel ukuran baru + aksesoris | panjang gawang yang diganti, jumlah tiang |
| Pemerataan | konektor | jumlah SR yang dipindah fasa (perkiraan) |

Material tampil di: rincian usulan, PDF/rincian WO di web, dan tugas di HP.

## P4 — Jadikan WO (memakai jalur WO yang SUDAH ADA)

| Pekerjaan | Masuk ke | Di HP |
|---|---|---|
| Pemerataan beban | WO Pemerataan (pengukuran terakhir gardu ditandai WO) | role Pemerataan → Penyeimbangan (sudah ada ukur sebelum/sesudah) |
| Tambah jurusan, Ganti kabel | Tugas HARJAR JTR (`buat_tugas_harjar`, sama dengan Buat Tugas di Pemeliharaan Jaringan) | HARJAR → Tugas → catatan Pemeliharaan Jaringan |
| Bagian PHB-TR (tambah jurusan bila perlu NH fuse/rel) | WO Tindak Lanjut Gardu (wo_batch, regu HARGAR) | HARGAR → Work Order |
| Naik daya / mutasi trafo | daftar Optimasi Trafo | (alur Optimasi Trafo) |
| Sisip gardu | bukan WO yantek — Usulan Sisip (Excel untuk perencanaan/RAB) | — |

Regu boleh diganti user saat membuat WO; bawaannya mengikuti tabel di atas.
Satu tombol "Jadikan WO" di usulan; layar konfirmasi menampilkan regu, bulan WO,
material (bisa diubah), catatan.

## P5 — Menutup lingkaran

- Tugas selesai di HP → usulan otomatis "Selesai" (diturunkan dari status tugas, bukan
  diisi dua kali).
- Sesudah selesai, gardu itu masuk WO Pengukuran bulan berikutnya → Analisis JTR
  menunjukkan arus sesudah perbaikan (bukti hasil).
- Tambah jurusan mengubah bentuk JTR: tiang yang pindah harus berganti huruf
  jurusan. Diusulkan: saat tugas selesai, regu memastikan di HP, atau admin menekan
  "Terapkan jurusan baru" di peta — DIPUTUSKAN NANTI, setelah P1–P4 dipakai.

## Urutan kerja

P1 (web saja, tanpa SQL) → user coba → P2+P3 (SQL + web) → P4 (web; HP hanya bila
material perlu tampil rapi di tugas → OTA) → P5.

## Keputusan user (20 Okt)

1. Sisip gardu = daftar usulan saja (Excel untuk perencanaan), tidak di-WO-kan.
2. Material: mulai dari daftar bawaan, user menyunting di Pengaturan.
3. Pekerjaan PHB-TR saat tambah jurusan ikut tugas HARJAR (satu WO).
4. Naik daya / mutasi trafo → WO Optimasi Trafo.

## Tambahan 21 Okt

- **Ubah titik pecah** selama usulan belum di-WO-kan (rincian usulan → "Ubah titik pecah"): angka dihitung
  ulang dari analisis saat ini, material diperkirakan ulang (material lama tampil sebagai pembanding).
  SQL `scripts/jtr-usulan-ubah-pecah.sql` (fungsi `ubah_pecah_usulan_jtr`).
- **Jumlah SR** tampil di tabel pilihan (SR baru / lama), tooltip klik tiang di peta, dan kode tiang di gambar survey.
- **Cara baru "pindah SR ke kabel baru"** (tanpa potong sambung): kabel baru ditarik sejajar sampai tiang X,
  SR di setiap tiang sepanjang jalur itu dipindah ke kabel baru, kabel lama utuh melayani sisanya. Untuk JTR
  pendek dengan SR menumpuk di pangkal / jurusan lurus. Tampil berdampingan dengan pilihan potong; usulan
  sistem bila tidak ada potong yang layak. Material bawaan sendiri (`pekerjaan = 'pindah-sr'`), WO tetap HARJAR.
