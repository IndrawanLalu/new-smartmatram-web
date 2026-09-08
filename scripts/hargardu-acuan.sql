-- =============================================================================
-- Fase 3.1b — HARGARDU: isi daftar acuan
-- Jalankan SESUDAH `hargardu-schema.sql`. Idempoten.
--
-- Ini DATA, bukan struktur — dipisah karena nasibnya berbeda. Strukturnya
-- berubah kalau rancangannya berubah; isinya berubah setiap kali orang lapangan
-- menemukan kata yang belum ada di daftar, dan itu jauh lebih sering.
--
-- Yang di bawah cuma ISIAN AWAL: tebakan dari formulir SIMANTEK (HARGARDU.pdf)
-- ditambah empat tambahan pemilik pekerjaan dan dua contoh katanya (rembes,
-- keropos). Yang tahu kata sebenarnya yang dipakai regu adalah orang lapangan,
-- dan merekalah yang menyempurnakannya lewat halaman pengaturan — bukan lewat
-- skrip ini lagi.
--
-- ⚠ DUA HAL YANG PERLU DIPERIKSA PEMILIK PEKERJAAN sebelum dipakai sungguhan:
--
--   1. `sambungan_outlet`: Joint Press dan Konektor SAMA-SAMA ditandai normal,
--      karena saya tidak tahu mana yang dianggap layak di ULP ini. Kalau
--      sebenarnya konektor tidak boleh, ubah `normal` jadi false — dan seketika
--      semua gardu berkonektor masuk daftar pekerjaan tertunda.
--
--   2. `cut_out_jenis` dan `arrester_jenis`: polimer dan keramik dua-duanya
--      normal, karena itu spesifikasi, bukan kerusakan.
--
-- Salah menandai `normal` tidak memunculkan galat apa pun — cuma daftar
-- perbaikan yang salah panjang atau salah pendek. Karena itu ditulis di sini.
-- =============================================================================

-- ── 1. Item pemeriksaan ──────────────────────────────────────
-- ON CONFLICT DO UPDATE, bukan DO NOTHING: menjalankan ulang skrip harus
-- mengembalikan daftar ke keadaan bakunya. Yang TIDAK disentuh `aktif` — item
-- yang sengaja dinonaktifkan UP3 tidak boleh hidup lagi cuma karena skrip
-- dijalankan ulang.

INSERT INTO public.hargardu_item_ref
  (kode, nama, kelompok, per_fasa, tipe, satuan, wajib, urutan, tampil_dashboard)
