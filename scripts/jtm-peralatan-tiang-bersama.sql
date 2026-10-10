-- =============================================================================
-- Peralatan & gardu di tiang bersama (10 Okt 2026)
-- Rencana: rencana-peralatan-tiang-bersama.md
--
-- Satu tiang bisa dipakai dua penyulang (menumpang). Penanda tiang (gardu, LBS,
-- FCO, …) disimpan PER TIANG, jadi selama ini tampil di peta dan terhitung di
-- Rekap Data pada KEDUA penyulang. Satu peralatan = satu pemilik:
--
--   gardu        → penyulang di master gardu (feeder), bila salah satu penyulang
--                  tiang itu; selain itu pemilik tiang
--   pertemuan    → peralatan hubung tempat kabel penyulang lain BERAKHIR (KONCO,
--                  Sampoerna): tampil di SEMUA penyulang tiang itu, dihitung
--                  sekali di pemilik tiang
--   dipilih      → peralatan lain: penyulang yang dipilih admin di peta
--                  (`tiang.penanda_penyulang`)
--   belum        → belum dipilih: tampil di semua dengan tanda "?", sementara
--                  dihitung di pemilik tiang
--
-- Tiang yang hanya satu penyulang TIDAK masuk view ini — tetap seperti dulu.
-- Pemakai yang tidak menemukan barisnya menganggap tampil & hitung = benar.
--
-- Jalankan SEBELUM scripts/jtm-rekap-data.sql (rekap memakai view ini).
-- =============================================================================

ALTER TABLE public.tiang ADD COLUMN IF NOT EXISTS penanda_penyulang TEXT;

COMMENT ON COLUMN public.tiang.penanda_penyulang IS
  'Tiang bersama: penyulang pemilik peralatan (non-gardu) di tiang ini. NULL = belum dipilih / tiang satu penyulang.';


-- ── 1. Pemilik penanda per (tiang, penyulang) ────────────────────────────────

CREATE OR REPLACE VIEW public.jtm_pemilik_penanda AS
WITH bersama AS (
  SELECT t.id, t.kode, t.ulp, lower(t.penanda) AS penanda, t.penanda_penyulang,
         upper(NULLIF(btrim(t.gardu_di_tiang), '')) AS gardu_kode,
         COALESCE((SELECT k.penyulang FROM tiang_kode_penyulang k
                    WHERE k.tiang_id = t.id AND k.utama LIMIT 1), t.penyulang) AS pemilik_tiang
  FROM tiang t
  WHERE t.status_hidup = 'aktif' AND t.gardu_kode IS NULL AND t.penanda IS NOT NULL
    AND (SELECT count(*) FROM tiang_kode_penyulang k WHERE k.tiang_id = t.id) >= 2
), baris AS (
  SELECT b.*, k.penyulang, k.utama,
         -- Kabel penyulang penumpang BERAKHIR di tiang ini: tidak ada tiang aktif
         -- penyulang itu yang induknya (di penyulang itu) tiang ini. Sama dengan
         -- jtm_induk_di_penyulang(c, p) = b.id, dipecah supaya fungsi pendaki
         -- hanya dipanggil untuk tiang yang induk batangnya bukan anggota p.
         NOT k.utama AND NOT EXISTS (
           SELECT 1
           FROM tiang_kode_penyulang ck
           JOIN tiang c ON c.id = ck.tiang_id AND c.status_hidup = 'aktif'
           WHERE upper(ck.penyulang) = upper(k.penyulang) AND ck.tiang_id <> b.id
             AND (ck.induk_id = b.id
                  OR (ck.induk_id IS NULL AND c.induk_id = b.id)
                  OR (ck.induk_id IS NULL AND c.induk_id IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM tiang_kode_penyulang x
                                       WHERE x.tiang_id = c.induk_id AND upper(x.penyulang) = upper(k.penyulang))
                      AND public.jtm_leluhur_di_penyulang(c.induk_id, k.penyulang) = b.id))
         ) AS berakhir
  FROM bersama b
  JOIN tiang_kode_penyulang k ON k.tiang_id = b.id
), per_tiang AS (
  SELECT r.id,
         bool_or(r.berakhir) AND min(r.penanda) <> 'gardu' AS pertemuan,
         -- Gardu: penyulang tiang ini yang cocok dengan feeder di master gardu.
         (SELECT r2.penyulang FROM baris r2
           JOIN gardu g ON upper(g.kode) = r2.gardu_kode
          WHERE r2.id = r.id AND upper(btrim(COALESCE(g.feeder, ''))) = upper(r2.penyulang)
          LIMIT 1) AS gardu_feeder,
         -- Pilihan admin, hanya bila masih salah satu penyulang tiang ini.
         (SELECT r3.penyulang FROM baris r3
          WHERE r3.id = r.id AND upper(r3.penyulang) = upper(r3.penanda_penyulang)
          LIMIT 1) AS dipilih
  FROM baris r
  GROUP BY r.id
), pemilik AS (
  SELECT b.id, b.pemilik_tiang,
         CASE WHEN b.penanda = 'gardu' THEN 'gardu'
              WHEN p.pertemuan THEN 'pertemuan'
              WHEN p.dipilih IS NOT NULL THEN 'dipilih'
              ELSE 'belum' END AS status,
         CASE WHEN b.penanda = 'gardu' THEN COALESCE(p.gardu_feeder, b.pemilik_tiang)
              WHEN p.pertemuan THEN b.pemilik_tiang
              ELSE COALESCE(p.dipilih, b.pemilik_tiang) END AS pemilik
  FROM bersama b
  JOIN per_tiang p ON p.id = b.id
)
SELECT r.id AS tiang_id,
       r.kode,
       r.ulp,
       r.penyulang,
       r.penanda,
       pm.status,
       pm.pemilik,
       -- Tampil di lapisan penyulang ini?
       (pm.status IN ('pertemuan', 'belum') OR upper(r.penyulang) = upper(pm.pemilik)) AS tampil,
       -- Dihitung di penyulang ini? Selalu tepat satu penyulang per tiang.
       (upper(r.penyulang) = upper(pm.pemilik)) AS hitung
