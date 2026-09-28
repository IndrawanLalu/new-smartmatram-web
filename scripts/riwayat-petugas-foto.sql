-- =============================================================================
-- 28 Sep 2026 — Riwayat dimaksimalkan untuk admin: saringan petugas + semua foto
-- Jalankan manual di Supabase SQL Editor, SESUDAH `riwayat-perbaikan` (fungsi
-- riwayat_pekerjaan_saya versi text[]). Idempoten. Hanya-baca.
--
-- Permintaan user: admin ULP menelusuri pekerjaan per petugas/tim lewat
-- Riwayat (kartu "Inspeksi by Petugas" / "Eksekusi by Team" di Beranda HP
-- membuka Riwayat yang sudah tersaring), rincian menampilkan semua fotonya.
--
--   1. riwayat_pekerjaan_saya(... , p_petugas) — nama petugas/tim, cocok
--      sebagian (nama satu orang ikut menemukan tim "A & B")
--   2. foto_riwayat(jenis, sumber_id) — semua foto satu baris Riwayat, berlabel
-- =============================================================================


-- ── 1. Saringan petugas ──────────────────────────────────────────────────────
-- Tanda tangan berubah (parameter baru) → yang lama DIBUANG, bukan ditimpa:
-- dua versi berdampingan membuat PostgREST ragu memilih.
DROP FUNCTION IF EXISTS public.riwayat_pekerjaan_saya(DATE, DATE, TEXT, TEXT[], TEXT[], TEXT, JSONB, INT);

CREATE OR REPLACE FUNCTION public.riwayat_pekerjaan_saya(
  p_dari     DATE,
  p_sampai   DATE,
  p_tim      TEXT    DEFAULT NULL,
  p_jenis    TEXT[]  DEFAULT NULL,
  p_status   TEXT[]  DEFAULT NULL,
  p_ulp      TEXT    DEFAULT NULL,
  p_setelah  JSONB   DEFAULT NULL,
  p_batas    INT     DEFAULT 20,
  p_petugas  TEXT    DEFAULT NULL
) RETURNS TABLE (
  jenis TEXT, sumber_id TEXT, ulp TEXT, tgl DATE, waktu TIME, objek TEXT, keterangan TEXT,
  status TEXT, status_asli TEXT, alasan TEXT, petugas TEXT, petugas_lain TEXT, km NUMERIC,
  foto_url TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION, total BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role   TEXT;
  v_unit   TEXT;
  r        RECORD;
  boleh    TEXT[];
  v_ulp    TEXT;
  v_tim    TEXT := NULLIF(upper(btrim(COALESCE(p_tim, ''))), '');
  v_orang  TEXT := NULLIF(btrim(COALESCE(p_petugas, '')), '');
  s_tgl    DATE := NULLIF(p_setelah->>'tgl', '')::date;
  s_waktu  TIME := COALESCE(NULLIF(p_setelah->>'waktu', '')::time, '00:00');
  s_jenis  TEXT := COALESCE(p_setelah->>'jenis', '');
  s_id     TEXT := COALESCE(p_setelah->>'sumber_id', '');
BEGIN
  SELECT ur.role, ur.unit INTO v_role, v_unit FROM public.user_roles ur WHERE ur.user_id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi.';
  END IF;
  IF p_dari IS NULL OR p_sampai IS NULL OR p_sampai < p_dari THEN
    RAISE EXCEPTION 'Rentang tanggal tidak sah.';
  END IF;
  IF p_sampai > (p_dari + INTERVAL '3 months')::date THEN
    RAISE EXCEPTION 'Rentang paling lama 3 bulan — persempit tanggalnya.';
  END IF;

  -- roles.menus = TEXT[] (roles-schema.sql).
  SELECT rl.is_eksekutor, rl.sees_all_units, COALESCE(rl.menus, '{}'::text[]) AS menus
    INTO r FROM public.roles rl WHERE rl.code = v_role;

  SELECT array_agg(DISTINCT j) INTO boleh FROM (
    SELECT unnest(CASE m
      WHEN 'hargardu'        THEN ARRAY['hargardu']
      WHEN 'pengukuranGardu' THEN ARRAY['pengukuran', 'ujung']
      WHEN 'optimasiTrafo'   THEN ARRAY['optimasi']
      WHEN 'perabasan'       THEN ARRAY['perabasan', 'rabas_luar']
      WHEN 'harjar'          THEN ARRAY['harjar']
      WHEN 'penyeimbangan'   THEN ARRAY['penyeimbangan']
      WHEN 'jtm'             THEN ARRAY['jtm']
      WHEN 'jtr'             THEN ARRAY['jtr']
      WHEN 'inspeksi'        THEN ARRAY['laporan']
    END) AS j
    FROM unnest(COALESCE(r.menus, '{}'::text[])) m
    UNION ALL
    SELECT 'tugas' WHERE COALESCE(r.is_eksekutor, false) OR v_role IN ('UP3', 'admin')
  ) x WHERE j IS NOT NULL;
  IF p_jenis IS NOT NULL THEN
    boleh := ARRAY(SELECT unnest(boleh) INTERSECT SELECT unnest(p_jenis));
  END IF;

  IF COALESCE(r.sees_all_units, false) OR v_role = 'UP3' THEN
    v_ulp := NULLIF(upper(btrim(COALESCE(p_ulp, ''))), '');
  ELSE
    v_ulp := upper(COALESCE(v_unit, ''));
  END IF;

  IF COALESCE(r.is_eksekutor, false) AND v_tim IS NULL THEN
    RAISE EXCEPTION 'Nama tim belum diketahui — keluar lalu masuk lagi dan pilih tim.';
  END IF;

  RETURN QUERY
  WITH f AS (
    SELECT v.* FROM public.riwayat_pekerjaan v
    WHERE v.tgl BETWEEN p_dari AND p_sampai
      AND v.jenis = ANY (COALESCE(boleh, '{}'))
      AND (v_ulp IS NULL OR v.ulp = v_ulp)
      AND (NOT COALESCE(r.is_eksekutor, false)
           OR upper(btrim(COALESCE(v.petugas, ''))) = v_tim
           OR upper(btrim(COALESCE(v.petugas_lain, ''))) = v_tim)
      AND (p_status IS NULL OR v.status = ANY (p_status))
      AND (v_orang IS NULL
           OR v.petugas ILIKE '%' || v_orang || '%'
           OR v.petugas_lain ILIKE '%' || v_orang || '%')
  ), n AS (SELECT count(*) AS total FROM f)
  SELECT f.jenis, f.sumber_id, f.ulp, f.tgl, f.waktu, f.objek, f.keterangan, f.status, f.status_asli,
         f.alasan, f.petugas, f.petugas_lain, f.km, f.foto_url, f.lat, f.lng, n.total
  FROM f CROSS JOIN n
  WHERE s_tgl IS NULL
     OR (f.tgl, COALESCE(f.waktu, '00:00'::time), f.jenis, f.sumber_id) < (s_tgl, s_waktu, s_jenis, s_id)
  ORDER BY f.tgl DESC, COALESCE(f.waktu, '00:00'::time) DESC, f.jenis DESC, f.sumber_id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_batas, 20), 1), 100);
