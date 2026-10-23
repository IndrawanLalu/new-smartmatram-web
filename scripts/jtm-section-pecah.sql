-- =============================================================================
-- X3 — Pecah / Gabung segmen di dalam section + nama segmen bebas (23 Okt 2026)
-- Rencana: rencana-section-segmen.md. Jalankan SESUDAH jtm-section.sql.
-- Idempoten (aman diulang).
--
--   • segmen.nama_bebas — nama yang DIKETIK admin (pecah, gabung, ubah nama)
--     tidak lagi ditimpa `segmen_susun_nama` saat titik ujungnya berubah.
--   • pecah_segmen(segmen, titik potong[], nama, uji) — memotong satu segmen di
--     tiang-tiang yang diklik. Potongan pertama (yang memuat pangkal segmen)
--     TETAP segmen lama — id-nya, jadi inspeksi & WO lama tetap menempel di
--     sana; potongan lain jadi segmen baru. Tiang potong ikut di kedua sisi
--     (ujung potongan hulu = pangkal potongan hilir), sama dengan segmen
--     REC→REC yang sudah ada.
--   • gabung_segmen_section(a, b, nama, uji) — dua segmen bersebelahan di
--     satu section jadi satu; yang di hulu dipertahankan (gabung_segmen lama).
--   • ubah_nama_segmen — kini untuk semua segmen, bukan hanya impor/tempelan.
--
-- Penjaga "tetap satu section": tiap potongan / hasil gabung hanya boleh berisi
-- tiang satu section. Tiang keypoint di ujung (hulu section berikutnya) tidak
-- dihitung — aturan yang sama dengan view segmen_section / segmen_lintas_section.
-- Penjaga ini HANYA di pecah & gabung. Segmen yang dirintis regu dari HP tidak
-- ditolak (penyapuan di lapangan tidak boleh terhenti karena aturan peta);
-- yang melewati keypoint tetap tampil di laporan segmen_lintas_section.
--
-- Ditolak selama segmennya masih diinspeksi (Dijadwalkan / Dalam Proses) atau
-- masih dirintis regu — regu di lapangan sedang memegang daftar tiangnya.
-- =============================================================================


-- ── 1. Nama bebas ────────────────────────────────────────────────────────────
ALTER TABLE public.segmen ADD COLUMN IF NOT EXISTS nama_bebas BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.segmen.nama_bebas IS
  'true = nama diketik admin (pecah/gabung/ubah nama di peta) — segmen_susun_nama tidak menyusunnya ulang dari titik ujung.';

-- Disalin dari `segmen-nama-tempel.sql`; satu perubahan (★).
CREATE OR REPLACE FUNCTION public.segmen_susun_nama()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  induk_id UUID;
BEGIN
  -- Segmen yang namanya DITULIS orang (tempelan WO, impor) menyimpan nama itu.
  -- Yang lahir dari titik ujung (manual, lapangan) tetap disusun di sini.
  -- ★ Juga segmen yang namanya diketik admin di peta (nama_bebas).
  IF NOT ((NEW.sumber IN ('tempelan', 'impor') OR NEW.nama_bebas) AND COALESCE(btrim(NEW.nama), '') <> '') THEN
    NEW.nama := public.segmen_label_titik(NEW.titik_awal_jenis, NEW.titik_awal_nama)
                || ' - ' ||
                public.segmen_label_titik(NEW.titik_akhir_jenis, NEW.titik_akhir_nama);
  END IF;

  IF NEW.titik_awal_tiang_id IS NOT NULL THEN
    SELECT s.id INTO induk_id
    FROM public.segmen_tiang st
    JOIN public.segmen s ON s.id = st.segmen_id
    WHERE st.tiang_id = NEW.titik_awal_tiang_id
      AND s.status = 'aktif'
      AND upper(s.penyulang) = upper(NEW.penyulang)
      AND s.id IS DISTINCT FROM NEW.id
    ORDER BY s.created_at
    LIMIT 1;

    NEW.induk_segmen_id := induk_id;
  ELSE
    NEW.induk_segmen_id := NULL;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;