FROM baris r
JOIN pemilik pm ON pm.id = r.id;

COMMENT ON VIEW public.jtm_pemilik_penanda IS
  'Tiang bersama berpenanda: per penyulang, apakah penanda (gardu/peralatan) tampil & dihitung di penyulang itu. status: gardu | pertemuan | dipilih | belum.';

GRANT SELECT ON public.jtm_pemilik_penanda TO authenticated;


-- ── 2. Admin memilih pemilik peralatan (panel tiang di peta) ─────────────────

CREATE OR REPLACE FUNCTION public.atur_pemilik_peralatan(
  p_tiang_id  UUID,
  p_penyulang TEXT,
  p_oleh      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t     RECORD;
  nama  TEXT;
BEGIN
  SELECT * INTO t FROM public.tiang WHERE id = p_tiang_id;
  IF NOT FOUND OR t.status_hidup <> 'aktif' THEN RAISE EXCEPTION 'Tiang tidak ditemukan atau sudah dibatalkan'; END IF;
  PERFORM public.penyulang_wajib_boleh(t.ulp);

  IF t.penanda IS NULL OR lower(t.penanda) = 'gardu' THEN
    RAISE EXCEPTION 'Tiang % tidak berperalatan (gardu mengikuti penyulang di master gardu)', t.kode;
  END IF;

  IF p_penyulang IS NOT NULL THEN
    SELECT k.penyulang INTO nama FROM public.tiang_kode_penyulang k
     WHERE k.tiang_id = p_tiang_id AND upper(k.penyulang) = upper(p_penyulang);
    IF nama IS NULL THEN
      RAISE EXCEPTION 'Penyulang % tidak melewati tiang %', p_penyulang, t.kode;
    END IF;
  END IF;

  UPDATE public.tiang SET penanda_penyulang = nama, updated_at = now() WHERE id = p_tiang_id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', t.kode, COALESCE(t.ulp, '-'), 'pemilik_peralatan',
          to_jsonb(t.penanda_penyulang), to_jsonb(nama), 'sunting_admin', auth.uid(), p_oleh);

  RETURN jsonb_build_object('kode', t.kode, 'penyulang', nama);
END $$;

REVOKE ALL ON FUNCTION public.atur_pemilik_peralatan(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atur_pemilik_peralatan(UUID, TEXT, TEXT) TO authenticated;


-- ── 3. Isi awal: FCO Seksi GNS-033 milik AMPENAN (keputusan user 10 Okt) ─────

WITH x AS (
  SELECT t.id, t.kode, t.ulp, t.penanda_penyulang AS lama, k.penyulang AS baru
  FROM public.tiang t
  JOIN public.tiang_kode_penyulang k ON k.tiang_id = t.id AND upper(k.penyulang) = 'AMPENAN'
  WHERE t.kode = 'GNS-033' AND t.status_hidup = 'aktif' AND lower(t.penanda) = 'fco'
    AND t.penanda_penyulang IS DISTINCT FROM k.penyulang
), u AS (
  UPDATE public.tiang t SET penanda_penyulang = x.baru, updated_at = now()
  FROM x WHERE t.id = x.id
  RETURNING x.*
)
INSERT INTO public.master_audit
  (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
SELECT 'tiang', u.kode, COALESCE(u.ulp, '-'), 'pemilik_peralatan', to_jsonb(u.lama), to_jsonb(u.baru),
       'sunting_admin', NULL, 'skrip jtm-peralatan-tiang-bersama (10 Okt 2026)'
FROM u;


-- ── Periksa ──────────────────────────────────────────────────────────────────
-- SELECT kode, penyulang, penanda, status, pemilik, tampil, hitung
-- FROM jtm_pemilik_penanda ORDER BY kode, penyulang;
-- Harapan (10 Okt): AMP-002R104 & PRM-024R008 = pertemuan (tampil di keduanya);
-- GNS-014/017/018 = gardu milik AMPENAN; GNS-033 = dipilih AMPENAN;
-- GNS-008 & GNS-026 = belum (milik sementara GUNUNG SARI).
