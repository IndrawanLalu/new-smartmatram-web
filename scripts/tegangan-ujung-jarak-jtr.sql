-- =============================================================================
-- Tegangan ujung: jarak dari gardu LEWAT JARINGAN JTR (15 Okt 2026).
-- Jalankan manual di Supabase SQL Editor, SESUDAH `tegangan-ujung-jarak.sql`
-- dan `jtr-jurusan-kabel.sql`. Idempoten, hanya membuat satu fungsi baca.
--
-- Keputusan user: jarak gardu → titik ukur mengikuti kabel JTR (tiang ke tiang),
-- bukan garis lurus dan bukan rute jalan. JTR baru berjalan, jadi banyak gardu
-- yang belum lengkap — fungsi ini SELALU memakai data JTR terkini (tidak
-- disimpan), sehingga angkanya ikut membaik begitu JTR gardunya diinspeksi.
--
-- Cara hitung: titik ukur → tiang JTR gardu itu yang terdekat (garis lurus,
-- `_tiang_jtr_terdekat`) → naik induk demi induk (`tiang_gawang`, baris utama)
-- sampai tiang pangkal → gardu. Panjang tiap gawang = `tiang_gawang.panjang_m`.
-- NULL = gardu belum punya tiang JTR, atau rantainya terputus sebelum gardu.
--
-- Dipanggil per titik dari peta (kartu periksa & popup), tidak lewat view —
-- menghitungnya untuk ratusan baris sekaligus terlalu berat untuk daftar.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.jarak_jtr_ujung(
  p_ulp TEXT, p_gardu TEXT, p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION
)
RETURNS NUMERIC
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d     RECORD;
  r     RECORD;
  v_id  UUID;
  v_m   DOUBLE PRECISION;
  lewat UUID[] := '{}';
BEGIN
  SELECT * INTO d FROM public._tiang_jtr_terdekat(p_ulp, p_gardu, p_lat, p_lng);
  IF d.tiang_id IS NULL THEN RETURN NULL; END IF;
  v_m := d.jarak_m;
  v_id := d.tiang_id;
  LOOP
    SELECT g.induk_id, g.panjang_m INTO r
    FROM public.tiang_gawang g
    WHERE g.tiang_id = v_id AND upper(g.gardu_kode) = upper(p_gardu) AND upper(g.ulp) = upper(p_ulp)
    ORDER BY g.utama DESC NULLS LAST
    LIMIT 1;
    IF NOT FOUND OR r.panjang_m IS NULL THEN RETURN NULL; END IF;   -- terputus / induk tak bertitik
    v_m := v_m + r.panjang_m;
    IF r.induk_id IS NULL THEN RETURN round(v_m::numeric, 0); END IF; -- pangkal: panjang_m = ke gardu
    IF r.induk_id = ANY (lewat) OR cardinality(lewat) > 2000 THEN RETURN NULL; END IF; -- lingkar
    lewat := lewat || v_id;
    v_id := r.induk_id;
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.jarak_jtr_ujung(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

-- Uji (ganti dengan satu titik nyata):
--   SELECT gardu_kode, jurusan, jarak_gardu_m,
--          public.jarak_jtr_ujung(ulp, gardu_kode, lat, lng) AS lewat_jtr
--   FROM public.tegangan_ujung_daftar ORDER BY tgl_ukur DESC LIMIT 20;
