# Rancangan — Kerja lapangan di HP (mulai dari Pemeliharaan Gardu) & Beranda HP

Disusun 24 September 2026 dari arahan user. **Belum dikerjakan** — menunggu
persetujuan. Setelah disetujui, aturan umumnya masuk `teknisaplikasi.md`
supaya berlaku di semua fitur HP.

---

## 0. Keputusan user (jangan ditawar ulang)

| # | Keputusan |
|---|---|
| 1 | Empat tab: **WO bulan ini · Belum dikerjakan · Sudah dikerjakan · Sudah dikirim** |
| 2 | Tampilan meniru layar **WO Pengukuran** di HP |
| 3 | *Sudah dikerjakan* = tersimpan di HP, **masih bisa diubah**. *Sudah dikirim* = **hanya dilihat** |
| 4 | Koreksi yang sudah dikirim **lewat admin "Kembalikan"** di web — petugas tidak bisa menarik sendiri |
| 5 | Pekerjaan yang **dikembalikan** admin masuk tab **Sudah dikerjakan** (jadi draf berisi isian lama) |
| 6 | Tetap bisa mengerjakan gardu **di luar WO** lewat pencarian |
| 7 | Mode luring mengikuti aturan yang sudah tercatat (butir 1, 5, 6 `teknisaplikasi.md`) |
| 8 | Nama petugas = **tim yang dipilih saat login**, dikunci; isian anggota regu manual dihapus |
| 9 | WO & tahap: tab WO berisi semua gardu WO; tiga tab lain per tahap, **WO maupun luar WO** |
| 10 | Beranda: Gangguan penyulang tetap → **Rekap Kinerja** (semua role, ULP sendiri, bulan berjalan dengan ◀ ▶) → bagian lama tetap di bawahnya |
| 11 | Urutan penerapan ke fitur lain: **Pengukuran → Optimasi → Perabasan → Harjar → JTM/JTR** |

---

## 1. Keadaan sekarang (yang harus diubah)

Diperiksa di kode `new-smart`, 24 Sep 2026:

- **Selesai langsung mengirim.** Tombol akhir di formulir membuat baris di server,
  menyimpan jawaban, mengunggah foto, lalu menutup — melanggar butir 1
  (isi → simpan di HP → periksa → KIRIM).
- **Draf cuma satu slot** (`@hargardu_draf`). Mengerjakan gardu kedua menimpa
  draf gardu pertama tanpa peringatan — melanggar butir 14 (kunci = satuan
  data: gardu + ULP).
- **Kirim tidak atomik.** Lima panggilan berurutan (kepala, jawaban, ukur, foto,
  selesaikan). Putus di tengah = baris "Dalam Proses" setengah jadi di server.
- **Nama regu diketik** di formulir (`regu_1`, `regu_2`), terpisah dari tim login.
- **Daftar gardu tidak tersimpan** untuk luring — tanpa sinyal, layar kosong.

---

## 2. Empat tab Pemeliharaan Gardu

Satu kotak pencarian di atas semua tab. Di bawahnya chip urut **Urutan WO /
Terdekat** dan navigasi bulan ◀ Sep 2026 ▶ — sama persis dengan WO Pengukuran.

| Tab | Isi | Sumber | Ketuk kartu |
|---|---|---|---|
| **WO bulan ini** | Semua gardu WO + bilah progres "x dari y dikerjakan" dan ringkasan per tim | server (tembolok HP) | buka formulir / lihat |
| **Belum dikerjakan** | Gardu WO yang belum disentuh, **plus** draf yang belum lengkap diisi (label "sedang diisi · langkah 5/12") | server + HP | formulir |
| **Sudah dikerjakan** | Draf lengkap di HP, belum dikirim (WO maupun luar WO) + yang **dikembalikan admin** (label merah + alasan). Tombol **Kirim** per kartu dan **Kirim semua** | HP | formulir (bisa diubah) |
| **Sudah dikirim** | Terkirim bulan ini se-ULP, dengan nama tim & status: *menunggu persetujuan · disetujui* | server (tembolok HP) | **rincian hanya-baca** |

Pencarian:
- Kosong → isi tab seperti di atas.
- Terisi → di bawah hasil tab muncul bagian **"Gardu lain (di luar WO)"** dari
  master gardu ULP — itulah jalan mengerjakan gardu di luar WO.

