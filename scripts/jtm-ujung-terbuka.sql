-- =============================================================================
-- Rintis: usulan pangkal = UJUNG TERDEKAT dengan regu (27 Okt 2026)
-- Jalankan SESUDAH jtm-kirim-otomatis.sql. Idempoten.
--
-- Masalah: segmen yang bercabang punya dua ujung di lapangan, tetapi segmen
-- hanya mencatat SATU (`titik_akhir_tiang_id`, tempat regu menutupnya).
-- `usul_awal_jtm` mengusulkan ujung itu saja — sejauh apa pun regu darinya.
--
--   1. `ujung_terbuka_jtm` — semua ujung penyulang ini yang belum dilanjutkan:
--      tiang anggota segmen selesai yang belum punya anak di penyulang ini dan
--      belum jadi pangkal segmen lain. HP memilih yang TERDEKAT sebagai usulan
--      dan menawarkan sisanya sebagai "Ujung lain". `usul_awal_jtm` tidak
--      diubah — HP versi lama tetap memakainya.
--   2. `rintis_segmen_jtm` (versi jtm-kirim-otomatis.sql, perubahan ditandai ★):
--      tiang pangkal yang belum punya anak tidak ditandai percabangan.
--      ⚠ Versi terbaru rintis_segmen_jtm kini di SINI — salin dari sini bila
--      mengubahnya lagi.
-- =============================================================================


-- ── 1. Ujung yang belum dilanjutkan ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ujung_terbuka_jtm(p_penyulang TEXT, p_ulp TEXT)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH sg AS (
    SELECT s.id, s.nama, s.titik_akhir_tiang_id, s.titik_akhir_jenis, s.titik_akhir_nama,
           COALESCE(s.dikonfirmasi_at, s.created_at) AS waktu
    FROM public.segmen s
    WHERE upper(s.penyulang) = upper(btrim(p_penyulang)) AND upper(s.ulp) = upper(btrim(p_ulp))
      AND s.status = 'aktif' AND s.titik_akhir_jenis <> 'UJUNG'
      AND s.sumber IS DISTINCT FROM 'tempelan'
  ), anggota AS (
    -- Satu baris per tiang: segmen terbaru yang memuatnya.
    SELECT DISTINCT ON (st.tiang_id) st.tiang_id, sg.nama AS segmen
    FROM public.segmen_tiang st JOIN sg ON sg.id = st.segmen_id
    ORDER BY st.tiang_id, sg.waktu DESC
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', t.id, 'kode', k.kode, 'lat', t.lat, 'lng', t.lng, 'segmen', a.segmen,
           'akhir_segmen', ak.titik_akhir_jenis IS NOT NULL,
           -- Jenis & nama pangkal segmen baru: label ujung yang tercatat, kalau
           -- tiang ini ujung segmen; kalau tidak, peralatannya atau kodenya.
           'jenis', COALESCE(ak.titik_akhir_jenis, tt.jenis),
           'nama',  COALESCE(ak.titik_akhir_nama, tt.nama),
           'label', COALESCE(public.segmen_label_titik(ak.titik_akhir_jenis, ak.titik_akhir_nama),
                             public._segmen_label_tiang(lower(t.penanda), NULLIF(btrim(t.nama_peralatan), ''), k.kode))
         ) ORDER BY k.kode), '[]'::jsonb)
  FROM anggota a
  JOIN public.tiang t ON t.id = a.tiang_id AND t.status_hidup = 'aktif' AND t.lat IS NOT NULL AND t.lng IS NOT NULL
  JOIN public.tiang_kode_penyulang k ON k.tiang_id = t.id AND upper(k.penyulang) = upper(btrim(p_penyulang))
  LEFT JOIN LATERAL (
    SELECT sg.titik_akhir_jenis, sg.titik_akhir_nama FROM sg
    WHERE sg.titik_akhir_tiang_id = t.id ORDER BY sg.waktu DESC LIMIT 1) ak ON true
  LEFT JOIN LATERAL public._segmen_titik_tiang(lower(t.penanda), NULLIF(btrim(t.nama_peralatan), ''), k.kode) tt ON true
  -- Belum punya anak di penyulang ini (induk per penyulang, kalau tidak ada: induk batangnya).
  WHERE NOT EXISTS (SELECT 1 FROM public.tiang_kode_penyulang c
                     JOIN public.tiang ct ON ct.id = c.tiang_id AND ct.status_hidup = 'aktif'
                    WHERE upper(c.penyulang) = upper(btrim(p_penyulang)) AND c.induk_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM public.tiang ct
                     JOIN public.tiang_kode_penyulang c ON c.tiang_id = ct.id AND c.induk_id IS NULL
                                                        AND upper(c.penyulang) = upper(btrim(p_penyulang))
                    WHERE ct.induk_id = t.id AND ct.status_hidup = 'aktif')
    -- Belum jadi pangkal segmen lain.
    AND NOT EXISTS (SELECT 1 FROM public.segmen o WHERE o.status = 'aktif' AND o.titik_awal_tiang_id = t.id);
