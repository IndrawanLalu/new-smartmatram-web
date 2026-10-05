-- ════════════════════════════════════════════════════════════════════════════
-- Foto temuan / bukti lebih dari satu — paling banyak 3 (5 Okt 2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Keputusan user: Inspeksi JTM, Inspeksi JTR, Pemeliharaan Jaringan; 3 foto
-- (1 utama + 2 tambahan). Kolom foto yang lama TETAP menyimpan foto pertama,
-- jadi HP versi lama, web lama, laporan, dan aturan "temuan wajib berfoto"
-- tidak berubah. Foto tambahan di kolom baru.
--
--   JTM  inspeksi_jtm_periksa.foto_lain TEXT[] — diisi kirim_tiang_jtm SESUDAH
--        penilaian tersimpan (fungsi penilaiannya tidak disentuh).
--   JTR  TIDAK ADA perubahan server: foto_temuan sudah peta isian→foto dan
--        digabung tiap kirim; tambahan = kunci "<isian>#2" / "#3", slot kosong
--        dikirim null (lolos pemeriksaan, menghapus tambahan inspeksi lama).
--   PJ   pemeliharaan_jaringan.foto_sebelum_lain / foto_sesudah_lain TEXT[].
--
-- Disalin dari versi hidup: kirim_tiang_jtm (jtm-penamaan-baru.sql),
-- kirim_pemeliharaan_jaringan & pemeliharaan_jaringan_daftar
-- (harjar-kerja-hp.sql). Yang baru bertanda ★.
-- Jalankan SEBELUM OTA HP yang mengirim foto tambahan. HP lama tidak terpengaruh.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.inspeksi_jtm_periksa
  ADD COLUMN IF NOT EXISTS foto_lain TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.pemeliharaan_jaringan
  ADD COLUMN IF NOT EXISTS foto_sebelum_lain TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS foto_sesudah_lain TEXT[] NOT NULL DEFAULT '{}';

-- Daftar foto tambahan satu jawaban JTM; bukan larik = tidak ada.
CREATE OR REPLACE FUNCTION public._foto_lain(x JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN jsonb_typeof(x->'foto_lain') = 'array' THEN x->'foto_lain' ELSE '[]'::jsonb END
$$;


-- ── 1. JTM: kirim_tiang_jtm ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kirim_tiang_jtm(p_isi JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_role   TEXT;
  v_unit   TEXT;
  v_id     UUID := NULLIF(p_isi->>'inspeksi_id', '')::uuid;
  v_seg    UUID := NULLIF(p_isi->>'segmen_id', '')::uuid;
  v_tier   TEXT := COALESCE(NULLIF(p_isi->>'tier', ''), '1');
  v_nama   TEXT := NULLIF(btrim(COALESCE(p_isi->>'nama', '')), '');
  v_status TEXT;
  s_ulp    TEXT;
  peta     JSONB := '{}'::jsonb;   -- id_lokal → tiang_id
  hasil    JSONB := '[]'::jsonb;
  r        JSONB;
  b        JSONB;
  v_tiang  UUID;
  v_induk  UUID;
  v_kode   TEXT;
  d        JSONB;
  sisa     INT := 0;
  selesai  JSONB;
  v_ok     BOOLEAN;
  ditolak  JSONB := '[]'::jsonb;
  sebagian BOOLEAN := COALESCE((p_isi->>'boleh_sebagian')::boolean, false);
  v_catatan TEXT;
BEGIN
  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi, kemudian kirim ulang — isian tetap tersimpan di HP.';
  END IF;

  -- ── inspeksi mana ──
  IF v_id IS NOT NULL THEN
    SELECT status, segmen_id INTO v_status, v_seg FROM public.inspeksi_jtm WHERE id = v_id;
    IF NOT FOUND THEN v_seg := NULLIF(p_isi->>'segmen_id', '')::uuid; END IF;
    -- Dibatalkan admin (atau hilang): pekerjaan di HP tetap sah — dikirim ke
    -- inspeksi yang berjalan / yang baru di segmen yang sama.
    IF NOT FOUND OR v_status = 'Dibatalkan' THEN v_id := NULL; v_status := NULL; END IF;
  END IF;
  IF v_seg IS NULL THEN RAISE EXCEPTION 'Segmen tidak disebut — perbarui aplikasi lalu kirim ulang.'; END IF;
  SELECT ulp INTO s_ulp FROM public.segmen WHERE id = v_seg;
  IF v_role <> 'UP3' AND upper(COALESCE(v_unit, '')) <> upper(COALESCE(s_ulp, '')) THEN
    RAISE EXCEPTION 'Segmen ini milik ULP %, akun ini ULP %.', COALESCE(s_ulp, '-'), COALESCE(v_unit, '-');
  END IF;

  -- Dua tim yang mengirim segmen yang sama bersamaan: yang kedua menunggu,
  -- lalu menemukan inspeksi yang dibuat yang pertama.
  PERFORM pg_advisory_xact_lock(hashtext('inspeksi-jtm|' || v_seg::text || '|' || v_tier));

  IF v_id IS NULL THEN
    -- Dimulai dari HP tanpa sinyal: cari yang sedang berjalan di segmen ini
    -- (tim lain boleh sudah memulainya — keputusan d), baru buat bila tidak ada.
    -- Yang sudah DIKIRIM (Selesai) tidak dibuka lagi dari HP (butir 2).
    SELECT id, status INTO v_id, v_status FROM public.inspeksi_jtm
    WHERE segmen_id = v_seg AND tier = v_tier AND status IN ('Dijadwalkan', 'Dalam Proses', 'Ditolak', 'Selesai')
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF v_status = 'Selesai' THEN
    -- Kiriman "selesai" yang jawabannya hilang di jalan: semua tiangnya sudah
    -- ada → anggap berhasil. Selain itu tolak dengan jalan keluarnya.
    FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_isi->'tiang', '[]'::jsonb)) LOOP
      v_tiang := COALESCE(NULLIF(r->>'tiang_id', '')::uuid,
                          (SELECT id FROM public.tiang WHERE id_hp = NULLIF(r->>'id_lokal', '')::uuid));
      IF v_tiang IS NULL OR (r->'daftar' IS NOT NULL AND jsonb_typeof(r->'daftar') = 'array' AND
         NOT EXISTS (SELECT 1 FROM public.inspeksi_jtm_titik WHERE inspeksi_id = v_id AND tiang_id = v_tiang)) THEN
        sisa := sisa + 1;
      END IF;
    END LOOP;
    IF sisa = 0 AND COALESCE((p_isi->>'selesai')::boolean, false) THEN
      RETURN jsonb_build_object('inspeksi_id', v_id, 'sudah_ada', true, 'tiang', '[]'::jsonb);
    END IF;
    RAISE EXCEPTION 'Inspeksi segmen ini sudah dikirim dan menunggu persetujuan — tiang tambahan tidak bisa dikirim. Minta admin mengembalikannya bila perlu.';
  END IF;
  IF v_status = 'Diverifikasi' THEN
    RAISE EXCEPTION 'Inspeksi segmen ini sudah disetujui admin — tidak bisa ditambah lagi.';
  END IF;

  IF v_id IS NULL OR v_status = 'Ditolak' THEN
    -- Baru, atau dikembalikan admin: dibuka lewat fungsi yang sudah ada.
    v_id := public.mulai_inspeksi_jtm(v_seg, v_tier, v_nama);
  END IF;

  -- ── tiang ──
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_isi->'tiang', '[]'::jsonb)) LOOP
    v_tiang := NULLIF(r->>'tiang_id', '')::uuid;
    v_catatan := NULL;
    b := r->'baru';

    IF v_tiang IS NULL AND b IS NOT NULL AND jsonb_typeof(b) = 'object' THEN
      SELECT id INTO v_tiang FROM public.tiang WHERE id_hp = NULLIF(r->>'id_lokal', '')::uuid;
      IF v_tiang IS NULL THEN
        v_induk := COALESCE(NULLIF(b->>'induk_id', '')::uuid,
                            NULLIF(peta->>(b->>'induk_lokal'), '')::uuid,
                            (SELECT id FROM public.tiang WHERE id_hp = NULLIF(b->>'induk_lokal', '')::uuid AND status_hidup = 'aktif'));
        -- ★ Jawaban regu "jalur utama dari induk ke arah mana" — cabang yang
        -- dititik sebelum jalur utamanya (penentu R/L, jtm-penamaan-baru.sql).
        IF NULLIF(b->>'arah_utama', '') IN ('kanan', 'lurus', 'kiri') AND v_induk IS NOT NULL THEN
          UPDATE public.tiang SET arah_utama_dari_sini = b->>'arah_utama', updated_at = now() WHERE id = v_induk;
        END IF;
        d := public.tambah_tiang_jtm(
          v_seg,
          NULLIF(b->>'lat', '')::double precision,
          NULLIF(b->>'lng', '')::double precision,
          NULLIF(b->>'akurasi', '')::double precision,
          v_induk,
          NULLIF(b->>'jenis', ''),
          NULLIF(b->>'konstruksi', ''),
          NULLIF(b->>'nomor_lama', ''),
          v_nama,
          COALESCE((b->>'cabang')::boolean, false),
          COALESCE((b->>'batang_beda')::boolean, false));
        v_tiang := (d->>'id')::uuid;
        -- ★ Dikirim sebagai jalur utama tapi dinamai cabang (induknya sudah
        -- punya lanjutan utama): regu diberi tahu, bukan ditolak.
        IF NOT COALESCE((b->>'cabang')::boolean, false)
           AND (SELECT cabang_baru FROM public.tiang WHERE id = v_tiang) THEN
          SELECT 'Dinamai cabang ' || t.kode || ' — ' || COALESCE(i.kode, 'induknya')
                 || ' sudah punya lanjutan jalur utama'
                 || COALESCE(' (' || (SELECT a.kode FROM public.tiang a
                                      WHERE a.induk_id = t.induk_id AND a.id <> t.id AND a.status_hidup = 'aktif'
                                        AND NOT COALESCE(a.cabang_baru, false) ORDER BY a.created_at LIMIT 1) || ')', '')
                 || '. Kalau terbalik, admin bisa menukarnya di web.'
            INTO v_catatan
          FROM public.tiang t LEFT JOIN public.tiang i ON i.id = t.induk_id
          WHERE t.id = v_tiang;
        END IF;
        UPDATE public.tiang SET id_hp = NULLIF(r->>'id_lokal', '')::uuid WHERE id = v_tiang;
        -- ★ Tiang kedua gardu portal (dibuat HP saat penilaian tiang gardunya
        -- disimpan). Tiang gardunya selalu dikirim lebih dulu.
        IF COALESCE(NULLIF(b->>'pasangan_dari', ''), NULLIF(b->>'pasangan_lokal', '')) IS NOT NULL THEN
          UPDATE public.tiang
          SET pasangan_portal_dari = COALESCE(
                NULLIF(b->>'pasangan_dari', '')::uuid,
                NULLIF(peta->>(b->>'pasangan_lokal'), '')::uuid,
                (SELECT id FROM public.tiang WHERE id_hp = NULLIF(b->>'pasangan_lokal', '')::uuid AND status_hidup = 'aktif'))
          WHERE id = v_tiang;
        END IF;
      END IF;
    END IF;
    IF v_tiang IS NULL THEN
      RAISE EXCEPTION 'Satu tiang di kiriman ini tidak punya id — perbarui aplikasi lalu kirim ulang.';
    END IF;

    -- ★ Tiang yang sudah DIBATALKAN (salah titik) tidak punya tempat untuk
    -- penilaiannya. Dilewati dan dilaporkan — bukan menolak seluruh kiriman,
    -- karena regu tidak punya jalan keluar dari penolakan itu.
    IF EXISTS (SELECT 1 FROM public.tiang WHERE id = v_tiang AND status_hidup = 'batal') THEN
      hasil := hasil || jsonb_build_object('id_lokal', r->>'id_lokal', 'tiang_id', v_tiang,
        'kode', (SELECT kode FROM public.tiang WHERE id = v_tiang), 'dilewati', 'dibatalkan');
      CONTINUE;
    END IF;
    IF r->>'id_lokal' IS NOT NULL THEN peta := peta || jsonb_build_object(r->>'id_lokal', v_tiang); END IF;

    IF r->'daftar' IS NOT NULL AND jsonb_typeof(r->'daftar') = 'array' THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(r->'daftar') x
        WHERE COALESCE(x->>'foto_url', '') NOT IN ('') AND x->>'foto_url' NOT LIKE 'http%'
           OR COALESCE(x->>'foto_tutup_url', '') NOT IN ('') AND x->>'foto_tutup_url' NOT LIKE 'http%'
           -- ★ foto tambahan juga harus sudah terunggah
           OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(public._foto_lain(x)) f WHERE f NOT LIKE 'http%')
      ) THEN
        RAISE EXCEPTION 'Foto temuan belum terunggah. Kirim ulang saat sinyal lebih baik.';
      END IF;
      -- ★ Paling banyak 3 foto per temuan (1 utama + 2 tambahan).
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'daftar') x WHERE jsonb_array_length(public._foto_lain(x)) > 2) THEN
        RAISE EXCEPTION 'Paling banyak 3 foto per temuan.';
      END IF;
      -- ★ Penolakan satu penilaian (jarak, GPS, temuan tanpa foto, …) tidak
      -- menggagalkan seluruh kiriman: tiangnya dilaporkan, sisanya diterima.
      v_ok := true;
      BEGIN
        PERFORM public.nilai_tiang_jtm(
          v_id, v_tiang,
          NULLIF(r->>'lat', '')::double precision,
          NULLIF(r->>'lng', '')::double precision,
          NULLIF(r->>'akurasi', '')::double precision,
          r->'daftar',
          NULLIF(btrim(COALESCE(r->>'catatan', '')), ''),
          v_nama);
      EXCEPTION WHEN raise_exception THEN
        IF NOT sebagian THEN RAISE; END IF;
        v_ok := false;
        ditolak := ditolak || jsonb_build_object(
          'id_lokal', r->>'id_lokal', 'tiang_id', v_tiang,
          'kode', (SELECT kode FROM public.tiang WHERE id = v_tiang), 'pesan', SQLERRM);
      END;
    END IF;
    IF v_ok IS TRUE AND r->'daftar' IS NOT NULL AND jsonb_typeof(r->'daftar') = 'array' THEN
      -- ★ Kiriman = isian LENGKAP tiang ini. Jawaban dari kiriman sebelumnya
      -- yang tidak ada lagi (item bersyarat yang kini tidak berlaku, mis.
      -- jumperan diubah jadi "tidak ada") dibuang — kalau tidak, ikut jadi
      -- keadaan terakhir & temuan sesudah disetujui.
      DELETE FROM public.inspeksi_jtm_periksa p
      USING public.inspeksi_jtm_titik tk
      WHERE p.titik_id = tk.id AND tk.inspeksi_id = v_id AND tk.tiang_id = v_tiang
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(r->'daftar') x
          WHERE x->>'item_kode' = p.item_kode
            AND COALESCE(NULLIF(x->>'bagian', ''), '-') = p.bagian
            AND COALESCE(NULLIF(x->>'sirkit_segmen_id', '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
              = COALESCE(p.sirkit_segmen_id, '00000000-0000-0000-0000-000000000000'::uuid));

      -- Waktu menilai = saat di HP (butir 17), dipotong ke sekarang bila jam HP maju.
      -- ★ Catatan ikut kiriman terakhir — mengosongkannya juga sah.
      UPDATE public.inspeksi_jtm_titik
      SET dinilai_at = LEAST(COALESCE(NULLIF(r->>'dinilai_at', '')::timestamptz, now()), now()),
          catatan = NULLIF(btrim(COALESCE(r->>'catatan', '')), '')
      WHERE inspeksi_id = v_id AND tiang_id = v_tiang;

      -- ★ Foto tambahan temuan. Ditempel SESUDAH penilaian tersimpan, supaya
      -- fungsi penilaiannya tidak berubah; foto utama tetap lewat foto_url.
      -- Ikut kiriman terakhir: yang dihapus regu ikut hilang di sini.
      UPDATE public.inspeksi_jtm_periksa p
      SET foto_lain = ARRAY(SELECT jsonb_array_elements_text(public._foto_lain(x)))
      FROM public.inspeksi_jtm_titik tk, jsonb_array_elements(r->'daftar') x
      WHERE p.titik_id = tk.id AND tk.inspeksi_id = v_id AND tk.tiang_id = v_tiang
        AND x->>'item_kode' = p.item_kode
        AND COALESCE(NULLIF(x->>'bagian', ''), '-') = p.bagian
        AND COALESCE(NULLIF(x->>'sirkit_segmen_id', '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(p.sirkit_segmen_id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND p.foto_lain IS DISTINCT FROM ARRAY(SELECT jsonb_array_elements_text(public._foto_lain(x)));
    END IF;

    -- ★ induk_id ikut: HP menambal garis induk tiang baru tanpa memuat ulang segmen.
    SELECT kode, induk_id INTO v_kode, v_induk FROM public.tiang WHERE id = v_tiang;
    hasil := hasil || jsonb_build_object('id_lokal', r->>'id_lokal', 'tiang_id', v_tiang, 'kode', v_kode, 'induk_id', v_induk,
                                         'catatan', v_catatan);
  END LOOP;

  -- ── tutup ──
  -- ★ Ada penilaian yang ditolak = belum bisa dinyatakan selesai.
  IF COALESCE((p_isi->>'selesai')::boolean, false) AND jsonb_array_length(ditolak) = 0 THEN
    selesai := public.selesaikan_inspeksi_jtm(v_id, v_nama, NULLIF(btrim(COALESCE(p_isi->>'catatan_selesai', '')), ''));
  END IF;

  RETURN jsonb_build_object('inspeksi_id', v_id, 'sudah_ada', false, 'tiang', hasil, 'selesai', selesai,
                            'ditolak', ditolak);
END $fn$;

GRANT EXECUTE ON FUNCTION public.kirim_tiang_jtm(JSONB) TO authenticated;


-- ── 2. Pemeliharaan Jaringan: kirim ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kirim_pemeliharaan_jaringan(p_isi JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_id    UUID := NULLIF(p_isi->>'id', '')::uuid;
  v_insp  TEXT := NULLIF(btrim(COALESCE(p_isi->>'inspeksi_id', '')), '');
  v_jenis TEXT := upper(btrim(COALESCE(p_isi->>'jenis', '')));
  v_peny  TEXT := upper(btrim(COALESCE(p_isi->>'penyulang', '')));
  v_kat   TEXT := p_isi->>'kategori';
  v_kerja TEXT := btrim(COALESCE(p_isi->>'pekerjaan', ''));
  v_fs    TEXT := COALESCE(p_isi->>'foto_sebelum_url', '');
  v_fd    TEXT := COALESCE(p_isi->>'foto_sesudah_url', '');
  -- ★ foto tambahan (paling banyak 2 per sisi)
  v_fs2   TEXT[] := ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_isi->'foto_sebelum_lain') = 'array' THEN p_isi->'foto_sebelum_lain' ELSE '[]'::jsonb END));
  v_fd2   TEXT[] := ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_isi->'foto_sesudah_lain') = 'array' THEN p_isi->'foto_sesudah_lain' ELSE '[]'::jsonb END));
  v_hari  DATE := (now() AT TIME ZONE 'Asia/Makassar')::date;
  v_tgl   DATE := COALESCE(NULLIF(p_isi->>'tgl', '')::date, (now() AT TIME ZONE 'Asia/Makassar')::date);
  v_nama  TEXT := NULLIF(btrim(COALESCE(p_isi->>'nama', '')), '');
  v_ulp   TEXT;
  ada     public.pemeliharaan_jaringan;
  t       public.inspeksi;
  lain    public.pemeliharaan_jaringan;
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'Catatan tanpa id — perbarui aplikasi lalu kirim ulang.'; END IF;

  SELECT * INTO ada FROM public.pemeliharaan_jaringan WHERE id = v_id FOR UPDATE;
  IF FOUND AND ada.status <> 'Dikembalikan' THEN
    -- Kiriman ulang setelah jawaban server hilang di jalan.
    RETURN jsonb_build_object('id', v_id, 'ulp', ada.ulp, 'sudah_ada', true);
  END IF;

  -- ── isian (sama dengan simpan_pemeliharaan_jaringan) ──
  IF v_jenis NOT IN ('JTM', 'JTR') THEN RAISE EXCEPTION 'Jenis jaringan harus JTM atau JTR'; END IF;
  IF v_peny = '' THEN RAISE EXCEPTION 'Penyulang wajib dipilih'; END IF;
  IF v_kerja = '' THEN RAISE EXCEPTION 'Pekerjaan wajib diisi'; END IF;
  IF v_fs NOT LIKE 'http%' OR v_fd NOT LIKE 'http%' THEN
    RAISE EXCEPTION 'Foto sebelum dan sesudah dua-duanya wajib dan harus sudah terunggah.';
  END IF;
  IF cardinality(v_fs2) > 2 OR cardinality(v_fd2) > 2 THEN
    RAISE EXCEPTION 'Paling banyak 3 foto sebelum dan 3 foto sesudah.';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_fs2 || v_fd2) f WHERE f NOT LIKE 'http%') THEN
    RAISE EXCEPTION 'Foto tambahan belum terunggah. Kirim ulang saat sinyal lebih baik.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pemeliharaan_jaringan_ref r WHERE r.kode = v_kat AND r.aktif) THEN
    RAISE EXCEPTION 'Kategori "%" tidak ada di daftar yang aktif', v_kat;
  END IF;
  IF v_tgl > v_hari THEN RAISE EXCEPTION 'Tanggal pekerjaan tidak boleh di masa depan.'; END IF;

  SELECT upper(pr.ulp) INTO v_ulp FROM public.penyulang_ref pr WHERE upper(pr.penyulang) = v_peny LIMIT 1;
  v_ulp := COALESCE(v_ulp, NULLIF(upper(btrim(COALESCE(p_isi->>'ulp', ''))), ''));
  IF v_ulp IS NULL THEN RAISE EXCEPTION 'ULP tidak diketahui untuk penyulang %', v_peny; END IF;

  -- ── tugas ──
  IF v_insp IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('tugas-harjar|' || v_insp));
    SELECT * INTO t FROM public.inspeksi WHERE id::text = v_insp FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tugas tidak ditemukan — mungkin sudah dihapus admin. Hapus kaitannya lalu kirim sebagai pekerjaan di luar tugas.'; END IF;
    PERFORM public._harjar_boleh_tugas(t);

    SELECT * INTO lain FROM public.pemeliharaan_jaringan
    WHERE inspeksi_id::text = v_insp AND status <> 'Dibatalkan' AND id <> v_id;
    IF FOUND THEN
      RAISE EXCEPTION 'Tugas ini sudah dikirim % pada %. Satu tugas satu catatan.',
        COALESCE(lain.petugas_nama, 'regu lain'), lain.tgl;
    END IF;
    IF t.status NOT IN ('Ditugaskan', 'Dalam Proses') THEN
      RAISE EXCEPTION 'Tugas ini sudah berstatus % — tidak bisa dikirim lagi.', t.status;
    END IF;
  END IF;

  IF ada.id IS NULL THEN
    INSERT INTO public.pemeliharaan_jaringan
      (id, inspeksi_id, jenis, penyulang, ulp, kategori, pekerjaan, alamat,
       lat, lng, akurasi, foto_sebelum_url, foto_sesudah_url,
       petugas_uid, petugas_nama, catatan, tgl, foto_sebelum_lain, foto_sesudah_lain)
    VALUES
      (v_id, t.id, v_jenis, v_peny, v_ulp, v_kat, v_kerja,
       NULLIF(btrim(COALESCE(p_isi->>'alamat', '')), ''),
       NULLIF(p_isi->>'lat', '')::double precision, NULLIF(p_isi->>'lng', '')::double precision,
       NULLIF(p_isi->>'akurasi', '')::double precision,
       v_fs, v_fd, auth.uid(), v_nama, NULLIF(btrim(COALESCE(p_isi->>'catatan', '')), ''), v_tgl, v_fs2, v_fd2);
  ELSE
    -- Kiriman ulang yang dikembalikan: baris yang sama diperbarui.
    UPDATE public.pemeliharaan_jaringan SET
      inspeksi_id = t.id, jenis = v_jenis, penyulang = v_peny, ulp = v_ulp, kategori = v_kat,
      pekerjaan = v_kerja, alamat = NULLIF(btrim(COALESCE(p_isi->>'alamat', '')), ''),
      lat = NULLIF(p_isi->>'lat', '')::double precision, lng = NULLIF(p_isi->>'lng', '')::double precision,
      akurasi = NULLIF(p_isi->>'akurasi', '')::double precision,
      foto_sebelum_url = v_fs, foto_sesudah_url = v_fd,
      foto_sebelum_lain = v_fs2, foto_sesudah_lain = v_fd2,
      petugas_uid = auth.uid(), petugas_nama = COALESCE(v_nama, petugas_nama),
      catatan = NULLIF(btrim(COALESCE(p_isi->>'catatan', '')), ''), tgl = v_tgl,
      status = 'Selesai', verified_at = NULL, verified_by = NULL, updated_at = now()
    WHERE id = v_id;
  END IF;

  IF t.id IS NOT NULL THEN
    UPDATE public.inspeksi
    SET status = 'Selesai', foto_sesudah_url = v_fd, tgl_eksekusi = v_tgl,
        updated_by = COALESCE(v_nama, updated_by), updated_at = now()
    WHERE id = t.id;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'ulp', v_ulp, 'sudah_ada', false);