-- ── 2. Pohon tiang beberapa segmen ───────────────────────────────────────────
-- Mengisi _sg_simpul: tiang segmen-segmen itu + induknya DI DALAM himpunan
-- (pohon penamaan penyulang; kalau induk langsungnya tidak ada di segmen, naik
-- sampai leluhur yang ada — celah tiang tidak memutus pohonnya), section-nya,
-- dan kedalaman dari pangkal himpunan.
CREATE OR REPLACE FUNCTION public._segmen_simpul(p_segmen UUID[])
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_p TEXT; v_u TEXT;
  r RECORD; naik UUID; n INT;
BEGIN
  SELECT upper(penyulang), upper(ulp) INTO v_p, v_u FROM public.segmen WHERE id = p_segmen[1];

  -- Section penyulang ini harus terkini sebelum dipakai menilai.
  IF EXISTS (SELECT 1 FROM public.penyulang_section WHERE penyulang = v_p AND ulp = v_u AND kotor) THEN
    PERFORM public.susun_section_penyulang(v_p, v_u);
  END IF;

  DROP TABLE IF EXISTS _sg_simpul;
  CREATE TEMP TABLE _sg_simpul (
    id UUID PRIMARY KEY, induk UUID, induk_langsung UUID, lat DOUBLE PRECISION, lng DOUBLE PRECISION,
    kode TEXT, penanda TEXT, nama_alat TEXT,
    di_a BOOLEAN NOT NULL DEFAULT false, di_b BOOLEAN NOT NULL DEFAULT false,
    section_id UUID, section_nama TEXT, hulu_section BOOLEAN NOT NULL DEFAULT false,
    keypoint BOOLEAN NOT NULL DEFAULT false,
    dalam INT, bagian INT
  ) ON COMMIT DROP;

  INSERT INTO _sg_simpul (id, induk, lat, lng, kode, penanda, nama_alat, di_a, di_b)
  SELECT t.id,
         COALESCE(kp.induk_id, public.jtm_leluhur_di_penyulang(t.induk_id, v_p)),
         t.lat, t.lng, COALESCE(kp.kode, t.kode), lower(t.penanda), NULLIF(btrim(t.nama_peralatan), ''),
         COALESCE(bool_or(st.segmen_id = p_segmen[1]), false), COALESCE(bool_or(st.segmen_id = p_segmen[2]), false)
  FROM public.segmen_tiang st
  JOIN public.tiang t ON t.id = st.tiang_id AND t.status_hidup = 'aktif'
  LEFT JOIN public.tiang_kode_penyulang kp ON kp.tiang_id = t.id AND upper(kp.penyulang) = v_p AND upper(kp.ulp) = v_u
  WHERE st.segmen_id = ANY (p_segmen)
  GROUP BY t.id, kp.induk_id, kp.kode, t.induk_id, t.lat, t.lng, t.kode, t.penanda, t.nama_peralatan;

  -- Induk langsung (tanpa melompati celah) — dipakai menilai bersebelahan.
  UPDATE _sg_simpul SET induk_langsung = induk;
  -- Induk di luar himpunan → naik sampai leluhur yang ada di himpunan.
  FOR r IN SELECT s.id, s.induk FROM _sg_simpul s
           WHERE s.induk IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _sg_simpul x WHERE x.id = s.induk) LOOP
    naik := r.induk; n := 0;
    WHILE naik IS NOT NULL AND n < 30 AND NOT EXISTS (SELECT 1 FROM _sg_simpul x WHERE x.id = naik) LOOP
      SELECT COALESCE(kp.induk_id, public.jtm_leluhur_di_penyulang(t.induk_id, v_p)) INTO naik
      FROM public.tiang t
      LEFT JOIN public.tiang_kode_penyulang kp ON kp.tiang_id = t.id AND upper(kp.penyulang) = v_p AND upper(kp.ulp) = v_u
      WHERE t.id = naik;
      n := n + 1;
    END LOOP;
    UPDATE _sg_simpul SET induk = CASE WHEN EXISTS (SELECT 1 FROM _sg_simpul x WHERE x.id = naik) THEN naik END
    WHERE id = r.id;
  END LOOP;
  -- Penjaga lingkaran (data rusak): tiang yang induknya dirinya sendiri.
  UPDATE _sg_simpul SET induk = NULL WHERE induk = id;

  UPDATE _sg_simpul s SET section_id = sc.id, section_nama = sc.nama,
         hulu_section = (sc.tiang_hulu_id = s.id),
         keypoint = (sc.tiang_hulu_id = s.id AND sc.jenis_hulu <> 'pangkal')
  FROM public.section_tiang x
  JOIN public.section sc ON sc.id = x.section_id
  WHERE x.tiang_id = s.id AND upper(sc.penyulang) = v_p AND upper(sc.ulp) = v_u;

  WITH RECURSIVE w AS (
    SELECT s.id, 0 AS dalam FROM _sg_simpul s WHERE s.induk IS NULL
    UNION ALL
    SELECT c.id, w.dalam + 1 FROM _sg_simpul c JOIN w ON c.induk = w.id WHERE w.dalam < 5000
  )
  UPDATE _sg_simpul s SET dalam = w.dalam FROM w WHERE w.id = s.id;
