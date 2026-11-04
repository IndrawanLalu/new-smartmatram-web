-- =============================================================================
-- Indeks hasil audit performa (5 Nov 2026)
-- -----------------------------------------------------------------------------
-- Kolom yang sering dipakai menyaring/menggabung tetapi indeksnya tidak
-- tercatat di skrip mana pun. Indeks dibuat HANYA bila:
--   • tabel dan semua kolomnya ada, dan
--   • belum ada indeks lain yang kolom awalnya sama persis (apa pun namanya),
-- jadi aman dijalankan ulang dan tidak membuat indeks kembar.
-- NOTICE di bawah menyebut mana yang dibuat dan mana yang dilewati.
-- =============================================================================

CREATE OR REPLACE FUNCTION pg_temp.indeks_bila_perlu(p_tabel TEXT, p_kolom TEXT[])
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  rel  OID := to_regclass('public.' || p_tabel);
  nama TEXT := left('ix_' || p_tabel || '_' || array_to_string(p_kolom, '_'), 63);
  ada  TEXT;
BEGIN
  IF rel IS NULL OR (SELECT relkind FROM pg_class WHERE oid = rel) NOT IN ('r', 'p') THEN
    RAISE NOTICE 'lewati %: bukan tabel', p_tabel; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_kolom) c
             WHERE NOT EXISTS (SELECT 1 FROM pg_attribute a
                               WHERE a.attrelid = rel AND a.attname = c AND NOT a.attisdropped)) THEN
    RAISE NOTICE 'lewati %(%): kolom tidak ada', p_tabel, array_to_string(p_kolom, ','); RETURN;
  END IF;
  -- Indeks yang sudah ada dengan kolom awal sama (urutan sama) sudah cukup.
  SELECT ci.relname INTO ada
  FROM pg_index x JOIN pg_class ci ON ci.oid = x.indexrelid
  WHERE x.indrelid = rel
    AND x.indpred IS NULL
    AND x.indnatts >= array_length(p_kolom, 1)
    AND (SELECT array_agg(a.attname ORDER BY g.i)
         FROM generate_series(0, array_length(p_kolom, 1) - 1) g(i)
         JOIN pg_attribute a ON a.attrelid = rel AND a.attnum = x.indkey[g.i]) = p_kolom::name[]
  LIMIT 1;
  IF ada IS NOT NULL THEN
    RAISE NOTICE 'sudah ada %(%): %', p_tabel, array_to_string(p_kolom, ','), ada; RETURN;
  END IF;
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)', nama, p_tabel,
                 (SELECT string_agg(format('%I', c), ', ') FROM unnest(p_kolom) c));
  RAISE NOTICE 'DIBUAT %', nama;
END $$;

-- Pengukuran gardu & turunannya
SELECT pg_temp.indeks_bila_perlu('pengukuran_gardu',          ARRAY['no_gardu']);
SELECT pg_temp.indeks_bila_perlu('pengukuran_gardu',          ARRAY['petugas_unit']);
SELECT pg_temp.indeks_bila_perlu('pengukuran_gardu',          ARRAY['tanggal_pengukuran']);
SELECT pg_temp.indeks_bila_perlu('pengukuran_tegangan_ujung', ARRAY['pengukuran_id']);
SELECT pg_temp.indeks_bila_perlu('penyeimbangan_gardu',       ARRAY['pengukuran_id']);
SELECT pg_temp.indeks_bila_perlu('optimasi_trafo',            ARRAY['pengukuran_id']);
SELECT pg_temp.indeks_bila_perlu('wo_pengukuran_realisasi',   ARRAY['tahun', 'bulan']);
SELECT pg_temp.indeks_bila_perlu('pemeliharaan_gardu',        ARRAY['gardu_kode']);

-- Tugas temuan (dipakai LATERAL di jtm_temuan per tiang)
SELECT pg_temp.indeks_bila_perlu('inspeksi',                  ARRAY['sumber_tiang_id']);
SELECT pg_temp.indeks_bila_perlu('inspeksi_pohon',            ARRAY['sumber_tiang_id']);
SELECT pg_temp.indeks_bila_perlu('inspeksi',                  ARRAY['ulp']);
SELECT pg_temp.indeks_bila_perlu('inspeksi_pohon',            ARRAY['ulp']);

-- Inspeksi JTM & aset
SELECT pg_temp.indeks_bila_perlu('inspeksi_jtm_periksa',      ARRAY['titik_id']);
SELECT pg_temp.indeks_bila_perlu('inspeksi_jtm_titik',        ARRAY['inspeksi_id']);
SELECT pg_temp.indeks_bila_perlu('inspeksi_jtm_titik',        ARRAY['tiang_id']);
SELECT pg_temp.indeks_bila_perlu('tiang',                     ARRAY['induk_id']);
SELECT pg_temp.indeks_bila_perlu('segmen_tiang',              ARRAY['tiang_id']);

-- Perabasan
SELECT pg_temp.indeks_bila_perlu('wo_perabasan_item',         ARRAY['segmen_id']);
SELECT pg_temp.indeks_bila_perlu('perabasan_realisasi',       ARRAY['item_id']);
SELECT pg_temp.indeks_bila_perlu('perabasan_realisasi',       ARRAY['dikerjakan_at']);


-- ── Periksa: semua indeks di tabel-tabel di atas ─────────────────────────────
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('pengukuran_gardu', 'pengukuran_tegangan_ujung', 'penyeimbangan_gardu',
                    'optimasi_trafo', 'wo_pengukuran_realisasi', 'pemeliharaan_gardu',
                    'inspeksi', 'inspeksi_pohon', 'inspeksi_jtm_periksa', 'inspeksi_jtm_titik',
                    'tiang', 'segmen_tiang', 'wo_perabasan_item', 'perabasan_realisasi')
ORDER BY tablename, indexname;
