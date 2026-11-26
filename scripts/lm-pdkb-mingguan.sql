-- =============================================================================
-- LM membaca PDKB + baris LM Mingguan diatur dari layar (25 Nov 2026).
-- Aman dijalankan ulang.
--
-- Keputusan user 25 Nov:
--   • PDKB = sumber TERPISAH "pdkb:<kode kategori>" (pdkb_pekerjaan, status
--     Tercatat). Baris yang sudah memakai "harjtm:<kode>" otomatis ditambah
--     "pdkb:<kode>" — angka kembali seperti sebelum catatan PDKB dipindah,
--     tetapi tetap bisa dilepas per baris.
--   • LM Mingguan punya daftar baris sendiri, PER ULP (seperti LM 4DX/Susut):
--     lm4dx_baris.laporan = 'mingguan', ditambah
--       induk  = baris total yang dijumlahinya (NULL = baris utama)
--       satuan = satuan tampilan
--       sla    = kunci SLA (sla_kinerja) yang menjadi target baris ini
--     Isi awal = 12 baris tab Mingguan sebelumnya.
-- =============================================================================

-- ── 1. Kolom & laporan baru ──────────────────────────────────────────────────
ALTER TABLE public.lm4dx_baris DROP CONSTRAINT IF EXISTS lm4dx_baris_laporan_valid;
ALTER TABLE public.lm4dx_baris ADD CONSTRAINT lm4dx_baris_laporan_valid
  CHECK (laporan IN ('4dx', 'susut', 'mingguan'));

ALTER TABLE public.lm4dx_baris ADD COLUMN IF NOT EXISTS induk  UUID;
ALTER TABLE public.lm4dx_baris ADD COLUMN IF NOT EXISTS satuan TEXT;
ALTER TABLE public.lm4dx_baris ADD COLUMN IF NOT EXISTS sla    TEXT[];
ALTER TABLE public.lm4dx_baris DROP CONSTRAINT IF EXISTS lm4dx_baris_induk_fk;
ALTER TABLE public.lm4dx_baris ADD CONSTRAINT lm4dx_baris_induk_fk
  FOREIGN KEY (induk) REFERENCES public.lm4dx_baris (id) ON DELETE SET NULL;
ALTER TABLE public.lm4dx_baris DROP CONSTRAINT IF EXISTS lm4dx_baris_induk_bukan_diri;
ALTER TABLE public.lm4dx_baris ADD CONSTRAINT lm4dx_baris_induk_bukan_diri CHECK (induk IS NULL OR induk <> id);

-- ── 2. Baris lama: harjtm:<kode> → tambah pdkb:<kode> ────────────────────────
UPDATE public.lm4dx_baris b
SET sumber = b.sumber || tambah.kode,
    updated_at = now(),
    updated_by = 'lm-pdkb-mingguan.sql'
FROM (
  SELECT x.id, array_agg(DISTINCT 'pdkb:' || substr(s, 8)) AS kode
  FROM public.lm4dx_baris x, unnest(x.sumber) s
  WHERE s LIKE 'harjtm:%'
    AND NOT ('pdkb:' || substr(s, 8)) = ANY (x.sumber)
  GROUP BY x.id
) tambah
WHERE b.id = tambah.id;

-- ── 3. Isi awal LM Mingguan per ULP (NULL = Semua ULP) ───────────────────────
DO $isi$
DECLARE
  u       TEXT;
  v_jtm   UUID;
  v_gardu UUID;
  v_pr    UUID;
  per_jtm TEXT[];
  per_gd  TEXT[];