Kartu (meniru WO Pengukuran): kode gardu besar, nama/alamat, penyulang · kVA,
jarak dari petugas, lencana status di kanan, garis warna kiri sesuai tahap.

Lencana:

| Keadaan | Lencana |
|---|---|
| WO, belum disentuh | belum dikerjakan (merah) |
| draf belum lengkap | sedang diisi (biru muda) |
| draf lengkap | tersimpan di HP — belum dikirim (kuning) |
| dikembalikan admin | dikembalikan (merah) + alasan |
| terkirim | menunggu persetujuan (biru) |
| disetujui | disetujui (hijau) |

---

## 3. Alur satu pekerjaan

```
Belum dikerjakan ──buka──► formulir bertahap ──(simpan otomatis ke HP tiap ubah)
                                │
                     langkah terakhir: "Simpan" (cek isian wajib)
                                ▼
                        Sudah dikerjakan  ◄──── dikembalikan admin (isian lama dimuat)
                     (bisa dibuka & diubah)
                                │  Kirim / Kirim semua
                                ▼
                          Sudah dikirim ──► hanya-baca; koreksi = admin "Kembalikan"
```

- **Tidak ada baris server sebelum Kirim.** Formulir hanya menulis ke HP.
- **Simpan** di langkah akhir memeriksa isian wajib & foto wajib (fungsi
  `isianKurang` yang sudah ada). Belum lengkap → tetap di *Belum dikerjakan*
  sebagai "sedang diisi".
- **Nama petugas** tampil terkunci di langkah pertama: "Petugas: Budi & Andi
  (dari login)". Isian anggota regu dihapus. Akun tanpa tim (admin/UP3 uji
  coba) memakai email, seperti sekarang.

---

## 4. Simpanan di HP (luring)

| Kunci AsyncStorage | Isi | Aturan |
|---|---|---|
| `@hargardu_draf_v2` | **daftar** draf, kunci tiap draf `KODE|ULP` (+ `pemeliharaanId` bila dari "dikembalikan") | butir 14: satu gardu satu draf; draf gardu lain tidak tertimpa |
| `@hargardu_gardu_<ULP>` | master gardu ULP + cap waktu | dipakai saat luring; spanduk "data dari HP, terakhir diperbarui 08.12" |
| `@hargardu_wo_<ULP>_<YYYY-MM>` | baris WO bulan itu | sama |
| `@hargardu_terkirim_<ULP>_<YYYY-MM>` | ringkas yang sudah dikirim | sama |
| acuan isian | sudah ada, tetap | — |

- Draf lama satu-slot **dipindahkan sekali** ke format baru saat pembaruan
  pertama dibuka — tidak ada isian regu yang hilang karena pembaruan.
- Foto tetap URI lokal di draf sampai Kirim (butir 1). Kehilangan foto dari
  tembolok diterjemahkan jadi kalimat "potret ulang foto X lalu kirim lagi"
  (butir 5).
- Server mati / tanpa sinyal: daftar dari tembolok + spanduk; tab tidak pernah
  tampil "kosong" karena gagal (butir 6). Membedakan "tanpa sinyal" dari
  "server mati" butuh NetInfo = build native — **ditunda** sesuai rencana build.

---

## 5. Kirim — satu transaksi di server

1. **Unggah foto dulu**, satu per satu dengan kemajuan "foto 3 dari 10". URL
   yang berhasil **ditulis balik ke draf** — kirim ulang setelah putus tidak
   mengunggah dua kali.
2. **Satu RPC** `kirim_pemeliharaan_gardu(p_isi jsonb)` membuat/memperbarui
   seluruhnya dalam satu transaksi: kepala, jawaban periksa, ukur
   sebelum-sesudah, foto, usulan spek, lalu status `Selesai`.
   - `p_isi.id` kosong → baris baru; terisi (dari "dikembalikan") → baris itu
     diperbarui, status `Ditolak` → `Selesai`.
   - `sumber = 'jadwal'` bila gardunya ada di WO bulan itu.
   - `petugas_nama` = tim login.
   - Menolak kalau gardu itu **sudah punya kiriman berstatus Selesai di bulan
     yang sama dari HP lain** — mencegah dua regu mengirim gardu yang sama.
