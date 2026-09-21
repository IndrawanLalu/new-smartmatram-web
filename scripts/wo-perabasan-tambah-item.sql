-- =============================================================================
-- Menambah segmen ke WO perabasan yang SUDAH terbit
-- Jalankan SESUDAH `wo-perabasan-regu.sql`. Idempoten.
--
-- ── KENAPA ──────────────────────────────────────────────────────────────────
-- Bapak 21 Sep: "harusnya saat buat WO bisa menambahkan item WO di WO yang
-- sudah dibuat, jadi tidak harus membuat WO dua kali."
--
-- Memang begitu keadaannya di lapangan: regu menyelesaikan ruasnya lebih cepat
-- dari perkiraan, atau ada ruas yang baru diimpor sesudah WO terbit. Memaksa
-- membuat WO kedua membuat capaian satu bulan pecah jadi dua angka yang harus
-- dijumlah orang — dan yang harus dijumlah orang cepat atau lambat salah
-- dijumlah.
--
-- ── SATU TEMPAT UNTUK ATURAN ITEM ───────────────────────────────────────────
-- Pemeriksaan per segmen — ULP cocok, segmen aktif, belum terikat WO lain,
-- regu terdaftar — dipindahkan ke `tambah_item_wo_perabasan`. Fungsi
-- `terbitkan_wo_perabasan` sekarang cuma membuat kepalanya lalu memanggil
-- fungsi itu.
--
-- Bukan kerapian: dua salinan aturan yang sama akan melenceng, dan yang
-- melenceng di sini berarti segmen yang ditolak saat WO terbit justru diterima
-- saat ditambahkan belakangan — lewat pintu yang sama sekali tidak dijaga.
-- =============================================================================


