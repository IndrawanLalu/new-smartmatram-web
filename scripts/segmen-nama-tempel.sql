-- =============================================================================
-- Segmen impor: nama PERSIS seperti ditempel + nama bisa diubah di web
-- Jalankan SESUDAH `impor-segmen-pratinjau.sql` dan `wo-tempel-semua.sql`.
-- Idempoten.
--
-- ── KENAPA ──────────────────────────────────────────────────────────────────
-- Bapak 30 Sep 2026: menempel "GI AMPENAN" - "MR DIY" menghasilkan segmen
-- "GI AMPENAN - PENG. MR DIY". Titik tanpa awalan dijatuhkan `pisah_label_titik`
-- ke jenis PENG, lalu penyusun nama menambahkan "PENG." di depannya. Padahal
-- segmen tidak selalu berujung di pengambilan — kalau di lapangan ternyata
-- memang ada, PENG ditambahkan sendiri kemudian.
--
-- Keputusan user: impor dari web = NAMA SESUAI YANG DITEMPEL. Hanya dirapikan
-- huruf besar dan spasinya (semua nama segmen memang huruf besar, dan indeks
-- unik `segmen_nama_unik` membandingkan tanpa memandang huruf besar-kecil).
-- HP tidak disentuh — perlakuannya di sana sudah benar.
--
-- Jenis titik tetap dibaca di balik layar (REC/LBS/PMT/GI memotong jaringan,
-- yang tidak dikenali tetap PENG = tidak memotong), tapi TIDAK lagi mengubah
-- nama. "UJUNG(1.4A)" tetap tertulis "UJUNG(1.4A)".
--
-- ── YANG DIUBAH ─────────────────────────────────────────────────────────────
--   1. `segmen_susun_nama` — segmen 'impor' menyimpan namanya seperti ditulis,
--      sama dengan 'tempelan' (wo-tempel-semua.sql).
--   2. `impor_segmen`      — nama = titik awal + ' - ' + titik akhir apa adanya.
--   3. `ubah_nama_segmen`  — BARU: membetulkan nama segmen impor/tempelan dari
--      web, termasuk 49 segmen lama yang telanjur ber-"PENG." (dibiarkan, atas
--      keputusan user; dibetulkan sendiri lewat fungsi ini).
--
-- Data lama TIDAK diubah oleh berkas ini.
-- =============================================================================


-- ── 1. Nama segmen impor tidak disusun ulang ─────────────────────────────────
-- Disalin dari `wo-tempel-semua.sql`; satu perubahan (★): 'impor' ikut.

CREATE OR REPLACE FUNCTION public.segmen_susun_nama()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  induk_id UUID;
BEGIN
  -- ★ Segmen yang namanya DITULIS orang (tempelan WO, impor) menyimpan nama itu.
  --   Yang lahir dari titik ujung (manual, lapangan) tetap disusun di sini.
  IF NOT (NEW.sumber IN ('tempelan', 'impor') AND COALESCE(btrim(NEW.nama), '') <> '') THEN
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


-- ── 2. Impor: nama sesuai tempelan ───────────────────────────────────────────
-- Disalin dari `impor-segmen-pratinjau.sql`; perubahan ditandai ★.

