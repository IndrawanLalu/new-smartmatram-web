-- =============================================================================
-- View: gardu_latest_state
-- Kondisi terkini per gardu: ambil event paling baru dari pengukuran ATAU
-- penyeimbangan. Untuk event penyeimbangan, nilai yang tidak diubah (suhu,
-- tegangan) di-inherit dari pengukuran yang dirujuk via pengukuran_id.
--
-- Jalankan di Supabase SQL Editor.
-- =============================================================================

CREATE OR REPLACE VIEW public.gardu_latest_state AS
WITH all_events AS (

  -- Semua event pengukuran
  SELECT
    pg.id::text       AS source_id,
    'pengukuran'      AS event_type,
    pg.no_gardu,
    pg.penyulang,
    pg.alamat,
    pg.kva_trafo,
    pg.petugas_unit,
    pg.petugas_nama,
    pg.tanggal_pengukuran::date AS event_date,
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
    pg.total_teg_rs,
    pg.total_teg_st,
    pg.total_teg_rt,
    pg.perjurusan,
    pg.jenis_pemeliharaan,
    pg.wo_sent_at
  FROM public.pengukuran_gardu pg

  UNION ALL

  -- Semua event penyeimbangan:
  --   nilai yang BERUBAH   → pakai nilai after dari penyeimbangan_gardu
  --   nilai yang TIDAK BERUBAH → inherit dari pengukuran asal (join via pengukuran_id)
  SELECT
    ps.id::text       AS source_id,
    'penyeimbangan'   AS event_type,
    ps.no_gardu,
    ps.penyulang,
    ps.alamat,
    ps.kva_trafo,
    ps.ulp            AS petugas_unit,
    ps.petugas_penyeimbang AS petugas_nama,
    ps.tgl_penyeimbangan::date AS event_date,
    ps.beban_pct_after  AS persen_beban,
    ps.beban_kva_after  AS beban_kva,
    pg.suhu_trafo,                    -- inherited: penyeimbangan tidak ukur suhu
    ps.arus_r_after   AS total_arus_r,
    ps.arus_s_after   AS total_arus_s,
    ps.arus_t_after   AS total_arus_t,
    ps.arus_n_after   AS total_arus_n,
    pg.total_teg_rn,                  -- inherited: tegangan tidak berubah
    pg.total_teg_sn,
    pg.total_teg_tn,
    pg.total_teg_rs,
    pg.total_teg_st,
    pg.total_teg_rt,
    ps.perjurusan_after AS perjurusan,
    ps.jenis_pemeliharaan,
    NULL::timestamptz AS wo_sent_at
  FROM public.penyeimbangan_gardu ps
  JOIN public.pengukuran_gardu pg ON pg.id = ps.pengukuran_id

)
SELECT DISTINCT ON (no_gardu) *
FROM all_events
ORDER BY no_gardu, event_date DESC, source_id DESC;

-- Beri akses read ke role authenticated (Supabase RLS tetap berlaku di tabel asal)
GRANT SELECT ON public.gardu_latest_state TO authenticated;
