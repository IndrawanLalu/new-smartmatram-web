-- ════════════════════════════════════════════════════════════════════════════
-- Peta: geser titik BANYAK tiang sekaligus, satu alasan (5 Okt 2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Admin menyeret beberapa tiang di "Mode geser titik", lalu menyimpan semuanya
-- dengan satu alasan. Satu transaksi: semua tergeser, atau tidak satu pun
-- (teknisaplikasi butir 17) — peta tidak pernah setengah terbetulkan.
--
-- Penjaga (hak ULP, tiang aktif, titik sah) dan jejak audit per tiang TIDAK
-- disalin: tiap tiang lewat `geser_titik_tiang` yang sudah ada.
--
-- p_isi = [{ "id": uuid, "lat": number, "lng": number }, …]
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.geser_titik_tiang_banyak(
  p_isi    JSONB,
  p_alasan TEXT,
  p_oleh   TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r     JSONB;
  d     JSONB;
  kode  TEXT;
  hasil JSONB := '[]'::jsonb;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan menggeser titik wajib diisi'; END IF;
  IF p_isi IS NULL OR jsonb_typeof(p_isi) <> 'array' OR jsonb_array_length(p_isi) = 0 THEN
    RAISE EXCEPTION 'Belum ada tiang yang digeser';
  END IF;
  IF jsonb_array_length(p_isi) > 200 THEN
    RAISE EXCEPTION 'Paling banyak 200 tiang sekali simpan';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_isi) LOOP
    BEGIN
      d := public.geser_titik_tiang(
        (r->>'id')::uuid, (r->>'lat')::double precision, (r->>'lng')::double precision, p_alasan, p_oleh);
    EXCEPTION WHEN OTHERS THEN
      -- Sebut tiangnya: "Tiang tidak ditemukan" dari 30 tiang tidak menolong.
      SELECT t.kode INTO kode FROM public.tiang t WHERE t.id = NULLIF(r->>'id', '')::uuid;
      RAISE EXCEPTION '%: % — tidak ada yang tersimpan', COALESCE(kode, 'Satu tiang'), SQLERRM;
    END;
    hasil := hasil || d;
  END LOOP;

  RETURN jsonb_build_object('jumlah', jsonb_array_length(hasil), 'tiang', hasil);
END $fn$;

GRANT EXECUTE ON FUNCTION public.geser_titik_tiang_banyak(JSONB, TEXT, TEXT) TO authenticated;
