-- =============================================================================
-- Fase 3.1b — HARGARDU: isi daftar acuan
-- Jalankan SESUDAH `hargardu-schema.sql`. Idempoten.
--
-- Ini DATA, bukan struktur — dipisah karena nasibnya berbeda. Strukturnya
-- berubah kalau rancangannya berubah; isinya berubah setiap kali orang lapangan
-- menemukan kata yang belum ada di daftar, dan itu jauh lebih sering.
--
-- ── URUTANNYA MENGIKUTI BENTUK FISIK GARDU ─────────────────────────────────
-- Ditetapkan pemilik pekerjaan 9 September 2026: dibaca dari ATAS TRAFO KE
-- BAWAH, urut seperti orang memeriksa gardu sungguhan — bukan dikelompokkan
-- menurut jenis barangnya.
--
--   FCO → Arrester → Jumperan → Bushing → Trafo & fisik → PHB TR →
--   Inlet → Outlet → Sambungan Outlet → Pentanahan
--
-- Tekep sengaja TIDAK berkumpul jadi satu kelompok lagi: tekep FCO diperiksa
-- bersama FCO-nya, karena begitulah orang berdiri di depan gardu.
--
-- Urutan ini juga yang dipakai aplikasi HP — langkahnya dibuat dari daftar
-- kelompok di sini, jadi menata ulang di sini menata ulang langkahnya sendiri.
--
-- ⚠ SATU HAL YANG PERLU DIPERIKSA PEMILIK PEKERJAAN:
--   Semua pilihan JENIS ditandai normal, karena jenis itu spesifikasi — bukan
--   kerusakan. NYY dan LVTC sama sahnya; AL-CU dan CU-CU sama sahnya; joint
--   press dan konektor sama-sama diterima. Kalau ternyata salah satunya memang
--   tidak boleh dipakai lagi, ubah `normal` jadi false — dan seketika semua
--   gardu yang memakainya masuk daftar pekerjaan tertunda.
-- =============================================================================

-- ── 1. Item pemeriksaan ──────────────────────────────────────
-- ON CONFLICT DO UPDATE, bukan DO NOTHING: menjalankan ulang skrip harus
-- mengembalikan daftar ke keadaan bakunya. Yang TIDAK disentuh `aktif` — item
-- yang sengaja dinonaktifkan UP3 tidak boleh hidup lagi cuma karena skrip
-- dijalankan ulang.
--
-- ...KECUALI yang sudah pernah disunting UP3 dari halaman Pengaturan. Sejak
-- daftar ini bisa diubah dari aplikasi, "mengembalikan ke keadaan baku" berarti
-- MENGHAPUS keputusan orang — diam-diam, karena tidak ada galat saat sebuah
-- label kembali ke tebakan awal saya. Yang pernah disunting dikenali dari
-- `hargardu_ref_audit`: itu memang gunanya jejak audit disimpan.

INSERT INTO public.hargardu_item_ref
  (kode, nama, kelompok, dimensi, tipe, satuan, wajib, urutan, tampil_dashboard)