END $$;
REVOKE ALL ON FUNCTION public._segmen_simpul(UUID[]) FROM PUBLIC;

-- Sebutan sebuah tiang sebagai ujung segmen: peralatan → "REC. MALOMBA",
-- tiang biasa / gardu → kodenya.
CREATE OR REPLACE FUNCTION public._segmen_titik_tiang(p_penanda TEXT, p_alat TEXT, p_kode TEXT)
RETURNS TABLE (jenis TEXT, nama TEXT)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE WHEN ok THEN public.jtm_kode_titik(p_penanda) ELSE 'TIANG' END,
         CASE WHEN ok THEN COALESCE(upper(p_alat), p_kode) ELSE p_kode END
  FROM (SELECT COALESCE(p_penanda IS NOT NULL AND lower(p_penanda) <> 'gardu'
               AND public.jtm_jenis_titik_sah(public.jtm_kode_titik(p_penanda)), false) AS ok) x
$$;

CREATE OR REPLACE FUNCTION public._segmen_label_tiang(p_penanda TEXT, p_alat TEXT, p_kode TEXT)
RETURNS TEXT
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE WHEN x.jenis = 'TIANG' THEN x.nama ELSE public.segmen_label_titik(x.jenis, x.nama) END
  FROM public._segmen_titik_tiang(p_penanda, p_alat, p_kode) x
$$;

-- Segmen yang sedang dipegang regu: inspeksi terjadwal / berjalan, atau rintisan.
CREATE OR REPLACE FUNCTION public._segmen_sedang_dipakai(p_segmen UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT format('Segmen %s sedang diinspeksi (%s%s) — tunggu sampai dikirim regu.',
                   s.nama, i.status, COALESCE(', ' || i.petugas_nama, ''))
     FROM public.inspeksi_jtm i JOIN public.segmen s ON s.id = i.segmen_id
     WHERE i.segmen_id = p_segmen AND i.status IN ('Dijadwalkan', 'Dalam Proses')
     ORDER BY i.created_at DESC LIMIT 1),
    (SELECT format('Segmen %s masih dirintis regu — tunggu ujungnya disimpan dari HP.', s.nama)
     FROM public.segmen s
     WHERE s.id = p_segmen AND s.sumber = 'lapangan' AND s.titik_akhir_jenis = 'UJUNG'))
$$;


