-- =============================================================================
-- JTR: asal kabel yang jelas — "langsung dari gardu", usulan, dan terapkan
-- Keputusan user 4 Okt 2026 (kasus AM136: dua jalur JTR berdampingan, di
-- beberapa tiang berbagi batang/underbuild → "kabel belum jelas datang dari
-- mana"). Jalankan manual di Supabase SQL Editor, SESUDAH
-- `jtm-hak-akses-portal.sql`. Idempoten. SQL dulu, baru OTA HP & push web.
--
-- Penyebabnya bukan salah regu: tiap tiang punya SATU induk (urutan regu
-- berjalan), sedangkan di jalur dua kabel, kabel di sebuah tiang bisa datang
-- dari tiang lain — atau langsung dari gardu. Asal per kabel sudah bisa
-- ditunjuk (`induk_tiang_id`), tapi:
--   • "langsung dari gardu" belum bisa dicatat;
--   • tidak ada yang mengusulkan asalnya, jadi regu & admin menebak.
--
--   1. tiang_konduktor.dari_gardu
--   2. tiang_gawang_kabel: kabel dari gardu = tersambung, panjang ke gardu
--   3. simpan_konduktor_tiang menyimpannya (HP lama: nilai lama dipertahankan)
--   4. usul_asal_kabel_jtr(gardu, ulp) — usulan untuk tiap kabel yang belum
--      jelas: tiang terdekat SEJURUSAN yang membawa kabel bernomor sama (bukan
--      tiang di hilirnya), atau gardu bila gardu lebih dekat
--   5. atur_asal_kabel_jtr — admin menerapkan (UP3 / admin ULP), tercatat
-- =============================================================================


-- ── 1. Kolom ─────────────────────────────────────────────────────────────────

ALTER TABLE public.tiang_konduktor
  ADD COLUMN IF NOT EXISTS dari_gardu BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.tiang_konduktor.dari_gardu IS
  'Kabel ini keluar LANGSUNG dari gardu (bukan dari induk tiang / tiang lain). induk_tiang_id diabaikan bila true.';


-- ── 2. tiang_gawang_kabel paham "dari gardu" ────────────────────────────────
-- Disalin dari wo-inspeksi-jtr.sql; kolom & urutannya tidak berubah (view
-- turunan seperti jtr_gawang_terputus & gardu_jtr_panjang ikut benar).

CREATE OR REPLACE VIEW public.tiang_gawang_kabel AS
SELECT t.id AS tiang_id,
    t.kode,
    t.gardu_kode,
    t.ulp,
    t.jurusan,
    k.id AS konduktor_id,
    k.nomor AS nomor_kabel,
    k.jenis,
    k.ukuran,
    CASE WHEN kk.dari_gardu THEN NULL::uuid ELSE COALESCE(k.induk_tiang_id, t.induk_id) END AS hulu_id,
    k.induk_tiang_id IS NOT NULL OR kk.dari_gardu AS hulu_ditunjuk,
    jarak_meter(t.lat::double precision, t.lng::double precision, COALESCE(h.lat::double precision, g.lat), COALESCE(h.lng::double precision, g.lng)) AS panjang_m,
    kk.dari_gardu OR COALESCE(k.induk_tiang_id, t.induk_id) IS NULL OR k.induk_tiang_id IS NOT NULL OR (EXISTS ( SELECT 1
           FROM jtr_kabel kp
          WHERE kp.tiang_id = t.induk_id AND kp.nomor = k.nomor AND kp.gardu = upper(t.gardu_kode))) AS tersambung
   FROM jtr_tiang t
     JOIN jtr_kabel k ON k.tiang_id = t.id AND k.gardu = upper(t.gardu_kode)
     JOIN tiang_konduktor kk ON kk.id = k.id
     LEFT JOIN tiang h ON h.id = CASE WHEN kk.dari_gardu THEN NULL::uuid ELSE COALESCE(k.induk_tiang_id, t.induk_id) END AND h.status_hidup = 'aktif'::text
     LEFT JOIN gardu g ON upper(g.kode) = upper(t.gardu_kode) AND upper(g.ulp) = upper(t.ulp)
  WHERE t.status_hidup = 'aktif'::text AND t.gardu_kode IS NOT NULL;


-- ── 3. simpan_konduktor_tiang menyimpan "dari gardu" ────────────────────────
-- Disalin dari wo-inspeksi-jtr.sql; yang baru bertanda ★.

CREATE OR REPLACE FUNCTION public.simpan_konduktor_tiang(p_tiang_id uuid, p_daftar jsonb, p_nama text DEFAULT NULL::text, p_gardu text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t       RECORD;
  h       RECORD;
  k       JSONB;
  lama    RECORD;
  hulu    UUID;
  no_kabel INT;
  dipakai INT[] := '{}';
  diff    JSONB := '{}'::jsonb;
  v_gardu TEXT;
  pemilik TEXT;   -- NULL = gardu pemilik batang; terisi = gardu yang meminjam
  dari    BOOLEAN;
BEGIN
  SELECT kode, ulp, gardu_kode INTO t FROM public.tiang WHERE id = p_tiang_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang tidak ditemukan'; END IF;

  -- Kabel dicatat PER GARDU. Tanpa p_gardu (aplikasi lama): gardu pemilik
  -- batang, perilaku lama utuh. Dengan p_gardu: batang harus anggota
  -- jaringan gardu itu (milik atau pinjaman), dan hanya kabel gardu itu
  -- yang disentuh — kabel gardu lain di batang yang sama tidak terhapus.
  v_gardu := upper(COALESCE(NULLIF(btrim(p_gardu), ''), t.gardu_kode));
  IF v_gardu IS NULL THEN RAISE EXCEPTION 'Tiang % belum menjadi bagian JTR gardu mana pun', t.kode; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.jtr_tiang j
                 WHERE j.id = p_tiang_id AND upper(j.gardu_kode) = v_gardu AND j.status_hidup = 'aktif') THEN
    RAISE EXCEPTION 'Tiang % bukan bagian jaringan gardu %', t.kode, v_gardu;
  END IF;
  pemilik := CASE WHEN v_gardu = upper(t.gardu_kode) THEN NULL ELSE v_gardu END;
  SELECT kode INTO t.kode FROM public.jtr_tiang j
  WHERE j.id = p_tiang_id AND upper(j.gardu_kode) = v_gardu ORDER BY j.menumpang LIMIT 1;

  FOR k IN SELECT * FROM jsonb_array_elements(COALESCE(p_daftar, '[]'::jsonb)) LOOP
    no_kabel := (k->>'nomor')::int;
    hulu  := NULLIF(k->>'hulu_id', '')::uuid;
    dipakai := dipakai || no_kabel;

    SELECT * INTO lama FROM public.tiang_konduktor
    WHERE tiang_id = p_tiang_id AND nomor = no_kabel
      AND COALESCE(pemilik_gardu_kode, '') = COALESCE(pemilik, '');
    -- ★ "Langsung dari gardu" (jtr-asal-kabel.sql). HP lama tidak mengirim
    -- kuncinya → nilai yang sudah tercatat dipertahankan, supaya koreksi admin
    -- tidak terhapus tiap kali HP lama menyimpan ulang tiangnya.
    dari := CASE WHEN k ? 'dari_gardu' THEN COALESCE((k->>'dari_gardu')::boolean, false)
                 ELSE COALESCE(lama.dari_gardu, false) END;
    IF dari THEN hulu := NULL; END IF;

    IF hulu IS NOT NULL THEN
      IF hulu = p_tiang_id THEN
        RAISE EXCEPTION 'Tiang % tidak bisa jadi asal kabel bagi dirinya sendiri', t.kode;
      END IF;
      SELECT kode, ulp, gardu_kode INTO h FROM public.tiang
      WHERE id = hulu AND status_hidup = 'aktif';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Tiang asal kabel ke-% tidak ditemukan atau sudah tidak aktif', no_kabel;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.jtr_tiang j
                     WHERE j.id = hulu AND upper(j.gardu_kode) = v_gardu
                       AND upper(j.ulp) = upper(t.ulp) AND j.status_hidup = 'aktif') THEN
        RAISE EXCEPTION 'Tiang asal % bukan bagian jaringan gardu yang sama', h.kode;
      END IF;
      -- Cegah dua tiang saling menunjuk: bentangnya akan terhitung dua kali.
      IF EXISTS (
        SELECT 1 FROM public.jtr_kabel x
        WHERE x.tiang_id = hulu AND x.induk_tiang_id = p_tiang_id AND x.gardu = v_gardu
      ) THEN
        RAISE EXCEPTION 'Tiang % sudah menunjuk % sebagai asal kabelnya', h.kode, t.kode;
      END IF;
    END IF;

    IF lama.tiang_id IS NOT NULL THEN
      IF lama.jenis IS DISTINCT FROM (k->>'jenis')
         OR lama.ukuran IS DISTINCT FROM (k->>'ukuran') THEN
        diff := diff || jsonb_build_object(
          'kabel_' || no_kabel,
          jsonb_build_array(
            concat_ws(' ', lama.jenis, lama.ukuran),
            concat_ws(' ', k->>'jenis', k->>'ukuran')));
      END IF;
      IF lama.induk_tiang_id IS DISTINCT FROM hulu OR COALESCE(lama.dari_gardu, false) IS DISTINCT FROM dari THEN
        diff := diff || jsonb_build_object(
          'asal_kabel_' || no_kabel,
          jsonb_build_array(
            CASE WHEN lama.dari_gardu THEN 'gardu' ELSE (SELECT kode FROM public.tiang WHERE id = lama.induk_tiang_id) END,
            CASE WHEN dari THEN 'gardu' ELSE (SELECT kode FROM public.tiang WHERE id = hulu) END));
      END IF;
    END IF;

    INSERT INTO public.tiang_konduktor
      (tiang_id, nomor, jenis, ukuran, kondisi, induk_tiang_id,
       aks_suspension, aks_large_angle, aks_dead_end, foto_temuan, pemilik_gardu_kode, dari_gardu)
    VALUES (p_tiang_id, no_kabel, k->>'jenis', k->>'ukuran', k->>'kondisi', hulu,
            k->>'aks_suspension', k->>'aks_large_angle', k->>'aks_dead_end',
            COALESCE(k->'foto_temuan', '{}'::jsonb), pemilik, dari)
    ON CONFLICT (tiang_id, (COALESCE(pemilik_gardu_kode, '')), nomor) DO UPDATE
      SET jenis           = EXCLUDED.jenis,
          ukuran          = EXCLUDED.ukuran,
          kondisi         = EXCLUDED.kondisi,
          induk_tiang_id  = EXCLUDED.induk_tiang_id,
          dari_gardu      = EXCLUDED.dari_gardu,
          aks_suspension  = EXCLUDED.aks_suspension,
          aks_large_angle = EXCLUDED.aks_large_angle,
          aks_dead_end    = EXCLUDED.aks_dead_end,
          -- Digabung, bukan ditimpa — alasan yang sama dengan `koreksi_tiang`.
          foto_temuan     = public.tiang_konduktor.foto_temuan || EXCLUDED.foto_temuan,
          updated_at      = now();
  END LOOP;

  DELETE FROM public.tiang_konduktor
  WHERE tiang_id = p_tiang_id AND NOT (nomor = ANY (dipakai))
    AND COALESCE(pemilik_gardu_kode, '') = COALESCE(pemilik, '');

  IF diff <> '{}'::jsonb THEN
    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', t.kode, t.ulp, 'konduktor', NULL, diff,
            'koreksi_lapangan', auth.uid(), p_nama);
  END IF;
