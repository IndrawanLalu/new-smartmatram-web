-- ⚠ JANGAN DIJALANKAN ULANG SELURUHNYA (5 Okt 2026). Fungsi berikut di
--   skrip ini SUDAH DIGANTIKAN: kirim_tiang_jtm (terakhir di jtm-penamaan-baru.sql).
--   Menjalankan ulang skrip ini mengembalikan versi lamanya.
-- =============================================================================
-- Hak akses fungsi JTM (audit A6) + gardu portal = dua tiang
-- Keputusan user 2 Okt 2026 (rencana-hak-akses-dan-portal.md):
--   • keputusan & kerja web  → hanya UP3 dan admin ULP itu (`wajib_boleh_ulp`)
--   • tindakan lapangan (HP) → akun ULP itu yang perannya punya menu JTM/JTR
--   • portal: tiang kedua dibuat HP saat Simpan (isian disalin), bernama
--     nomor berikutnya; portal lama dikoreksi admin lewat peta.
--   • kirim: satu penilaian yang ditolak (mis. "Anda 62 m dari tiang") tidak
--     lagi menahan seluruh kiriman — tiangnya dilaporkan, sisanya diterima.
--     Hanya untuk HP baru (`boleh_sebagian`); HP lama tetap semua-atau-tidak.
-- Jalankan manual di Supabase SQL Editor, SESUDAH `jtm-kirim-otomatis.sql`.
-- Idempoten. SQL dulu, baru OTA HP & push web (HP membaca kolom baru).
--
-- CARA MEMASANG PEMERIKSA HAK — badan fungsi TIDAK disalin dari skrip lama.
-- Fungsi yang hidup diganti nama jadi `_<nama>_inti` (sekali), lalu nama
-- aslinya diisi pembungkus: periksa hak → panggil inti. Tanda tangan
-- pembungkus dibaca dari fungsi hidup (`pg_get_function_arguments`), jadi
-- parameter, urutan, dan nilai bawaannya pasti sama.
--
-- ⚠ MULAI SEKARANG: mengubah isi fungsi-fungsi ini = mengubah `_<nama>_inti`.
--   `CREATE OR REPLACE FUNCTION public.<nama>` akan MENIMPA pembungkusnya dan
--   pemeriksa hak hilang. Daftar fungsinya ada di bagian 2.
-- =============================================================================


-- ── 1. Pemeriksa hak tindakan lapangan ───────────────────────────────────────
-- Pasangan `wajib_boleh_ulp` (sudah ada: UP3 / admin ULP itu, untuk keputusan).
-- Boleh: peran dengan `sees_all_units` (UP3), atau peran yang punya menu
-- jtm/jtr DAN unitnya = ULP data. Menu dibaca dari tabel `roles` — peran baru
-- yang diberi menu JTM otomatis ikut boleh, tanpa mengubah SQL.
-- Sesi tanpa pengguna (SQL Editor / kunci layanan) dibiarkan lewat: itu admin
-- basis data, bukan akun aplikasi. Permintaan `anon` tetap ditolak.

CREATE OR REPLACE FUNCTION public.wajib_kerja_ulp(p_ulp TEXT)
RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  klaim JSONB := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  r     RECORD;
BEGIN
  IF auth.uid() IS NULL AND (klaim IS NULL OR klaim->>'role' = 'service_role') THEN
    RETURN;
  END IF;

  SELECT ur.role, ur.unit, ro.sees_all_units, ro.menus
    INTO r
  FROM public.user_roles ur
  LEFT JOIN public.roles ro ON ro.code = ur.role
  WHERE ur.user_id = auth.uid();

  IF r.role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi — isian tetap tersimpan di HP.';
  END IF;
  IF COALESCE(r.sees_all_units, false) THEN RETURN; END IF;
  IF NOT (COALESCE(r.menus, '{}'::text[]) && ARRAY['jtm', 'jtr']) THEN
    RAISE EXCEPTION 'Peran % tidak punya akses Inspeksi JTM/JTR. Minta admin mengatur perannya.', r.role;
  END IF;
  IF upper(COALESCE(r.unit, '')) <> upper(COALESCE(p_ulp, '')) THEN
    RAISE EXCEPTION 'Data ini milik ULP %, akun ini ULP %.', COALESCE(p_ulp, '-'), COALESCE(r.unit, '-');
  END IF;
