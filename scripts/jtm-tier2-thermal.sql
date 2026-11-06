-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2 JTM: foto thermal wajib di tiang tertentu (7 Nov 2026)
--
-- Keputusan user:
--   • Hanya Tier 2 biasa (bukan "Tier 2 + titik").
--   • Wajib di tiang: konstruksi A3, berperalatan (penanda: gardu, LBS,
--     recloser, FCO, …), percabangan, dan tiang PERTAMA penyulang (segmen
--     berpangkal GI/PLTD/GH, tiang tanpa induk di penyulang itu).
--   • Foto milik INSPEKSI penyulang itu (konduktornya), bukan badan tiang —
--     tiang yang dilewati dua penyulang punya foto masing-masing.
--   • Minimal 1, sampai 3. Foto layar alat thermal dipotret kamera HP inspektor.
--   • HP menilai warnanya; yang tidak mirip layar thermal TETAP diterima tapi
--     ditandai `ragu` → "perlu dicek" di web.
--
-- Disimpan di inspeksi_jtm_foto kode 'thermal' (pola foto drone).
-- URUTAN: OTA HP DULU, baru SQL ini — HP lama tidak mengirim foto thermal dan
-- tiang wajibnya akan ditolak server.
-- Aman dijalankan ulang; tambalan berhenti bila penandanya tidak ketemu.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.inspeksi_jtm_foto ADD COLUMN IF NOT EXISTS ragu BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.inspeksi_jtm_foto ADD COLUMN IF NOT EXISTS skor NUMERIC;
COMMENT ON COLUMN public.inspeksi_jtm_foto.ragu IS
  'Foto thermal yang warnanya tidak mirip layar thermal menurut HP — perlu dicek admin (jtm-tier2-thermal.sql).';
COMMENT ON COLUMN public.inspeksi_jtm_foto.skor IS
  'Skor warna thermal dari HP 0–1 (untuk menyetel ambang), NULL = bukan foto thermal.';