END $$;

GRANT EXECUTE ON FUNCTION public.riwayat_pekerjaan_saya(DATE, DATE, TEXT, TEXT[], TEXT[], TEXT, JSONB, INT, TEXT) TO authenticated;


-- ── 2. Semua foto satu baris Riwayat ─────────────────────────────────────────
-- Foto tersimpan dengan bentuk berbeda-beda: kolom teks, array, dan JSON
-- bersarang (penyeimbangan {"R": {"url": …}}). Satu penelusur untuk semuanya:
-- setiap kolom `foto*` / `image_url` sebuah baris ditelusuri sampai ke dasar,
-- dan setiap teks berawalan http diambil.
CREATE OR REPLACE FUNCTION public._foto_dari_baris(r JSONB)
RETURNS TABLE (label TEXT, url TEXT)
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE e.key
           WHEN 'foto_sebelum_url'        THEN 'Sebelum'
           WHEN 'foto_sesudah_url'        THEN 'Sesudah'
           WHEN 'foto_lokasi_url'         THEN 'Lokasi'
           WHEN 'foto_nameplate_lama_url' THEN 'Papan nama trafo lama'
           WHEN 'foto_nameplate_baru_url' THEN 'Papan nama trafo baru'
           WHEN 'foto_arus'               THEN 'Arus'
           WHEN 'foto_tegangan'           THEN 'Tegangan'
           WHEN 'foto_perjurusan'         THEN 'Per jurusan'
           WHEN 'foto_total'              THEN 'Total'
           ELSE 'Foto'
         END,
         u #>> '{}'
  FROM jsonb_each(COALESCE(r, '{}'::jsonb)) e
  CROSS JOIN LATERAL jsonb_path_query(
    e.value, 'strict $.** ? (@.type() == "string" && @ like_regex "^https?://")') u
  WHERE e.key LIKE 'foto%' OR e.key = 'image_url'
$$;

CREATE OR REPLACE FUNCTION public.foto_riwayat(p_jenis TEXT, p_sumber_id TEXT)
RETURNS TABLE (label TEXT, url TEXT)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  -- Baris pohon membawa awalan "pohon|" (view riwayat_pekerjaan).
  v_pohon BOOLEAN := p_sumber_id LIKE 'pohon|%';
  v_id    TEXT := CASE WHEN p_sumber_id LIKE 'pohon|%' THEN substr(p_sumber_id, 7) ELSE p_sumber_id END;