END $fn$;

GRANT EXECUTE ON FUNCTION public.wajib_kerja_ulp(TEXT) TO authenticated;


-- ── 2. Pembungkus pemeriksa hak ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._pasang_pemeriksa_hak(
  p_nama    TEXT,   -- nama fungsi publik
  p_periksa TEXT,   -- ekspresi pemeriksa, boleh memakai nama parameter
  p_sebelum TEXT DEFAULT NULL  -- pernyataan tambahan sebelum inti (opsional)
) RETURNS VOID
LANGUAGE plpgsql AS $fn$
DECLARE
  inti   TEXT := '_' || p_nama || '_inti';
  o      OID;
  n      INT;
  args   TEXT;
  ident  TEXT;
  hasil  TEXT;
  nama   TEXT[];
  panggil TEXT;
  badan  TEXT;
BEGIN
  -- Badan yang hidup pindah ke nama dalam — SEKALI. Dijalankan ulang, langkah
  -- ini dilewati dan pembungkusnya saja yang ditulis ulang.
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND p.proname = inti;
  IF n = 0 THEN
    SELECT count(*), min(p.oid) INTO n, o FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
     WHERE s.nspname = 'public' AND p.proname = p_nama;
    IF n <> 1 THEN
      RAISE EXCEPTION 'Fungsi % ditemukan % versi — harus tepat satu. Bereskan dulu sebelum memasang pemeriksa.', p_nama, n;
    END IF;
    EXECUTE format('ALTER FUNCTION %s RENAME TO %I', o::regprocedure, inti);
  END IF;

  SELECT p.oid, p.proargnames INTO o, nama FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND p.proname = inti;
  args  := pg_get_function_arguments(o);
  ident := pg_get_function_identity_arguments(o);
  hasil := pg_get_function_result(o);
  SELECT string_agg(format('%I => %I', a, a), ', ') INTO panggil FROM unnest(nama) a;
  panggil := format('public.%I(%s)', inti, COALESCE(panggil, ''));

  badan := 'BEGIN PERFORM ' || p_periksa || '; '
        || COALESCE(p_sebelum || '; ', '')
        || CASE WHEN hasil = 'void' THEN 'PERFORM ' || panggil || '; ' ELSE 'RETURN ' || panggil || '; ' END
        || 'END';

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS %L',
    p_nama, args, hasil, badan);
  -- Inti hanya bisa dipanggil lewat pembungkusnya.
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', inti, ident);
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon, authenticated', inti, ident);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', p_nama, ident);
  EXECUTE format('COMMENT ON FUNCTION public.%I(%s) IS %L', p_nama, ident,
    'PEMBUNGKUS HAK (A6, 2 Okt 2026): ' || p_periksa || ' → ' || inti || '. Ubah isinya di ' || inti || ', bukan di sini.');
END $fn$;

