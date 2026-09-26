-- =============================================================================
-- Alat baca definisi yang SEDANG TERPASANG (26 Sep 2026)
-- Jalankan manual di Supabase SQL Editor. Idempoten. Baca-saja.
--
-- Kenapa: beberapa view & fungsi JTR sudah ditulis ulang di 4–5 berkas skrip.
-- Menebak versi yang hidup dari urutan berkas berisiko menimpa versi yang
-- lebih baru tanpa terasa. Fungsi ini memulangkan definisi yang benar-benar
-- terpasang, plus daftar view yang bergantung pada sebuah tabel/view.
--
-- HANYA untuk kunci server (service_role) — tidak bisa dipanggil pengguna
-- aplikasi, jadi struktur database tidak terbuka ke HP maupun peramban.
-- =============================================================================

CREATE OR REPLACE FUNCTION public._definisi(p_nama TEXT[])
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'view', (
      SELECT COALESCE(jsonb_object_agg(v.viewname, pg_get_viewdef(format('public.%I', v.viewname)::regclass, true)), '{}'::jsonb)
      FROM pg_views v
      WHERE v.schemaname = 'public' AND v.viewname = ANY (p_nama)
    ),
    'fungsi', (
      SELECT COALESCE(jsonb_object_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
                                       pg_get_functiondef(p.oid)), '{}'::jsonb)
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = ANY (p_nama)
    ),
    -- View yang memakai salah satu objek yang disebut (langsung).
    'pemakai', (
      SELECT COALESCE(jsonb_object_agg(sumber, pemakai), '{}'::jsonb) FROM (
        SELECT src.relname AS sumber, jsonb_agg(DISTINCT dep.relname) AS pemakai
        FROM pg_depend d
        JOIN pg_rewrite r ON r.oid = d.objid
        JOIN pg_class dep ON dep.oid = r.ev_class
        JOIN pg_class src ON src.oid = d.refobjid
        JOIN pg_namespace ns ON ns.oid = src.relnamespace
        WHERE ns.nspname = 'public' AND src.relname = ANY (p_nama) AND dep.relname <> src.relname
        GROUP BY src.relname
      ) x
    )
  );
$$;

REVOKE ALL ON FUNCTION public._definisi(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._definisi(TEXT[]) TO service_role;
