-- ════════════════════════════════════════════════════════════════════════════
-- Pemeriksaan jarak menilai tiang JTM bisa dimatikan (21 Okt 2026)
-- Permintaan user: "jarak menilai tiang buatkan tombol aktif non aktif, non
-- aktif mengabaikan jarak". Berlaku Tier 1 & Tier 2. Idempoten.
-- ════════════════════════════════════════════════════════════════════════════
-- Satu-satunya tempat aturan jarak dibaca = jtm_ambang(): server
-- (_nilai_tiang_jtm_inti: "v_jarak > amb.jarak_maks_nilai_m") DAN HP
-- (getAmbang → jarakMaksM). Saat dimatikan, jtm_ambang mengembalikan batas
-- 99.999 m — kedua pemeriksa lolos tanpa fungsi besar disalin ulang dan tanpa
-- OTA. Nilai jarak di tabel tidak berubah, jadi menyalakan lagi kembali ke
-- angka lama. Jarak petugas tetap tercatat (inspeksi_jtm_titik.jarak_m).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.jtm_settings ADD COLUMN IF NOT EXISTS cek_jarak_nilai BOOLEAN NOT NULL DEFAULT true;
COMMENT ON COLUMN public.jtm_settings.cek_jarak_nilai IS
  'false = jarak regu ke tiang saat menilai tidak diperiksa (jtm_ambang mengembalikan 99.999 m). Diatur dari Pengaturan JTM.';

CREATE OR REPLACE FUNCTION public.jtm_ambang(p_ulp TEXT DEFAULT NULL)
RETURNS public.jtm_settings
LANGUAGE plpgsql STABLE SET search_path = public AS $fn$
DECLARE
  r public.jtm_settings;
BEGIN
  SELECT * INTO r FROM public.jtm_settings
  WHERE ulp = upper(COALESCE(p_ulp, 'ALL')) OR ulp = 'ALL'
  ORDER BY (ulp = 'ALL')   -- baris ULP menang, 'ALL' cuma jatuh-tempat
  LIMIT 1;
  IF FOUND AND NOT r.cek_jarak_nilai THEN
    r.jarak_maks_nilai_m := 99999;
  END IF;
  RETURN r;
END $fn$;
GRANT EXECUTE ON FUNCTION public.jtm_ambang(TEXT) TO authenticated;
