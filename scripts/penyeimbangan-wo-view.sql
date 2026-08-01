-- =============================================================================
-- Fase 1 — View daftar WO Pemerataan Beban yang masih perlu dikerjakan
-- Jalankan manual di Supabase SQL Editor. Idempoten (CREATE OR REPLACE).
--
-- Dipakai bersama oleh mobile (daftar tugas petugas) dan web (pemantauan).
-- Alasan dibuat view, bukan query di aplikasi: relasinya "pengukuran yang
-- BELUM punya baris penyeimbangan" — anti-join yang tidak bisa diungkapkan
-- lewat PostgREST tanpa akal-akalan.
--
-- Isi = WO yang BELUM SELESAI saja:
--   • belum disentuh siapa pun  → penyeimbangan_id NULL
--   • sedang dikerjakan seseorang → status_penyeimbangan = 'Dikerjakan'
-- WO yang sudah 'Selesai' hilang dari daftar dengan sendirinya.
-- =============================================================================

CREATE OR REPLACE VIEW public.v_wo_pemerataan_terbuka
WITH (security_invoker = true) AS
SELECT
  pg.id                       AS pengukuran_id,
  pg.no_gardu,
  pg.alamat,
  pg.penyulang,
  pg.petugas_unit             AS ulp,
  pg.kva_trafo,
  pg.tanggal_pengukuran,
  pg.wo_sent_at,

  -- Kondisi SEBELUM: inilah yang harus diratakan petugas di lapangan
  pg.persen_beban,
  pg.beban_kva,
  pg.suhu_trafo,
  pg.total_arus_r,
  pg.total_arus_s,
  pg.total_arus_t,
  pg.total_arus_n,
  pg.total_teg_rn,
  pg.total_teg_sn,
  pg.total_teg_tn,
  pg.perjurusan,

  -- Status klaim (NULL = belum ada yang mengambil)
  ps.id                       AS penyeimbangan_id,
  ps.status                   AS status_penyeimbangan,
  ps.petugas_uid,
  ps.petugas_penyeimbang,
  ps.diklaim_at

FROM public.pengukuran_gardu pg

-- LATERAL + LIMIT 1, bukan LEFT JOIN biasa: di data nyata sudah ada 1 pengukuran
-- yang punya DUA baris penyeimbangan. LEFT JOIN biasa akan menggandakan WO itu
-- di daftar petugas. Diambil yang terbaru; tidak dipasang UNIQUE constraint
-- karena mengerjakan ulang satu gardu bukan hal terlarang.
LEFT JOIN LATERAL (
  SELECT p.id, p.status, p.petugas_uid, p.petugas_penyeimbang, p.diklaim_at
  FROM public.penyeimbangan_gardu p
  WHERE p.pengukuran_id = pg.id
  ORDER BY p.created_at DESC
  LIMIT 1
) ps ON true

WHERE pg.jenis_pemeliharaan = 'PEMERATAAN BEBAN'
  -- Baris hasil penyeimbangan tidak boleh ditawarkan balik sebagai WO baru.
  AND pg.hasil_penyeimbangan_id IS NULL
  AND (ps.id IS NULL OR ps.status = 'Dikerjakan');

-- security_invoker = true → RLS tabel asal ikut berlaku untuk user yang query.
-- Ini BERBEDA dari gardu_latest_state (yang berjalan sebagai pemilik view dan
-- karenanya melewati RLS). Di sini sengaja diperketat karena view ini dibaca
-- langsung oleh aplikasi mobile memakai sesi petugas, bukan service role.
-- Aplikasi TETAP menyaring `ulp` secara eksplisit — RLS sebagai lapis kedua,
-- bukan satu-satunya penjaga.
GRANT SELECT ON public.v_wo_pemerataan_terbuka TO authenticated;

-- Verifikasi (harusnya 20 baris, semua AMPENAN, per 1 Agustus 2026):
--   SELECT ulp, COUNT(*) FROM v_wo_pemerataan_terbuka GROUP BY ulp;
