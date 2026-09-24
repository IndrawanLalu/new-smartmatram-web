# Rancangan — Pengukuran Gardu di HP mengikuti pola kerja lapangan

Disusun 25 September 2026. Fitur kedua setelah Pemeliharaan Gardu dalam urutan
`rencana-mobile-kerja-lapangan.md` §8 (Pengukuran → Optimasi → Perabasan →
Harjar → JTM/JTR). Berlaku `teknisaplikasi.md` butir 1, 2, 6, 14–17.
**Belum dikerjakan — menunggu persetujuan.**

---

## 0. Keputusan user (25 Sep 2026, jangan ditawar ulang)

| # | Keputusan |
|---|---|
| 1 | **Satu pintu**: menu Pengukuran Gardu membuka daftar 4 tab; formulir dibuka dari daftar; menu WO Pengukuran terpisah dihapus |
| 2 | Tambah **"Kembalikan ke petugas"** di web (+ alasan) → jadi draf berisi isian lama di HP. Edit langsung oleh admin di web **tetap ada** untuk salah ketik kecil |
| 3 | WA kondisi kritis ditawarkan **saat Simpan di HP** — tidak menunggu terkirim |
| 4 | Tanggal & jam ukur **tetap dipilih petugas**; dibatasi: tidak di masa depan, paling jauh **7 hari** ke belakang |

---

## 1. Keadaan sekarang

- Tombol simpan **langsung menulis ke server** — melanggar butir 1.
- Kiriman = **tiga panggilan terpisah**: sisip pengukuran → usulan titik
  (`koreksi_titik_gardu`) → usulan kVA (`usul_kva_gardu`). Usulan yang gagal
  dilewati diam-diam; pengukurannya tetap tersimpan tanpa usulannya.
- Foto papan nama untuk usulan titik **diunggah saat formulir diisi**, sebelum
  apa pun tersimpan — jadi sampah di bucket bila batal.
- **Dua pintu**: formulir kosong (menu) dan daftar WO; hasilnya tidak terlihat
  di mana pun di HP setelah tersimpan.
- Tidak ada draf; tanpa sinyal, pengukuran tidak bisa disimpan sama sekali.
- Pengukuran tidak punya status — yang salah hanya bisa diedit/dihapus admin.

---

## 2. HP — empat tab (pola butir 15, tampilan WO Pengukuran yang sudah ada)

| Tab | Isi |
|---|---|
| **WO bulan ini** | seluruh gardu WO Pengukuran + progres & ringkasan per tim (layar WO Pengukuran sekarang) |
| **Belum dikerjakan** | gardu WO belum diukur + draf belum lengkap |
| **Sudah dikerjakan** | tersimpan di HP, belum dikirim (WO maupun luar WO) + yang **dikembalikan** admin (merah + alasan). Kirim / Kirim semua |
| **Sudah dikirim** | terkirim bulan ini se-ULP, status: *terhitung* / *tertahan menunggu persetujuan titik/kVA* — hanya-baca |

- Pencarian memunculkan **"Gardu lain"** = pengukuran di luar WO (menggantikan
  formulir kosong dari menu).
- Formulir tetap formulir yang sekarang (1.249 baris, sudah teruji) — yang
  berubah hanya ujungnya: **"Simpan di HP"**, bukan simpan ke server.
- Nama petugas terkunci dari login (butir 16) — sudah begitu sekarang, tinggal
  diberi tanda gembok.
- Usulan titik: foto papan nama & catatan **disimpan di draf**, ikut Kirim.
- WA kritis: dihitung dan ditawarkan saat **Simpan di HP** (keputusan 3).
- Luring: master gardu ULP, WO, dan terkirim disimpan di HP (butir 6).
  Draf per `gardu+ULP+tanggal ukur` — satu gardu boleh diukur dua kali di hari
  berbeda (butir 14).

## 3. Kirim — satu transaksi (butir 17)

`kirim_pengukuran_gardu(p_isi)`:
1. HP mengunggah foto papan nama (bila ada usulan titik), URL ditulis balik ke draf.
2. RPC dalam SATU transaksi: sisip/perbarui `pengukuran_gardu` →
   `koreksi_titik_gardu` (bila ada usulan) → `usul_kva_gardu` (bila kVA beda
   master). **Fungsi usulan yang ada dipakai ulang**, bukan disalin.
3. Penjaga: hak per ULP; tanggal ukur tidak di masa depan & ≤ 7 hari ke
   belakang; gardu ada di master; **tidak dua kiriman untuk gardu + tanggal yang
   sama** (kunci advisory); baris yang dikembalikan hanya bisa diperbarui
   pemiliknya (tim yang sama).
4. Id dibuat HP saat draf lahir; kiriman ulang yang dikembalikan memperbarui
   baris yang sama.

## 4. Web — "Kembalikan ke petugas"

- Kolom baru `pengukuran_gardu`: `dikembalikan_at`, `dikembalikan_alasan`,
  `dikembalikan_oleh`. NULL = normal.
- RPC `kembalikan_pengukuran(id, alasan)` — admin ULP-nya / UP3; menolak baris
  pembawa AMG (`hasil_penyeimbangan_id` terisi) dan yang sudah dikirim ke AMG.
- Tombol di modal detail pengukuran (BatalkanModal + alasan wajib), badge
  **"Dikembalikan"** di tabel.
- **Pengukuran yang dikembalikan keluar dari hitungan** sampai dikirim ulang:
  - `wo_pengukuran_realisasi` — tidak dihitung realisasi (gardu kembali "belum");
  - `gardu_latest_state` → `gardu_master_state` — tidak jadi keadaan terkini
    (tidak memicu overload/anomali, tidak dipakai kandidat WO);
  - `pengukuran_tertahan` / `pengukuran_persetujuan` — tidak muncul di antrean.
  Tetap tampil di tabel riwayat web dengan labelnya — tidak ada yang dihapus.

## 5. Urutan pengerjaan

| Fase | Isi |
|---|---|
| P1 | SQL: kolom dikembalikan, `kembalikan_pengukuran`, `kirim_pengukuran_gardu`, penyesuaian 4 view |
| P2 | HP layanan: draf, tembolok, tarik dikembalikan, kirim (pola `hargarduKerja.ts`) |
| P3 | HP layar: WO Pengukuran → 4 tab satu pintu; formulir berakhir di "Simpan di HP"; menu WO Pengukuran dihapus |
| P4 | Web: tombol Kembalikan + badge |

## 6. Risiko

- **View yang dibangun ulang** (`gardu_latest_state` dipakai banyak layar):
  diubah dengan menambah satu saringan saja, kolom tidak berubah; diuji dengan
  membandingkan jumlah baris sebelum/sesudah (harus sama selama belum ada yang
  dikembalikan).
- **HP versi lama** masih menyisip langsung selama belum OTA — tetap sah, hanya
  tanpa draf. Tidak ada yang rusak.
- Pengukuran yang sudah dikirim ke AMG **tidak bisa dikembalikan** — koreksinya
  lewat Edit web, karena AMG tidak menarik data kembali.
