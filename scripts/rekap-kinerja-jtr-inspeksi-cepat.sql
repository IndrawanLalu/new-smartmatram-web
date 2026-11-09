-- =============================================================================
-- Dua sisa timeout UP3 sesudah jtr-panjang-simpan.sql (9 Nov 2026).
--
-- 1. rekap_kinerja(p_ulp = NULL/SEMUA) → 8,3 dtk, 57014.
--    Per ULP cuma 0,7–1,3 dtk. Untuk semua ULP, tambahan SLA dihitung dengan
--    memanggil _rekap_kinerja_inti (hitungan utuh satu ULP) SEKALI PER KUNCI
--    wo_surat_mode — November: 14 kunci = 14 × ±1 dtk. Kini sekali per
--    ULP-bulan; angkanya sama persis (selisih per kunci dibaca dari hasil yang
--    sama). Salinan wo-tunggakan-semua.sql; yang berubah hanya blok ★.
--
-- 2. jtr_inspeksi tanpa saringan → 8,3 dtk. Kolom jumlah_temuan menghitung
--    view berat inspeksi_jtr_temuan (0,8 dtk) PER INSPEKSI (418×). Kini
--    dihitung sekali (GROUP BY) lalu digabung; saringan id=eq.X tetap
--    terdorong masuk lewat kunci gabung. Kolom, urutan, tipe SAMA.
--
-- Idempoten (aman diulang).
-- =============================================================================


-- ── 1. rekap_kinerja ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rekap_kinerja(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS TABLE (kunci TEXT, wo_terbit NUMERIC, realisasi NUMERIC, belum_disetujui NUMERIC, luar_wo NUMERIC, sla NUMERIC)
LANGUAGE plpgsql STABLE SET search_path = public AS $fn$
DECLARE
  u       TEXT := NULLIF(NULLIF(upper(btrim(COALESCE(p_ulp, ''))), ''), 'SEMUA');
  g       RECORD;
  tambah  JSONB := '{}'::jsonb;
  hutang  JSONB := '{}'::jsonb;
  terbit  JSONB;
  v_sla   NUMERIC;
  selisih NUMERIC;
  k       TEXT;
BEGIN
  IF u IS NULL OR p_bulan = 0 THEN
    FOR g IN
      SELECT m.ulp, m.tahun, m.bulan, array_agg(m.kunci) AS kunci
      FROM public.wo_surat_mode m
      WHERE m.tahun = p_tahun AND (p_bulan = 0 OR m.bulan = p_bulan) AND (u IS NULL OR m.ulp = u)
      GROUP BY 1, 2, 3
    LOOP
      -- ★ Sekali per ULP-bulan (dulu sekali per kunci). Kunci yang tidak ada
      --   di hasil → selisih NULL, sama dengan SELECT INTO tanpa baris dulu.
      SELECT jsonb_object_agg(x.kunci, x.wo_terbit) INTO terbit
      FROM public._rekap_kinerja_inti(g.ulp, g.tahun, g.bulan) x;
      FOREACH k IN ARRAY g.kunci LOOP
        v_sla := public.sla_rekap(g.ulp, k, g.tahun, g.bulan);
        IF v_sla IS NOT NULL THEN
          selisih := CASE WHEN terbit ? k THEN v_sla - COALESCE((terbit->>k)::numeric, 0) END;
          tambah := jsonb_set(tambah, ARRAY[k], to_jsonb(COALESCE((tambah->>k)::numeric, 0) + COALESCE(selisih, 0)));
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  -- ★ Tunggakan (per bulan saja).
  IF p_bulan <> 0 THEN
    SELECT COALESCE(jsonb_object_agg(t.kunci, t.jumlah), '{}'::jsonb) INTO hutang
    FROM (
      SELECT d.kunci,
             CASE WHEN d.kunci IN ('perabasan', 'jtm', 'jtm2', 'jtr') THEN round(COALESCE(sum(d.km), 0), 3)
                  ELSE count(*)::numeric END AS jumlah
      FROM public._wo_tunggakan_daftar(u, p_tahun, p_bulan) d
      WHERE NOT EXISTS (SELECT 1 FROM public.wo_surat_mode m
                        WHERE m.ulp = d.ulp AND m.tahun = p_tahun AND m.bulan = p_bulan AND m.kunci = d.kunci)
      GROUP BY d.kunci
    ) t;
  END IF;

  RETURN QUERY
  SELECT r.kunci,
    CASE
      WHEN u IS NOT NULL AND p_bulan <> 0 AND s.sla IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.wo_surat_mode m
        WHERE m.ulp = u AND m.tahun = p_tahun AND m.bulan = p_bulan AND m.kunci = r.kunci)
        THEN s.sla
      WHEN tambah ? r.kunci OR hutang ? r.kunci
        THEN COALESCE(r.wo_terbit, 0) + COALESCE((tambah->>r.kunci)::numeric, 0) + COALESCE((hutang->>r.kunci)::numeric, 0)
      ELSE r.wo_terbit
    END,
    r.realisasi, r.belum_disetujui, r.luar_wo, s.sla
  FROM public._rekap_kinerja_inti(p_ulp, p_tahun, p_bulan) r
  CROSS JOIN LATERAL (SELECT public.sla_rekap(u, r.kunci, p_tahun, p_bulan) AS sla) s;
END $fn$;

GRANT EXECUTE ON FUNCTION public.rekap_kinerja(TEXT, INT, INT) TO authenticated;


-- ── 2. jtr_inspeksi ─────────────────────────────────────────────────────────
-- Definisi yang berlaku (pg_get_viewdef 9 Nov); hanya jumlah_temuan yang berubah.
CREATE OR REPLACE VIEW public.jtr_inspeksi AS
SELECT i.id,
  i.gardu_kode,
  i.ulp,
  i.penyulang,
  i.tgl_mulai,
  i.tgl_selesai,
  i.status,
  i.inspektor_nama,
  i.petugas_2,
  i.catatan,
  i.verified_at,
  i.verified_by,
  i.verified_note,
  g.nama   AS gardu_nama,
  g.alamat AS gardu_alamat,
  k.tiang_aktif,
  k.sudah_diperiksa,
  k.tiang_baru,
  COALESCE(tm.jumlah, 0::bigint) AS jumlah_temuan,
  COALESCE(( SELECT round(sum(gg.panjang_rute_km), 3)
               FROM public.gardu_jtr_panjang gg
              WHERE upper(gg.gardu_kode) = upper(i.gardu_kode) AND upper(gg.ulp) = upper(i.ulp)), 0::numeric) AS panjang_km
FROM public.inspeksi_jtr i
LEFT JOIN public.gardu g ON upper(g.kode) = upper(i.gardu_kode) AND upper(g.ulp) = upper(i.ulp)
LEFT JOIN public.inspeksi_jtr_kelengkapan k ON k.inspeksi_id = i.id
LEFT JOIN ( SELECT t.inspeksi_id, count(*) AS jumlah
              FROM public.inspeksi_jtr_temuan t
             GROUP BY t.inspeksi_id) tm ON tm.inspeksi_id = i.id;


-- ── Pemeriksaan (jalankan terpisah sesudahnya) ──────────────────────────────
--   SELECT * FROM rekap_kinerja(NULL, 2026, 11);     -- harus < 8 dtk
--   SELECT count(*), sum(jumlah_temuan) FROM jtr_inspeksi;