VALUES
  ('cut_out', 'Cut Out', 'Pengaman', true, 'pilihan', NULL, true, 10, false),
  ('cut_out_jenis', 'Jenis Cut Out', 'Pengaman', true, 'pilihan', NULL, true, 11, false),
  ('fuse_link', 'Ukuran Fuse Link', 'Pengaman', true, 'angka', 'A', true, 12, false),
  ('arrester', 'Arrester', 'Pengaman', true, 'pilihan', NULL, true, 20, false),
  ('arrester_jenis', 'Jenis Arrester', 'Pengaman', true, 'pilihan', NULL, true, 21, false),
  ('tekep_fco', 'Tekep FCO', 'Tekep', false, 'pilihan', NULL, true, 30, true),
  ('tekep_arrester', 'Tekep Arrester', 'Tekep', false, 'pilihan', NULL, true, 31, true),
  ('tekep_bushing', 'Tekep Bushing', 'Tekep', false, 'pilihan', NULL, true, 32, true),
  ('bushing_primer', 'Bushing Primer', 'Bushing', true, 'pilihan', NULL, true, 40, false),
  ('bushing_sekunder', 'Bushing Sekunder', 'Bushing', true, 'pilihan', NULL, true, 41, false),
  ('kondisi_trafo', 'Kondisi Trafo', 'Trafo', false, 'pilihan', NULL, true, 50, true),
  ('minyak_trafo', 'Minyak Trafo', 'Trafo', false, 'pilihan', NULL, true, 51, false),
  ('jumperan_trafo', 'Jumperan Trafo', 'Trafo', false, 'pilihan', NULL, true, 52, true),
  ('lv_board', 'LV Board', 'PHB TR', false, 'pilihan', NULL, true, 60, false),
  ('dudukan_fuse', 'Dudukan Fuse', 'PHB TR', false, 'pilihan', NULL, true, 61, false),
  ('busbar_tr', 'Busbar TR', 'PHB TR', false, 'pilihan', NULL, true, 62, false),
  ('helbom_saklar', 'Helbom Saklar', 'PHB TR', false, 'pilihan', NULL, true, 63, false),
  ('hs_rating', 'HS Rating', 'PHB TR', false, 'angka', 'A', true, 64, false),
  ('kabel_inlet', 'Kabel In Let', 'Sambungan', false, 'angka', 'mm2', true, 70, false),
  ('kabel_outlet', 'Kabel Out Let', 'Sambungan', false, 'angka', 'mm2', true, 71, false),
  ('schoen_inlet', 'Schoen In Let', 'Sambungan', false, 'angka', 'mm2', true, 72, false),
  ('schoen_outlet', 'Schoen Out Let', 'Sambungan', false, 'angka', 'mm2', true, 73, false),
  ('sambungan_outlet', 'Sambungan Outlet Gardu', 'Sambungan', false, 'pilihan', NULL, true, 74, true),
  ('papan_injak', 'Papan Injak', 'Fisik', false, 'pilihan', NULL, true, 80, false),
  ('yzer_werk', 'Yzer Werk', 'Fisik', false, 'pilihan', NULL, true, 81, false),
  ('lantai_kerja', 'Lantai Kerja', 'Fisik', false, 'pilihan', NULL, true, 82, false)
ON CONFLICT (kode) DO UPDATE SET
  nama = EXCLUDED.nama,
  kelompok = EXCLUDED.kelompok,
  per_fasa = EXCLUDED.per_fasa,
  tipe = EXCLUDED.tipe,
  satuan = EXCLUDED.satuan,
  wajib = EXCLUDED.wajib,
  urutan = EXCLUDED.urutan,
  tampil_dashboard = EXCLUDED.tampil_dashboard,
  updated_at = now();

-- ── 2. Pilihan jawaban ──────────────────────────────────────
-- `normal` sengaja TIDAK ditimpa saat dijalankan ulang. Kalau UP3 sudah
-- memutuskan konektor tidak layak, keputusan itu keputusan mereka — bukan
-- tebakan saya yang dipulihkan diam-diam tiap kali skrip dijalankan.