-- Lapangan (HP; tutup/percabangan/batalkan juga dipakai admin di web — admin lolos).
SELECT public._pasang_pemeriksa_hak('rintis_segmen_jtm',       'public.wajib_kerja_ulp(p_ulp)');
SELECT public._pasang_pemeriksa_hak('tutup_segmen_jtm',        'public.wajib_kerja_ulp((SELECT ulp FROM public.segmen WHERE id = p_segmen_id))');
SELECT public._pasang_pemeriksa_hak('tumpangi_tiang_jtm',      'public.wajib_kerja_ulp((SELECT ulp FROM public.segmen WHERE id = p_segmen_id))');
SELECT public._pasang_pemeriksa_hak('koreksi_titik_tiang_jtm', 'public.wajib_kerja_ulp((SELECT ulp FROM public.tiang WHERE id = p_tiang_id))');
SELECT public._pasang_pemeriksa_hak('tandai_percabangan_jtm',  'public.wajib_kerja_ulp((SELECT ulp FROM public.tiang WHERE id = p_tiang_id))');
SELECT public._pasang_pemeriksa_hak('tambah_tiang_jtm',        'public.wajib_kerja_ulp((SELECT ulp FROM public.segmen WHERE id = p_segmen_id))');
SELECT public._pasang_pemeriksa_hak('nilai_tiang_jtm',         'public.wajib_kerja_ulp((SELECT ulp FROM public.inspeksi_jtm WHERE id = p_inspeksi_id))');
SELECT public._pasang_pemeriksa_hak('mulai_inspeksi_jtm',      'public.wajib_kerja_ulp((SELECT ulp FROM public.segmen WHERE id = p_segmen_id))');
SELECT public._pasang_pemeriksa_hak('selesaikan_inspeksi_jtm', 'public.wajib_kerja_ulp((SELECT ulp FROM public.inspeksi_jtm WHERE id = p_id))');
-- Tiang gardu dibatalkan → pasangan portalnya (yang tidak menyuplai apa pun)
-- ikut dibatalkan; tanpa ini pembatalan ditolak "masih menyuplai 1 tiang".
SELECT public._pasang_pemeriksa_hak('batalkan_tiang',
  'public.wajib_kerja_ulp((SELECT ulp FROM public.tiang WHERE id = p_id))',
  'PERFORM public._batalkan_tiang_inti(x.id, p_nama, ''ikut tiang gardunya dibatalkan: '' || btrim(p_alasan)) '
  || 'FROM public.tiang x WHERE x.pasangan_portal_dari = p_id AND x.induk_id = p_id AND x.status_hidup = ''aktif'' '
  || 'AND btrim(COALESCE(p_alasan, '''')) <> '''' '
  || 'AND NOT EXISTS (SELECT 1 FROM public.tiang c WHERE (c.induk_id = x.id OR c.induk_jtr_id = x.id) AND c.status_hidup = ''aktif'')');

-- Keputusan & kerja web: UP3 dan admin ULP itu saja.
SELECT public._pasang_pemeriksa_hak('putuskan_inspeksi_jtm',      'public.wajib_boleh_ulp((SELECT ulp FROM public.inspeksi_jtm WHERE id = p_id))');
SELECT public._pasang_pemeriksa_hak('batalkan_inspeksi_jtm',      'public.wajib_boleh_ulp((SELECT ulp FROM public.inspeksi_jtm WHERE id = p_id))');
SELECT public._pasang_pemeriksa_hak('gabung_inspeksi_jtm',        'public.wajib_boleh_ulp((SELECT ulp FROM public.inspeksi_jtm WHERE id = p_tujuan))');
SELECT public._pasang_pemeriksa_hak('buang_inspeksi_kosong_jtm',  'public.wajib_boleh_ulp((SELECT ulp FROM public.inspeksi_jtm WHERE id = p_id))');
SELECT public._pasang_pemeriksa_hak('ubah_induk_tiang_jtm',       'public.wajib_boleh_ulp((SELECT ulp FROM public.tiang WHERE id = p_tiang_id))');
SELECT public._pasang_pemeriksa_hak('ubah_kode_tiang_jtm',        'public.wajib_boleh_ulp((SELECT ulp FROM public.tiang WHERE id = p_tiang_id))');
SELECT public._pasang_pemeriksa_hak('nomori_ulang_penyulang_jtm', 'public.wajib_boleh_ulp(p_ulp)');
SELECT public._pasang_pemeriksa_hak('gabung_segmen',              'public.wajib_boleh_ulp((SELECT ulp FROM public.segmen WHERE id = p_ke))');
SELECT public._pasang_pemeriksa_hak('impor_tiang_jtm',            'public.wajib_boleh_ulp(p_ulp)');


