-- ════════════════════════════════════════════════════════════════════════════
-- Kode gardu di tiang JTM (5 Okt 2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Tiang berpenanda gardu belum tahu gardu YANG MANA: kodenya cuma ada di
-- jawaban penilaian `nomor_gardu` ("Am013", "Tj14", "GARDU MM250"), dan tidak
-- terbaca peta maupun panel. Tiang yang ditandai gardu dari web tidak punya
-- kode sama sekali.
--
--   • kolom `tiang.gardu_di_tiang` — kode gardu bentuk Master (AM013);
--   • terisi otomatis dari jawaban nomor_gardu regu (dirapikan; isian berupa
--     kalimat bebas dilewati, admin yang mengisi);
--   • admin mengisi/mengoreksi dari peta (`ubah_atribut_tiang`), boleh kode
--     yang belum ada di Master Gardu (pemutakhiran data);
--   • tiang kedua gardu portal tidak pernah membawa kode — gardunya satu;
--   • `peta_tiang.gardu_di_tiang` untuk label di peta.
--
-- Nama kolom sengaja BUKAN `gardu_kode`: itu sudah dipakai untuk "tiang JTR
-- milik gardu ini", artinya lain sama sekali.
-- Jalankan SESUDAH jtm-portal-satu-gardu.sql.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.tiang ADD COLUMN IF NOT EXISTS gardu_di_tiang TEXT;
COMMENT ON COLUMN public.tiang.gardu_di_tiang IS
  'JTM: kode gardu yang berdiri di tiang ini (bentuk Master, mis. AM013). NULL di tiang kedua gardu portal.';


-- ── 1. Merapikan kode: "Am13" / "GARDU mm250" / "Tj 044" → AM013 / MM250 / TJ044 ──
-- NULL = bukan kode gardu (mis. "Gardu timur puskesmas").
CREATE OR REPLACE FUNCTION public.normal_kode_gardu(p TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN m IS NULL THEN NULL
              ELSE m[1] || lpad(ltrim(m[2], '0'), GREATEST(3, length(ltrim(m[2], '0'))), '0') END
  FROM (SELECT regexp_match(upper(regexp_replace(btrim(COALESCE(p, '')), '^GARDU\s+', '', 'i')),
                            '^([A-Z]{2,3})\s*-?\s*([0-9]{1,4})$') AS m) x
$fn$;


-- ── 2. Tiang kedua portal: bukan gardu, tanpa kode gardu ─────────────────────
CREATE OR REPLACE FUNCTION public.tiang_portal_bukan_gardu()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.pasangan_portal_dari IS NOT NULL THEN
    IF NEW.penanda = 'gardu' THEN NEW.penanda := NULL; END IF;
    NEW.gardu_di_tiang := NULL;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_tiang_portal_bukan_gardu ON public.tiang;
CREATE TRIGGER trg_tiang_portal_bukan_gardu
  BEFORE INSERT OR UPDATE OF penanda, pasangan_portal_dari, gardu_di_tiang ON public.tiang
  FOR EACH ROW EXECUTE FUNCTION public.tiang_portal_bukan_gardu();


-- ── 3. Jawaban nomor gardu regu → tiang ──────────────────────────────────────
-- Pemicu tersendiri, tidak menyentuh `jtm_koreksi_master`. Jawaban yang bukan
-- kode tidak menghapus kode yang sudah ada.
CREATE OR REPLACE FUNCTION public.jtm_nomor_gardu_ke_tiang()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  k TEXT := public.normal_kode_gardu(NEW.nilai);
BEGIN
  IF k IS NOT NULL THEN
    UPDATE public.tiang t SET gardu_di_tiang = k, updated_at = now()
    FROM public.inspeksi_jtm_titik tk
    WHERE tk.id = NEW.titik_id AND t.id = tk.tiang_id
      AND t.gardu_di_tiang IS DISTINCT FROM k;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_jtm_nomor_gardu_ke_tiang ON public.inspeksi_jtm_periksa;
CREATE TRIGGER trg_jtm_nomor_gardu_ke_tiang
  AFTER INSERT OR UPDATE OF nilai ON public.inspeksi_jtm_periksa
  FOR EACH ROW WHEN (NEW.item_kode = 'nomor_gardu')
  EXECUTE FUNCTION public.jtm_nomor_gardu_ke_tiang();


-- ── 4. Isi dari jawaban yang sudah ada (terbaru per tiang) ───────────────────
WITH jawab AS (
  SELECT DISTINCT ON (tk.tiang_id) tk.tiang_id, public.normal_kode_gardu(p.nilai) AS kode
  FROM public.inspeksi_jtm_periksa p
  JOIN public.inspeksi_jtm_titik tk ON tk.id = p.titik_id
  JOIN public.inspeksi_jtm m        ON m.id = tk.inspeksi_id
  WHERE p.item_kode = 'nomor_gardu' AND m.status <> 'Dibatalkan'
    AND public.normal_kode_gardu(p.nilai) IS NOT NULL
  ORDER BY tk.tiang_id, tk.dinilai_at DESC NULLS LAST
)
UPDATE public.tiang t
SET gardu_di_tiang = j.kode, updated_at = now()
FROM jawab j
WHERE t.id = j.tiang_id AND t.status_hidup = 'aktif' AND t.gardu_di_tiang IS NULL;


-- ── 5. ubah_atribut_tiang + gardu_di_tiang (disalin dari peta-sunting.sql; ★) ──
CREATE OR REPLACE FUNCTION public.ubah_atribut_tiang(
  p_id    UUID,
  p_isi   JSONB,
  p_oleh  TEXT DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t      RECORD;
  boleh  TEXT[];
  f      TEXT;
  lama   TEXT;
  baru   TEXT;
  n      INT := 0;
BEGIN
  SELECT * INTO t FROM public.tiang WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang tidak ditemukan'; END IF;
  IF t.status_hidup <> 'aktif' THEN RAISE EXCEPTION 'Tiang % sudah %', t.kode, t.status_hidup; END IF;
  PERFORM public.penyulang_wajib_boleh(t.ulp);

  boleh := CASE WHEN t.gardu_kode IS NULL
                THEN ARRAY['jenis', 'konstruksi', 'nomor_lama', 'penanda', 'gardu_di_tiang']  -- ★
                ELSE ARRAY['jenis', 'tinggi'] END;

  FOR f IN SELECT jsonb_object_keys(COALESCE(p_isi, '{}'::jsonb)) LOOP
    IF NOT (f = ANY (boleh)) THEN
      RAISE EXCEPTION 'Isian "%" tidak bisa diubah dari peta', f;
    END IF;
    baru := NULLIF(btrim(COALESCE(p_isi->>f, '')), '');

    IF f = 'penanda' AND baru IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.jtm_ref WHERE kategori = 'penanda' AND kode = baru AND aktif) THEN
      RAISE EXCEPTION 'Penanda "%" tidak dikenal', baru;
    END IF;
    -- ★ Kode gardu: dirapikan ke bentuk Master (Am13 → AM013). Kode baru yang
    -- belum ada di Master tetap boleh — pemutakhiran data dimulai dari sini.
    IF f = 'gardu_di_tiang' AND baru IS NOT NULL THEN
      IF public.normal_kode_gardu(baru) IS NULL THEN
        RAISE EXCEPTION 'Kode gardu "%" tidak sah — tulis seperti AM013', baru;
      END IF;
      baru := public.normal_kode_gardu(baru);
    END IF;
    IF f = 'tinggi' AND baru IS NOT NULL AND baru !~ '^[0-9]+([.,][0-9]+)?$' THEN
      RAISE EXCEPTION 'Tinggi tiang harus angka meter';
    END IF;

    EXECUTE format('SELECT (%I)::text FROM public.tiang WHERE id = $1', f) INTO lama USING p_id;
    IF lama IS NOT DISTINCT FROM baru
       OR (f = 'tinggi' AND lama IS NOT NULL AND baru IS NOT NULL
           AND lama::numeric = replace(baru, ',', '.')::numeric) THEN
      CONTINUE;
    END IF;

    IF f = 'tinggi' THEN
      UPDATE public.tiang SET tinggi = replace(baru, ',', '.')::numeric, updated_at = now() WHERE id = p_id;
    ELSE
      EXECUTE format('UPDATE public.tiang SET %I = $1, updated_at = now() WHERE id = $2', f) USING baru, p_id;
    END IF;

    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', COALESCE(t.kode, p_id::text), COALESCE(t.ulp, '-'), f,
            to_jsonb(lama), jsonb_build_object('nilai', baru, 'lewat', 'peta'),
            'sunting_admin', auth.uid(), p_oleh);
    n := n + 1;
  END LOOP;

  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.ubah_atribut_tiang(UUID, JSONB, TEXT) TO authenticated;


-- ── 6. peta_tiang + gardu_di_tiang (disalin dari jtm-portal-satu-gardu.sql; ★) ──
CREATE OR REPLACE VIEW public.peta_tiang AS
SELECT t.id,
       k.kode,
       t.ulp,
       t.lat,
       t.lng,
       t.penanda,
       t.percabangan,
       'jtm'::text          AS jaringan,
       k.penyulang          AS induk_kelompok,
       t.induk_id,
       p.lat                AS induk_lat,
       p.lng                AS induk_lng,
       NOT k.utama          AS menumpang,
       NULL::int            AS jumlah_kabel,
       false                AS kabel_putus,
       false                AS di_jtm,
       NULL::text           AS gardu_bersama,
       NULL::text           AS nomor_kabel,
       t.pasangan_portal_dari,
       t.gardu_di_tiang                                          -- ★
FROM public.tiang t
JOIN public.tiang_kode_penyulang k ON k.tiang_id = t.id
LEFT JOIN public.tiang p ON p.id = t.induk_id AND p.status_hidup = 'aktif'
WHERE t.gardu_kode IS NULL
  AND t.status_hidup = 'aktif' AND t.lat IS NOT NULL AND t.lng IS NOT NULL

UNION ALL

SELECT t.id, t.kode, t.ulp, t.lat, t.lng, t.penanda, t.percabangan,
       'jtm'::text, t.penyulang, t.induk_id, p.lat, p.lng, false,
       NULL::int, false, false, NULL::text, NULL::text,
       t.pasangan_portal_dari,
       t.gardu_di_tiang                                          -- ★
FROM public.tiang t
LEFT JOIN public.tiang p ON p.id = t.induk_id AND p.status_hidup = 'aktif'
WHERE t.gardu_kode IS NULL
  AND t.status_hidup = 'aktif' AND t.lat IS NOT NULL AND t.lng IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.tiang_kode_penyulang k WHERE k.tiang_id = t.id)

