-- ════════════════════════════════════════════════════════════════════════════
-- Kategori temuan JTM: Urgent · Rawan · Biasa (rencana-notif-temuan-jtm.md, B)
-- ════════════════════════════════════════════════════════════════════════════
-- Keputusan user 6 Okt 2026: regu memilih kategori setiap temuan JTM di HP
-- (wajib, tanpa pilihan bawaan). Hanya Urgent yang dikirim WA — saat regu
-- mengirim, lewat container `pekerja` yang memantau tabel ini secara realtime.
--
--   1. inspeksi_jtm_periksa.kategori_temuan (NULL = HP lama / bukan temuan)
--   2. kirim_tiang_jtm menempelkannya SESUDAH penilaian tersimpan (pola foto_lain;
--      `_nilai_tiang_jtm_inti` tidak disentuh). Disalin dari versi hidup:
--      scripts/foto-temuan-banyak.sql. Yang baru bertanda ◆.
--   3. View KECIL `jtm_kategori_temuan` — view yang hidup (tiang_kondisi_terakhir,
--      jtm_temuan) TIDAK diubah; web menggabungkan lewat inspeksi + tiang + isian.
--   4. Tabel ini masuk publication realtime + REPLICA IDENTITY FULL (supaya
--      pekerja tahu kategori SEBELUM berubah → hanya yang BARU menjadi Urgent).
--
-- Jalankan SEBELUM OTA HP. HP lama tidak mengirim kategori → tidak ada WA.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.inspeksi_jtm_periksa
  ADD COLUMN IF NOT EXISTS kategori_temuan TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inspeksi_jtm_periksa_kategori_valid') THEN
    ALTER TABLE public.inspeksi_jtm_periksa
      ADD CONSTRAINT inspeksi_jtm_periksa_kategori_valid
      CHECK (kategori_temuan IS NULL OR kategori_temuan IN ('Urgent', 'Rawan', 'Biasa'));
  END IF;
END $$;
COMMENT ON COLUMN public.inspeksi_jtm_periksa.kategori_temuan IS
  'Kategori temuan dipilih regu: Urgent (WA saat dikirim) / Rawan / Biasa. NULL = HP lama atau bukan temuan.';


-- ── 1. kirim_tiang_jtm ───────────────────────────────────────────────────────
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
      -- ◆ Kategori temuan hanya Urgent / Rawan / Biasa.
      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(r->'daftar') x
        WHERE NULLIF(x->>'kategori_temuan', '') IS NOT NULL
          AND x->>'kategori_temuan' NOT IN ('Urgent', 'Rawan', 'Biasa')
      ) THEN
        RAISE EXCEPTION 'Kategori temuan harus Urgent, Rawan, atau Biasa — perbarui aplikasi lalu kirim ulang.';
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

      -- ◆ Kategori temuan (Urgent/Rawan/Biasa) — juga ditempel sesudah penilaian.
      -- HP lama tidak mengirim kuncinya: kategori yang sudah ada dipertahankan.
      -- Hanya berubah bila memang beda, supaya kirim ulang tidak memicu notif.
      UPDATE public.inspeksi_jtm_periksa p
      SET kategori_temuan = NULLIF(x->>'kategori_temuan', '')
      FROM public.inspeksi_jtm_titik tk, jsonb_array_elements(r->'daftar') x
      WHERE p.titik_id = tk.id AND tk.inspeksi_id = v_id AND tk.tiang_id = v_tiang
        AND x ? 'kategori_temuan'
        AND x->>'item_kode' = p.item_kode
        AND COALESCE(NULLIF(x->>'bagian', ''), '-') = p.bagian
        AND COALESCE(NULLIF(x->>'sirkit_segmen_id', '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(p.sirkit_segmen_id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND p.kategori_temuan IS DISTINCT FROM NULLIF(x->>'kategori_temuan', '');
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


-- ── 2. Kategori per temuan, untuk digabung web ──────────────────────────────
CREATE OR REPLACE VIEW public.jtm_kategori_temuan AS
SELECT tk.inspeksi_id, tk.tiang_id, p.item_kode, p.bagian, p.sirkit_segmen_id, p.kategori_temuan
FROM public.inspeksi_jtm_periksa p
JOIN public.inspeksi_jtm_titik tk ON tk.id = p.titik_id
WHERE p.kategori_temuan IS NOT NULL;

GRANT SELECT ON public.jtm_kategori_temuan TO authenticated;


-- ── 3. Realtime untuk pekerja ────────────────────────────────────────────────
ALTER TABLE public.inspeksi_jtm_periksa REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'inspeksi_jtm_periksa'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inspeksi_jtm_periksa;
  END IF;
END $$;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
--   SELECT count(*) FROM jtm_kategori_temuan;   -- 0 sampai HP baru mengirim
