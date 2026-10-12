# Rencana — Susun WO seragam + masa garansi (12 Okt 2026)

Permintaan user 12 Okt 2026, untuk SEMUA pekerjaan yang ber-WO: Perabasan,
Inspeksi JTM (Tier 1/2), Inspeksi JTR, Pemeliharaan Gardu, Pengukuran Gardu.

Keputusan user:
- Cakupan: kelima-limanya (termasuk Pemeliharaan Gardu & Pengukuran).
- Masa garansi dihitung **sejak pekerjaan selesai**; belum selesai → sejak bulan WO.
- Masa garansi diatur di **Rekap Kinerja → Atur SLA, per ULP**; kosong = 1 bulan.
- Istilah layar: lencana **"⚠ Masa garansi s.d. Nov 2026"** + keterangan
  "WO … Okt 2026, selesai 20 Okt"; saat terbit **"3 segmen masih dalam masa
  garansi — tetap terbitkan?"**. Boleh, hanya peringatan.

## F1 — Bug & loading (SELESAI 12 Okt, belum commit)
- WO ULP lain tampil: tabel "WO inspeksi berjalan" JTM/JTR menampilkan semua
  ULP. Kini hanya ULP sendiri; UP3 memilih ULP (bawaan semua).
  (Data dicek: belum ada objek yang ter-WO dua kali di bulan yang sama —
  JTM 943 item, JTR 163, Perabasan 292 — tapi sistem MEMBOLEHKAN begitu item
  lama tertutup; dijawab F3.)
- Menu samping "tidak terjadi apa-apa": tidak ada `loading.tsx` di /admin,
  jadi Next menahan halaman lama sampai halaman baru tiba. Kini
  `app/admin/loading.tsx` ("Memuat halaman…") + putaran kecil di menu yang
  diklik (`useLinkStatus`).
- Catatan, belum diubah: middleware memanggil `auth.getUser()` (ke server
  Supabase) di SETIAP perpindahan halaman — sumber jeda tambahan.

## F2 — Daftar WO + Tambah ke WO untuk Inspeksi JTM & JTR
Sepola Perabasan (tab Daftar WO → modal detail → "Tambah segmen" → Susun WO
mode tambah).
- SQL: view `wo_inspeksi_capaian` (per WO: ulp, jenis, tier, nama, tgl_wo,
  target, item, item selesai, rencana km, status); RPC
  `tambah_wo_inspeksi(p_wo_id, p_objek[], p_regu, p_target_km)` dengan aturan
  lewati yang sama dengan terbit (ULP lain, tidak aktif, masih terbuka di WO
  tier yang sama).
- Web: tab "Daftar WO" di /admin/jtm & /admin/jtr; `woTerbuka` + `onTambah`
  diisi di WoInspeksi.

## F3 — Masa garansi (kelima jenis)
- SQL: `sla_kinerja.garansi_bulan INT NULL` (NULL = 1) + simpan_sla ikut
  menyimpannya; fungsi `wo_garansi(p_jenis, p_ulp)` → per objek: pekerjaan
  terakhir (tanggal selesai, atau bulan WO kalau belum selesai), nama WO,
  `garansi_sampai`. Sumber per jenis: perabasan (wo_perabasan_item),
  jtm/jtm2 (inspeksi_jtm per tier), jtr (inspeksi_jtr), hargardu (catatan
  pemeliharaan), pengukuran (pengukuran_gardu).
- Atur SLA: kolom "Masa garansi (bulan)" per jenis.
- Susun WO (Perabasan/JTM/JTR): lencana di baris pilihan + dialog konfirmasi
  saat Terbitkan / Tambahkan bila ada yang masih bergaransi.
- Tabel WO (WO berjalan, detail Daftar WO, tabel WO Pemeliharaan & WO
  Pengukuran): lencana yang sama di baris yang di-WO-kan dalam masa garansi.
- Terbit otomatis dari Rencana (gardu/pengukuran) TIDAK menahan gardu
  bergaransi — rencana tetap rencana; cukup berlencana di tabel.

## F4 — Pemeliharaan Gardu & Pengukuran: tambah gardu ke WO
WO-nya satu per ULP per bulan (terbit dari Rencana/kriteria). Yang belum ada:
memilih gardu tertentu lalu menambahkannya ke WO bulan itu (atau membuat WO
bulan itu bila belum ada), dengan lencana garansi. Rancangan rinci menyusul
setelah F2–F3 — bentuk layarnya berbeda dari Susun WO segmen.
