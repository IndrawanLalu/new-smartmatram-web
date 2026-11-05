# Rencana: Tabel ringkas kondisi terakhir tiang (5 Nov 2026)

## Masalah
`tiang_kondisi_terakhir` adalah view yang, **setiap kali dibaca**, menyusun
`row_number()` atas SELURUH jawaban periksa inspeksi JTM terverifikasi
(±457 ribu baris dan terus bertambah) untuk mencari jawaban terakhir per
tiang × item × bagian × sirkit. Saringan ULP / "tidak normal" baru diterapkan
SESUDAH penyusunan itu, jadi indeks tidak menolong.

Terukur 4 Nov:

| Bacaan | Waktu |
|---|---|
| `jtm_temuan` 1 ULP, per 1.000 baris | 2–3,4 dtk |
| `jtm_temuan` semua ULP, hitung | **habis waktu** (> 8 dtk) |
| `jtm_perlu_perbaikan` semua ULP | 5,7 dtk |

Yang ikut lambat: tab Temuan JTM, Perlu Perbaikan, Dasbor JTM, unduh Excel JTM,
lapisan kondisi di /peta, Prediksi Lokasi Gangguan (patokan), WA "@smart temuan",
pengingat WA, lapisan pohon /peta. Makin banyak inspeksi, makin lambat — pada
titik tertentu semuanya gagal "Sebagian data gagal dibaca".

## Gagasan
Hasil "jawaban terakhir" disimpan di tabel `kondisi_tiang_terakhir`, diperbarui
**pada saat yang sama** dengan perubahan datanya (pemicu database), hanya untuk
tiang yang berubah. View `tiang_kondisi_terakhir` ditulis ulang membaca tabel
itu dengan **kolom dan arti yang sama persis** → web, HP, WA, dan SQL lain
tidak perlu diubah sama sekali.

## Isi tabel
Satu baris per tiang × item × bagian × sirkit (kunci yang sama dengan view sekarang):

```
tiang_id, item_kode, bagian, sirkit_segmen_id      ← kunci
nilai, nilai_angka, catatan, foto_url               ← jawaban
inspeksi_id, penyulang, ulp, tier, tgl              ← asal jawaban
```

Yang **tidak** disimpan, tetap digabung saat dibaca: nama & kode tiang,
nama item & kelompok, **label dan status normal pilihan** (`jtm_opsi_ref`),
nama sirkit. Pelajaran hari ini: pilihan vegetasi berganti dan semua yang
menyimpan/menulis kode tetap jadi salah. Dengan digabung saat dibaca, ganti
label atau ganti "normal" langsung berlaku tanpa membangun ulang tabel.

Indeks: `(ulp)`, `(item_kode, nilai)` (untuk "tidak normal"), `(tiang_id)`.

## Kapan diperbarui
Satu fungsi `segarkan_kondisi_tiang(daftar tiang)`: hapus baris tiang-tiang
itu, hitung ulang dari jawaban periksa — rumus yang sama dengan view sekarang,
tapi hanya untuk tiang tersebut (cepat, lewat indeks `tiang_id`).

Dipanggil oleh pemicu (sekali per pernyataan, bukan per baris):

| Perubahan | Tiang yang disegarkan |
|---|---|
| Inspeksi JTM berubah status dari/ke **Diverifikasi** (disetujui, dikembalikan, dibatalkan), atau tanggal/ULP/penyulang/tier inspeksi terverifikasi berubah, atau dihapus | semua tiang di inspeksi itu |
| Jawaban periksa ditambah/diubah/dihapus **pada inspeksi terverifikasi** (koreksi isian JTM, lepas tumpang, dll.) | tiang titik itu |
| Titik inspeksi pindah tiang / dihapus (tiang kembar, balik arah, koreksi) | tiang lama dan baru |
| Tiang dihapus | barisnya ikut terhapus (FK cascade) |

Isian HP yang masih draf/terkirim **tidak** memicu hitung ulang — tidak ada
beban tambahan saat petugas bekerja di lapangan. Temuan muncul **saat
disetujui**, sama seperti sekarang (bukan tertunda).

## Jaring pengaman
- `bangun_ulang_kondisi_tiang()` — hitung ulang semua (beberapa detik), untuk
  pengisian awal dan bila suatu saat ada selisih.
- `kondisi_tiang_selisih()` — bandingkan tabel dengan rumus lama, hasilnya
  jumlah baris yang berbeda. Harus 0.
- Usulan: pekerja di homelab menjalankan pemeriksa selisih tiap malam; bila
  tidak 0, perbaiki otomatis lalu kirim pesan WA ke admin (tanda ada jalur
  perubahan yang belum terpantau pemicu).

## Tahapan
1. **K1 – SQL** `scripts/kondisi-tiang-ringkas.sql`: tabel + indeks + fungsi +
   pemicu + pengisian awal + view ditulis ulang + periksa selisih = 0.
   Aman dijalankan ulang. Tidak ada perubahan web/HP.
2. **K2 – Ukur** `jtm_temuan`, `jtm_perlu_perbaikan`, Dasbor JTM, semua ULP vs
   per ULP, dibandingkan angka di atas. Uji: setujui satu inspeksi, koreksi
   satu isian, batalkan satu inspeksi → selisih tetap 0.
3. **K3 – Pengaman malam** di pekerja (bila disetujui).

Perkiraan (dipastikan di K2): `jtm_temuan` per ULP di bawah 1 dtk, semua ULP
tidak lagi habis waktu. Bagian yang tersisa dari `jtm_temuan` (cari segmen &
status tugas per temuan) sudah memakai indeks dari `indeks-audit-nov.sql`.

## Risiko
- Ada jalur pengubah data yang terlewat pemicu → baris kedaluwarsa. Ditangkap
  oleh pemeriksa selisih; daftar pemicu di atas mencakup ketiga tabel sumber
  untuk SEMUA jenis perubahan, bukan per fungsi, jadi fungsi baru pun tertangkap.
- Menyetujui inspeksi besar (ratusan tiang) sedikit lebih lama — hitungan per
  tiang lewat indeks, diperkirakan di bawah 1 dtk.
- Rollback: kembalikan definisi view lama (disimpan di skrip), hapus pemicu.

## Keputusan
- 5 Nov: K1 dikerjakan, pengaman malam **ya** (user).
- K1 = `scripts/kondisi-tiang-ringkas.sql`. K3 = `/api/kondisi-tiang-periksa`
  dipicu pekerja 02.00 WITA (`JAM_PERIKSA_KONDISI`); WA ke `WA_ADMIN_TEKNIS`
  (.env) bila selisih > 0.