END $fn$;
GRANT EXECUTE ON FUNCTION public.kirim_pemeliharaan_jaringan(JSONB) TO authenticated;


-- ── 3. Daftar web Pemeliharaan Jaringan (kolom baru di belakang) ────────────
CREATE OR REPLACE VIEW public.pemeliharaan_jaringan_daftar AS
SELECT
  p.id,
  p.jenis,
  p.penyulang,
  p.ulp,
  p.kategori,
  r.label AS kategori_label,
  p.pekerjaan,
  p.alamat,
  p.lat,
  p.lng,
  p.foto_sebelum_url,
  p.foto_sesudah_url,
  p.status,
  p.petugas_nama,
  p.catatan,
  p.tgl,
  p.verified_at,
  p.verified_by,
  p.created_at,
  p.inspeksi_id,
  p.dikembalikan_at,
  p.dikembalikan_alasan,
  p.dikembalikan_oleh,
  i.temuan          AS tugas_temuan,
  i.deskripsi       AS tugas_deskripsi,
  i.assigned_at     AS tugas_ditugaskan,
  i.foto_sebelum_url AS tugas_foto,
  p.foto_sebelum_lain,                 -- ★
  p.foto_sesudah_lain                  -- ★
FROM public.pemeliharaan_jaringan p
LEFT JOIN public.pemeliharaan_jaringan_ref r ON r.kode = p.kategori
LEFT JOIN public.inspeksi i ON i.id = p.inspeksi_id;
GRANT SELECT ON public.pemeliharaan_jaringan_daftar TO authenticated;