INSERT INTO public.hargardu_opsi_ref (item_kode, kode, label, normal, urutan)
VALUES
  ('cut_out', 'baik', 'Baik', true, 10),
  ('cut_out', 'kotor', 'Kotor', false, 20),
  ('cut_out', 'retak', 'Retak', false, 30),
  ('cut_out', 'pecah', 'Pecah', false, 40),
  ('cut_out', 'terbakar', 'Terbakar', false, 50),
  ('cut_out', 'hilang', 'Hilang', false, 60),
  ('cut_out_jenis', 'polimer', 'Polimer', true, 10),
  ('cut_out_jenis', 'keramik', 'Keramik', true, 20),
  ('arrester', 'baik', 'Baik', true, 10),
  ('arrester', 'kotor', 'Kotor', false, 20),
  ('arrester', 'retak', 'Retak', false, 30),
  ('arrester', 'pecah', 'Pecah', false, 40),
  ('arrester', 'terbakar', 'Terbakar', false, 50),
  ('arrester', 'hilang', 'Hilang', false, 60),
  ('arrester_jenis', 'polimer', 'Polimer', true, 10),
  ('arrester_jenis', 'keramik', 'Keramik', true, 20),
  ('tekep_fco', 'ada', 'Ada', true, 10),
  ('tekep_fco', 'tidak', 'Tidak Ada', false, 20),
  ('tekep_arrester', 'ada', 'Ada', true, 10),
  ('tekep_arrester', 'tidak', 'Tidak Ada', false, 20),
  ('tekep_bushing', 'ada', 'Ada', true, 10),
  ('tekep_bushing', 'tidak', 'Tidak Ada', false, 20),
  ('bushing_primer', 'baik', 'Baik', true, 10),
  ('bushing_primer', 'kotor', 'Kotor', false, 20),
  ('bushing_primer', 'retak', 'Retak', false, 30),
  ('bushing_primer', 'pecah', 'Pecah', false, 40),
  ('bushing_primer', 'rembes', 'Rembes', false, 50),
  ('bushing_sekunder', 'baik', 'Baik', true, 10),
  ('bushing_sekunder', 'kotor', 'Kotor', false, 20),
  ('bushing_sekunder', 'retak', 'Retak', false, 30),
  ('bushing_sekunder', 'pecah', 'Pecah', false, 40),
  ('bushing_sekunder', 'rembes', 'Rembes', false, 50),
  ('kondisi_trafo', 'baik', 'Baik', true, 10),
  ('kondisi_trafo', 'rembes', 'Rembes', false, 20),
  ('kondisi_trafo', 'bocor', 'Bocor', false, 30),
  ('kondisi_trafo', 'berkarat', 'Berkarat', false, 40),
  ('kondisi_trafo', 'bunyi', 'Suara tidak normal', false, 50),
  ('minyak_trafo', 'baik', 'Baik', true, 10),
  ('minyak_trafo', 'kurang', 'Kurang', false, 20),
  ('minyak_trafo', 'kotor', 'Kotor', false, 30),
  ('minyak_trafo', 'ganti', 'Perlu ganti', false, 40),
  ('jumperan_trafo', 'a3cs', 'A3Cs (berisolasi)', true, 10),
  ('jumperan_trafo', 'a3c', 'A3C (telanjang)', false, 20),
  ('lv_board', 'baik', 'Baik', true, 10),
  ('lv_board', 'keropos', 'Keropos', false, 20),
  ('lv_board', 'karat', 'Karat', false, 30),
  ('lv_board', 'pintu_rusak', 'Pintu rusak', false, 40),
  ('lv_board', 'tidak_ada', 'Tidak ada', false, 50),
  ('dudukan_fuse', 'baik', 'Baik', true, 10),
  ('dudukan_fuse', 'retak', 'Retak', false, 20),
  ('dudukan_fuse', 'pecah', 'Pecah', false, 30),
  ('dudukan_fuse', 'longgar', 'Longgar', false, 40),
  ('busbar_tr', 'baik', 'Baik', true, 10),
  ('busbar_tr', 'kotor', 'Kotor', false, 20),
  ('busbar_tr', 'longgar', 'Longgar', false, 30),
  ('busbar_tr', 'panas', 'Panas / berubah warna', false, 40),
  ('helbom_saklar', 'baik', 'Baik', true, 10),
  ('helbom_saklar', 'rusak', 'Rusak', false, 20),
  ('helbom_saklar', 'tidak_ada', 'Tidak ada', false, 30),
  ('sambungan_outlet', 'joint_press', 'Joint Press', true, 10),
  ('sambungan_outlet', 'konektor', 'Konektor', true, 20),
  ('sambungan_outlet', 'lilit', 'Lilit', false, 30),
  ('papan_injak', 'baik', 'Baik', true, 10),
  ('papan_injak', 'rusak', 'Rusak', false, 20),
  ('papan_injak', 'tidak_ada', 'Tidak ada', false, 30),
  ('yzer_werk', 'baik', 'Baik', true, 10),
  ('yzer_werk', 'karat', 'Karat', false, 20),
  ('yzer_werk', 'rusak', 'Rusak', false, 30),
  ('yzer_werk', 'tidak_ada', 'Tidak ada', false, 40),
  ('lantai_kerja', 'baik', 'Baik', true, 10),
  ('lantai_kerja', 'retak', 'Retak', false, 20),
  ('lantai_kerja', 'rusak', 'Rusak', false, 30),
  ('lantai_kerja', 'tidak_ada', 'Tidak ada', false, 40)