VALUES
  ('cut_out', 'Cut Out', 'FCO', 'fasa', 'pilihan', NULL, true, 10, false),
  ('cut_out_jenis', 'Jenis Cut Out', 'FCO', 'fasa', 'pilihan', NULL, true, 11, false),
  ('fuse_link', 'Ukuran Fuse Link', 'FCO', 'fasa', 'angka', 'A', true, 12, false),
  ('tekep_fco', 'Tekep FCO', 'FCO', 'tunggal', 'pilihan', NULL, true, 13, true),
  ('arrester', 'Arrester', 'Arrester', 'fasa', 'pilihan', NULL, true, 20, false),
  ('arrester_jenis', 'Jenis Arrester', 'Arrester', 'fasa', 'pilihan', NULL, true, 21, false),
  ('tekep_arrester', 'Tekep Arrester', 'Arrester', 'tunggal', 'pilihan', NULL, true, 22, true),
  ('jumperan_trafo', 'Jumperan Trafo', 'Jumperan', 'tunggal', 'pilihan', NULL, true, 30, true),
  ('bushing_primer', 'Bushing Primer', 'Bushing', 'fasa', 'pilihan', NULL, true, 40, false),
  ('bushing_sekunder', 'Bushing Sekunder', 'Bushing', 'fasa', 'pilihan', NULL, true, 41, false),
  ('tekep_bushing', 'Tekep Bushing', 'Bushing', 'tunggal', 'pilihan', NULL, true, 42, true),
  ('kondisi_trafo', 'Kondisi Trafo', 'Trafo & fisik', 'tunggal', 'pilihan', NULL, true, 50, true),
  ('minyak_trafo', 'Minyak Trafo', 'Trafo & fisik', 'tunggal', 'pilihan', NULL, true, 51, false),
  ('papan_injak', 'Papan Injak', 'Trafo & fisik', 'tunggal', 'pilihan', NULL, true, 52, false),
  ('yzer_werk', 'Yzer Werk', 'Trafo & fisik', 'tunggal', 'pilihan', NULL, true, 53, false),
  ('lantai_kerja', 'Lantai Kerja', 'Trafo & fisik', 'tunggal', 'pilihan', NULL, true, 54, false),
  ('lv_board', 'LV Board', 'PHB TR', 'tunggal', 'pilihan', NULL, true, 60, false),
  ('dudukan_fuse', 'Dudukan Fuse', 'PHB TR', 'tunggal', 'pilihan', NULL, true, 61, false),
  ('busbar_tr', 'Busbar TR', 'PHB TR', 'tunggal', 'pilihan', NULL, true, 62, false),
  ('helbom_saklar', 'Helbom Saklar', 'PHB TR', 'tunggal', 'pilihan', NULL, true, 63, false),
  ('hs_rating', 'HS Rating', 'PHB TR', 'tunggal', 'angka', 'A', true, 64, false),
  ('jurusan_tersedia', 'Jurusan Tersedia', 'PHB TR', 'tunggal', 'angka', 'jurusan', true, 65, false),
  ('jurusan_terpakai', 'Jurusan Terpakai', 'PHB TR', 'tunggal', 'angka', 'jurusan', true, 66, false),
  ('kabel_inlet', 'Ukuran Kabel Inlet', 'Inlet', 'tunggal', 'angka', 'mm2', true, 70, false),
  ('kabel_inlet_jenis', 'Jenis Kabel Inlet', 'Inlet', 'tunggal', 'pilihan', NULL, true, 71, false),
  ('schoen_inlet', 'Ukuran Schoen Inlet', 'Inlet', 'tunggal', 'angka', 'mm2', true, 72, false),
  ('schoen_inlet_jenis', 'Jenis Schoen Inlet', 'Inlet', 'tunggal', 'pilihan', NULL, true, 73, false),
  ('kabel_outlet', 'Ukuran Kabel Outlet', 'Outlet', 'tunggal', 'angka', 'mm2', true, 80, false),
  ('kabel_outlet_jenis', 'Jenis Kabel Outlet', 'Outlet', 'tunggal', 'pilihan', NULL, true, 81, false),
  ('schoen_outlet', 'Ukuran Schoen Outlet', 'Outlet', 'tunggal', 'angka', 'mm2', true, 82, false),
  ('schoen_outlet_jenis', 'Jenis Schoen Outlet', 'Outlet', 'tunggal', 'pilihan', NULL, true, 83, false),
  ('sambungan_outlet', 'Sambungan Outlet Gardu', 'Sambungan Outlet', 'jurusan', 'pilihan', NULL, true, 90, true),
  ('pentanahan_jenis_kabel', 'Jenis Kabel Pentanahan', 'Pentanahan', 'tunggal', 'pilihan', NULL, true, 100, false)
