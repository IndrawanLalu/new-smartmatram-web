# Rencana — Survey Jaringan Baru (JTM dulu, lalu JTR) → Operasikan → jadi aset

21 Okt 2026. Status: S1 dibangun 21 Okt (SQL `scripts/survey-jaringan.sql`, belum dijalankan). S2–S4 belum.

## Keputusan user (21 Okt)

1. Nama di layar: **"Survey Jaringan Baru"**.
2. Digambar di **web dulu**; survey lapangan dari HP menyusul.
3. **JTM dulu**, JTR menyusul.
4. **Operasikan** hanya UP3 + admin ULP (web).

## Masalah

Jaringan baru direncanakan di luar SMART, dikerjakan, lalu baru masuk SMART saat inspeksi
berikutnya — atau tidak pernah. Unit kehilangan data jaringan barunya dan KMS tidak bertambah.

## Gagasan

Jaringan baru **digambar langsung di peta sebagai aset berstatus survey**, di tabel aset yang SAMA
(`tiang`), bukan tabel terpisah. Saat dioperasikan statusnya dibalik menjadi aktif — tanpa salin
data, tanpa ketik ulang.

Dasar yang sudah ada: `tiang.status_hidup` punya nilai `usulan` (0 tiang memakainya). Hampir semua
view/fungsi JTM & JTR hanya membaca `aktif`, jadi tiang survey tidak ikut KMS, rekap, inspeksi,
WO. Beberapa view belum menyaring (mis. di `jtm-koreksi-isian.sql`, `jtm-underbuild-mvtic.sql`,
`jtm-temuan-tugas*.sql`) → **diaudit satu per satu di S1**.

```
Gambar di peta ──► SURVEY (Draf) ──► Gambar survey PDF + daftar material
                        │
                        ▼
                  Disetujui ──► (nanti) WO pembangunan
                        ▼
                  OPERASIKAN: tanggal operasi + sesuaikan hasil lapangan
                        │     (geser tiang, hapus yang tidak jadi, tambah yang kurang)
                        ▼
                  tiang → aktif, nama resmi JTM, gardu baru masuk master
                  → KMS, rekap, peta, SLD, inspeksi berikutnya
```

## Penyimpanan (diputuskan saat S1 dibangun, 21 Okt)

Titik survey disimpan di tabel SENDIRI (`survey_titik`), BUKAN baris `tiang` berstatus `usulan`:
±16 skrip JTM membaca `tiang` tanpa menyaring status, sehingga tiang rencana bisa bocor ke peta,
penamaan, segmen, atau rekap. Hasil untuk user sama — Operasikan (S2) melahirkan tiang aktif dari
titik-titik itu, tanpa ketik ulang. Kode sementara tidak diperlukan.

## Satu survey = satu paket pekerjaan

Tabel baru `survey_jaringan`: judul, ULP, penyulang, jenis (JTM / JTR), alasan (perluasan /
sisip gardu / tambah jurusan / lainnya), status (Draf → Disetujui → Dioperasikan / Batal),
material (jsonb, disunting user), catatan, pembuat & waktu, tanggal operasi. Setiap tiang survey
menunjuk `survey_id`, berstatus `usulan`, dan memakai **kode sementara** (mis. `SRV-12-001`) —
trigger penamaan JTM hanya menamai tiang tanpa kode, jadi nomor resmi tidak terpakai sebelum
jaringan benar-benar ada.

**Gardu baru** tidak masuk master saat survey (supaya tidak muncul di daftar pengukuran, WO,
dsb.). Disimpan di survey (titik, kVA, nama/alamat rencana) dan baru dibuat di master gardu saat
dioperasikan, dengan kode gardu yang diisi user saat itu.

## S1 — Survey JTM: gambar di peta + daftar + gambar survey

**Menggambar di /peta (mode "Survey Jaringan Baru"):**
- klik tiang JTM yang ada sebagai **titik sambung** → penyulang & segmen ikut titik itu;
- klik titik-titik tiang baru berurutan (induk = tiang sebelumnya); bisa bercabang dari tiang
  survey mana pun;
- per tiang: jenis & tinggi tiang, konstruksi; per gawang: jenis & ukuran konduktor (bawaan =
  isian sebelumnya, seperti isian inspeksi JTM); tanda **gardu baru** (kVA) atau **peralatan**
  (FCO, LBS, recloser);
- geser / hapus titik selama Draf; panjang dihitung dari koordinat;
- tampil: garis putus-putus warna survey, tiang berbingkai; lapisan "Survey jaringan baru"
  bisa disembunyikan.

**Daftar survey** (halaman web baru, menu "Survey Jaringan Baru"): saring status/ULP/penyulang,
rincian, Setujui, Batalkan (alasan), Lihat di peta, Excel.

**Gambar survey PDF:** mesin yang sudah ada (latar peta jalan, kolom kanan, tanda tangan):
JTM sekitar (abu-abu), jaringan baru merah putus-putus, tiang baru bernomor, gardu baru
segitiga, peralatan baru bersimbol, titik sambung ditandai.

**Material dihitung dari gambarnya** (tanpa daftar bawaan dulu): panjang konduktor per jenis &
ukuran, jumlah tiang per jenis & tinggi, konstruksi per jenis, peralatan per jenis, trafo per kVA —
lalu diperiksa & disunting user. Daftar bawaan per konstruksi (isi material satu konstruksi)
menyusul bila dibutuhkan.

## S2 — Operasikan JTM

Tombol **Operasikan** (UP3 + admin ULP; tanggal operasi wajib):
- tampil di peta: tiang survey bisa digeser ke posisi sebenarnya, dihapus bila tidak dibangun,
  ditambah bila kurang (hasil lapangan);
- isi kode gardu baru (bila ada) → dibuat di master gardu;
- semua tiang → `aktif`, `sumber = 'survey'`; kode sementara dilepas dan **nama resmi diberikan
  aturan penamaan JTM yang berlaku** (pratinjau seperti "Generate ulang nama");
- peralatan pemisah baru (LBS/recloser) → pembagian segmen memakai aturan segmen yang ada
  (rinciannya diperiksa saat S2 dibangun);
- tiang `sumber = 'survey'` diperlakukan **belum dikonfirmasi lapangan** sampai inspeksi JTM
  berikutnya menyapunya — tetap ada pemeriksaan nyata;
- dicatat di riwayat (siapa, kapan, tanggal operasi).

⚠ Diperiksa saat S2: apakah rekap bulan-bulan lalu dihitung ulang dari data sekarang (bila ya,
KMS bulan lalu ikut bertambah setelah operasi → perlu tanggal berlaku).

## S3 — Survey JTR

Sama, untuk JTR: mulai dari gardu (lama atau gardu baru dari survey JTM) atau tiang JTR yang ada;
jurusan & penamaan JTR yang ada; SR rencana. Sambungan dari **Usulan perbaikan JTR** (tambah
jurusan / sisip gardu) → "Buat survey jaringan" dari usulan.

## S4 — HP

Petugas survey menitik tiang rencana di lapangan dengan GPS (OTA). Regu tetap tidak bisa
Operasikan (keputusan 4).

## Urutan

S1 (SQL + web) → user coba → S2 → S3 → S4. Tiap tahap: SQL dijalankan user dulu, lalu push.