-- ── Tiang ini wajib foto thermal di inspeksi ini? ───────────────────────────
-- Kembalian = alasannya (untuk pesan), NULL = tidak wajib. HP memakai aturan
-- yang sama (src/utils/thermal.ts).
CREATE OR REPLACE FUNCTION public.jtm_wajib_thermal(p_inspeksi UUID, p_tiang UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN upper(btrim(COALESCE(t.konstruksi, ''))) = 'A3' THEN 'konstruksi A3'
    WHEN NULLIF(btrim(COALESCE(t.penanda, '')), '') IS NOT NULL THEN 'peralatan'
    WHEN COALESCE(t.percabangan, false) THEN 'percabangan'
    WHEN sg.titik_awal_jenis IN ('GI', 'PLTD', 'GH')
         AND COALESCE((SELECT k.induk_id FROM public.tiang_kode_penyulang k
                       WHERE k.tiang_id = t.id AND k.penyulang = sg.penyulang AND k.induk_id IS NOT NULL
                       LIMIT 1), t.induk_id) IS NULL
      THEN 'tiang pertama penyulang'
  END
  FROM public.inspeksi_jtm i
  JOIN public.segmen sg ON sg.id = i.segmen_id
  JOIN public.tiang t ON t.id = p_tiang
  WHERE i.id = p_inspeksi
    AND i.tier = '2'
    AND NOT COALESCE((SELECT w.titik FROM public.wo_inspeksi_item w WHERE w.id = i.wo_item_id), false)
$$;
GRANT EXECUTE ON FUNCTION public.jtm_wajib_thermal(UUID, UUID) TO authenticated;


-- ── Tambalan kirim_tiang_jtm (definisi hidup) ───────────────────────────────
DO $tambal$
DECLARE
  def  TEXT;
  baru TEXT;
  pasang TEXT[][] := ARRAY[
    -- a. variabel
    ARRAY[E'  v_drone  BOOLEAN := false;   -- ★ Tier 1 + drone\nBEGIN',
          E'  v_drone  BOOLEAN := false;   -- ★ Tier 1 + drone\n'
          || E'  v_thermal TEXT;             -- ★ Tier 2 foto thermal\nBEGIN'],
    -- b. wajib foto thermal — ditolak per tiang, bukan seluruh kiriman
    ARRAY[E'        -- ★ Jam kerja Tier 2 (jam-tier2.sql): di luar jam = tiang ini ditolak.',
          E'        -- ★ Tier 2 foto thermal (jtm-tier2-thermal.sql).\n'
          || E'        v_thermal := public.jtm_wajib_thermal(v_id, v_tiang);\n'
          || E'        IF v_thermal IS NOT NULL AND NOT EXISTS (\n'
          || E'          SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r->''foto_thermal'') = ''array''\n'
          || E'                                                  THEN r->''foto_thermal'' ELSE ''[]''::jsonb END) u\n'
          || E'          WHERE jsonb_typeof(u) = ''object'' AND u->>''url'' LIKE ''http%'') THEN\n'
          || E'          RAISE EXCEPTION ''Tier 2: tiang % (%) wajib punya minimal 1 foto thermal.'',\n'
          || E'            COALESCE((SELECT kode FROM public.tiang WHERE id = v_tiang), ''ini''), v_thermal;\n'
          || E'        END IF;\n'
          || E'        -- ★ Jam kerja Tier 2 (jam-tier2.sql): di luar jam = tiang ini ditolak.'],
    -- c. simpan foto thermal (ikut kiriman terakhir)
    ARRAY[E'    -- ★ induk_id ikut:',
          E'    -- ★ Foto thermal Tier 2 — ikut kiriman terakhir.\n'
          || E'    IF v_ok IS TRUE AND jsonb_typeof(r->''daftar'') = ''array''\n'
          || E'       AND jsonb_typeof(r->''foto_thermal'') = ''array'' THEN\n'
          || E'      DELETE FROM public.inspeksi_jtm_foto f\n'
          || E'      USING public.inspeksi_jtm_titik tk\n'
          || E'      WHERE f.titik_id = tk.id AND tk.inspeksi_id = v_id AND tk.tiang_id = v_tiang AND f.kode = ''thermal'';\n'
          || E'      INSERT INTO public.inspeksi_jtm_foto (titik_id, kode, url, lat, lng, ragu, skor)\n'
          || E'      SELECT tk.id, ''thermal'', u->>''url'', tk.petugas_lat, tk.petugas_lng,\n'
          || E'             COALESCE(u->>''ragu'' = ''true'', false),\n'
          || E'             CASE WHEN jsonb_typeof(u->''skor'') = ''number'' THEN (u->>''skor'')::numeric END\n'
          || E'      FROM public.inspeksi_jtm_titik tk, jsonb_array_elements(r->''foto_thermal'') u\n'
          || E'      WHERE tk.inspeksi_id = v_id AND tk.tiang_id = v_tiang\n'
          || E'        AND jsonb_typeof(u) = ''object'' AND u->>''url'' LIKE ''http%'';\n'
          || E'    END IF;\n\n'
          || E'    -- ★ induk_id ikut:']
  ];
  i INT;
BEGIN
  SELECT replace(pg_get_functiondef('public.kirim_tiang_jtm(jsonb)'::regprocedure), E'\r\n', E'\n') INTO def;
  IF position('v_thermal' IN def) > 0 THEN
    RAISE NOTICE 'kirim_tiang_jtm sudah bertambalan foto thermal — dilewati.'; RETURN;
  END IF;
  baru := def;
  FOR i IN 1 .. array_length(pasang, 1) LOOP
    IF (length(baru) - length(replace(baru, pasang[i][1], ''))) / length(pasang[i][1]) <> 1 THEN
      RAISE EXCEPTION 'Tambalan kirim_tiang_jtm #%: penanda tidak ditemukan tepat sekali — tidak ada yang berubah.', i;
    END IF;
    baru := replace(baru, pasang[i][1], pasang[i][2]);
  END LOOP;
  EXECUTE baru;
  RAISE NOTICE 'kirim_tiang_jtm ditambal (foto thermal).';
END $tambal$;


-- ── Periksa ─────────────────────────────────────────────────────────────────
-- Berapa tiang wajib foto thermal per alasan, di segmen yang punya inspeksi Tier 2.
SELECT public.jtm_wajib_thermal(i.id, st.tiang_id) AS alasan, count(DISTINCT st.tiang_id) AS tiang
FROM public.inspeksi_jtm i
JOIN public.segmen_tiang st ON st.segmen_id = i.segmen_id
WHERE i.tier = '2' AND i.status IN ('Dijadwalkan', 'Dalam Proses')
GROUP BY 1 ORDER BY 2 DESC;