ON CONFLICT (kode) DO UPDATE SET
  nama = EXCLUDED.nama,
  kelompok = EXCLUDED.kelompok,
  dimensi = EXCLUDED.dimensi,
  tipe = EXCLUDED.tipe,
  satuan = EXCLUDED.satuan,
  wajib = EXCLUDED.wajib,
  urutan = EXCLUDED.urutan,
  tampil_dashboard = EXCLUDED.tampil_dashboard,
  updated_at = now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.hargardu_ref_audit a
  WHERE a.tabel = 'item' AND a.kunci = hargardu_item_ref.kode
);

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
  ('tekep_fco', 'ada', 'Ada', true, 10),
  ('tekep_fco', 'tidak', 'Tidak Ada', false, 20),
  ('arrester', 'baik', 'Baik', true, 10),
  ('arrester', 'kotor', 'Kotor', false, 20),
  ('arrester', 'retak', 'Retak', false, 30),
  ('arrester', 'pecah', 'Pecah', false, 40),
  ('arrester', 'terbakar', 'Terbakar', false, 50),
  ('arrester', 'hilang', 'Hilang', false, 60),
  ('arrester_jenis', 'polimer', 'Polimer', true, 10),
  ('arrester_jenis', 'keramik', 'Keramik', true, 20),
  ('tekep_arrester', 'ada', 'Ada', true, 10),
  ('tekep_arrester', 'tidak', 'Tidak Ada', false, 20),
  ('jumperan_trafo', 'a3cs', 'A3Cs (berisolasi)', true, 10),
  ('jumperan_trafo', 'a3c', 'A3C (telanjang)', false, 20),
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
  ('tekep_bushing', 'ada', 'Ada', true, 10),
  ('tekep_bushing', 'tidak', 'Tidak Ada', false, 20),
  ('kondisi_trafo', 'baik', 'Baik', true, 10),
  ('kondisi_trafo', 'rembes', 'Rembes', false, 20),
  ('kondisi_trafo', 'bocor', 'Bocor', false, 30),
  ('kondisi_trafo', 'berkarat', 'Berkarat', false, 40),
  ('kondisi_trafo', 'bunyi', 'Suara tidak normal', false, 50),
  ('minyak_trafo', 'baik', 'Baik', true, 10),
  ('minyak_trafo', 'kurang', 'Kurang', false, 20),
  ('minyak_trafo', 'kotor', 'Kotor', false, 30),
  ('minyak_trafo', 'ganti', 'Perlu ganti', false, 40),
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
  ('lantai_kerja', 'tidak_ada', 'Tidak ada', false, 40),
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
  ('kabel_inlet_jenis', 'nyy', 'NYY', true, 10),
  ('kabel_inlet_jenis', 'nfygby', 'NFYGBY', true, 20),
  ('kabel_inlet_jenis', 'nfa2x', 'NFA2X', true, 30),
  ('kabel_inlet_jenis', 'lvtc', 'LVTC', true, 40),
  ('schoen_inlet_jenis', 'al_al', 'AL-AL', true, 10),
  ('schoen_inlet_jenis', 'al_cu', 'AL-CU', true, 20),
  ('schoen_inlet_jenis', 'cu_cu', 'CU-CU', true, 30),
  ('kabel_outlet_jenis', 'nyy', 'NYY', true, 10),
  ('kabel_outlet_jenis', 'nfygby', 'NFYGBY', true, 20),
  ('kabel_outlet_jenis', 'nfa2x', 'NFA2X', true, 30),
  ('kabel_outlet_jenis', 'lvtc', 'LVTC', true, 40),
  ('schoen_outlet_jenis', 'al_al', 'AL-AL', true, 10),
  ('schoen_outlet_jenis', 'al_cu', 'AL-CU', true, 20),
  ('schoen_outlet_jenis', 'cu_cu', 'CU-CU', true, 30),
  ('sambungan_outlet', 'joint_press', 'Joint Press', true, 10),
  ('sambungan_outlet', 'konektor', 'Konektor', true, 20),
  ('sambungan_outlet', 'lilit', 'Lilit', false, 30),
  ('pentanahan_jenis_kabel', 'tembaga', 'Tembaga', true, 10),
  ('pentanahan_jenis_kabel', 'aluminium', 'Aluminium', true, 20)