$fn$;
REVOKE ALL ON FUNCTION public.ujung_terbuka_jtm(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ujung_terbuka_jtm(TEXT, TEXT) TO authenticated;


-- ── 2. Rintis (versi jtm-kirim-otomatis.sql; ★ = berubah) ────────────────────
CREATE OR REPLACE FUNCTION public.rintis_segmen_jtm(
  p_penyulang     TEXT,
  p_ulp           TEXT,
  p_jenis_awal    TEXT DEFAULT NULL,
  p_nama_awal     TEXT DEFAULT NULL,
  p_tiang_awal_id UUID DEFAULT NULL,
  p_tier          TEXT DEFAULT '1',
  p_nama          TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_penyulang TEXT := btrim(COALESCE(p_penyulang, ''));
  v_ulp       TEXT := btrim(COALESCE(p_ulp, ''));
  v_jenis     TEXT := upper(btrim(COALESCE(p_jenis_awal, '')));
  v_nama_awal TEXT := btrim(COALESCE(p_nama_awal, ''));
  v_tiang_id  UUID := p_tiang_awal_id;
  rintis      RECORD;
  akhir       RECORD;
  v_id        UUID;
  v_inspeksi  UUID;
  v_nama_jadi TEXT;
BEGIN
  IF v_penyulang = '' OR v_ulp = '' THEN
    RAISE EXCEPTION 'Penyulang dan ULP wajib diisi';
  END IF;

  -- (a) Rintisan yang masih terbuka DILANJUTKAN. Penyapuannya juga: fungsinya
  --     sendiri sudah tahu cara menyambung yang belum selesai.
  SELECT s.id, s.nama INTO rintis
  FROM public.segmen s
  WHERE upper(s.penyulang) = upper(v_penyulang)
    AND upper(s.ulp) = upper(v_ulp)
    AND s.status = 'aktif'
    AND s.titik_akhir_jenis = 'UJUNG'
    AND s.sumber = 'lapangan'          -- ★
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF rintis.id IS NOT NULL THEN
    v_inspeksi := public.mulai_inspeksi_jtm(rintis.id, p_tier, p_nama);
    RETURN jsonb_build_object(
      'segmen_id',   rintis.id,
      'inspeksi_id', v_inspeksi,
      'nama',        rintis.nama,
      'dilanjutkan', true
    );
  END IF;

  -- (b) Pangkal. Kalau petugas tidak menyebutkannya, diambil dari ujung segmen
  --     terakhir penyulang ini.
  IF v_jenis = '' THEN
    SELECT s.titik_akhir_jenis, s.titik_akhir_nama, s.titik_akhir_tiang_id
      INTO akhir
    FROM public.segmen s
    WHERE upper(s.penyulang) = upper(v_penyulang)
      AND upper(s.ulp) = upper(v_ulp)
      AND s.status = 'aktif'
      AND s.titik_akhir_jenis <> 'UJUNG'
      AND s.sumber IS DISTINCT FROM 'tempelan'   -- ★
      -- ★ Ujung yang sudah jadi pangkal segmen lain tidak diusulkan lagi.
      AND NOT EXISTS (SELECT 1 FROM public.segmen o
                       WHERE o.status = 'aktif' AND o.id <> s.id AND s.titik_akhir_tiang_id IS NOT NULL
                         AND o.titik_awal_tiang_id = s.titik_akhir_tiang_id)
    ORDER BY COALESCE(s.dikonfirmasi_at, s.created_at) DESC, s.created_at DESC, s.id
    LIMIT 1;

    IF akhir.titik_akhir_jenis IS NULL THEN
      RAISE EXCEPTION
        'Penyulang % belum punya segmen satu pun. Isi dulu titik awalnya — dari GI, PLTD, atau gardu induk tempat penyulang ini keluar.',
        v_penyulang;
    END IF;

    v_jenis     := akhir.titik_akhir_jenis;
    v_nama_awal := akhir.titik_akhir_nama;
    v_tiang_id  := COALESCE(v_tiang_id, akhir.titik_akhir_tiang_id);
  END IF;

  -- ★ Pangkal = tiang yang DIPILIH regu (simpang, percabangan). Harus tiang
  -- aktif yang punya nama di penyulang ini. Kalau tiang itu ujung segmen,
  -- labelnya ikut ujung itu — satu tempat, satu nama.
  IF p_tiang_awal_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.tiang t JOIN public.tiang_kode_penyulang k ON k.tiang_id = t.id
                    WHERE t.id = p_tiang_awal_id AND t.status_hidup = 'aktif'
                      AND upper(k.penyulang) = upper(v_penyulang)) THEN
      RAISE EXCEPTION 'Tiang pangkal bukan tiang aktif penyulang %', v_penyulang;
    END IF;
    SELECT s.titik_akhir_jenis, s.titik_akhir_nama INTO akhir
      FROM public.segmen s
     WHERE s.titik_akhir_tiang_id = p_tiang_awal_id AND s.status = 'aktif'
       AND upper(s.penyulang) = upper(v_penyulang) AND s.titik_akhir_jenis <> 'UJUNG'
     ORDER BY COALESCE(s.dikonfirmasi_at, s.created_at) DESC
     LIMIT 1;
    IF akhir.titik_akhir_jenis IS NOT NULL THEN
      v_jenis := akhir.titik_akhir_jenis;
      v_nama_awal := akhir.titik_akhir_nama;
    ELSIF EXISTS (SELECT 1 FROM public.tiang_kode_penyulang c
                   JOIN public.tiang ct ON ct.id = c.tiang_id AND ct.status_hidup = 'aktif'
                  WHERE upper(c.penyulang) = upper(v_penyulang)
                    AND (c.induk_id = p_tiang_awal_id OR (c.induk_id IS NULL AND ct.induk_id = p_tiang_awal_id))) THEN
      -- Tiang di tengah segmen yang jadi pangkal = titik percabangan.
      -- ★ 27 Okt: hanya bila tiang itu sudah punya anak di penyulang ini —
      -- ujung cabang (tanpa anak) yang dilanjutkan bukan percabangan.
      UPDATE public.tiang SET percabangan = true, updated_at = now()
       WHERE id = p_tiang_awal_id AND NOT COALESCE(percabangan, false);
      IF FOUND THEN
        INSERT INTO public.master_audit
          (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
        SELECT 'tiang', t.kode, COALESCE(t.ulp, '-'), 'percabangan', 'false'::jsonb, 'true'::jsonb,
               'koreksi_lapangan', auth.uid(), p_nama
          FROM public.tiang t WHERE t.id = p_tiang_awal_id;
      END IF;
    END IF;
  END IF;

  IF NOT public.jtm_jenis_titik_sah(v_jenis) THEN
    RAISE EXCEPTION 'Jenis titik awal "%" tidak dikenal', v_jenis;
  END IF;
  IF v_nama_awal = '' THEN
    RAISE EXCEPTION 'Nama titik awal wajib diisi (misal: GI AMPENAN, atau PLTD TALIWANG)';
  END IF;

  INSERT INTO public.segmen
    (penyulang, ulp,
     titik_awal_jenis,  titik_awal_nama,  titik_awal_tiang_id,
     -- Ujung sengaja dibiarkan terbuka. 'UJUNG' berlabel "UJUNG" selama
     -- namanya kosong, jadi segmennya terbaca `GI AMPENAN - UJUNG` sampai
     -- petugas benar-benar sampai di ujungnya.
     titik_akhir_jenis, titik_akhir_nama, titik_akhir_tiang_id,
     status, sumber)
  VALUES (upper(v_penyulang), upper(v_ulp),
          v_jenis, upper(v_nama_awal), v_tiang_id,
          'UJUNG', '', NULL,
          'aktif', 'lapangan')
  RETURNING id INTO v_id;

  v_inspeksi := public.mulai_inspeksi_jtm(v_id, p_tier, p_nama);

  SELECT nama INTO v_nama_jadi FROM public.segmen WHERE id = v_id;

  RETURN jsonb_build_object(
    'segmen_id',   v_id,
    'inspeksi_id', v_inspeksi,
    'nama',        v_nama_jadi,
    'dilanjutkan', false
  );
END $$;