-- Perapian satu-satunya: huruf besar + spasi ganda jadi satu.
CREATE OR REPLACE FUNCTION public.rapikan_nama_segmen(p TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT upper(btrim(regexp_replace(COALESCE(p, ''), '\s+', ' ', 'g')))
$$;

CREATE OR REPLACE FUNCTION public.impor_segmen(
  p_penyulang TEXT,
  p_baris     JSONB,
  p_oleh      TEXT    DEFAULT NULL,
  p_uji       BOOLEAN DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  nama_p   TEXT := regexp_replace(upper(btrim(COALESCE(p_penyulang, ''))), '\s+', ' ', 'g');
  unit     TEXT;
  b        JSONB;
  awal     TEXT;
  akhir    TEXT;
  km       NUMERIC;
  ta       RECORD;
  tb       RECORD;
  label    TEXT;
  dibuat   INT := 0;
  siap     JSONB := '[]'::jsonb;
  dilewati JSONB := '[]'::jsonb;
  -- Nama yang akan lahir dalam tempelan INI. Tanpa ini, dua baris kembar di
  -- dalam satu tempelan lolos berdua — yang kedua tidak ketahuan karena yang
  -- pertama belum tersimpan (apalagi saat p_uji, yang memang tidak menyimpan).
  sudah    TEXT[] := ARRAY[]::TEXT[];
BEGIN
  SELECT ulp INTO unit FROM public.penyulang_ref WHERE upper(penyulang) = nama_p;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Penyulang "%" belum ada di Master Penyulang. Daftarkan dulu di sana — segmen tanpa induk yang sah tidak bisa dipakai jadi WO.', nama_p;
  END IF;
  IF COALESCE(unit, '') = '' THEN
    RAISE EXCEPTION 'Penyulang "%" belum punya ULP di master. Lengkapi dulu.', nama_p;
  END IF;

  -- Pratinjau tidak mengubah apa pun, jadi tidak perlu hak mengubah.
  IF NOT p_uji THEN
    PERFORM public.wajib_boleh_ulp(unit);
  END IF;

  FOR b IN SELECT * FROM jsonb_array_elements(COALESCE(p_baris, '[]'::jsonb)) LOOP
    -- ★ Dirapikan sekali di sini; yang sama inilah yang jadi nama segmen.
    awal  := public.rapikan_nama_segmen(b ->> 'awal');
    akhir := public.rapikan_nama_segmen(b ->> 'akhir');
    BEGIN
      km := NULLIF(b ->> 'km', '')::NUMERIC;
    EXCEPTION WHEN others THEN
      km := NULL;
    END;

    IF awal = '' OR akhir = '' THEN
      dilewati := dilewati || jsonb_build_object(
        'baris', b, 'sebab', 'Titik awal atau titik akhir kosong.');
      CONTINUE;
    END IF;

    IF km IS NOT NULL AND (km <= 0 OR km > 200) THEN
      dilewati := dilewati || jsonb_build_object(
        'baris', b, 'sebab', format('Panjang %s km tidak wajar. Ruas JTM sepanjang itu tidak ada — biasanya koma yang tertinggal.', km));
      CONTINUE;
    END IF;

    -- Jenis tetap dibaca untuk logika jaringan (memotong atau tidak) …
    SELECT * INTO ta FROM public.pisah_label_titik(awal);
    SELECT * INTO tb FROM public.pisah_label_titik(akhir);
    -- ★ … tapi namanya = yang ditempel. Tidak ada awalan yang ditambahkan.
    label := awal || ' - ' || akhir;

    IF label = ANY(sudah) THEN
      dilewati := dilewati || jsonb_build_object(
        'baris', b, 'sebab', format('Kembar dengan baris lain di tempelan ini — "%s".', label));
      CONTINUE;
    END IF;

    -- ★ upper() di kedua sisi, sama dengan indeks unik `segmen_nama_unik`.
    IF EXISTS (SELECT 1 FROM public.segmen
               WHERE upper(penyulang) = nama_p AND upper(nama) = label AND status = 'aktif') THEN
      IF NOT p_uji AND km IS NOT NULL THEN
        UPDATE public.segmen
        SET panjang_manual_km = km, updated_at = now()
        WHERE upper(penyulang) = nama_p AND upper(nama) = label AND status = 'aktif'
          AND sumber <> 'lapangan' AND panjang_manual_km IS NULL;
      END IF;
      dilewati := dilewati || jsonb_build_object(
        'baris', b, 'sebab', format('Segmen "%s" sudah ada — tidak ditimpa.', label));
      CONTINUE;
    END IF;

    sudah  := sudah || label;
    dibuat := dibuat + 1;

    siap := siap || jsonb_build_object(
      'nama', label, 'km', km,
      'awal_jenis', ta.jenis, 'akhir_jenis', tb.jenis);

    IF NOT p_uji THEN
      INSERT INTO public.segmen (
        penyulang, ulp,
        titik_awal_jenis, titik_awal_nama,
        titik_akhir_jenis, titik_akhir_nama,
        nama,                                           -- ★ disimpan apa adanya
        sumber, panjang_manual_km, catatan
      ) VALUES (
        nama_p, unit,
        ta.jenis, ta.nama,
        tb.jenis, tb.nama,
        label,
        'impor', km,
        CASE WHEN p_oleh IS NULL THEN NULL ELSE 'Diimpor oleh ' || p_oleh END
      );
    END IF;
  END LOOP;

  IF NOT p_uji THEN
    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('segmen', nama_p, unit, 'impor', NULL,
            jsonb_build_object('dibuat', dibuat, 'dilewati', jsonb_array_length(dilewati)),
            'sunting_admin', auth.uid(), p_oleh);
  END IF;

  RETURN jsonb_build_object(
    'penyulang', nama_p, 'ulp', unit,
    'uji', p_uji,
    'dibuat', dibuat,
    'siap', siap,
    'dilewati', dilewati);
END $fn$;


-- ── 3. Ubah nama segmen dari web ─────────────────────────────────────────────
-- Hanya segmen yang namanya memang DITULIS orang (impor, tempelan). Segmen
-- manual/lapangan namanya disusun dari titik ujungnya: mengetik namanya di
-- sini akan ditimpa trigger pada perubahan berikutnya, dan orang mengira sudah
-- membetulkan sesuatu.
--
-- WO yang sudah terbit menyimpan salinan nama saat diterbitkan
-- (`wo_perabasan_item.segmen_nama`) — itu sejarah, sengaja tidak ikut berubah.

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

  IF s.sumber NOT IN ('impor', 'tempelan') THEN
    RAISE EXCEPTION
      'Nama segmen "%" disusun dari titik ujungnya (sumber %), jadi tidak diketik di sini.', s.nama, s.sumber;
  END IF;
  IF baru = '' THEN RAISE EXCEPTION 'Nama segmen tidak boleh kosong'; END IF;
  IF baru = s.nama THEN RETURN baru; END IF;

  IF s.status = 'aktif' AND EXISTS (
    SELECT 1 FROM public.segmen
    WHERE upper(penyulang) = upper(s.penyulang) AND upper(ulp) = upper(s.ulp)
      AND upper(nama) = baru AND status = 'aktif' AND id <> s.id
  ) THEN
    RAISE EXCEPTION 'Segmen "%" sudah ada di penyulang %', baru, s.penyulang;
  END IF;

  UPDATE public.segmen SET nama = baru, updated_at = now() WHERE id = p_segmen_id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('segmen', baru, COALESCE(s.ulp, '-'), 'nama',
          to_jsonb(s.nama), to_jsonb(baru), 'sunting_admin', auth.uid(), p_oleh);

  RETURN baru;
END $fn$;


-- ── 4. Hak akses ─────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.rapikan_nama_segmen TO authenticated;
GRANT EXECUTE ON FUNCTION public.impor_segmen        TO authenticated;
GRANT EXECUTE ON FUNCTION public.ubah_nama_segmen    TO authenticated;


-- =============================================================================
-- Periksa hasilnya (fungsi plpgsql wajib diuji dengan DIPANGGIL)
-- =============================================================================
-- a. Pratinjau — TIDAK menulis apa pun. Harus keluar "GI AMPENAN - MR DIY",
--    "MR DIY - UJUNG(1.4A)", dan "REC BRIMOB - LBS PASAR" (tanpa titik tambahan):
--      SELECT jsonb_pretty(impor_segmen('MATARAM', '[
--        {"awal":"GI Ampenan","akhir":"MR DIY"},
--        {"awal":"MR DIY","akhir":"UJUNG(1.4A)"},
--        {"awal":"REC BRIMOB","akhir":"LBS  pasar"}
--      ]'::jsonb, 'uji', true)) -> 'siap';
--
-- b. Segmen lama yang telanjur ber-"PENG." — dibetulkan dari web (Master
--    Segmen → klik nama), atau di sini:
--      SELECT segmen_id, nama FROM master_segmen
--      WHERE sumber = 'impor' AND nama LIKE '%PENG.%' ORDER BY penyulang, nama;
-- =============================================================================