-- ── 3. Pasangan portal ───────────────────────────────────────────────────────
-- Gardu portal berdiri di DUA tiang. Tiang kedua dibuat HP saat penilaian
-- tiang gardunya disimpan (isian disalin), atau oleh admin lewat peta untuk
-- portal lama. Kolom ini menandai "tiang ini pasangan portal dari X" — supaya
-- tidak dibuat tiang ketiga, dan supaya peta bisa menyebutnya.

ALTER TABLE public.tiang
  ADD COLUMN IF NOT EXISTS pasangan_portal_dari UUID REFERENCES public.tiang(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.tiang.pasangan_portal_dari IS
  'Tiang kedua gardu portal: menunjuk tiang gardu pasangannya. NULL = bukan pasangan portal.';
CREATE INDEX IF NOT EXISTS tiang_pasangan_portal_idx ON public.tiang (pasangan_portal_dari)
  WHERE pasangan_portal_dari IS NOT NULL;


-- ── 4. kirim_tiang_jtm meneruskan pasangan portal ────────────────────────────
-- Disalin utuh dari jtm-kirim-otomatis.sql; yang baru hanya bagian ★ pasangan.

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
    b := r->'baru';

    IF v_tiang IS NULL AND b IS NOT NULL AND jsonb_typeof(b) = 'object' THEN
      SELECT id INTO v_tiang FROM public.tiang WHERE id_hp = NULLIF(r->>'id_lokal', '')::uuid;
      IF v_tiang IS NULL THEN
        v_induk := COALESCE(NULLIF(b->>'induk_id', '')::uuid,
                            NULLIF(peta->>(b->>'induk_lokal'), '')::uuid,
                            (SELECT id FROM public.tiang WHERE id_hp = NULLIF(b->>'induk_lokal', '')::uuid AND status_hidup = 'aktif'));
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
      ) THEN
        RAISE EXCEPTION 'Foto temuan belum terunggah. Kirim ulang saat sinyal lebih baik.';
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
    END IF;

    -- ★ induk_id ikut: HP menambal garis induk tiang baru tanpa memuat ulang segmen.
    SELECT kode, induk_id INTO v_kode, v_induk FROM public.tiang WHERE id = v_tiang;
    hasil := hasil || jsonb_build_object('id_lokal', r->>'id_lokal', 'tiang_id', v_tiang, 'kode', v_kode, 'induk_id', v_induk);
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


-- ── 5. Membuat pasangan portal dari peta (admin) ─────────────────────────────
-- Untuk portal yang tercatat satu tiang. Tiang kedua berdiri 2 m searah jalur
-- (induk → tiang gardu; tanpa induk: ke timur), bisa digeser di peta sesudahnya.
-- Namanya dari aturan penamaan biasa — di jaringan yang sudah ada itu nama
-- sisipan (mis. PRM-012a), karena nomor berikutnya sudah dipakai.
-- Isian penilaian TIDAK disalin: inspeksi yang sudah disetujui tidak boleh
-- bertambah isi. Kondisinya terisi pada inspeksi berikutnya.