-- ── 1. Menambah item ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tambah_item_wo_perabasan(
  p_wo_id  UUID,
  p_segmen UUID[],
  p_regu   JSONB DEFAULT '{}'::jsonb,
  p_oleh   TEXT  DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  w         RECORD;
  s         RECORD;
  n         INT := 0;
  tanpa     INT := 0;
  urut      INT;
  nama_regu TEXT;
  dilewati  JSONB := '[]'::jsonb;
BEGIN
  SELECT * INTO w FROM public.wo_perabasan WHERE id = p_wo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'WO tidak ditemukan'; END IF;

  PERFORM public.wajib_boleh_ulp(w.ulp);

  IF w.status <> 'Terbit' THEN
    RAISE EXCEPTION 'WO "%" berstatus % — segmen hanya bisa ditambahkan ke WO yang masih berjalan.',
      w.nama, w.status;
  END IF;

  IF COALESCE(array_length(p_segmen, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Belum ada segmen yang dipilih';
  END IF;

  -- Nomor urut MELANJUTKAN yang sudah ada, tidak mengulang dari satu. Lembar
  -- yang sudah dipegang regu memakai nomor itu sebagai rujukan lisan
  -- ("sudah sampai nomor tujuh"), dan penomoran yang diulang membuat dua ruas
  -- berbeda sama-sama bernomor satu.
  SELECT COALESCE(max(urutan), 0) INTO urut
  FROM public.wo_perabasan_item WHERE wo_id = p_wo_id;

  FOR s IN
    SELECT * FROM public.master_segmen
    WHERE segmen_id = ANY(p_segmen)
    ORDER BY penyulang, nama
  LOOP
    IF upper(s.ulp) <> upper(w.ulp) THEN
      dilewati := dilewati || jsonb_build_object(
        'segmen', s.nama, 'sebab', format('Milik ULP %s, bukan %s.', s.ulp, w.ulp));
      CONTINUE;
    END IF;

    IF s.status <> 'aktif' THEN
      dilewati := dilewati || jsonb_build_object(
        'segmen', s.nama, 'sebab', 'Segmen tidak aktif.');
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.wo_perabasan_item x
      WHERE x.segmen_id = s.segmen_id
        AND x.status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai', 'Ditolak')
    ) THEN
      dilewati := dilewati || jsonb_build_object(
        'segmen', s.nama,
        'sebab', format('Masih berjalan di WO lain (%s). Batalkan dulu di sana kalau memang mau dipindahkan.',
                        (SELECT x.status FROM public.wo_perabasan_item x
                          WHERE x.segmen_id = s.segmen_id
                            AND x.status IN ('Dijadwalkan','Dalam Proses','Selesai','Ditolak') LIMIT 1)));
      CONTINUE;
    END IF;

    nama_regu := NULLIF(btrim(COALESCE(p_regu ->> s.segmen_id::text, '')), '');

    -- Regu yang tidak dikenal DITOLAK, bukan disimpan apa adanya. Nama salah
    -- ketik menghasilkan segmen yang tidak muncul di HP siapa pun, tanpa satu
    -- pun galat — kelihatannya persis seperti regu yang tidak bekerja.
    IF nama_regu IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.regu_perabasan r
      WHERE r.regu = nama_regu AND upper(r.ulp) = upper(w.ulp)
    ) THEN
      dilewati := dilewati || jsonb_build_object(
        'segmen', s.nama, 'sebab', format('Regu "%s" tidak terdaftar di ULP %s.', nama_regu, w.ulp));
      CONTINUE;
    END IF;

    IF nama_regu IS NULL THEN tanpa := tanpa + 1; END IF;

    urut := urut + 1;
    n := n + 1;
    INSERT INTO public.wo_perabasan_item (
      wo_id, segmen_id, urutan, ulp, penyulang, segmen_nama, panjang_km, panjang_dari, regu
    ) VALUES (
      p_wo_id, s.segmen_id, urut, s.ulp, s.penyulang, s.nama,
      s.panjang_pakai_km, s.panjang_dari, nama_regu
    );
  END LOOP;

  RETURN jsonb_build_object(
    'wo_id', p_wo_id, 'nama', w.nama, 'ulp', w.ulp,
    'item', n, 'tanpa_regu', tanpa, 'dilewati', dilewati);
END $fn$;


-- ── 2. Pintu masuk dari layar: tambah ke WO yang sudah ada ───────────────────
-- Targetnya boleh ikut dinaikkan dalam satu tindakan. Tanpa itu, WO bertarget
-- 2 km yang diisi 12 km akan menampilkan capaian 600% — angka yang benar
-- secara hitungan tapi tidak berarti apa-apa bagi yang membacanya.

CREATE OR REPLACE FUNCTION public.tambah_wo_perabasan(
  p_wo_id     UUID,
  p_segmen    UUID[],
  p_regu      JSONB   DEFAULT '{}'::jsonb,
  p_target_km NUMERIC DEFAULT NULL,
  p_oleh      TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  hasil JSONB;
  lama  NUMERIC;
BEGIN
  hasil := public.tambah_item_wo_perabasan(p_wo_id, p_segmen, p_regu, p_oleh);

  IF (hasil ->> 'item')::INT = 0 THEN
    RAISE EXCEPTION 'Tidak ada satu pun segmen yang bisa ditambahkan. %',
      COALESCE((SELECT string_agg(d ->> 'segmen' || ': ' || (d ->> 'sebab'), ' | ')
                FROM jsonb_array_elements(hasil -> 'dilewati') d), '');
  END IF;

  IF p_target_km IS NOT NULL THEN
    SELECT target_km INTO lama FROM public.wo_perabasan WHERE id = p_wo_id;
    IF p_target_km <> lama THEN
      UPDATE public.wo_perabasan
      SET target_km = p_target_km, updated_at = now()
      WHERE id = p_wo_id;

      INSERT INTO public.master_audit
        (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
      VALUES ('wo_perabasan', hasil ->> 'nama', hasil ->> 'ulp', 'target_km',
              to_jsonb(lama), to_jsonb(p_target_km), 'sunting_admin', auth.uid(), p_oleh);
    END IF;
  END IF;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('wo_perabasan', hasil ->> 'nama', hasil ->> 'ulp', 'tambah_item', NULL,
          hasil, 'sunting_admin', auth.uid(), p_oleh);

  RETURN hasil || jsonb_build_object(
    'rencana_km', (SELECT rencana_km FROM public.wo_perabasan_capaian WHERE wo_id = p_wo_id),
    'target_km',  (SELECT target_km  FROM public.wo_perabasan        WHERE id    = p_wo_id));
END $fn$;


-- ── 3. Menerbitkan WO — sekarang cuma membuat kepalanya ──────────────────────
-- Seluruh pemeriksaan per segmen dikerjakan `tambah_item_wo_perabasan`, jadi
-- aturannya hidup di SATU tempat. Bentuk kembaliannya dipertahankan persis
-- supaya layar tidak perlu ikut berubah.

CREATE OR REPLACE FUNCTION public.terbitkan_wo_perabasan(
  p_ulp       TEXT,
  p_nama      TEXT,
  p_target_km NUMERIC,
  p_segmen    UUID[],
  p_tgl_wo    DATE    DEFAULT CURRENT_DATE,
  p_regu      JSONB   DEFAULT '{}'::jsonb,
  p_oleh      TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  unit  TEXT := upper(btrim(COALESCE(p_ulp, '')));
  judul TEXT := btrim(COALESCE(p_nama, ''));
  wo    UUID;
  hasil JSONB;
BEGIN
  IF unit = '' THEN RAISE EXCEPTION 'ULP belum dipilih'; END IF;
  IF judul = '' THEN RAISE EXCEPTION 'Nama WO belum diisi'; END IF;

  PERFORM public.wajib_boleh_ulp(unit);

  INSERT INTO public.wo_perabasan (ulp, nama, tgl_wo, target_km, created_by)
  VALUES (unit, judul, COALESCE(p_tgl_wo, CURRENT_DATE), p_target_km, auth.uid())
  RETURNING id INTO wo;

  hasil := public.tambah_item_wo_perabasan(wo, p_segmen, p_regu, p_oleh);

  -- WO tanpa satu item pun tidak boleh tinggal. Galat di sini membatalkan
  -- INSERT kepalanya sekalian — seluruh fungsi satu pernyataan.
  IF (hasil ->> 'item')::INT = 0 THEN
    RAISE EXCEPTION 'Tidak ada satu pun segmen yang bisa dimasukkan. %',
      COALESCE((SELECT string_agg(d ->> 'segmen' || ': ' || (d ->> 'sebab'), ' | ')
                FROM jsonb_array_elements(hasil -> 'dilewati') d), '');
  END IF;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('wo_perabasan', judul, unit, 'terbit', NULL,
          jsonb_build_object('wo_id', wo, 'item', hasil -> 'item',
                             'target_km', p_target_km, 'tanpa_regu', hasil -> 'tanpa_regu'),
          'sunting_admin', auth.uid(), p_oleh);

  RETURN hasil || jsonb_build_object(
    'rencana_km', (SELECT rencana_km FROM public.wo_perabasan_capaian WHERE wo_id = wo));
END $fn$;


-- ── 4. Hak akses ─────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.tambah_item_wo_perabasan TO authenticated;
GRANT EXECUTE ON FUNCTION public.tambah_wo_perabasan      TO authenticated;
GRANT EXECUTE ON FUNCTION public.terbitkan_wo_perabasan   TO authenticated;


-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. WO yang masih bisa ditambah:
--      SELECT id, ulp, nama, tgl_wo, target_km FROM wo_perabasan
--      WHERE status = 'Terbit' ORDER BY tgl_wo DESC;
--
-- b. Tambahkan segmen, sekalian menaikkan targetnya:
--      SELECT jsonb_pretty(tambah_wo_perabasan(
--        '<wo_id>'::uuid,
--        ARRAY['<segmen_id>'::uuid],
--        '{"<segmen_id>": "RABAS 3"}'::jsonb,
--        12.0, 'uji'));
--
-- c. Nomor urutnya harus MELANJUTKAN, bukan mengulang dari 1:
--      SELECT urutan, segmen_nama, regu FROM wo_perabasan_item
--      WHERE wo_id = '<wo_id>' ORDER BY urutan;
-- =============================================================================