ON CONFLICT (item_kode, kode) DO UPDATE SET
  label = EXCLUDED.label,
  urutan = EXCLUDED.urutan
WHERE NOT EXISTS (
  SELECT 1 FROM public.hargardu_ref_audit a
  WHERE a.tabel = 'opsi'
    AND a.kunci = hargardu_opsi_ref.item_kode || '/' || hargardu_opsi_ref.kode
);

-- ── 3. Slot foto ──────────────────────────────────────────
-- `kelompok` foto SENGAJA memakai nama yang sama dengan kelompok item. Itulah
-- yang membuat layar persetujuan bisa menaruh foto di sebelah datanya sendiri —
-- foto FCO di baris FCO, bukan menumpuk di satu galeri di bawah yang memaksa
-- admin mengingat-ingat foto mana milik bagian mana.
--
-- Sepuluh wajib: sebelum, sesudah, keseluruhan, nama plat, dan enam angka alat
-- ukur. Nama plat wajib karena dialah yang membuat koreksi kVA bisa dipercaya —
-- koreksi master yang tidak bisa diperiksa bukan koreksi, cuma tebakan baru.

INSERT INTO public.hargardu_foto_ref (kode, nama, kelompok, wajib, urutan)
VALUES
  ('sebelum', 'Sebelum Perbaikan', 'Pekerjaan', true, 10),
  ('proses', 'Proses Perbaikan', 'Pekerjaan', false, 11),
  ('sesudah', 'Setelah Perbaikan', 'Pekerjaan', true, 12),
  ('keseluruhan', 'Keseluruhan Gardu', 'Pekerjaan', true, 13),
  ('nama_plat', 'Nama Plat Trafo', 'Data Gardu', true, 20),
  ('fco', 'FCO', 'FCO', false, 30),
  ('arrester', 'Arrester', 'Arrester', false, 40),
  ('bushing_primer', 'Bushing Primer', 'Bushing', false, 50),
  ('bushing_sekunder', 'Bushing Sekunder', 'Bushing', false, 51),
  ('trafo', 'Trafo', 'Trafo & fisik', false, 60),
  ('phb_tr', 'PHB TR', 'PHB TR', false, 70),
  ('isi_phb_tr', 'Isi PHB TR', 'PHB TR', false, 71),
  ('helbom', 'Helbom Saklar', 'PHB TR', false, 72),
  ('nh_fuse', 'Keseluruhan NH Fuse', 'PHB TR', false, 73),
  ('beban_r', 'Beban Total R', 'Pengukuran', true, 74),
  ('beban_s', 'Beban Total S', 'Pengukuran', true, 75),
  ('beban_t', 'Beban Total T', 'Pengukuran', true, 76),
  ('beban_n', 'Beban Total N', 'Pengukuran', true, 77),
  ('tegangan_rn', 'Tegangan R-N', 'Pengukuran', true, 78),
  ('tegangan_rs', 'Tegangan R-S', 'Pengukuran', true, 79)
ON CONFLICT (kode) DO UPDATE SET
  nama = EXCLUDED.nama,
  kelompok = EXCLUDED.kelompok,
  wajib = EXCLUDED.wajib,
  urutan = EXCLUDED.urutan;

-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Urutan bagian, sekaligus urutan langkah di aplikasi HP:
--      SELECT kelompok, count(*) AS item, min(urutan) AS urut
--      FROM hargardu_item_ref WHERE aktif GROUP BY kelompok ORDER BY urut;
--
-- b. Item yang dinilai per jurusan:
--      SELECT kode, nama FROM hargardu_item_ref WHERE dimensi = 'jurusan';
--
-- c. Yang dianggap TIDAK normal — inilah yang jadi daftar perbaikan:
--      SELECT item_kode, kode, label FROM hargardu_opsi_ref
--      WHERE NOT normal ORDER BY item_kode, urutan;
-- =============================================================================