-- ── 3. Pecah ─────────────────────────────────────────────────────────────────
-- p_potong: tiang tempat memotong (urutan klik).
-- p_nama  : {"asal": "<nama potongan pangkal>", "<id tiang potong>": "<nama>", …}
--           — kosong = pakai usulan.
-- p_uji   : true = pratinjau saja (tidak menulis).
-- Hasil   : {segmen, bagian:[{no, asal, akar_id, akar_kode, jumlah_tiang,
--           panjang_km, section[], nama_usul, nama, garis[[lat,lng,lat,lng]],
--           titik{lat,lng}}], usul_potong[], galat[], segmen_baru[]}
CREATE OR REPLACE FUNCTION public.pecah_segmen(
  p_segmen UUID,
  p_potong UUID[],
  p_nama   JSONB   DEFAULT '{}'::jsonb,
  p_oleh   TEXT    DEFAULT NULL,
  p_uji    BOOLEAN DEFAULT true
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s       RECORD;
  rb      RECORD;
  potong  UUID[];
  galat   TEXT[] := ARRAY[]::TEXT[];
  hasil   JSONB;
  v_bagian JSONB;
  usul    JSONB;
  dipakai TEXT;
  baru    UUID;
  dibuat  JSONB := '[]'::jsonb;
  ta RECORD; tb RECORD;
BEGIN
  SELECT * INTO s FROM public.segmen WHERE id = p_segmen;
  IF NOT FOUND THEN RAISE EXCEPTION 'Segmen tidak ditemukan'; END IF;
  IF s.status <> 'aktif' THEN RAISE EXCEPTION 'Segmen % tidak aktif', s.nama; END IF;

  -- Titik potong unik, urutan pertama dipertahankan.
  SELECT COALESCE(array_agg(x ORDER BY i), ARRAY[]::UUID[]) INTO potong
  FROM (SELECT x, min(i) i FROM unnest(COALESCE(p_potong, ARRAY[]::UUID[])) WITH ORDINALITY u(x, i) GROUP BY x) d;

  PERFORM public._segmen_simpul(ARRAY[p_segmen]);

  -- Penilaian titik potong.
  SELECT galat || COALESCE(array_agg(m ORDER BY m), ARRAY[]::TEXT[]) INTO galat FROM (
    SELECT CASE
      WHEN g.id IS NULL THEN format('Tiang %s bukan anggota segmen ini.', COALESCE((SELECT kode FROM public.tiang WHERE id = p.x), '?'))
      WHEN g.induk IS NULL THEN format('Tiang %s pangkal segmen — tidak bisa jadi titik potong.', g.kode)
      WHEN NOT EXISTS (SELECT 1 FROM _sg_simpul c WHERE c.induk = g.id) THEN format('Tiang %s ujung segmen — tidak ada yang dipotong di sana.', g.kode)
    END AS m
    FROM unnest(potong) p(x) LEFT JOIN _sg_simpul g ON g.id = p.x
  ) z WHERE m IS NOT NULL;

  -- Bagian tiap tiang: 0 = potongan pangkal (segmen lama), i = mulai di potong[i].
  WITH RECURSIVE w AS (
    SELECT g.id, 0 AS bagian FROM _sg_simpul g WHERE g.induk IS NULL
    UNION ALL
    SELECT c.id, COALESCE(array_position(potong, c.id), w.bagian)
    FROM _sg_simpul c JOIN w ON c.induk = w.id
  )
  UPDATE _sg_simpul g SET bagian = w.bagian FROM w WHERE w.id = g.id;

  -- Anggota tiap potongan: tiang potong ikut sebagai ujung potongan induknya.
  DROP TABLE IF EXISTS _sg_anggota;
  CREATE TEMP TABLE _sg_anggota ON COMMIT DROP AS
  SELECT g.bagian, g.id FROM _sg_simpul g WHERE g.bagian IS NOT NULL
  UNION
  SELECT i.bagian, g.id FROM _sg_simpul g JOIN _sg_simpul i ON i.id = g.induk
  WHERE g.id = ANY (potong) AND i.bagian IS NOT NULL;

  -- Ringkasan potongan.
  DROP TABLE IF EXISTS _sg_bagian;
  CREATE TEMP TABLE _sg_bagian ON COMMIT DROP AS
  SELECT a.bagian,
         ak.id AS akar_id, ak.kode AS akar_kode, ak.lat AS akar_lat, ak.lng AS akar_lng,
         ak.penanda AS akar_penanda, ak.nama_alat AS akar_alat,
         uj.id AS ujung_id, uj.kode AS ujung_kode, uj.penanda AS ujung_penanda, uj.nama_alat AS ujung_alat,
         (SELECT count(*) FROM _sg_anggota x WHERE x.bagian = a.bagian) AS jumlah_tiang,
         (SELECT COALESCE(sum(public.jarak_meter(i.lat, i.lng, g.lat, g.lng)), 0) / 1000.0
            FROM _sg_anggota x JOIN _sg_simpul g ON g.id = x.id
            JOIN _sg_anggota xi ON xi.bagian = x.bagian AND xi.id = g.induk
            JOIN _sg_simpul i ON i.id = g.induk
           WHERE x.bagian = a.bagian AND g.lat IS NOT NULL AND i.lat IS NOT NULL) AS panjang_km,
         (SELECT COALESCE(array_agg(DISTINCT g.section_nama ORDER BY g.section_nama), ARRAY[]::TEXT[])
            FROM _sg_anggota x JOIN _sg_simpul g ON g.id = x.id
           WHERE x.bagian = a.bagian AND g.section_id IS NOT NULL AND NOT g.hulu_section) AS section,
         (SELECT COALESCE(jsonb_agg(jsonb_build_array(i.lat, i.lng, g.lat, g.lng)), '[]'::jsonb)
            FROM _sg_anggota x JOIN _sg_simpul g ON g.id = x.id
            JOIN _sg_anggota xi ON xi.bagian = x.bagian AND xi.id = g.induk
            JOIN _sg_simpul i ON i.id = g.induk
           WHERE x.bagian = a.bagian AND g.lat IS NOT NULL AND i.lat IS NOT NULL) AS garis
  FROM (SELECT DISTINCT bagian FROM _sg_anggota) a
  -- Akar: pangkal segmen (bagian 0, yang paling dangkal) atau tiang potongnya.
  LEFT JOIN LATERAL (
    SELECT g.* FROM _sg_simpul g
    WHERE CASE WHEN a.bagian = 0 THEN g.bagian = 0 AND g.induk IS NULL ELSE g.id = potong[a.bagian] END
    ORDER BY g.dalam NULLS LAST LIMIT 1) ak ON true
  -- Ujung: tiang terdalam potongan itu.
  LEFT JOIN LATERAL (
    SELECT g.* FROM _sg_anggota x JOIN _sg_simpul g ON g.id = x.id
    WHERE x.bagian = a.bagian AND g.id <> ak.id
    ORDER BY g.dalam DESC NULLS LAST, g.kode LIMIT 1) uj ON true;

  -- Nama tiap potongan: ketikan admin, kalau kosong usulan.
  ALTER TABLE _sg_bagian ADD COLUMN nama_usul TEXT, ADD COLUMN nama TEXT;
  UPDATE _sg_bagian SET nama_usul = CASE WHEN bagian = 0 THEN s.nama ELSE
    public._segmen_label_tiang(akar_penanda, akar_alat, akar_kode) || ' - ' ||
    COALESCE(public._segmen_label_tiang(ujung_penanda, ujung_alat, ujung_kode), 'UJUNG') END;
  UPDATE _sg_bagian SET nama = COALESCE(
    NULLIF(public.rapikan_nama_segmen(p_nama ->> CASE WHEN bagian = 0 THEN 'asal' ELSE akar_id::text END), ''),
    public.rapikan_nama_segmen(nama_usul));

  -- Penjaga.
  SELECT galat || COALESCE(array_agg(m ORDER BY m), ARRAY[]::TEXT[]) INTO galat FROM (
    SELECT format('Potongan "%s" melewati keypoint (%s) — tambahkan titik potong di keypoint-nya.',
                  b.nama, array_to_string(b.section, ', ')) AS m
    FROM _sg_bagian b WHERE cardinality(b.section) > 1
    UNION ALL
    SELECT format('Nama "%s" dipakai lebih dari satu potongan.', b.nama)
    FROM _sg_bagian b GROUP BY b.nama HAVING count(*) > 1
    UNION ALL
    SELECT format('Nama "%s" sudah dipakai segmen lain di penyulang %s.', b.nama, s.penyulang)
    FROM _sg_bagian b
    WHERE EXISTS (SELECT 1 FROM public.segmen o
                  WHERE o.status = 'aktif' AND o.id <> s.id AND upper(o.penyulang) = upper(s.penyulang)
                    AND upper(o.ulp) = upper(s.ulp) AND upper(o.nama) = upper(b.nama))
  ) z;

  dipakai := public._segmen_sedang_dipakai(p_segmen);
  IF dipakai IS NOT NULL THEN galat := galat || dipakai; END IF;
  IF cardinality(potong) = 0 THEN galat := galat || 'Belum ada titik potong — klik tiang di peta.'::TEXT; END IF;

  -- Keypoint di tengah segmen (punya hulu & hilir di segmen): usulan titik potong.
  SELECT COALESCE(jsonb_agg(g.id ORDER BY g.dalam), '[]'::jsonb) INTO usul
  FROM _sg_simpul g
  WHERE g.keypoint AND g.induk IS NOT NULL AND EXISTS (SELECT 1 FROM _sg_simpul c WHERE c.induk = g.id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'no', b.bagian, 'asal', b.bagian = 0, 'akar_id', b.akar_id, 'akar_kode', b.akar_kode,
           'jumlah_tiang', b.jumlah_tiang, 'panjang_km', round(b.panjang_km::numeric, 3),
           'section', to_jsonb(b.section), 'nama_usul', b.nama_usul, 'nama', b.nama,
           'garis', b.garis, 'titik', jsonb_build_object('lat', b.akar_lat, 'lng', b.akar_lng))
         ORDER BY b.bagian = 0 DESC, (SELECT g.dalam FROM _sg_simpul g WHERE g.id = b.akar_id), b.bagian), '[]'::jsonb)
  INTO v_bagian FROM _sg_bagian b;

  hasil := jsonb_build_object(
    'segmen', jsonb_build_object('id', s.id, 'nama', s.nama, 'penyulang', s.penyulang, 'ulp', s.ulp),
    'bagian', v_bagian, 'usul_potong', usul, 'galat', to_jsonb(galat));

  IF p_uji THEN RETURN hasil; END IF;

  -- ── Terapkan ──
  PERFORM public.penyulang_wajib_boleh(s.ulp);
  PERFORM 1 FROM public.segmen WHERE id = p_segmen FOR UPDATE;
  IF cardinality(galat) > 0 THEN RAISE EXCEPTION '%', galat[1]; END IF;

  -- Nama potongan pangkal dulu (bisa saja nama lamanya diberikan ke potongan lain).
  SELECT * INTO rb FROM _sg_bagian WHERE bagian = 0;
  SELECT * INTO tb FROM public._segmen_titik_tiang(rb.ujung_penanda, rb.ujung_alat, rb.ujung_kode);
  UPDATE public.segmen
     SET nama = rb.nama, nama_bebas = true,
         titik_akhir_jenis = COALESCE(tb.jenis, titik_akhir_jenis),
         titik_akhir_nama = COALESCE(tb.nama, titik_akhir_nama),
         titik_akhir_tiang_id = COALESCE(rb.ujung_id, titik_akhir_tiang_id)
   WHERE id = s.id;

  FOR rb IN SELECT * FROM _sg_bagian WHERE bagian > 0 ORDER BY bagian LOOP
    SELECT * INTO ta FROM public._segmen_titik_tiang(rb.akar_penanda, rb.akar_alat, rb.akar_kode);
    SELECT * INTO tb FROM public._segmen_titik_tiang(rb.ujung_penanda, rb.ujung_alat, rb.ujung_kode);
    INSERT INTO public.segmen (penyulang, ulp, nama, nama_bebas, sumber, status,
                               titik_awal_jenis, titik_awal_nama, titik_awal_tiang_id,
                               titik_akhir_jenis, titik_akhir_nama, titik_akhir_tiang_id,
                               penghantar_jenis, penghantar_ukuran, dikonfirmasi_at, dikonfirmasi_oleh,
                               catatan)
    VALUES (s.penyulang, s.ulp, rb.nama, true, s.sumber, 'aktif',
            ta.jenis, ta.nama, rb.akar_id,
            COALESCE(tb.jenis, 'UJUNG'), COALESCE(tb.nama, ''), rb.ujung_id,
            s.penghantar_jenis, s.penghantar_ukuran, s.dikonfirmasi_at, s.dikonfirmasi_oleh,
            '[dipecah dari ' || s.nama || ']')
    RETURNING id INTO baru;

    INSERT INTO public.segmen_tiang (segmen_id, tiang_id, posisi, sumber)
    SELECT baru, st.tiang_id, st.posisi, st.sumber
    FROM public.segmen_tiang st JOIN _sg_anggota x ON x.id = st.tiang_id AND x.bagian = rb.bagian
    WHERE st.segmen_id = s.id;

    dibuat := dibuat || jsonb_build_object('id', baru, 'nama', rb.nama);
  END LOOP;

  -- Tiang yang pindah seluruhnya keluar dari segmen lama (tiang potong tetap
  -- di sana sebagai ujungnya). Tiang segmen yang tidak aktif tidak disentuh.
  DELETE FROM public.segmen_tiang st
  WHERE st.segmen_id = s.id
    AND EXISTS (SELECT 1 FROM _sg_anggota x WHERE x.id = st.tiang_id)
    AND NOT EXISTS (SELECT 1 FROM _sg_anggota x WHERE x.id = st.tiang_id AND x.bagian = 0);

  -- Segmen anak yang pangkalnya kini di potongan baru ikut menunjuk ke sana
  -- (induk_segmen_id disusun pemicu dari tiang pangkalnya).
  UPDATE public.segmen c SET titik_awal_tiang_id = c.titik_awal_tiang_id
  WHERE c.induk_segmen_id = s.id AND c.status = 'aktif';

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('segmen', s.nama, COALESCE(s.ulp, '-'), 'pecah',
          jsonb_build_object('nama', s.nama),
          jsonb_build_object('asal', (SELECT nama FROM _sg_bagian WHERE bagian = 0), 'baru', dibuat),
          'sunting_admin', auth.uid(), p_oleh);

  RETURN hasil || jsonb_build_object('segmen_baru', dibuat);
