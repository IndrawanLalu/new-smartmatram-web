-- ═══════════════════════════════════════════════════════════════════════════
-- WO: Daftar WO + Tambah ke WO berjalan (Inspeksi JTM/JTR) dan MASA GARANSI
-- (rencana-wo-garansi.md F2 + F3, 12 Okt 2026)
--
--   F2  wo_inspeksi_capaian           ringkasan per WO inspeksi (Daftar WO)
--       tambah_wo_inspeksi(...)       tambah segmen/gardu ke WO yang masih Terbit
--   F3  sla_kinerja.garansi_bulan     masa garansi per ULP per jenis (NULL = 1)
--       simpan_sla_kinerja(..., p_garansi)
--       garansi_objek(kunci, ulp, tgl_wo)  objek yang MASIH bergaransi pada bulan WO
--       garansi_item(kunci, ulp)           item WO yang di-WO-kan dalam masa garansi
--
-- Masa garansi dihitung sejak pekerjaan SELESAI; yang belum selesai sejak
-- bulan WO-nya (keputusan user 12 Okt 2026). Hanya PERINGATAN — tidak ada
-- yang ditolak karena garansi.
--
-- Aman dijalankan ulang.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── F2.1 Ringkasan per WO inspeksi ──────────────────────────────────────────
CREATE OR REPLACE VIEW public.wo_inspeksi_capaian AS
SELECT w.id AS wo_id, w.jenis, w.tier, w.ulp, w.nama, w.tgl_wo, w.target_km, w.status, w.created_at,
       count(i.id) FILTER (WHERE i.status <> 'Dibatalkan')                                   AS item,
       count(i.id) FILTER (WHERE i.status = 'Selesai')                                       AS item_selesai,
       round(COALESCE(sum(i.panjang_km) FILTER (WHERE i.status <> 'Dibatalkan'), 0), 2)      AS rencana_km,
       round(COALESCE(sum(i.panjang_km) FILTER (WHERE i.status = 'Selesai'), 0), 2)          AS capaian_km
FROM public.wo_inspeksi w
LEFT JOIN public.wo_inspeksi_item i ON i.wo_id = w.id
GROUP BY w.id;
GRANT SELECT ON public.wo_inspeksi_capaian TO authenticated;


