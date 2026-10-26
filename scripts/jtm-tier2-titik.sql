-- =============================================================================
-- Inspeksi JTM "Tier 2 + titik" (26 Okt 2026)
-- Jalankan SESUDAH jtm-tier2-malam.sql, wo-jtm-tier.sql, wo-daftar-garansi.sql,
-- jtm-pecah-riwayat.sql. Idempoten. SQL dulu, baru web & HP (OTA).
--
-- Keputusan user 26 Okt — Tier 2 punya dua mode:
--   • "Tier 2"          — yang sekarang: hanya tiang yang sudah ada, segmen
--                         wajib sudah Tier 1 Diverifikasi.
--   • "Tier 2 + titik"  — seperti dulu: regu boleh menitik / menyisip /
--                         menggeser tiang, segmen BOLEH belum pernah Tier 1
--                         (itu tujuannya). Isian tetap Tier 2 ringkas.
--   • Mode dipilih ADMIN saat Susun WO (per WO); regu mengikuti.
--
--   1. wo_inspeksi.titik / wo_inspeksi_item.titik (item mewarisi WO-nya).
--   2. terbitkan_wo_inspeksi_jtm(…, p_titik) — disalin dari wo-jtm-tier.sql, ★.
--   3. jtm_tier2_boleh_titik(segmen) — ada item WO Tier 2 + titik yang terbuka.
--   4. Tiga penjaga Tier 2 (jtm-tier2-malam.sql) meloloskan mode titik.
--   5. Segmen "sudah dititik" juga dari Tier 2 + titik yang disetujui.
--   6. View item WO & daftar WO membawa `titik`.
-- =============================================================================


-- ── 1. Kolom ─────────────────────────────────────────────────────────────────
ALTER TABLE public.wo_inspeksi      ADD COLUMN IF NOT EXISTS titik BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.wo_inspeksi_item ADD COLUMN IF NOT EXISTS titik BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.wo_inspeksi DROP CONSTRAINT IF EXISTS wo_inspeksi_titik_tier2;
ALTER TABLE public.wo_inspeksi ADD CONSTRAINT wo_inspeksi_titik_tier2 CHECK (NOT titik OR tier = '2');
COMMENT ON COLUMN public.wo_inspeksi.titik IS
  'WO Tier 2 + titik: regu boleh menitik/menyisip/menggeser tiang, segmen boleh belum pernah Tier 1 (26 Okt 2026).';
COMMENT ON COLUMN public.wo_inspeksi_item.titik IS 'Salinan wo_inspeksi.titik (pemicu trg_wo_item_ikut_tier).';

-- Item mewarisi tier DAN mode titik WO-nya (disalin dari wo-jtm-tier.sql; ★).
CREATE OR REPLACE FUNCTION public.wo_item_ikut_tier()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  SELECT w.tier, w.titik INTO NEW.tier, NEW.titik FROM public.wo_inspeksi w WHERE w.id = NEW.wo_id;   -- ★ titik
  NEW.tier := COALESCE(NEW.tier, '1');
  NEW.titik := COALESCE(NEW.titik, false);   -- ★
  RETURN NEW;
END $fn$;


