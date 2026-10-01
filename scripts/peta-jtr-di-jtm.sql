-- =============================================================================
-- Peta Jaringan: tandai JTR yang berdiri di tiang JTM
-- Permintaan user 1 Okt 2026. Jalankan manual di Supabase SQL Editor, SESUDAH
-- `peta-koreksi-jtr.sql`. Idempoten.
--
-- `peta_tiang` mendapat kolom `di_jtm` (di BELAKANG — syarat CREATE OR REPLACE
-- VIEW). Saat ini 42 tiang JTR dicatat "ada JTM di atasnya"; belum ada yang
-- tercatat sebagai pinjaman dari batang JTM, tapi keduanya dihitung.
-- Disalin dari `peta-koreksi-jtr.sql`; yang berubah ditandai ★.
-- =============================================================================

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
       false                AS di_jtm
FROM public.tiang t
JOIN public.tiang_kode_penyulang k ON k.tiang_id = t.id
LEFT JOIN public.tiang p ON p.id = t.induk_id AND p.status_hidup = 'aktif'
WHERE t.gardu_kode IS NULL
  AND t.status_hidup = 'aktif' AND t.lat IS NOT NULL AND t.lng IS NOT NULL

UNION ALL

SELECT t.id, t.kode, t.ulp, t.lat, t.lng, t.penanda, t.percabangan,
       'jtm'::text, t.penyulang, t.induk_id, p.lat, p.lng, false,
       NULL::int, false, false
FROM public.tiang t
LEFT JOIN public.tiang p ON p.id = t.induk_id AND p.status_hidup = 'aktif'
WHERE t.gardu_kode IS NULL
  AND t.status_hidup = 'aktif' AND t.lat IS NOT NULL AND t.lng IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.tiang_kode_penyulang k WHERE k.tiang_id = t.id)

UNION ALL

SELECT j.id, j.kode, j.ulp, j.lat, j.lng, j.penanda, j.percabangan,
       'jtr'::text, j.gardu_kode, j.induk_id,
       -- ★ Tiang pertama (tanpa induk) bergaris ke gardunya.
       -- Koordinat gardu double precision, tiang numeric(12,8): disamakan ke
       -- tipe kolom lama view ini (CREATE OR REPLACE tidak boleh mengubahnya).
       (CASE WHEN j.induk_id IS NULL THEN g.lat::numeric ELSE p.lat END)::numeric(12,8),
       (CASE WHEN j.induk_id IS NULL THEN g.lng::numeric ELSE p.lng END)::numeric(12,8),
       j.menumpang,
       -- ★ Kabel JTR gardu ini di tiang ini; ≥2 = underbuild JTR.
       (SELECT count(*)::int FROM public.jtr_kabel kb
         WHERE kb.tiang_id = j.id AND kb.gardu = upper(j.gardu_kode)),
       -- ★ Ada kabel yang belum jelas datang dari tiang mana.
       EXISTS (SELECT 1 FROM public.tiang_gawang_kabel gk
                WHERE gk.tiang_id = j.id AND upper(gk.gardu_kode) = upper(j.gardu_kode) AND NOT gk.tersambung),
       -- ★ JTR di tiang JTM: dicatat regu "ada JTM di atasnya" (underbuild_tm),
       -- atau batang pinjamannya tiang JTM (punya nama di sebuah penyulang).
       COALESCE(j.underbuild_tm, false)
         OR (j.menumpang AND EXISTS (SELECT 1 FROM public.tiang_kode_penyulang kp WHERE kp.tiang_id = j.id))
FROM public.jtr_tiang j
LEFT JOIN public.tiang p ON p.id = j.induk_id AND p.status_hidup = 'aktif'
LEFT JOIN public.gardu g ON upper(g.kode) = upper(j.gardu_kode) AND upper(g.ulp) = upper(j.ulp)
WHERE j.status_hidup = 'aktif' AND j.lat IS NOT NULL AND j.lng IS NOT NULL;

GRANT SELECT ON public.peta_tiang TO authenticated;