CREATE OR REPLACE FUNCTION public.buat_pasangan_portal(
  p_tiang_id UUID,
  p_oleh     TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  t       RECORD;
  i_lat   DOUBLE PRECISION;
  i_lng   DOUBLE PRECISION;
  arah    DOUBLE PRECISION;
  v_lat   DOUBLE PRECISION;
  v_lng   DOUBLE PRECISION;
  id_baru UUID;
  kode_baru TEXT;
  ada     TEXT;
BEGIN
  SELECT * INTO t FROM public.tiang WHERE id = p_tiang_id;
  IF NOT FOUND OR t.status_hidup <> 'aktif' THEN
    RAISE EXCEPTION 'Tiang tidak ditemukan atau sudah dibatalkan';
  END IF;
  PERFORM public.wajib_boleh_ulp(t.ulp);

  IF t.penyulang IS NULL THEN
    RAISE EXCEPTION 'Tiang % bukan tiang JTM', t.kode;
  END IF;
  IF t.pasangan_portal_dari IS NOT NULL THEN
    RAISE EXCEPTION 'Tiang % sendiri adalah pasangan portal dari tiang lain', t.kode;
  END IF;
  SELECT kode INTO ada FROM public.tiang
   WHERE pasangan_portal_dari = p_tiang_id AND status_hidup = 'aktif' LIMIT 1;
  IF ada IS NOT NULL THEN
    RAISE EXCEPTION 'Tiang % sudah punya pasangan portal: %', t.kode, ada;
  END IF;
  IF t.lat IS NULL OR t.lng IS NULL THEN
    RAISE EXCEPTION 'Tiang % belum punya titik', t.kode;
  END IF;

  SELECT lat, lng INTO i_lat, i_lng FROM public.tiang WHERE id = t.induk_id;
  arah  := COALESCE(public.arah_derajat(i_lat, i_lng, t.lat, t.lng), 90);
  v_lat := t.lat + 2 * cos(radians(arah)) / 111320.0;
  v_lng := t.lng + 2 * sin(radians(arah)) / (111320.0 * cos(radians(t.lat)));

  INSERT INTO public.tiang
    (penyulang, ulp, lat, lng, induk_id, jenis, konstruksi, penanda, sumber, status_hidup,
     pasangan_portal_dari, beda_dari_tiang_id, beda_dari_jarak_m)
  VALUES (t.penyulang, t.ulp, v_lat, v_lng, t.id, t.jenis, t.konstruksi, t.penanda, 'portal', 'aktif',
          t.id, t.id, 2)
  RETURNING id, kode INTO id_baru, kode_baru;

  -- Anggota segmen yang sama dengan tiang gardunya.
  INSERT INTO public.segmen_tiang (segmen_id, tiang_id, posisi, sumber)
  SELECT segmen_id, id_baru, posisi, 'portal' FROM public.segmen_tiang WHERE tiang_id = t.id
  ON CONFLICT DO NOTHING;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', kode_baru, COALESCE(t.ulp, '-'), 'pasangan_portal', NULL,
          jsonb_build_object('dari', t.kode), 'sunting_admin', auth.uid(), p_oleh);

  RETURN jsonb_build_object('id', id_baru, 'kode', kode_baru, 'dari', t.kode);
END $fn$;

GRANT EXECUTE ON FUNCTION public.buat_pasangan_portal(UUID, TEXT) TO authenticated;


-- ── 6. Daftar portal yang belum berpasangan ──────────────────────────────────
-- Jawaban `gardu` TERAKHIR tiap tiang (inspeksi yang tidak dibatalkan) =
-- portal, dan belum ada tiang pasangannya.

CREATE OR REPLACE VIEW public.jtm_portal_tanpa_pasangan AS
WITH jawab AS (
  SELECT DISTINCT ON (tk.tiang_id, p.item_kode)
         tk.tiang_id, p.item_kode, p.nilai
  FROM public.inspeksi_jtm_periksa p
  JOIN public.inspeksi_jtm_titik tk ON tk.id = p.titik_id
  JOIN public.inspeksi_jtm m        ON m.id = tk.inspeksi_id
  WHERE p.item_kode IN ('gardu', 'nomor_gardu') AND m.status <> 'Dibatalkan'
  ORDER BY tk.tiang_id, p.item_kode, tk.dinilai_at DESC
)
SELECT t.id AS tiang_id, t.kode, t.penyulang, t.ulp, t.lat, t.lng, n.nilai AS nomor_gardu
FROM jawab g
JOIN public.tiang t ON t.id = g.tiang_id
LEFT JOIN jawab n ON n.tiang_id = t.id AND n.item_kode = 'nomor_gardu'
WHERE g.item_kode = 'gardu' AND g.nilai = 'portal'
  AND t.status_hidup = 'aktif'
  AND t.pasangan_portal_dari IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.tiang x
                   WHERE x.pasangan_portal_dari = t.id AND x.status_hidup = 'aktif');

