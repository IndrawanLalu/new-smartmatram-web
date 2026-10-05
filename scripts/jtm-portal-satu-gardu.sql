-- ════════════════════════════════════════════════════════════════════════════
-- Gardu portal = SATU gardu, digambar di tengah kedua tiangnya (5 Okt 2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Masalah: tiang kedua portal ikut berpenanda 'gardu', jadi peta menggambar
-- dua gardu untuk satu trafo. Jalannya dua:
--   • HP menyalin isian tiang gardunya (gardu = portal) ke tiang kedua, lalu
--     pemicu `jtm_koreksi_master` menulis penanda 'gardu' dari jawaban itu;
--   • `buat_pasangan_portal` (web) menyalin penanda tiang gardunya.
-- Per 5 Okt: 22 pasang, semuanya bergambar dua gardu.
--
-- Perbaikan: penanda 'gardu' milik tiang PERTAMA saja. Pasangannya dijaga oleh
-- satu pemicu BEFORE di `tiang` — menutup semua jalan sekaligus (kiriman HP,
-- tombol web, sunting manual), tanpa menyentuh fungsi-fungsi yang ada.
-- Peta menggambar gardunya di tengah pasangan lewat kolom baru
-- `peta_tiang.pasangan_portal_dari`.
--
-- Aman dijalankan siang hari: tidak mengubah kiriman HP, hanya penandanya.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Pasangan portal tidak pernah berpenanda gardu ─────────────────────────
CREATE OR REPLACE FUNCTION public.tiang_portal_bukan_gardu()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.pasangan_portal_dari IS NOT NULL AND NEW.penanda = 'gardu' THEN
    NEW.penanda := NULL;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_tiang_portal_bukan_gardu ON public.tiang;
CREATE TRIGGER trg_tiang_portal_bukan_gardu
  BEFORE INSERT OR UPDATE OF penanda, pasangan_portal_dari ON public.tiang
  FOR EACH ROW EXECUTE FUNCTION public.tiang_portal_bukan_gardu();


-- ── 2. Bereskan yang sudah telanjur ──────────────────────────────────────────
UPDATE public.tiang
SET penanda = NULL, updated_at = now()
WHERE pasangan_portal_dari IS NOT NULL AND penanda = 'gardu';


-- ── 3. peta_tiang + pasangan_portal_dari (kolom baru di belakang ★) ──────────
-- Disalin dari `jtr-gardu-lain.sql`; selebihnya tidak berubah.
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
       t.pasangan_portal_dari                                    -- ★
FROM public.tiang t
JOIN public.tiang_kode_penyulang k ON k.tiang_id = t.id
LEFT JOIN public.tiang p ON p.id = t.induk_id AND p.status_hidup = 'aktif'
WHERE t.gardu_kode IS NULL
  AND t.status_hidup = 'aktif' AND t.lat IS NOT NULL AND t.lng IS NOT NULL

UNION ALL

SELECT t.id, t.kode, t.ulp, t.lat, t.lng, t.penanda, t.percabangan,
       'jtm'::text, t.penyulang, t.induk_id, p.lat, p.lng, false,
       NULL::int, false, false, NULL::text, NULL::text,
       t.pasangan_portal_dari                                    -- ★
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
       NULL::uuid                                                -- ★ portal hanya JTM
FROM public.jtr_tiang j
LEFT JOIN public.tiang p ON p.id = j.induk_id AND p.status_hidup = 'aktif'
LEFT JOIN public.gardu g ON upper(g.kode) = upper(j.gardu_kode) AND upper(g.ulp) = upper(j.ulp)
JOIN public.tiang bt ON bt.id = j.id
WHERE j.status_hidup = 'aktif' AND j.lat IS NOT NULL AND j.lng IS NOT NULL;

GRANT SELECT ON public.peta_tiang TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT count(*) FROM tiang WHERE pasangan_portal_dari IS NOT NULL AND penanda = 'gardu';  -- 0
--   SELECT count(*) FROM peta_tiang WHERE pasangan_portal_dari IS NOT NULL;                     -- ±22