END $$;


-- ── 4. Gabung dua segmen bersebelahan di satu section ────────────────────────
-- Yang di hulu dipertahankan (id-nya, inspeksi & WO-nya); yang di hilir
-- dinonaktifkan lewat gabung_segmen lama (catatan "[digabung ke …]").
CREATE OR REPLACE FUNCTION public.gabung_segmen_section(
  p_a    UUID,
  p_b    UUID,
  p_nama TEXT    DEFAULT NULL,
  p_oleh TEXT    DEFAULT NULL,
  p_uji  BOOLEAN DEFAULT true
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a RECORD; b RECORD; hulu RECORD; hilir RECORD;
  galat   TEXT[] := ARRAY[]::TEXT[];
  sect    TEXT[];
  v_nama  TEXT;
  dipakai TEXT;
  hasil   JSONB;
  jml     INT; km NUMERIC;
BEGIN
  IF p_a = p_b THEN RAISE EXCEPTION 'Pilih dua segmen yang berbeda'; END IF;
  SELECT * INTO a FROM public.segmen WHERE id = p_a;
  SELECT * INTO b FROM public.segmen WHERE id = p_b;
  IF a.id IS NULL OR b.id IS NULL THEN RAISE EXCEPTION 'Segmen tidak ditemukan'; END IF;
  IF a.status <> 'aktif' OR b.status <> 'aktif' THEN RAISE EXCEPTION 'Kedua segmen harus aktif'; END IF;
  IF upper(a.penyulang) <> upper(b.penyulang) OR upper(a.ulp) <> upper(b.ulp) THEN
    RAISE EXCEPTION 'Segmen beda penyulang tidak bisa digabung (% / %)', a.penyulang, b.penyulang;
  END IF;

  PERFORM public._segmen_simpul(ARRAY[p_a, p_b]);

  -- Bersebelahan: berbagi tiang, atau pangkal yang satu bergantung pada tiang yang lain.
  IF NOT EXISTS (SELECT 1 FROM _sg_simpul WHERE di_a AND di_b)
     AND NOT EXISTS (SELECT 1 FROM _sg_simpul g JOIN _sg_simpul i ON i.id = g.induk_langsung
                     WHERE (g.di_a AND NOT g.di_b AND i.di_b) OR (g.di_b AND NOT g.di_a AND i.di_a)) THEN
    galat := galat || format('%s dan %s tidak bersambung.', a.nama, b.nama);
  END IF;

  SELECT COALESCE(array_agg(DISTINCT section_nama ORDER BY section_nama), ARRAY[]::TEXT[]) INTO sect
  FROM _sg_simpul WHERE section_id IS NOT NULL AND NOT hulu_section;
  IF cardinality(sect) > 1 THEN
    galat := galat || format('Hasil gabungan melewati keypoint (%s) — segmen hanya boleh di satu section.', array_to_string(sect, ', '));
  END IF;

  -- Hulu = segmen yang memuat tiang paling dangkal.
  IF (SELECT di_a FROM _sg_simpul WHERE dalam IS NOT NULL ORDER BY dalam, di_a DESC LIMIT 1) THEN
    hulu := a; hilir := b;
  ELSE
    hulu := b; hilir := a;
  END IF;

  v_nama := COALESCE(NULLIF(public.rapikan_nama_segmen(p_nama), ''), hulu.nama);
  IF EXISTS (SELECT 1 FROM public.segmen o
             WHERE o.status = 'aktif' AND o.id NOT IN (p_a, p_b) AND upper(o.penyulang) = upper(a.penyulang)
               AND upper(o.ulp) = upper(a.ulp) AND upper(o.nama) = v_nama) THEN
    galat := galat || format('Nama "%s" sudah dipakai segmen lain di penyulang %s.', v_nama, a.penyulang);
  END IF;
  dipakai := COALESCE(public._segmen_sedang_dipakai(p_a), public._segmen_sedang_dipakai(p_b));
  IF dipakai IS NOT NULL THEN galat := galat || dipakai; END IF;

  SELECT count(*) INTO jml FROM _sg_simpul;
  SELECT COALESCE(sum(public.jarak_meter(i.lat, i.lng, g.lat, g.lng)), 0) / 1000.0 INTO km
  FROM _sg_simpul g JOIN _sg_simpul i ON i.id = g.induk WHERE g.lat IS NOT NULL AND i.lat IS NOT NULL;

  hasil := jsonb_build_object(
    'hulu', jsonb_build_object('id', hulu.id, 'nama', hulu.nama),
    'hilir', jsonb_build_object('id', hilir.id, 'nama', hilir.nama),
    'nama', v_nama, 'jumlah_tiang', jml, 'panjang_km', round(km, 3),
    'section', to_jsonb(sect), 'galat', to_jsonb(galat));
  IF p_uji THEN RETURN hasil; END IF;

  PERFORM public.penyulang_wajib_boleh(a.ulp);
  PERFORM 1 FROM public.segmen WHERE id IN (p_a, p_b) FOR UPDATE;
  IF cardinality(galat) > 0 THEN RAISE EXCEPTION '%', galat[1]; END IF;

  PERFORM public.gabung_segmen(hilir.id, hulu.id, p_oleh);
  UPDATE public.segmen
     SET nama = v_nama, nama_bebas = true,
         titik_akhir_jenis = hilir.titik_akhir_jenis, titik_akhir_nama = hilir.titik_akhir_nama,
         titik_akhir_tiang_id = hilir.titik_akhir_tiang_id
   WHERE id = hulu.id;

  RETURN hasil;
END $$;


-- ── 5. Ubah nama: semua segmen ───────────────────────────────────────────────
-- Disalin dari `segmen-nama-tempel.sql`; perubahan ditandai ★.
CREATE OR REPLACE FUNCTION public.ubah_nama_segmen(
  p_segmen_id UUID,
  p_nama      TEXT,
  p_oleh      TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  s    RECORD;
  baru TEXT := public.rapikan_nama_segmen(p_nama);
BEGIN
  SELECT * INTO s FROM public.segmen WHERE id = p_segmen_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Segmen tidak ditemukan'; END IF;

  PERFORM public.penyulang_wajib_boleh(s.ulp);

  -- ★ Semua sumber boleh (keputusan X3: nama segmen bebas). Segmen lapangan /
  --   manual yang namanya diketik ditandai nama_bebas supaya tidak disusun
  --   ulang dari titik ujungnya.
  IF baru = '' THEN RAISE EXCEPTION 'Nama segmen tidak boleh kosong'; END IF;
  IF baru = s.nama THEN RETURN baru; END IF;

  IF s.status = 'aktif' AND EXISTS (
    SELECT 1 FROM public.segmen
    WHERE upper(penyulang) = upper(s.penyulang) AND upper(ulp) = upper(s.ulp)
      AND upper(nama) = baru AND status = 'aktif' AND id <> s.id
  ) THEN
    RAISE EXCEPTION 'Segmen "%" sudah ada di penyulang %', baru, s.penyulang;
  END IF;

  UPDATE public.segmen SET nama = baru, nama_bebas = true, updated_at = now() WHERE id = p_segmen_id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('segmen', baru, COALESCE(s.ulp, '-'), 'nama',
          to_jsonb(s.nama), to_jsonb(baru), 'sunting_admin', auth.uid(), p_oleh);

  RETURN baru;
END $fn$;


-- ── 6. Hak akses ─────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public._segmen_sedang_dipakai(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pecah_segmen(UUID, UUID[], JSONB, TEXT, BOOLEAN)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.gabung_segmen_section(UUID, UUID, TEXT, TEXT, BOOLEAN)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.ubah_nama_segmen(UUID, TEXT, TEXT)                        TO authenticated;


-- ── Sesudah dijalankan ───────────────────────────────────────────────────────
-- Pratinjau pecah (tidak menulis) — potong di keypoint yang diusulkan:
--   SELECT jsonb_pretty(pecah_segmen(s.segmen_id,
--     ARRAY(SELECT jsonb_array_elements_text(pecah_segmen(s.segmen_id, '{}')->'usul_potong')::uuid)))
--   FROM segmen_lintas_section s LIMIT 1;