END $function$;
GRANT EXECUTE ON FUNCTION public.simpan_konduktor_tiang(uuid, jsonb, text, text) TO authenticated;


-- ── 4. Usulan asal kabel ─────────────────────────────────────────────────────
-- Untuk tiap kabel gardu ini yang belum jelas asalnya: calon = tiang SEJURUSAN
-- yang membawa kabel bernomor sama, bukan tiang itu sendiri dan bukan tiang di
-- hilirnya (asal tidak mungkin datang dari hilir). Gardu ikut bersaing sebagai
-- calon; yang terdekat menang. Hanya USULAN — yang memutuskan tetap orang.

CREATE OR REPLACE FUNCTION public.usul_asal_kabel_jtr(p_gardu TEXT, p_ulp TEXT)
RETURNS TABLE (
  tiang_id UUID, tiang_kode TEXT, jurusan TEXT, nomor_kabel INT,
  usul_tiang_id UUID, usul_kode TEXT, usul_dari_gardu BOOLEAN, jarak_m NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE jar AS (
    SELECT DISTINCT ON (j.id) j.id, j.kode, j.induk_id, j.jurusan, j.lat, j.lng
    FROM public.jtr_tiang j
    WHERE upper(j.gardu_kode) = upper(p_gardu) AND upper(j.ulp) = upper(p_ulp) AND j.status_hidup = 'aktif'
    ORDER BY j.id, j.menumpang
  ), putus AS (
    SELECT DISTINCT gk.tiang_id, gk.nomor_kabel, j.kode, j.jurusan, j.lat, j.lng
    FROM public.tiang_gawang_kabel gk
    JOIN jar j ON j.id = gk.tiang_id
    WHERE NOT gk.tersambung AND upper(gk.gardu_kode) = upper(p_gardu) AND upper(gk.ulp) = upper(p_ulp)
  ), hilir AS (
    SELECT p.tiang_id AS akar, p.tiang_id AS id FROM putus p
    UNION
    SELECT h.akar, j.id FROM hilir h JOIN jar j ON j.induk_id = h.id
  ), calon AS (
    SELECT DISTINCT ON (p.tiang_id, p.nomor_kabel)
           p.tiang_id, p.nomor_kabel, j.id AS usul_id, j.kode AS usul_kode,
           public.jarak_meter(p.lat, p.lng, j.lat, j.lng) AS m
    FROM putus p
    JOIN jar j ON j.jurusan IS NOT DISTINCT FROM p.jurusan AND j.lat IS NOT NULL
    JOIN public.jtr_kabel k ON k.tiang_id = j.id AND k.nomor = p.nomor_kabel AND k.gardu = upper(p_gardu)
    WHERE NOT EXISTS (SELECT 1 FROM hilir h WHERE h.akar = p.tiang_id AND h.id = j.id)
    ORDER BY p.tiang_id, p.nomor_kabel, public.jarak_meter(p.lat, p.lng, j.lat, j.lng)
  ), g AS (
    SELECT lat, lng FROM public.gardu
    WHERE upper(kode) = upper(p_gardu) AND upper(ulp) = upper(p_ulp) AND lat IS NOT NULL LIMIT 1
  )
  SELECT p.tiang_id, p.kode, p.jurusan, p.nomor_kabel,
         CASE WHEN dg.m IS NULL OR c.m <= dg.m THEN c.usul_id END,
         CASE WHEN dg.m IS NULL OR c.m <= dg.m THEN c.usul_kode END,
         (dg.m IS NOT NULL AND (c.usul_id IS NULL OR dg.m < c.m)),
         round((CASE WHEN dg.m IS NOT NULL AND (c.usul_id IS NULL OR dg.m < c.m) THEN dg.m ELSE c.m END)::numeric, 0)
  FROM putus p
  LEFT JOIN calon c ON c.tiang_id = p.tiang_id AND c.nomor_kabel = p.nomor_kabel
  LEFT JOIN LATERAL (SELECT public.jarak_meter(p.lat, p.lng, g.lat, g.lng) AS m FROM g) dg ON true
  ORDER BY p.kode, p.nomor_kabel
$$;

GRANT EXECUTE ON FUNCTION public.usul_asal_kabel_jtr(TEXT, TEXT) TO authenticated;


-- ── 5. Menerapkan asal kabel (admin) ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.atur_asal_kabel_jtr(
  p_tiang_id   UUID,
  p_gardu      TEXT,
  p_nomor      INT,
  p_hulu_id    UUID DEFAULT NULL,
  p_dari_gardu BOOLEAN DEFAULT false,
  p_oleh       TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_gardu TEXT := upper(btrim(COALESCE(p_gardu, '')));
  t       RECORD;
  k       RECORD;
  h_kode  TEXT;
  lama    TEXT;
  baru    TEXT;
BEGIN
  SELECT j.id, j.kode, j.ulp INTO t FROM public.jtr_tiang j
  WHERE j.id = p_tiang_id AND upper(j.gardu_kode) = v_gardu AND j.status_hidup = 'aktif'
  ORDER BY j.menumpang LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang bukan bagian jaringan gardu %', v_gardu; END IF;
  PERFORM public.wajib_boleh_ulp(t.ulp);

  -- `jtr_kabel` (k.*) tidak memuat kolom baru — dari_gardu dibaca dari tabelnya.
  SELECT kb.id, kb.induk_tiang_id, tk.dari_gardu INTO k
  FROM public.jtr_kabel kb JOIN public.tiang_konduktor tk ON tk.id = kb.id
  WHERE kb.tiang_id = p_tiang_id AND kb.nomor = p_nomor AND kb.gardu = v_gardu;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang % tidak punya kabel ke-% gardu %', t.kode, p_nomor, v_gardu; END IF;

  IF NOT COALESCE(p_dari_gardu, false) THEN
    IF p_hulu_id IS NULL THEN RAISE EXCEPTION 'Pilih tiang asal kabelnya, atau "langsung dari gardu"'; END IF;
    IF p_hulu_id = p_tiang_id THEN RAISE EXCEPTION 'Tiang % tidak bisa jadi asal kabelnya sendiri', t.kode; END IF;
    SELECT j.kode INTO h_kode FROM public.jtr_tiang j
    WHERE j.id = p_hulu_id AND upper(j.gardu_kode) = v_gardu AND upper(j.ulp) = upper(t.ulp) AND j.status_hidup = 'aktif'
    ORDER BY j.menumpang LIMIT 1;
    IF h_kode IS NULL THEN RAISE EXCEPTION 'Tiang asal bukan bagian jaringan gardu %', v_gardu; END IF;
    -- Dua tiang saling menunjuk = bentang terhitung dua kali.
    IF EXISTS (SELECT 1 FROM public.jtr_kabel x
               WHERE x.tiang_id = p_hulu_id AND x.induk_tiang_id = p_tiang_id AND x.gardu = v_gardu) THEN
      RAISE EXCEPTION 'Tiang % sudah menunjuk % sebagai asal kabelnya', h_kode, t.kode;
    END IF;
  END IF;

  lama := CASE WHEN k.dari_gardu THEN 'gardu' ELSE (SELECT kode FROM public.tiang WHERE id = k.induk_tiang_id) END;
  baru := CASE WHEN p_dari_gardu THEN 'gardu' ELSE h_kode END;

  UPDATE public.tiang_konduktor
  SET induk_tiang_id = CASE WHEN p_dari_gardu THEN NULL ELSE p_hulu_id END,
      dari_gardu     = COALESCE(p_dari_gardu, false),
      updated_at     = now()
  WHERE id = k.id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', t.kode, COALESCE(t.ulp, '-'), 'asal_kabel_' || p_nomor,
          to_jsonb(lama), to_jsonb(baru), 'sunting_admin', auth.uid(), p_oleh);

  RETURN jsonb_build_object('kode', t.kode, 'nomor', p_nomor, 'asal', baru);
END $fn$;

GRANT EXECUTE ON FUNCTION public.atur_asal_kabel_jtr(UUID, TEXT, INT, UUID, BOOLEAN, TEXT) TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT * FROM usul_asal_kabel_jtr('AM136', 'AMPENAN');
--   -- harapan: B3 k1 → gardu · B4 k2 → B2 · B7 k1 → B5 · B8 k2 → B6