BEGIN
  IF p_jenis IN ('laporan', 'tugas') AND v_pohon THEN
    RETURN QUERY SELECT f.* FROM public.inspeksi_pohon i, LATERAL public._foto_dari_baris(to_jsonb(i)) f
      WHERE i.id::text = v_id;
  ELSIF p_jenis IN ('laporan', 'tugas') THEN
    RETURN QUERY SELECT f.* FROM public.inspeksi i, LATERAL public._foto_dari_baris(to_jsonb(i)) f
      WHERE i.id::text = v_id;
  ELSIF p_jenis = 'harjar' THEN
    RETURN QUERY SELECT f.* FROM public.pemeliharaan_jaringan x, LATERAL public._foto_dari_baris(to_jsonb(x)) f
      WHERE x.id::text = v_id;
  ELSIF p_jenis = 'rabas_luar' THEN
    RETURN QUERY SELECT f.* FROM public.perabasan_luar_wo x, LATERAL public._foto_dari_baris(to_jsonb(x)) f
      WHERE x.id::text = v_id;
  ELSIF p_jenis = 'optimasi' THEN
    RETURN QUERY SELECT f.* FROM public.optimasi_trafo x, LATERAL public._foto_dari_baris(to_jsonb(x)) f
      WHERE x.id::text = v_id;
  ELSIF p_jenis = 'ujung' THEN
    RETURN QUERY SELECT 'Alat ukur'::text, f.url FROM public.pengukuran_tegangan_ujung x,
      LATERAL public._foto_dari_baris(to_jsonb(x)) f WHERE x.id::text = v_id;
  ELSIF p_jenis = 'pengukuran' THEN
    RETURN QUERY SELECT f.* FROM public.pengukuran_gardu x, LATERAL public._foto_dari_baris(to_jsonb(x)) f
      WHERE x.id::text = v_id;
  ELSIF p_jenis = 'penyeimbangan' THEN
    RETURN QUERY SELECT f.* FROM public.penyeimbangan_gardu x, LATERAL public._foto_dari_baris(to_jsonb(x)) f
      WHERE x.id::text = v_id;
  ELSIF p_jenis = 'hargardu' THEN
    RETURN QUERY SELECT COALESCE(NULLIF(x.slot, ''), 'Foto')::text, x.url::text
      FROM public.pemeliharaan_gardu_foto x
      WHERE x.pemeliharaan_id::text = v_id AND x.url LIKE 'http%'
      ORDER BY x.diambil_at LIMIT 40;
  ELSIF p_jenis = 'perabasan' THEN
    -- sumber_id = item_id | tanggal WITA | petugas (satu hari kerja satu tim)
    RETURN QUERY
      SELECT ('Pohon ' || p.n || ' · ' || f.label)::text, f.url
      FROM (
        SELECT x.*, row_number() OVER (ORDER BY x.dikerjakan_at) AS n
        FROM public.perabasan_realisasi x
        WHERE x.item_id::text = split_part(p_sumber_id, '|', 1)
          AND (x.dikerjakan_at AT TIME ZONE 'Asia/Makassar')::date::text = split_part(p_sumber_id, '|', 2)
          AND COALESCE(x.petugas_nama, '') = split_part(p_sumber_id, '|', 3)
      ) p, LATERAL public._foto_dari_baris(to_jsonb(p) - 'n') f
      LIMIT 40;
  ELSIF p_jenis = 'jtm' THEN
    RETURN QUERY
      SELECT ('Tiang ' || COALESCE(tg.kode, '?') || CASE WHEN f.kode <> 'tiang' THEN ' · ' || f.kode ELSE '' END)::text, f.url::text
      FROM public.inspeksi_jtm_titik t
      JOIN public.inspeksi_jtm_foto f ON f.titik_id = t.id
      LEFT JOIN public.tiang tg ON tg.id = t.tiang_id
      WHERE t.inspeksi_id::text = v_id AND f.url LIKE 'http%'
      ORDER BY t.dinilai_at, f.created_at
      LIMIT 40;
  ELSIF p_jenis = 'jtr' THEN
    RETURN QUERY
      SELECT ('Tiang ' || COALESCE(tg.kode, '?'))::text, u.url::text
      FROM public.inspeksi_jtr_titik t
      CROSS JOIN LATERAL unnest(t.foto_url) AS u(url)
      LEFT JOIN public.tiang tg ON tg.id = t.tiang_id
      WHERE t.inspeksi_id::text = v_id AND u.url LIKE 'http%'
      ORDER BY t.created_at
      LIMIT 40;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.foto_riwayat(TEXT, TEXT) TO authenticated;

-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT * FROM foto_riwayat('laporan', (SELECT id::text FROM inspeksi ORDER BY created_at DESC LIMIT 1));