ON CONFLICT (item_kode, kode) DO UPDATE SET
  label = EXCLUDED.label,
  urutan = EXCLUDED.urutan;

-- ── 3. Slot foto ──────────────────────────────────────────
-- Sepuluh wajib sesuai pilihan pemilik pekerjaan: sebelum, sesudah, nama plat,
-- keseluruhan gardu, dan enam foto angka alat ukur.
--
-- Nama plat wajib karena dialah yang membuat koreksi kVA bisa dipercaya. Tanpa
-- foto itu, klaim "kVA-nya beda" tidak bisa diperiksa admin dari belakang meja —
-- dan koreksi master yang tidak bisa diperiksa bukan koreksi, cuma tebakan baru.

INSERT INTO public.hargardu_foto_ref (kode, nama, kelompok, wajib, urutan)
VALUES
  ('sebelum', 'Sebelum Perbaikan', 'Pekerjaan', true, 10),
  ('proses', 'Proses Perbaikan', 'Pekerjaan', false, 11),
  ('sesudah', 'Setelah Perbaikan', 'Pekerjaan', true, 12),
  ('keseluruhan', 'Keseluruhan Gardu', 'Pekerjaan', true, 13),
  ('nama_plat', 'Nama Plat Trafo', 'Trafo', true, 20),
  ('trafo', 'Trafo', 'Trafo', false, 21),
  ('phb_tr', 'PHB TR', 'PHB TR', false, 30),
  ('isi_phb_tr', 'Isi PHB TR', 'PHB TR', false, 31),
  ('helbom', 'Helbom Saklar', 'PHB TR', false, 32),
  ('nh_fuse', 'Keseluruhan NH Fuse', 'PHB TR', false, 33),
  ('beban_r', 'Berat Total R', 'Pengukuran', true, 40),
  ('beban_s', 'Berat Total S', 'Pengukuran', true, 41),
  ('beban_t', 'Berat Total T', 'Pengukuran', true, 42),
  ('beban_n', 'Berat Total N', 'Pengukuran', true, 43),
  ('tegangan_rn', 'Tegangan R-N', 'Pengukuran', true, 44),
  ('tegangan_rs', 'Tegangan R-S', 'Pengukuran', true, 45),
  ('bushing_primer', 'Bushing Primer', 'Komponen', false, 50),
  ('bushing_sekunder', 'Bushing Sekunder', 'Komponen', false, 51),
  ('fco', 'FCO', 'Komponen', false, 52),
  ('arrester', 'Arrester', 'Komponen', false, 53)
ON CONFLICT (kode) DO UPDATE SET
  nama = EXCLUDED.nama,
  kelompok = EXCLUDED.kelompok,
  wajib = EXCLUDED.wajib,
  urutan = EXCLUDED.urutan;

-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Daftar item beserta jumlah pilihannya:
--      SELECT i.kelompok, i.kode, i.nama, i.tipe, count(o.kode) AS pilihan
--      FROM hargardu_item_ref i
--      LEFT JOIN hargardu_opsi_ref o ON o.item_kode = i.kode
--      GROUP BY i.kelompok, i.kode, i.nama, i.tipe, i.urutan ORDER BY i.urutan;
--
-- b. Yang dianggap TIDAK normal — inilah yang nanti jadi daftar perbaikan:
--      SELECT item_kode, kode, label FROM hargardu_opsi_ref
--      WHERE NOT normal ORDER BY item_kode, urutan;
--
-- c. Yang ikut jadi angka dashboard:
--      SELECT kode, nama FROM hargardu_item_ref WHERE tampil_dashboard;
-- =============================================================================