GRANT SELECT ON public.jtm_portal_tanpa_pasangan TO authenticated;


-- ── 7. Portal yang sudah dititik manual sebagai dua tiang ────────────────────
-- (5 pasang per 2 Okt 2026: MTR-017_B2, OLBTK-003D8, -D19, -D23C6D9C3,
-- -D23C6_B15C11.) Bentuknya sudah sesuai model baru, jadi hanya DITAUTKAN —
-- tidak ada yang dibuat, diganti nama, atau dihapus. Tanpa tautan ini, inspeksi
-- berikutnya akan membuatkan tiang ketiga. Pasangan = nomor gardu sama
-- (huruf besar, nol di depan angka diabaikan: Tj044 = Tj44), berjarak ≤ 8 m;
-- yang lebih baru jadi pasangan dari yang lebih lama.

WITH jawab AS (
  SELECT DISTINCT ON (tk.tiang_id, p.item_kode) tk.tiang_id, p.item_kode, p.nilai
  FROM public.inspeksi_jtm_periksa p
  JOIN public.inspeksi_jtm_titik tk ON tk.id = p.titik_id
  JOIN public.inspeksi_jtm m        ON m.id = tk.inspeksi_id
  WHERE p.item_kode IN ('gardu', 'nomor_gardu') AND m.status <> 'Dibatalkan'
  ORDER BY tk.tiang_id, p.item_kode, tk.dinilai_at DESC
), portal AS (
  SELECT t.id, t.lat, t.lng, t.created_at,
         upper(regexp_replace(btrim(n.nilai), '^([A-Za-z]+)0*', '\1')) AS nomor
  FROM jawab g
  JOIN jawab n ON n.tiang_id = g.tiang_id AND n.item_kode = 'nomor_gardu'
  JOIN public.tiang t ON t.id = g.tiang_id
  WHERE g.item_kode = 'gardu' AND g.nilai = 'portal' AND t.status_hidup = 'aktif'
    AND t.lat IS NOT NULL AND COALESCE(btrim(n.nilai), '') <> ''
), pasang AS (
  SELECT DISTINCT ON (b.id) b.id AS baru, a.id AS lama
  FROM portal a JOIN portal b
    ON a.nomor = b.nomor AND a.id <> b.id
   AND (a.created_at, a.id) < (b.created_at, b.id)
   AND public.jarak_meter(a.lat, a.lng, b.lat, b.lng) <= 8
  ORDER BY b.id, public.jarak_meter(a.lat, a.lng, b.lat, b.lng)
)
UPDATE public.tiang t
SET pasangan_portal_dari = p.lama
FROM pasang p
WHERE t.id = p.baru
  AND t.pasangan_portal_dari IS NULL
  -- yang lama sendiri bukan pasangan, dan belum punya pasangan lain
  AND NOT EXISTS (SELECT 1 FROM public.tiang x WHERE x.id = p.lama AND x.pasangan_portal_dari IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM public.tiang x WHERE x.pasangan_portal_dari = p.lama AND x.id <> t.id);


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT count(*) FROM jtm_portal_tanpa_pasangan;                 -- ±27
--   SELECT a.kode, b.kode FROM tiang b JOIN tiang a ON a.id = b.pasangan_portal_dari;  -- 5 pasang
--   SELECT proname FROM pg_proc WHERE proname LIKE '\_%\_inti' ORDER BY 1;   -- 19 inti