-- ── 2. Terbitkan WO JTM ──────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.terbitkan_wo_inspeksi_jtm(TEXT, TEXT, NUMERIC, UUID[], DATE, JSONB, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.terbitkan_wo_inspeksi_jtm(
  p_ulp       TEXT,
  p_nama      TEXT,
  p_target_km NUMERIC,
  p_segmen    UUID[],
  p_tgl_wo    DATE    DEFAULT CURRENT_DATE,
  p_regu      JSONB   DEFAULT '{}'::jsonb,
  p_oleh      TEXT    DEFAULT NULL,
  p_tier      TEXT    DEFAULT '1',
  p_titik     BOOLEAN DEFAULT false        -- ★ Tier 2 + titik
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  unit     TEXT := upper(btrim(COALESCE(p_ulp, '')));
  judul    TEXT := btrim(COALESCE(p_nama, ''));
  wo       UUID;
  s        RECORD;
  item     UUID;
  n        INT := 0;
  dilewati JSONB := '[]'::jsonb;
  v_tier   TEXT := btrim(COALESCE(p_tier, '1'));
  v_titik  BOOLEAN := COALESCE(p_titik, false);   -- ★
BEGIN
  IF v_tier NOT IN ('1', '2') THEN RAISE EXCEPTION 'Tier WO harus 1 atau 2'; END IF;
  IF v_titik AND v_tier <> '2' THEN RAISE EXCEPTION 'Mode "+ titik" hanya untuk WO Tier 2'; END IF;   -- ★
  IF unit = '' THEN RAISE EXCEPTION 'ULP belum dipilih'; END IF;
  IF judul = '' THEN RAISE EXCEPTION 'Nama WO belum diisi'; END IF;
  IF COALESCE(array_length(p_segmen, 1), 0) = 0 THEN RAISE EXCEPTION 'Belum ada segmen yang dipilih'; END IF;
  PERFORM public.wajib_boleh_ulp(unit);

  INSERT INTO public.wo_inspeksi (jenis, ulp, nama, tgl_wo, target_km, created_by, tier, titik)   -- ★ titik
  VALUES ('JTM', unit, judul, COALESCE(p_tgl_wo, CURRENT_DATE), p_target_km, auth.uid(), v_tier, v_titik)
  RETURNING id INTO wo;

  FOR s IN SELECT * FROM public.master_segmen WHERE segmen_id = ANY(p_segmen) ORDER BY penyulang, nama LOOP
    IF upper(s.ulp) <> unit THEN
      dilewati := dilewati || jsonb_build_object('segmen', s.nama, 'sebab', format('Milik ULP %s, bukan %s.', s.ulp, unit));
      CONTINUE;
    END IF;
    IF s.status <> 'aktif' THEN
      dilewati := dilewati || jsonb_build_object('segmen', s.nama, 'sebab', 'Segmen tidak aktif.');
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.wo_inspeksi_item x
               WHERE x.segmen_id = s.segmen_id AND x.status = 'Terbuka' AND x.tier = v_tier) THEN
      dilewati := dilewati || jsonb_build_object('segmen', s.nama, 'sebab', format('Masih terbuka di WO inspeksi Tier %s lain.', v_tier));
      CONTINUE;
    END IF;

    n := n + 1;
    INSERT INTO public.wo_inspeksi_item
      (wo_id, jenis, urutan, ulp, penyulang, segmen_id, objek_nama, panjang_km, panjang_dari, regu)
    VALUES
      (wo, 'JTM', n, s.ulp, s.penyulang, s.segmen_id, s.nama, s.panjang_pakai_km, s.panjang_dari,
       NULLIF(btrim(COALESCE(p_regu ->> s.segmen_id::text, '')), ''))
    RETURNING id INTO item;

    UPDATE public.inspeksi_jtm SET wo_item_id = item, updated_at = now()
    WHERE segmen_id = s.segmen_id AND wo_item_id IS NULL
      AND COALESCE(tier, '1') = v_tier
      AND status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai', 'Ditolak');
  END LOOP;

  IF n = 0 THEN
    RAISE EXCEPTION 'Tidak ada satu pun segmen yang bisa dimasukkan. %',
      COALESCE((SELECT string_agg(d ->> 'segmen' || ': ' || (d ->> 'sebab'), ' | ') FROM jsonb_array_elements(dilewati) d), '');
  END IF;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('wo_inspeksi', judul, unit, 'terbit', NULL,
          jsonb_build_object('wo_id', wo, 'jenis', 'JTM', 'tier', v_tier, 'titik', v_titik, 'item', n, 'target_km', p_target_km),   -- ★ titik
          'sunting_admin', auth.uid(), p_oleh);

  RETURN jsonb_build_object('wo_id', wo, 'nama', judul, 'ulp', unit, 'tier', v_tier, 'titik', v_titik, 'item', n, 'dilewati', dilewati,
    'rencana_km', (SELECT round(COALESCE(sum(panjang_km), 0), 2) FROM public.wo_inspeksi_item WHERE wo_id = wo));
END $fn$;
GRANT EXECUTE ON FUNCTION public.terbitkan_wo_inspeksi_jtm(TEXT, TEXT, NUMERIC, UUID[], DATE, JSONB, TEXT, TEXT, BOOLEAN) TO authenticated;


-- ── 3. Segmen yang sedang di-WO-kan Tier 2 + titik ──────────────────────────
CREATE OR REPLACE FUNCTION public.jtm_tier2_boleh_titik(p_segmen UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.wo_inspeksi_item
                 WHERE segmen_id = p_segmen AND tier = '2' AND titik AND status = 'Terbuka')
$fn$;
COMMENT ON FUNCTION public.jtm_tier2_boleh_titik(UUID) IS
  'Segmen punya item WO Tier 2 + titik yang terbuka: inspeksi Tier 2-nya boleh menitik tiang (26 Okt 2026).';
GRANT EXECUTE ON FUNCTION public.jtm_tier2_boleh_titik(UUID) TO authenticated;


-- ── 4. Penjaga Tier 2 (disalin dari jtm-tier2-malam.sql; ★) ─────────────────
CREATE OR REPLACE FUNCTION public.jtm_tier2_wajib_dititik()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF NEW.tier = '2' AND NOT public.jtm_sudah_dititik(NEW.segmen_id)
     AND NOT public.jtm_tier2_boleh_titik(NEW.segmen_id) THEN   -- ★
    RAISE EXCEPTION 'Inspeksi Tier 2 hanya untuk segmen yang Tier 1-nya sudah disetujui, atau yang ada di WO "Tier 2 + titik". Segmen ini belum dititik — kerjakan Tier 1 dulu, atau minta admin memasukkannya ke WO Tier 2 + titik.';
  END IF;
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.jtm_tier2_tanpa_tiang_baru()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM public.inspeksi_jtm m
             WHERE m.id = NEW.inspeksi_id AND m.tier = '2'
               AND NOT public.jtm_tier2_boleh_titik(m.segmen_id))   -- ★
     AND EXISTS (SELECT 1 FROM public.tiang WHERE id = NEW.tiang_id AND created_at = now()) THEN
    RAISE EXCEPTION 'Inspeksi Tier 2 hanya memakai tiang yang sudah ada — tiang baru tidak bisa ditambahkan. Titik tiang baru lewat inspeksi Tier 1, atau WO "Tier 2 + titik".';
  END IF;
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.wo_item_tier2_dititik()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF NEW.tier = '2' AND NOT NEW.titik   -- ★ mode titik boleh segmen yang belum dititik
     AND NEW.segmen_id IS NOT NULL AND NOT public.jtm_sudah_dititik(NEW.segmen_id) THEN
    RAISE EXCEPTION 'Segmen % belum dititik Tier 1 (belum ada Tier 1 yang disetujui) — tidak bisa masuk WO Tier 2. Pakai WO "Tier 2 + titik".',
      COALESCE((SELECT nama FROM public.segmen WHERE id = NEW.segmen_id), NEW.segmen_id::text);
  END IF;
  RETURN NEW;