-- ── F2.2 Tambah objek ke WO inspeksi yang masih berjalan ────────────────────
-- Aturan lewati sama dengan terbitkan_wo_inspeksi_jtm/jtr: ULP lain, segmen
-- tidak aktif, atau masih terbuka di WO lain (JTM: tier yang sama).
CREATE OR REPLACE FUNCTION public.tambah_wo_inspeksi(
  p_wo_id     UUID,
  p_objek     TEXT[],
  p_regu      JSONB   DEFAULT '{}'::jsonb,
  p_target_km NUMERIC DEFAULT NULL,
  p_oleh      TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w        RECORD;
  s        RECORD;
  g        RECORD;
  item     UUID;
  urut     INT;
  n        INT := 0;
  dilewati JSONB := '[]'::jsonb;
  lama     NUMERIC;
BEGIN
  SELECT * INTO w FROM public.wo_inspeksi WHERE id = p_wo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WO tidak ditemukan'; END IF;
  PERFORM public.wajib_boleh_ulp(w.ulp);
  IF w.status <> 'Terbit' THEN
    RAISE EXCEPTION 'WO "%" berstatus % — item hanya bisa ditambahkan ke WO yang masih berjalan.', w.nama, w.status;
  END IF;
  IF COALESCE(array_length(p_objek, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Belum ada % yang dipilih', CASE WHEN w.jenis = 'JTM' THEN 'segmen' ELSE 'gardu' END;
  END IF;

  -- Nomor urut MELANJUTKAN yang sudah ada (pola tambah_item_wo_perabasan).
  SELECT COALESCE(max(urutan), 0) INTO urut FROM public.wo_inspeksi_item WHERE wo_id = p_wo_id;

  IF w.jenis = 'JTM' THEN
    FOR s IN SELECT * FROM public.master_segmen WHERE segmen_id::text = ANY(p_objek) ORDER BY penyulang, nama LOOP
      IF upper(s.ulp) <> upper(w.ulp) THEN
        dilewati := dilewati || jsonb_build_object('segmen', s.nama, 'sebab', format('Milik ULP %s, bukan %s.', s.ulp, w.ulp));
        CONTINUE;
      END IF;
      IF s.status <> 'aktif' THEN
        dilewati := dilewati || jsonb_build_object('segmen', s.nama, 'sebab', 'Segmen tidak aktif.');
        CONTINUE;
      END IF;
      IF EXISTS (SELECT 1 FROM public.wo_inspeksi_item x
                 WHERE x.segmen_id = s.segmen_id AND x.status = 'Terbuka' AND x.tier = w.tier) THEN
        dilewati := dilewati || jsonb_build_object('segmen', s.nama, 'sebab', format('Masih terbuka di WO inspeksi Tier %s.', w.tier));
        CONTINUE;
      END IF;

      urut := urut + 1;
      n := n + 1;
      INSERT INTO public.wo_inspeksi_item
        (wo_id, jenis, urutan, ulp, penyulang, segmen_id, objek_nama, panjang_km, panjang_dari, regu)
      VALUES
        (p_wo_id, 'JTM', urut, s.ulp, s.penyulang, s.segmen_id, s.nama, s.panjang_pakai_km, s.panjang_dari,
         NULLIF(btrim(COALESCE(p_regu ->> s.segmen_id::text, '')), ''))
      RETURNING id INTO item;

      UPDATE public.inspeksi_jtm SET wo_item_id = item, updated_at = now()
      WHERE segmen_id = s.segmen_id AND wo_item_id IS NULL
        AND COALESCE(tier, '1') = w.tier
        AND status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai', 'Ditolak');
    END LOOP;
  ELSE
    FOR g IN
      SELECT * FROM public.master_gardu_jtr
      WHERE ulp = upper(w.ulp)
        AND gardu_kode = ANY (SELECT upper(split_part(x, '|', CASE WHEN x LIKE '%|%' THEN 2 ELSE 1 END)) FROM unnest(p_objek) x)
      ORDER BY penyulang NULLS LAST, gardu_kode
    LOOP
      IF EXISTS (SELECT 1 FROM public.wo_inspeksi_item x
                 WHERE x.jenis = 'JTR' AND upper(x.gardu_kode) = g.gardu_kode AND upper(x.ulp) = g.ulp
                   AND x.status = 'Terbuka') THEN
        dilewati := dilewati || jsonb_build_object('gardu', g.gardu_kode, 'sebab', 'Masih terbuka di WO inspeksi lain.');
        CONTINUE;
      END IF;

      urut := urut + 1;
      n := n + 1;
      INSERT INTO public.wo_inspeksi_item
        (wo_id, jenis, urutan, ulp, penyulang, gardu_kode, objek_nama, panjang_km, panjang_dari, regu)
      VALUES
        (p_wo_id, 'JTR', urut, g.ulp, g.penyulang, g.gardu_kode,
         concat_ws(' · ', g.gardu_kode, NULLIF(btrim(g.nama), '')),
         g.panjang_km, CASE WHEN g.panjang_km > 0 THEN 'hitungan' ELSE 'kosong' END,
         NULLIF(btrim(COALESCE(p_regu ->> g.gardu_kode, p_regu ->> (g.ulp || '|' || g.gardu_kode), '')), ''))
      RETURNING id INTO item;

      UPDATE public.inspeksi_jtr SET wo_item_id = item, updated_at = now()
      WHERE upper(gardu_kode) = g.gardu_kode AND upper(ulp) = g.ulp AND wo_item_id IS NULL
        AND status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai', 'Ditolak');
    END LOOP;
  END IF;

  IF n = 0 THEN
    RAISE EXCEPTION 'Tidak ada satu pun % yang bisa ditambahkan. %',
      CASE WHEN w.jenis = 'JTM' THEN 'segmen' ELSE 'gardu' END,
      COALESCE((SELECT string_agg(COALESCE(d ->> 'segmen', d ->> 'gardu') || ': ' || (d ->> 'sebab'), ' | ')
                FROM jsonb_array_elements(dilewati) d), '');
  END IF;

  IF p_target_km IS NOT NULL AND p_target_km IS DISTINCT FROM w.target_km THEN
    lama := w.target_km;
    UPDATE public.wo_inspeksi SET target_km = p_target_km, updated_at = now() WHERE id = p_wo_id;
    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('wo_inspeksi', w.nama, w.ulp, 'target_km', to_jsonb(lama), to_jsonb(p_target_km), 'sunting_admin', auth.uid(), p_oleh);
  END IF;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('wo_inspeksi', w.nama, w.ulp, 'tambah_item', NULL,
          jsonb_build_object('wo_id', p_wo_id, 'jenis', w.jenis, 'tier', w.tier, 'item', n, 'dilewati', dilewati),
          'sunting_admin', auth.uid(), p_oleh);

  RETURN jsonb_build_object('wo_id', p_wo_id, 'nama', w.nama, 'ulp', w.ulp, 'item', n, 'dilewati', dilewati,
    'rencana_km', (SELECT rencana_km FROM public.wo_inspeksi_capaian WHERE wo_id = p_wo_id),
    'target_km',  (SELECT target_km  FROM public.wo_inspeksi         WHERE id    = p_wo_id));
END $$;
GRANT EXECUTE ON FUNCTION public.tambah_wo_inspeksi(UUID, TEXT[], JSONB, NUMERIC, TEXT) TO authenticated;


-- ── F3.1 Masa garansi di SLA ────────────────────────────────────────────────
ALTER TABLE public.sla_kinerja ADD COLUMN IF NOT EXISTS garansi_bulan INT;
ALTER TABLE public.sla_kinerja DROP CONSTRAINT IF EXISTS sla_kinerja_garansi_valid;
ALTER TABLE public.sla_kinerja ADD CONSTRAINT sla_kinerja_garansi_valid
  CHECK (garansi_bulan IS NULL OR garansi_bulan BETWEEN 0 AND 24);
COMMENT ON COLUMN public.sla_kinerja.garansi_bulan IS
  'Masa garansi pekerjaan (bulan) sejak selesai. NULL = 1 bulan. Objek yang di-WO-kan lagi dalam masa ini diberi peringatan, tidak ditolak.';

-- Versi lama (4 argumen) dibuang: dengan p_garansi berbawaan, dua versi
-- membuat panggilan bernama "function is not unique".
DROP FUNCTION IF EXISTS public.simpan_sla_kinerja(TEXT, DATE, JSONB, TEXT);

-- p_isi = {kunci: SLA|null}, p_garansi = {kunci: bulan|null}. Kunci yang hanya
-- ada di salah satunya mewarisi nilai lain yang sedang berlaku, supaya
-- mengubah garansi tidak menghapus SLA (dan sebaliknya).
CREATE OR REPLACE FUNCTION public.simpan_sla_kinerja(
  p_ulp           TEXT,
  p_berlaku_mulai DATE,
  p_isi           JSONB,
  p_oleh          TEXT  DEFAULT NULL,
  p_garansi       JSONB DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  unit  TEXT := upper(btrim(COALESCE(p_ulp, '')));
  awal  DATE := date_trunc('month', p_berlaku_mulai)::date;
  isi   JSONB := COALESCE(p_isi, '{}'::jsonb);
  gar   JSONB := COALESCE(p_garansi, '{}'::jsonb);
  k     TEXT;
  v     JSONB;
  t     NUMERIC;
  gb    INT;
  kini  RECORD;
  n     INT := 0;
BEGIN
  IF unit = '' THEN RAISE EXCEPTION 'ULP belum dipilih'; END IF;
  IF p_berlaku_mulai IS NULL THEN RAISE EXCEPTION 'Bulan berlaku belum dipilih'; END IF;
  PERFORM public.wajib_boleh_ulp(unit);

  FOR k IN SELECT jsonb_object_keys(isi) UNION SELECT jsonb_object_keys(gar) LOOP
    SELECT target, garansi_bulan INTO kini FROM public.sla_kinerja
    WHERE ulp = unit AND kunci = k AND berlaku_mulai <= awal
    ORDER BY berlaku_mulai DESC LIMIT 1;

    IF isi ? k THEN
      v := isi -> k;
      IF jsonb_typeof(v) NOT IN ('number', 'null') THEN RAISE EXCEPTION 'SLA % harus angka.', k; END IF;
      t := CASE WHEN jsonb_typeof(v) = 'null' THEN NULL ELSE (v #>> '{}')::numeric END;
    ELSE
      t := kini.target;
    END IF;

    IF gar ? k THEN
      v := gar -> k;
      IF jsonb_typeof(v) NOT IN ('number', 'null') THEN RAISE EXCEPTION 'Masa garansi % harus angka.', k; END IF;
      gb := CASE WHEN jsonb_typeof(v) = 'null' THEN NULL ELSE (v #>> '{}')::numeric::int END;
    ELSE
      gb := kini.garansi_bulan;
    END IF;

    INSERT INTO public.sla_kinerja (ulp, kunci, berlaku_mulai, target, garansi_bulan, oleh, oleh_uid)
    VALUES (unit, k, awal, t, gb, p_oleh, auth.uid())
    ON CONFLICT (ulp, kunci, berlaku_mulai) DO UPDATE
      SET target = EXCLUDED.target, garansi_bulan = EXCLUDED.garansi_bulan,
          oleh = EXCLUDED.oleh, oleh_uid = EXCLUDED.oleh_uid, updated_at = now();
    n := n + 1;
  END LOOP;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('sla_kinerja', to_char(awal, 'YYYY-MM'), unit, 'sla', NULL,
          jsonb_build_object('sla', isi, 'garansi', gar), 'sunting_admin', auth.uid(), p_oleh);
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.simpan_sla_kinerja(TEXT, DATE, JSONB, TEXT, JSONB) TO authenticated;

-- Masa garansi yang berlaku untuk ULP & jenis itu di bulan tanggal itu.
CREATE OR REPLACE FUNCTION public.garansi_bulan(p_kunci TEXT, p_ulp TEXT, p_tgl DATE)
RETURNS INT LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE((
    SELECT s.garansi_bulan FROM public.sla_kinerja s
    WHERE s.ulp = upper(p_ulp) AND s.kunci = p_kunci
      AND s.berlaku_mulai <= date_trunc('month', p_tgl)::date
    ORDER BY s.berlaku_mulai DESC LIMIT 1), 1);
$$;


-- ── F3.2 Riwayat pekerjaan per objek ─────────────────────────────────────────
-- Satu baris = satu pekerjaan (atau item WO yang belum dikerjakan).
--   objek   segmen_id (perabasan, jtm, jtm2) · 'ULP|KODE' (jtr, hargardu, pengukuran)
--   item_id item WO tempat pekerjaan itu (NULL = di luar WO)
--   dasar   tanggal awal masa garansi: tanggal selesai; belum selesai = bulan WO
-- 25 bulan ke belakang cukup: masa garansi paling lama 24 bulan.
CREATE OR REPLACE FUNCTION public._riwayat_pekerjaan(p_kunci TEXT, p_ulp TEXT)
RETURNS TABLE (objek TEXT, ulp TEXT, item_id UUID, wo_nama TEXT, tgl_wo DATE, dasar DATE, selesai BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  u     TEXT := NULLIF(upper(btrim(COALESCE(p_ulp, ''))), '');
  batas DATE := (date_trunc('month', CURRENT_DATE) - interval '25 months')::date;
  v_tier TEXT := CASE p_kunci WHEN 'jtm2' THEN '2' ELSE '1' END;
BEGIN
  IF p_kunci = 'perabasan' THEN
    RETURN QUERY
      SELECT i.segmen_id::text, upper(i.ulp), i.id, w.nama, w.tgl_wo,
             CASE WHEN i.status IN ('Selesai', 'Diverifikasi') THEN COALESCE(i.tgl_selesai::date, w.tgl_wo) ELSE w.tgl_wo END,
             i.status IN ('Selesai', 'Diverifikasi')
      FROM public.wo_perabasan_item i JOIN public.wo_perabasan w ON w.id = i.wo_id
      WHERE i.status <> 'Dibatalkan' AND w.status <> 'Dibatalkan'
        AND (u IS NULL OR upper(i.ulp) = u) AND w.tgl_wo >= batas;

  ELSIF p_kunci IN ('jtm', 'jtm2') THEN
    RETURN QUERY
      SELECT x.segmen_id::text, upper(x.ulp), x.wo_item_id, w.nama, w.tgl_wo,
             CASE WHEN x.status IN ('Selesai', 'Diverifikasi') AND x.tgl_selesai IS NOT NULL
                  THEN (x.tgl_selesai AT TIME ZONE 'Asia/Makassar')::date
                  ELSE COALESCE(w.tgl_wo, (x.tgl_mulai AT TIME ZONE 'Asia/Makassar')::date) END,
             x.status IN ('Selesai', 'Diverifikasi')
      FROM public.inspeksi_jtm x
      LEFT JOIN public.wo_inspeksi_item it ON it.id = x.wo_item_id
      LEFT JOIN public.wo_inspeksi w ON w.id = it.wo_id
      WHERE x.status <> 'Dibatalkan' AND x.segmen_id IS NOT NULL AND COALESCE(x.tier, '1') = v_tier
        AND (u IS NULL OR upper(x.ulp) = u)
        AND COALESCE(x.tgl_selesai, x.tgl_mulai, x.created_at) >= batas
      UNION ALL
      -- Item WO yang belum diinspeksi sama sekali.
      SELECT it.segmen_id::text, upper(it.ulp), it.id, w.nama, w.tgl_wo, w.tgl_wo, false
      FROM public.wo_inspeksi_item it JOIN public.wo_inspeksi w ON w.id = it.wo_id
      WHERE it.jenis = 'JTM' AND it.tier = v_tier AND it.status = 'Terbuka' AND w.status <> 'Dibatalkan'
        AND (u IS NULL OR upper(it.ulp) = u) AND w.tgl_wo >= batas
        AND NOT EXISTS (SELECT 1 FROM public.inspeksi_jtm x WHERE x.wo_item_id = it.id AND x.status <> 'Dibatalkan');

  ELSIF p_kunci = 'jtr' THEN
    RETURN QUERY
      SELECT upper(x.ulp) || '|' || upper(x.gardu_kode), upper(x.ulp), x.wo_item_id, w.nama, w.tgl_wo,
             CASE WHEN x.status IN ('Selesai', 'Diverifikasi') AND x.tgl_selesai IS NOT NULL
                  THEN x.tgl_selesai::date ELSE COALESCE(w.tgl_wo, x.tgl_mulai::date) END,
             x.status IN ('Selesai', 'Diverifikasi')
      FROM public.inspeksi_jtr x
      LEFT JOIN public.wo_inspeksi_item it ON it.id = x.wo_item_id
      LEFT JOIN public.wo_inspeksi w ON w.id = it.wo_id
      WHERE x.status <> 'Dibatalkan' AND x.gardu_kode IS NOT NULL
        AND (u IS NULL OR upper(x.ulp) = u)
        AND COALESCE(x.tgl_selesai, x.tgl_mulai, x.created_at::date) >= batas
      UNION ALL
      SELECT upper(it.ulp) || '|' || upper(it.gardu_kode), upper(it.ulp), it.id, w.nama, w.tgl_wo, w.tgl_wo, false
      FROM public.wo_inspeksi_item it JOIN public.wo_inspeksi w ON w.id = it.wo_id
      WHERE it.jenis = 'JTR' AND it.status = 'Terbuka' AND w.status <> 'Dibatalkan'
        AND (u IS NULL OR upper(it.ulp) = u) AND w.tgl_wo >= batas
        AND NOT EXISTS (SELECT 1 FROM public.inspeksi_jtr x WHERE x.wo_item_id = it.id AND x.status <> 'Dibatalkan');

  ELSIF p_kunci = 'hargardu' THEN
    RETURN QUERY
      -- Pemeliharaan yang terkirim (di dalam maupun di luar WO).
      SELECT upper(p.ulp) || '|' || upper(p.gardu_kode), upper(p.ulp), r.id, NULL::text, r.tgl_wo,
             (COALESCE(p.tgl_selesai, p.created_at) AT TIME ZONE 'Asia/Makassar')::date, true
      FROM public.pemeliharaan_gardu p
      LEFT JOIN public.wo_hargardu_realisasi r ON r.pemeliharaan_id = p.id
      WHERE p.status IN ('Selesai', 'Diverifikasi')
        AND (u IS NULL OR upper(p.ulp) = u)
        AND COALESCE(p.tgl_selesai, p.created_at) >= batas
      UNION ALL
      -- Item WO yang belum dikerjakan.
      SELECT upper(r.ulp) || '|' || upper(r.gardu_kode), upper(r.ulp), r.id, NULL::text, r.tgl_wo, r.tgl_wo, false
      FROM public.wo_hargardu_realisasi r
      WHERE NOT r.terealisasi AND (u IS NULL OR upper(r.ulp) = u) AND r.tgl_wo >= batas;

  ELSIF p_kunci = 'pengukuran' THEN
    RETURN QUERY
      SELECT upper(COALESCE(r.ulp, g.petugas_unit)) || '|' || upper(g.no_gardu), upper(COALESCE(r.ulp, g.petugas_unit)),
             r.id, NULL::text, r.tgl_wo, g.tanggal_pengukuran::date, true
      FROM public.pengukuran_gardu g
      LEFT JOIN public.wo_pengukuran_realisasi r ON r.pengukuran_id = g.id
      WHERE g.dikembalikan_at IS NULL AND g.no_gardu IS NOT NULL
        AND COALESCE(r.ulp, g.petugas_unit) IS NOT NULL
        AND (u IS NULL OR upper(COALESCE(r.ulp, g.petugas_unit)) = u)
        AND g.tanggal_pengukuran::date >= batas
      UNION ALL
      SELECT upper(r.ulp) || '|' || upper(r.kode_gardu), upper(r.ulp), r.id, NULL::text, r.tgl_wo, r.tgl_wo, false
      FROM public.wo_pengukuran_realisasi r
      WHERE NOT r.terealisasi AND (u IS NULL OR upper(r.ulp) = u) AND r.tgl_wo >= batas;

  ELSE
    RAISE EXCEPTION 'Jenis pekerjaan % tidak dikenal untuk masa garansi.', p_kunci;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._riwayat_pekerjaan(TEXT, TEXT) FROM PUBLIC, anon, authenticated;


-- ── F3.3 Objek yang MASIH bergaransi pada bulan WO (layar Susun WO) ─────────
-- Satu baris per objek: pekerjaan terakhirnya yang garansinya melewati awal
-- bulan WO. Contoh garansi 1 bulan: selesai 20 Sep → s.d. 20 Okt → WO Oktober
-- (1 Okt) diberi peringatan, WO November tidak.
CREATE OR REPLACE FUNCTION public.garansi_objek(p_kunci TEXT, p_ulp TEXT, p_tgl_wo DATE)
RETURNS TABLE (objek TEXT, wo_nama TEXT, tgl_wo DATE, dasar DATE, selesai BOOLEAN, garansi_sampai DATE)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH g AS (SELECT public.garansi_bulan(p_kunci, p_ulp, p_tgl_wo) AS bln)
  SELECT DISTINCT ON (r.objek) r.objek, r.wo_nama, r.tgl_wo, r.dasar, r.selesai,
         (r.dasar + make_interval(months => g.bln))::date
  FROM public._riwayat_pekerjaan(p_kunci, p_ulp) r, g
  WHERE g.bln > 0
    AND (r.dasar + make_interval(months => g.bln))::date > date_trunc('month', p_tgl_wo)::date
  ORDER BY r.objek, r.dasar DESC;
$$;
GRANT EXECUTE ON FUNCTION public.garansi_objek(TEXT, TEXT, DATE) TO authenticated;


-- ── F3.4 Item WO yang di-WO-kan dalam masa garansi (tabel WO) ───────────────
-- Untuk tiap item WO 13 bulan terakhir: pekerjaan LAIN pada objek yang sama,
-- yang sudah ada saat item itu dibuat, dan garansinya masih berjalan di awal
-- bulan WO item itu.
CREATE OR REPLACE FUNCTION public.garansi_item(p_kunci TEXT, p_ulp TEXT)
RETURNS TABLE (item_id UUID, objek TEXT, wo_nama TEXT, tgl_wo DATE, dasar DATE, selesai BOOLEAN, garansi_sampai DATE)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  u    TEXT := NULLIF(upper(btrim(COALESCE(p_ulp, ''))), '');
  v_tier TEXT := CASE p_kunci WHEN 'jtm2' THEN '2' ELSE '1' END;
  awal DATE := (date_trunc('month', CURRENT_DATE) - interval '13 months')::date;
BEGIN
  RETURN QUERY
  WITH it AS (
    -- Item WO beserta objek, bulan WO, dan kapan item itu dibuat.
    SELECT i.id, i.segmen_id::text AS objek, upper(i.ulp) AS ulp, w.tgl_wo, i.created_at::date AS dibuat
    FROM public.wo_perabasan_item i JOIN public.wo_perabasan w ON w.id = i.wo_id
    WHERE p_kunci = 'perabasan' AND i.status <> 'Dibatalkan'
    UNION ALL
    SELECT i.id, i.segmen_id::text, upper(i.ulp), w.tgl_wo, i.created_at::date
    FROM public.wo_inspeksi_item i JOIN public.wo_inspeksi w ON w.id = i.wo_id
    WHERE p_kunci IN ('jtm', 'jtm2') AND i.jenis = 'JTM' AND i.tier = v_tier AND i.status <> 'Dibatalkan'
    UNION ALL
    SELECT i.id, upper(i.ulp) || '|' || upper(i.gardu_kode), upper(i.ulp), w.tgl_wo, i.created_at::date
    FROM public.wo_inspeksi_item i JOIN public.wo_inspeksi w ON w.id = i.wo_id
    WHERE p_kunci = 'jtr' AND i.jenis = 'JTR' AND i.status <> 'Dibatalkan'
    UNION ALL
    SELECT i.id, upper(i.ulp) || '|' || upper(i.gardu_kode), upper(i.ulp), w.tgl_wo, i.created_at::date
    FROM public.wo_hargardu_item i JOIN public.wo_hargardu w ON w.id = i.wo_id
    WHERE p_kunci = 'hargardu'
    UNION ALL
    SELECT i.id, upper(i.ulp) || '|' || upper(i.kode_gardu), upper(i.ulp), w.tgl_wo, i.created_at::date
    FROM public.wo_pengukuran_item i JOIN public.wo_pengukuran w ON w.id = i.wo_id
    WHERE p_kunci = 'pengukuran'
  ),
  r AS (SELECT * FROM public._riwayat_pekerjaan(p_kunci, p_ulp))
  SELECT DISTINCT ON (it.id) it.id, it.objek, r.wo_nama, r.tgl_wo, r.dasar, r.selesai,
         (r.dasar + make_interval(months => public.garansi_bulan(p_kunci, it.ulp, it.tgl_wo)))::date
  FROM it
  JOIN r ON r.objek = it.objek
        AND r.item_id IS DISTINCT FROM it.id
        AND r.dasar <= it.dibuat
        AND (r.dasar + make_interval(months => public.garansi_bulan(p_kunci, it.ulp, it.tgl_wo)))::date > it.tgl_wo
  WHERE it.tgl_wo >= awal AND (u IS NULL OR it.ulp = u)
  ORDER BY it.id, r.dasar DESC;
END $$;
GRANT EXECUTE ON FUNCTION public.garansi_item(TEXT, TEXT) TO authenticated;