3. Berhasil → draf dihapus dari HP → kartu pindah ke *Sudah dikirim*.
   Gagal → draf tetap, pesan menyebut sebabnya, kiriman berikutnya di "Kirim
   semua" berhenti (butir 1).

Fungsi lama (`simpanKepala`, `simpanPeriksa`, `unggahFoto`,
`selesaikanPemeliharaan`) tidak dipakai lagi oleh HP versi baru, tetapi RPC
lamanya dibiarkan hidup selama HP versi lama masih beredar.

---

## 6. Beranda HP

Urutan dari atas:

1. **Kepala** (salam, nama tim, lonceng) — tetap.
2. **Gangguan penyulang** — tetap, aturan tampil per role tetap seperti sekarang.
3. **Rekap Kinerja** — baru:
   - ◀ September 2026 ▶ ; UP3 mendapat chip ULP.
   - Delapan kartu baris, **isi dan angka sama persis dengan web**: ikon,
     jenis pekerjaan, *WO terbit · Realisasi · Belum disetujui* dengan satuan
     (km/gardu), bilah capaian (hijau ≥ 80, kuning ≥ 50, merah), label
     "belum ber-WO" / "gagal dimuat".
   - Ketuk baris → layar fitur itu di HP (bila ada).
   - Gagal dimuat → keadaan gagal + "Muat ulang", **bukan angka nol** (butir 6).
4. **Bagian lama** — filter periode, Inspeksi by Petugas, Eksekusi by Team —
   dipindah ke bawah Rekap, **filter periodenya ikut turun** supaya jelas
   hanya berlaku untuk bagian itu.

### Satu sumber angka untuk web & HP

Rekap di web sekarang dihitung di peramban dari sebelas kueri
(`useKinerjaYantek`). Menyalin logika itu ke HP berarti dua salinan yang pasti
melenceng. Karena itu dibuat **RPC `rekap_kinerja(p_ulp, p_tahun, p_bulan)`**
di database yang mengembalikan delapan baris; **web dan HP sama-sama
memanggilnya**. Sekalian menutup kueri web yang belum dipaginasi.

---

## 7. Aturan umum yang dicatat ke `teknisaplikasi.md`

- **Butir 2 diubah:** yang sudah dikirim hanya bisa dilihat; koreksi lewat admin
  "Kembalikan ke petugas", dan yang dikembalikan menjadi draf berisi isian lama.
- **Butir 15 (baru): daftar kerja HP = empat tab** WO bulan ini · Belum
  dikerjakan · Sudah dikerjakan · Sudah dikirim, pencarian untuk di luar WO,
  tampilan acuan = WO Pengukuran.
- **Butir 16 (baru): nama petugas = tim login**, dikunci, tidak diketik.
- **Butir 17 (baru): kirim = unggah foto (URL ditulis balik ke draf) + satu RPC
  transaksi.** Tidak ada baris server sebelum Kirim.

---

## 8. Urutan pengerjaan

| Fase | Isi | Keterangan |
|---|---|---|
| 1 | SQL: RPC `kirim_pemeliharaan_gardu`, RPC `rekap_kinerja` | dijalankan user |
| 2 | HP: layanan — draf banyak (+ pindah dari slot lama), tembolok luring, kirim | |
| 3 | HP: layar 4 tab + formulir (Simpan ke HP, nama terkunci, mode hanya-baca) | OTA |
| 4 | Web: `useKinerjaYantek` pindah ke RPC; modal Pemeliharaan Gardu tidak lagi menampilkan anggota regu terketik | push |
| 5 | HP: Beranda (Rekap Kinerja) | OTA |
| 6 | `teknisaplikasi.md` butir 2, 15–17 | |
| 7+ | Terapkan ke Pengukuran → Optimasi → Perabasan → Harjar → JTM/JTR, satu fitur satu uji | |

## 9. Risiko & batas

- **Draf lama harus dikirim dulu?** Tidak — dipindahkan otomatis (fase 2).
  Pekerjaan setengah jadi di server dari versi lama (status Dalam Proses)
  muncul di *Sudah dikerjakan* sebagai draf, supaya tidak menggantung.
- **Foto di tembolok** masih bisa dibersihkan OS sampai `expo-file-system`
  dipasang lewat build native (ditunda, lihat rencana build).
- **Dua regu satu gardu:** dicegah di RPC (bagian 5), bukan di layar.