END $fn$;


-- ── 5. Sudah dititik: Tier 1, atau Tier 2 + titik, yang disetujui ────────────
-- Disalin dari jtm-pecah-riwayat.sql; ★ = Tier 2 lewat WO + titik ikut.
CREATE OR REPLACE FUNCTION public.jtm_sudah_dititik(p_segmen UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.inspeksi_jtm_milik m
    WHERE m.segmen_id = p_segmen AND m.status = 'Diverifikasi'
      AND (m.tier = '1'
           OR (m.tier = '2' AND EXISTS (   -- ★
                 SELECT 1 FROM public.inspeksi_jtm x
                 JOIN public.wo_inspeksi_item wi ON wi.id = x.wo_item_id
                 WHERE x.id = m.inspeksi_id AND wi.titik))))
$fn$;

CREATE OR REPLACE FUNCTION public.jtm_segmen_dititik(p_ulp TEXT DEFAULT NULL)
RETURNS TABLE (segmen_id UUID)
LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT DISTINCT m.segmen_id FROM public.inspeksi_jtm_milik m
  WHERE m.status = 'Diverifikasi'
    AND (m.tier = '1'
         OR (m.tier = '2' AND EXISTS (   -- ★
               SELECT 1 FROM public.inspeksi_jtm x
               JOIN public.wo_inspeksi_item wi ON wi.id = x.wo_item_id
               WHERE x.id = m.inspeksi_id AND wi.titik)))
    AND (NULLIF(btrim(COALESCE(p_ulp, '')), '') IS NULL OR upper(m.ulp) = upper(p_ulp))
$fn$;


-- ── 6. View membawa `titik` ──────────────────────────────────────────────────
-- `i.*` dibekukan saat view dibuat → dibuat ulang (disalin dari wo-jtm-tier.sql).
DROP VIEW IF EXISTS public.wo_inspeksi_item_status;
CREATE VIEW public.wo_inspeksi_item_status AS
SELECT
  i.*,
  w.nama   AS wo_nama,
  w.tgl_wo,
  m.id     AS inspeksi_id,
  m.status AS inspeksi_status,
  m.petugas_nama AS inspeksi_petugas,
  m.tgl_mulai    AS inspeksi_mulai,
  m.tgl_selesai  AS inspeksi_selesai,
  m.verified_note AS inspeksi_catatan_admin
FROM public.wo_inspeksi_item i
JOIN public.wo_inspeksi w ON w.id = i.wo_id
LEFT JOIN LATERAL (
  SELECT x.* FROM public.inspeksi_jtm x
  WHERE x.wo_item_id = i.id AND x.status <> 'Dibatalkan'
  ORDER BY x.created_at DESC LIMIT 1
) m ON true
WHERE i.jenis = 'JTM';
GRANT SELECT ON public.wo_inspeksi_item_status TO authenticated;

-- Disalin dari wo-daftar-garansi.sql; ★ kolom titik di belakang.
CREATE OR REPLACE VIEW public.wo_inspeksi_capaian AS
SELECT w.id AS wo_id, w.jenis, w.tier, w.ulp, w.nama, w.tgl_wo, w.target_km, w.status, w.created_at,
       count(i.id) FILTER (WHERE i.status <> 'Dibatalkan')                                   AS item,
       count(i.id) FILTER (WHERE i.status = 'Selesai')                                       AS item_selesai,
       round(COALESCE(sum(i.panjang_km) FILTER (WHERE i.status <> 'Dibatalkan'), 0), 2)      AS rencana_km,
       round(COALESCE(sum(i.panjang_km) FILTER (WHERE i.status = 'Selesai'), 0), 2)          AS capaian_km,
       w.titik                                                                               -- ★
FROM public.wo_inspeksi w
LEFT JOIN public.wo_inspeksi_item i ON i.wo_id = w.id
GROUP BY w.id;
GRANT SELECT ON public.wo_inspeksi_capaian TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Periksa:
--   SELECT tier, titik, count(*) FROM wo_inspeksi WHERE jenis = 'JTM' GROUP BY 1, 2;
--   SELECT * FROM wo_inspeksi_item_status LIMIT 1;   -- ada kolom titik