UNION ALL

SELECT j.id, j.kode, j.ulp, j.lat, j.lng, j.penanda, j.percabangan,
       'jtr'::text, j.gardu_kode, j.induk_id,
       (CASE WHEN j.induk_id IS NULL THEN g.lat::numeric ELSE p.lat END)::numeric(12,8),
       (CASE WHEN j.induk_id IS NULL THEN g.lng::numeric ELSE p.lng END)::numeric(12,8),
       j.menumpang,
       (SELECT count(*)::int FROM public.jtr_kabel kb
         WHERE kb.tiang_id = j.id AND kb.gardu = upper(j.gardu_kode)),
       EXISTS (SELECT 1 FROM public.tiang_gawang_kabel gk
                WHERE gk.tiang_id = j.id AND upper(gk.gardu_kode) = upper(j.gardu_kode) AND NOT gk.tersambung),
       COALESCE(j.underbuild_tm, false)
         OR (j.menumpang AND EXISTS (SELECT 1 FROM public.tiang_kode_penyulang kp WHERE kp.tiang_id = j.id)),
       NULLIF(concat_ws(', ',
         (SELECT string_agg(DISTINCT upper(o.gardu_kode), ', ') FROM public.jtr_tiang o
           WHERE o.id = j.id AND upper(o.gardu_kode) <> upper(j.gardu_kode) AND o.status_hidup = 'aktif'),
         CASE
           WHEN NOT bt.jtr_gardu_lain THEN NULL
           WHEN bt.jtr_gardu_lain_kode IS NULL THEN
             CASE WHEN NOT EXISTS (SELECT 1 FROM public.jtr_tiang o2
                                    WHERE o2.id = j.id AND upper(o2.gardu_kode) <> upper(j.gardu_kode) AND o2.status_hidup = 'aktif')
                  THEN '?' END
           WHEN upper(bt.jtr_gardu_lain_kode) <> upper(j.gardu_kode)
                AND NOT EXISTS (SELECT 1 FROM public.jtr_tiang o2
                                 WHERE o2.id = j.id AND upper(o2.gardu_kode) = upper(bt.jtr_gardu_lain_kode) AND o2.status_hidup = 'aktif')
             THEN upper(bt.jtr_gardu_lain_kode)
         END), ''),
       (SELECT string_agg(kb.nomor::text, ',' ORDER BY kb.nomor) FROM public.jtr_kabel kb
         WHERE kb.tiang_id = j.id AND kb.gardu = upper(j.gardu_kode)),
       NULL::uuid,
       NULL::text                                                -- ★ gardu di tiang: JTM saja
FROM public.jtr_tiang j
LEFT JOIN public.tiang p ON p.id = j.induk_id AND p.status_hidup = 'aktif'
LEFT JOIN public.gardu g ON upper(g.kode) = upper(j.gardu_kode) AND upper(g.ulp) = upper(j.ulp)
JOIN public.tiang bt ON bt.id = j.id
WHERE j.status_hidup = 'aktif' AND j.lat IS NOT NULL AND j.lng IS NOT NULL;

GRANT SELECT ON public.peta_tiang TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT normal_kode_gardu('Am13'), normal_kode_gardu('GARDU MM250'), normal_kode_gardu('Tj 044'),
--          normal_kode_gardu('Gardu timur puskesmas');          -- AM013 · MM250 · TJ044 · NULL
--   SELECT count(*) FROM tiang WHERE penanda = 'gardu' AND gardu_di_tiang IS NULL;   -- sisa diisi admin