BEGIN
  -- Perisai binatang dikenali dari nama kategori (sama dengan aturan lama tab
  -- Mingguan): ber-"gardu" = Perisai Gardu, lainnya = Perisai JTM. Setiap
  -- kategori dihitung dari Pemeliharaan Jaringan DAN PDKB.
  SELECT COALESCE(array_agg(p || r.kode ORDER BY r.kode, p), '{}') INTO per_jtm
  FROM public.pemeliharaan_jaringan_ref r, unnest(ARRAY['harjtm:', 'pdkb:']) p
  WHERE r.label ~* '(perisai|prisai|binatang|animal)' AND r.label !~* 'gardu';
  SELECT COALESCE(array_agg(p || r.kode ORDER BY r.kode, p), '{}') INTO per_gd
  FROM public.pemeliharaan_jaringan_ref r, unnest(ARRAY['harjtm:', 'pdkb:']) p
  WHERE r.label ~* '(perisai|prisai|binatang|animal)' AND r.label ~* 'gardu';

  FOREACH u IN ARRAY ARRAY['', 'AMPENAN', 'CAKRANEGARA', 'GERUNG', 'TANJUNG'] LOOP
    IF EXISTS (SELECT 1 FROM public.lm4dx_baris
               WHERE laporan = 'mingguan' AND ulp IS NOT DISTINCT FROM NULLIF(u, '')) THEN
      CONTINUE;
    END IF;
    v_jtm := gen_random_uuid(); v_gardu := gen_random_uuid(); v_pr := gen_random_uuid();
    INSERT INTO public.lm4dx_baris (id, laporan, ulp, urutan, uraian, sumber, induk, satuan, sla, updated_by)
    VALUES
      (v_jtm,             'mingguan', NULLIF(u, ''), 1,  'Inspeksi JTM',                '{}',                      NULL,    'KMS',       ARRAY['jtm', 'jtm2'],         'isi awal'),
      (gen_random_uuid(), 'mingguan', NULLIF(u, ''), 2,  'Tier 1',                      ARRAY['jtm_tanpa_drone'],  v_jtm,   'KMS',       NULL,                         'isi awal'),
      (gen_random_uuid(), 'mingguan', NULLIF(u, ''), 3,  'Tier 1 drone',                ARRAY['jtm_drone_km'],     v_jtm,   'KMS',       NULL,                         'isi awal'),
      (gen_random_uuid(), 'mingguan', NULLIF(u, ''), 4,  'Tier 2',                      ARRAY['jtm2'],             v_jtm,   'KMS',       NULL,                         'isi awal'),
      (v_gardu,           'mingguan', NULLIF(u, ''), 5,  'Inspeksi Gardu',              '{}',                      NULL,    'gardu',     ARRAY['igardu1', 'igardu2'],  'isi awal'),
      (gen_random_uuid(), 'mingguan', NULLIF(u, ''), 6,  'Tier 1',                      ARRAY['igardu1'],          v_gardu, 'gardu',     NULL,                         'isi awal'),
      (gen_random_uuid(), 'mingguan', NULLIF(u, ''), 7,  'Tier 2',                      ARRAY['igardu2'],          v_gardu, 'gardu',     NULL,                         'isi awal'),
      (gen_random_uuid(), 'mingguan', NULLIF(u, ''), 8,  'Perabasan pohon',             ARRAY['perabasan'],        NULL,    'KMS',       ARRAY['perabasan'],           'isi awal'),
      (gen_random_uuid(), 'mingguan', NULLIF(u, ''), 9,  'Penebangan pohon',            '{}',                      NULL,    'pohon',     NULL,                         'isi awal'),
      (v_pr,              'mingguan', NULLIF(u, ''), 10, 'Pemasangan perisai binatang', '{}',                      NULL,    'pekerjaan', NULL,                         'isi awal'),
      (gen_random_uuid(), 'mingguan', NULLIF(u, ''), 11, 'Perisai JTM',                 per_jtm,                   v_pr,    'pekerjaan', NULL,                         'isi awal'),
      (gen_random_uuid(), 'mingguan', NULLIF(u, ''), 12, 'Perisai Gardu',               per_gd,                    v_pr,    'pekerjaan', NULL,                         'isi awal');
  END LOOP;
END $isi$;

NOTIFY pgrst, 'reload schema';

-- Periksa (hanya baca):
--   SELECT laporan, COALESCE(ulp, '(Semua ULP)') ulp, count(*) FROM lm4dx_baris GROUP BY 1, 2 ORDER BY 1, 2;
--   SELECT ulp, urutan, uraian, sumber FROM lm4dx_baris WHERE laporan = 'mingguan' AND uraian ILIKE 'perisai%';
--   SELECT uraian, sumber FROM lm4dx_baris WHERE EXISTS (SELECT 1 FROM unnest(sumber) s WHERE s LIKE 'pdkb:%');
