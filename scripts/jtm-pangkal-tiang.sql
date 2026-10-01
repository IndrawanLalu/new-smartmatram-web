-- =============================================================================
-- Rintis: pangkal segmen DIPILIH dari tiang yang sudah ada
-- Keputusan user 1 Okt 2026. Jalankan manual di Supabase SQL Editor, SESUDAH
-- `jtm-batal-segmen.sql`. Idempoten.
--
-- Usulan pangkal = ujung segmen terakhir — salah di simpang: segmen 2 berakhir
-- di LBSM GILI PUTRI (perbatasan), segmen 3 bercabang dari simpang di tengah
-- segmen 1, tapi diusulkan berpangkal di GILI PUTRI. Pangkal yang diketik
-- sendiri tidak menunjuk ke tiang, jadi tiang pertamanya lahir tanpa induk.
--
--   1. `pilihan_pangkal_jtm` — semua tiang aktif penyulang itu, untuk dipilih
--      regu di HP (diurutkan terdekat di HP).
--   2. `rintis_segmen_jtm` — tiang pangkal pilihan diperiksa milik penyulang
--      ini; ujung segmen → label ujung itu; tiang tengah → ditandai percabangan.
--   3. Usulan cepat tidak lagi menawarkan ujung yang sudah dilanjutkan.
-- =============================================================================


-- ── 1. Pilihan tiang pangkal ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pilihan_pangkal_jtm(p_penyulang TEXT, p_ulp TEXT)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'kode'), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'id', t.id,
      'kode', k.kode,
      'lat', t.lat,
      'lng', t.lng,
      'penanda', t.penanda,
      'percabangan', COALESCE(t.percabangan, false),
      'segmen', (SELECT s.nama FROM public.segmen_tiang st JOIN public.segmen s ON s.id = st.segmen_id
                  WHERE st.tiang_id = t.id AND s.status = 'aktif' AND upper(s.penyulang) = upper(p_penyulang)
                  ORDER BY s.created_at LIMIT 1),
      -- Ujung segmen: pangkal barunya memakai label ujung ini.
      'label_ujung', (SELECT public.segmen_label_titik(s.titik_akhir_jenis, s.titik_akhir_nama)
                        FROM public.segmen s
                       WHERE s.titik_akhir_tiang_id = t.id AND s.status = 'aktif'
                         AND upper(s.penyulang) = upper(p_penyulang) AND s.titik_akhir_jenis <> 'UJUNG'
                       ORDER BY COALESCE(s.dikonfirmasi_at, s.created_at) DESC LIMIT 1)
    ) AS x
    FROM public.tiang_kode_penyulang k
    JOIN public.tiang t ON t.id = k.tiang_id
    WHERE upper(k.penyulang) = upper(btrim(p_penyulang))
      AND upper(t.ulp) = upper(btrim(p_ulp))
      AND t.status_hidup = 'aktif'
      AND t.lat IS NOT NULL AND t.lng IS NOT NULL
  ) q;
$fn$;
GRANT EXECUTE ON FUNCTION public.pilihan_pangkal_jtm(TEXT, TEXT) TO authenticated;


-- ── 2 & 3. Disalin dari `jtm-batal-segmen.sql`; yang berubah ditandai ★ ─────
CREATE OR REPLACE FUNCTION public.usul_awal_jtm(
  p_penyulang TEXT,
  p_ulp       TEXT
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_penyulang TEXT := upper(btrim(COALESCE(p_penyulang, '')));
  v_ulp       TEXT := upper(btrim(COALESCE(p_ulp, '')));
  rintis      RECORD;
  akhir       RECORD;
  v_tiang     INT := 0;
  v_selesai   INT := 0;
BEGIN
  IF v_penyulang = '' OR v_ulp = '' THEN
    RAISE EXCEPTION 'Penyulang dan ULP wajib diisi';
  END IF;

  SELECT s.id, s.nama
    INTO rintis
  FROM public.segmen s
  WHERE upper(s.penyulang) = v_penyulang
    AND upper(s.ulp) = v_ulp
    AND s.status = 'aktif'
    AND s.titik_akhir_jenis = 'UJUNG'
    AND s.sumber = 'lapangan'          -- ★ hanya rintisan sungguhan
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF rintis.id IS NOT NULL THEN
    SELECT count(*) INTO v_tiang
    FROM public.segmen_tiang WHERE segmen_id = rintis.id;
  END IF;

  SELECT s.titik_akhir_jenis, s.titik_akhir_nama, s.titik_akhir_tiang_id, s.nama
    INTO akhir
  FROM public.segmen s
  WHERE upper(s.penyulang) = v_penyulang
    AND upper(s.ulp) = v_ulp
    AND s.status = 'aktif'
    AND s.titik_akhir_jenis <> 'UJUNG'
    AND s.sumber IS DISTINCT FROM 'tempelan'   -- ★
    -- ★ Ujung yang sudah jadi pangkal segmen lain tidak diusulkan lagi.
    AND NOT EXISTS (SELECT 1 FROM public.segmen o
                     WHERE o.status = 'aktif' AND o.id <> s.id AND s.titik_akhir_tiang_id IS NOT NULL
                       AND o.titik_awal_tiang_id = s.titik_akhir_tiang_id)
  -- ★ Yang paling akhir DITUTUP, bukan yang paling akhir dibuat: segmen impor
  -- dan tempelan lahir pada detik yang sama, dan urutan dibuat memilih acak.
  ORDER BY COALESCE(s.dikonfirmasi_at, s.created_at) DESC, s.created_at DESC, s.id
  LIMIT 1;

  SELECT count(*) INTO v_selesai
  FROM public.segmen s
  WHERE upper(s.penyulang) = v_penyulang
    AND upper(s.ulp) = v_ulp
    AND s.status = 'aktif'
    AND s.titik_akhir_jenis <> 'UJUNG'
    AND s.sumber IS DISTINCT FROM 'tempelan';   -- ★

  RETURN jsonb_build_object(
    'rintisan_id',    rintis.id,
    'rintisan_nama',  rintis.nama,
    'rintisan_tiang', v_tiang,
    -- NULL di ketiga kolom ini berarti penyulang ini belum punya segmen sama
    -- sekali. Di situ petugaslah yang menentukan pangkalnya — GI, PLTD, atau
    -- gardu induk tempat penyulangnya keluar.
    'awal_jenis',     akhir.titik_akhir_jenis,
    'awal_nama',      akhir.titik_akhir_nama,
    'awal_tiang_id',  akhir.titik_akhir_tiang_id,
    'dari_segmen',    akhir.nama,
    'segmen_selesai', v_selesai
  );
END $$;

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
    v_inspeksi := public.mulai_penyapuan_jtm(rintis.id, p_tier, p_nama);
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
    ELSE
      -- Tiang di tengah segmen yang jadi pangkal = titik percabangan.
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

  v_inspeksi := public.mulai_penyapuan_jtm(v_id, p_tier, p_nama);

  SELECT nama INTO v_nama_jadi FROM public.segmen WHERE id = v_id;

  RETURN jsonb_build_object(
    'segmen_id',   v_id,
    'inspeksi_id', v_inspeksi,
    'nama',        v_nama_jadi,
    'dilanjutkan', false
  );
END $$;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT jsonb_array_length(pilihan_pangkal_jtm('MATARAM', 'AMPENAN'));
--   SELECT usul_awal_jtm('MATARAM', 'AMPENAN');
