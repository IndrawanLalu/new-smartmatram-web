-- =============================================================================
-- Inspeksi JTM — posisi kabel di tiang bersama: Di atas / Di bawah (16 Nov 2026)
-- rencana-jtm-mode-menumpang.md. Idempoten (aman dijalankan ulang).
--
-- Pemilik batang = penyulang yang PERTAMA menitik tiang itu. Kalau jalur yang
-- sebenarnya di bawah disapu lebih dulu, dialah pemiliknya. Sekarang saat jalur
-- lain menumpang, inspektor menjawab posisi kabel segmennya:
--   Di bawah → menumpang seperti sebelumnya (tidak ada yang berubah);
--   Di atas  → pemilik batang PINDAH ke jalur ini (langsung dari HP, keputusan user).
-- Web bisa membetulkan pemilik (Tetapkan pemilik tiang).
--
-- TIDAK ADA fungsi lama yang ditambal. Semua di sini fungsi BARU:
--   _jtm_tukar_pemilik         inti (pratinjau & terapkan satu jalan)
--   tumpangi_tiang_jtm_posisi  HP: menumpang + posisi (memanggil tumpangi_tiang_jtm_dari)
--   atur_posisi_tiang_jtm      HP: koreksi posisi dari kepala formulir
--   pratinjau_pemilik_tiang_jtm / tetapkan_pemilik_tiang_jtm   web
--
-- Yang DIJAGA tetap sama oleh penukaran (diperiksa sebelum disimpan, batal bila tidak):
--   • nama tiang di SETIAP jalur (tidak ada nama baru lahir; tiang.kode = nama
--     yang sudah ada di jalur pemilik baru);
--   • induk di SETIAP jalur (= jtm_induk_di_penyulang, yang dipakai peta &
--     penamaan) untuk tiang itu DAN seluruh hilir batangnya;
--   • tanda cabang per jalur (tiang.cabang_baru tidak disentuh);
--   • pemilik peralatan di tiang (penanda_penyulang diisi pemilik lama bila kosong).
-- Yang memang berubah: tiang.penyulang / kode / induk_id (batang), utama,
-- segmen_tiang.posisi, dan semua yang dihitung dari pemilik (rekap tiang milik,
-- isian badan tiang, koreksi master) — itulah tujuannya.
--
-- Pemicu yang ikut menyala (sudah diperhitungkan):
--   trg_jtm_cermin_kode_pemilik   menulis baris nama pemilik baru utama=true
--   trg_tiang_cegah_lingkaran     dicegah lebih dulu dengan pesan yang jelas
--   trg_jtm_tandai_induk_percabangan  bisa menyalakan percabangan induk batang
--                                     baru → dikembalikan seperti semula (tanda
--                                     itu ikut menentukan nama tiang berikutnya)
--   trg_section_kotor_*, trg_rute_kotor_*, jtr_panjang  hanya menandai simpanan kotor
-- =============================================================================


-- ── 0. Prasyarat — berhenti dengan pesan jelas bila fungsi lama belum terpasang ──
DO $do$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.tumpangi_tiang_jtm_dari(uuid,uuid,uuid,text)',   -- jtm-tumpang-dari.sql / jtm-balik-arah-tumpang.sql
    'public._jtm_nama_di(uuid,text)',                        -- jtm-balik-arah-tumpang.sql
    'public.jtm_induk_di_penyulang(uuid,text)',              -- jtm-induk-per-penyulang.sql
    'public.jtm_leluhur_di_penyulang(uuid,text)',            -- jtm-nama-penuh.sql
    'public.wajib_boleh_ulp(text)'                           -- wo-perabasan.sql
  ] LOOP
    IF to_regprocedure(f) IS NULL THEN
      RAISE EXCEPTION 'Fungsi % belum ada di database — jalankan skrip pembuatnya dulu. Belum ada yang diubah.', f;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'tiang' AND column_name = 'penanda_penyulang') THEN
    RAISE EXCEPTION 'Kolom tiang.penanda_penyulang belum ada — jalankan jtm-peralatan-tiang-bersama.sql dulu. Belum ada yang diubah.';
  END IF;
END $do$;


-- ── 1. Inti ──────────────────────────────────────────────────────────────────
-- p_terapkan = false → semua langkah dijalankan lalu DIBATALKAN (pratinjau persis
-- sama dengan yang akan terjadi). Hasil berbentuk jsonb; penolakan = RAISE dengan
-- pesan yang menyebut apa, kenapa, dan jalan keluarnya.
CREATE OR REPLACE FUNCTION public._jtm_tukar_pemilik(
  p_tiang     UUID,
  p_penyulang TEXT,
  p_sebab     TEXT,        -- 'hp' / 'web'
  p_alasan    TEXT,
  p_oleh      TEXT,
  p_terapkan  BOOLEAN
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  t        public.tiang;
  ka       public.tiang_kode_penyulang;   -- nama di jalur pemilik baru
  v_lama   TEXT;
  induk_a  UUID;
  n_sub    INT;
  hasil    JSONB;
  r        RECORD;
  beda     TEXT;
  n_khusus INT := 0;
  cab_lama BOOLEAN;
  lama_kode TEXT;
BEGIN
  SELECT * INTO t FROM public.tiang WHERE id = p_tiang FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tiang tidak ditemukan — mungkin sudah dibatalkan. Muat ulang daftar.';
  END IF;
  IF t.gardu_kode IS NOT NULL THEN
    RAISE EXCEPTION 'Tiang % adalah tiang JTR — pemilik hanya berlaku untuk tiang JTM.', t.kode;
  END IF;
  IF t.status_hidup <> 'aktif' THEN
    RAISE EXCEPTION 'Tiang % sudah tidak aktif (%) — pemiliknya tidak bisa diubah.', t.kode, t.status_hidup;
  END IF;

  SELECT * INTO ka FROM public.tiang_kode_penyulang
   WHERE tiang_id = p_tiang AND upper(penyulang) = upper(btrim(COALESCE(p_penyulang, '')));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tiang % belum tercatat dilewati %. Tumpangi dulu tiang itu dari segmen %, baru pilih posisinya.',
      t.kode, COALESCE(NULLIF(btrim(p_penyulang), ''), '-'), COALESCE(NULLIF(btrim(p_penyulang), ''), '-');
  END IF;

  v_lama := t.penyulang;
  SELECT kode INTO lama_kode FROM public.tiang_kode_penyulang
   WHERE tiang_id = p_tiang AND upper(penyulang) = upper(COALESCE(v_lama, ''));
  lama_kode := COALESCE(lama_kode, t.kode);

  IF upper(COALESCE(v_lama, '')) = upper(ka.penyulang) THEN
    RETURN jsonb_build_object('berubah', false, 'tiang', ka.kode, 'pemilik', ka.penyulang);
  END IF;

  -- ── Potret sebelum: induk tiap jalur di tiang ini + hilir yang jalannya lewat sini ──
  -- Hilir batang (anak, cucu, …). Baris (tiang D, jalur P) di hilir hanya bisa berubah
  -- bila P tidak bernama di tiang ini DAN induk khususnya kosong (pendakian
  -- jtm_leluhur_di_penyulang melewati tiang ini lalu naik ke induk batangnya).
  CREATE TEMP TABLE IF NOT EXISTS _tp_potret (
    tiang_id UUID, penyulang TEXT, utama BOOLEAN, induk_lama UUID, induk_baru UUID
  ) ON COMMIT DROP;
  DELETE FROM _tp_potret WHERE true;

  WITH RECURSIVE sub AS (
    SELECT c.id, 1 AS dalam FROM public.tiang c WHERE c.induk_id = p_tiang
    UNION ALL
    SELECT c.id, s.dalam + 1 FROM public.tiang c JOIN sub s ON c.induk_id = s.id
    WHERE s.dalam < 20000
  )
  SELECT count(*) INTO n_sub FROM sub;
  IF n_sub >= 20000 THEN
    RAISE EXCEPTION 'Hilir tiang % terlalu dalam (≥ 20.000 tiang) untuk diperiksa — hubungi pengembang.', t.kode;
  END IF;

  INSERT INTO _tp_potret (tiang_id, penyulang, utama, induk_lama)
  SELECT kp.tiang_id, kp.penyulang, kp.utama, public.jtm_induk_di_penyulang(kp.tiang_id, kp.penyulang)
  FROM public.tiang_kode_penyulang kp
  WHERE kp.tiang_id = p_tiang;

  INSERT INTO _tp_potret (tiang_id, penyulang, utama, induk_lama)
  WITH RECURSIVE sub AS (
    SELECT c.id FROM public.tiang c WHERE c.induk_id = p_tiang
    UNION
    SELECT c.id FROM public.tiang c JOIN sub s ON c.induk_id = s.id
  )
  SELECT kp.tiang_id, kp.penyulang, kp.utama, public.jtm_induk_di_penyulang(kp.tiang_id, kp.penyulang)
  FROM sub
  JOIN public.tiang_kode_penyulang kp ON kp.tiang_id = sub.id
  WHERE kp.induk_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.tiang_kode_penyulang x
                    WHERE x.tiang_id = p_tiang AND upper(x.penyulang) = upper(kp.penyulang));

  SELECT induk_lama INTO induk_a FROM _tp_potret
   WHERE tiang_id = p_tiang AND upper(penyulang) = upper(ka.penyulang);

  -- Arah berlawanan: induk jalur baru ada di HILIR batang tiang ini → melingkar.
  IF induk_a IS NOT NULL AND (induk_a = p_tiang OR EXISTS (
    WITH RECURSIVE sub AS (
      SELECT c.id FROM public.tiang c WHERE c.induk_id = p_tiang
      UNION
      SELECT c.id FROM public.tiang c JOIN sub s ON c.induk_id = s.id
    ) SELECT 1 FROM sub WHERE sub.id = induk_a)) THEN
    RAISE EXCEPTION 'Tiang % tidak bisa dipindah ke %: arah % di tiang ini berlawanan dengan arah batang sekarang (tiang sebelumnya di %, %, ada di hilir %). Minta admin membetulkan arahnya dulu (Balik arah di /peta).',
      t.kode, ka.penyulang, ka.penyulang, ka.penyulang, public._jtm_nama_di(induk_a, ka.penyulang), t.kode;
  END IF;

  cab_lama := (SELECT percabangan FROM public.tiang WHERE id = induk_a);

  -- ── Langkah-langkah, di dalam blok yang bisa dibatalkan (pratinjau) ──
  BEGIN
    UPDATE public.tiang_kode_penyulang SET utama = false, updated_at = now()
     WHERE tiang_id = p_tiang AND upper(penyulang) = upper(COALESCE(v_lama, ''));
    UPDATE public.tiang_kode_penyulang SET induk_id = NULL, updated_at = now()
     WHERE tiang_id = p_tiang AND penyulang = ka.penyulang;

    -- Pemicu cermin menulis baris nama ka.penyulang utama = true (kode sama).
    BEGIN
      UPDATE public.tiang
         SET penyulang = ka.penyulang, kode = ka.kode, updated_at = now()
       WHERE id = p_tiang;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Nama % sudah dipakai tiang aktif lain di % — pemilik tiang % tidak bisa dipindah sebelum nama kembar itu dibetulkan di /peta.',
        ka.kode, ka.penyulang, lama_kode;
    END;
    IF induk_a IS DISTINCT FROM t.induk_id THEN
      UPDATE public.tiang SET induk_id = induk_a, updated_at = now() WHERE id = p_tiang;
      -- Pemicu percabangan bisa menyalakan tanda di induk batang baru; bentuk
      -- jaringan tidak berubah, jadi tandanya dikembalikan seperti semula.
      IF induk_a IS NOT NULL THEN
        UPDATE public.tiang SET percabangan = COALESCE(cab_lama, false)
         WHERE id = induk_a AND percabangan IS DISTINCT FROM COALESCE(cab_lama, false);
      END IF;
    END IF;

    -- Jalur lain di tiang ini yang ikut induk batang: induknya dicatat langsung
    -- (= yang lama), supaya tidak ikut induk batang baru (jalur pemilik baru).
    FOR r IN
      SELECT p.* FROM _tp_potret p
      JOIN public.tiang_kode_penyulang k ON k.tiang_id = p.tiang_id AND k.penyulang = p.penyulang
      WHERE p.tiang_id = p_tiang AND upper(p.penyulang) <> upper(ka.penyulang)
        AND k.induk_id IS NULL AND p.induk_lama IS NOT NULL
        AND p.induk_lama IS DISTINCT FROM induk_a
    LOOP
      UPDATE public.tiang_kode_penyulang SET induk_id = r.induk_lama, updated_at = now()
       WHERE tiang_id = r.tiang_id AND penyulang = r.penyulang;
      n_khusus := n_khusus + 1;
    END LOOP;

    -- Peralatan di tiang tetap milik jalur lama (sebelumnya "NULL = pemilik tiang").
    UPDATE public.tiang SET penanda_penyulang = v_lama
     WHERE id = p_tiang AND penanda IS NOT NULL AND penanda_penyulang IS NULL AND v_lama IS NOT NULL;

    -- Posisi per segmen.
    UPDATE public.segmen_tiang st SET posisi = 'atas'
      FROM public.segmen s
     WHERE st.segmen_id = s.id AND st.tiang_id = p_tiang AND upper(s.penyulang) = upper(ka.penyulang)
       AND st.posisi IS DISTINCT FROM 'atas';
    UPDATE public.segmen_tiang st SET posisi = 'bawah'
      FROM public.segmen s
     WHERE st.segmen_id = s.id AND st.tiang_id = p_tiang AND upper(s.penyulang) = upper(COALESCE(v_lama, ''))
       AND st.posisi IS DISTINCT FROM 'bawah';

    -- Induk yang bergeser karena induk batang berubah → induk khusus = yang lama.
    UPDATE _tp_potret SET induk_baru = public.jtm_induk_di_penyulang(tiang_id, penyulang) WHERE true;
    FOR r IN
      SELECT * FROM _tp_potret WHERE induk_baru IS DISTINCT FROM induk_lama
    LOOP
      IF r.tiang_id = p_tiang AND upper(r.penyulang) = upper(ka.penyulang) THEN
        CONTINUE;  -- pemilik baru: induknya kini induk batang (= induk_a), diperiksa di bawah
      END IF;
      IF r.utama OR r.induk_lama IS NULL THEN
        beda := format('%s di %s (induk %s → %s)',
          public._jtm_nama_di(r.tiang_id, r.penyulang), r.penyulang,
          COALESCE(public._jtm_nama_di(r.induk_lama, r.penyulang), 'pangkal'),
          COALESCE(public._jtm_nama_di(r.induk_baru, r.penyulang), 'pangkal'));
        RAISE EXCEPTION 'Pemilik tiang % tidak bisa dipindah ke %: induk tiang % akan ikut berubah. Tidak ada yang diubah — minta admin memeriksa sambungan di /peta.',
          lama_kode, ka.penyulang, beda;
      END IF;
      UPDATE public.tiang_kode_penyulang SET induk_id = r.induk_lama, updated_at = now()
       WHERE tiang_id = r.tiang_id AND penyulang = r.penyulang;
      n_khusus := n_khusus + 1;
    END LOOP;

    -- Pemeriksaan akhir: semua induk sama dengan sebelum (pemilik baru = induk_a).
    SELECT format('%s di %s', public._jtm_nama_di(p.tiang_id, p.penyulang), p.penyulang) INTO beda
    FROM _tp_potret p
    WHERE public.jtm_induk_di_penyulang(p.tiang_id, p.penyulang) IS DISTINCT FROM p.induk_lama
    LIMIT 1;
    IF beda IS NOT NULL THEN
      RAISE EXCEPTION 'Pemilik tiang % tidak bisa dipindah ke %: induk % tidak bisa dijaga tetap. Tidak ada yang diubah — kirim pesan ini ke pengembang.',
        lama_kode, ka.penyulang, beda;
    END IF;
    IF (SELECT kode FROM public.tiang_kode_penyulang WHERE tiang_id = p_tiang AND penyulang = ka.penyulang) IS DISTINCT FROM ka.kode
       OR NOT (SELECT utama FROM public.tiang_kode_penyulang WHERE tiang_id = p_tiang AND penyulang = ka.penyulang)
       OR (SELECT count(*) FROM public.tiang_kode_penyulang WHERE tiang_id = p_tiang AND utama) <> 1 THEN
      RAISE EXCEPTION 'Pemilik tiang % tidak bisa dipindah ke %: nama pemilik tidak tercatat dengan benar. Tidak ada yang diubah — kirim pesan ini ke pengembang.',
        lama_kode, ka.penyulang;
    END IF;

    hasil := jsonb_build_object(
      'berubah', true,
      'tiang', ka.kode,
      'pemilik_lama', v_lama,
      'pemilik_baru', ka.penyulang,
      'jalur', (SELECT jsonb_agg(jsonb_build_object(
                  'penyulang', k.penyulang, 'kode', k.kode, 'pemilik', k.utama,
                  'induk', public._jtm_nama_di(public.jtm_induk_di_penyulang(k.tiang_id, k.penyulang), k.penyulang))
                  ORDER BY k.utama DESC, k.penyulang)
                FROM public.tiang_kode_penyulang k WHERE k.tiang_id = p_tiang),
      'induk_khusus_ditambah', n_khusus);

    IF NOT p_terapkan THEN
      RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'pratinjau';
    END IF;

    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', ka.kode, COALESCE(t.ulp, '-'), 'pemilik_tiang',
            jsonb_build_object('pemilik', v_lama, 'kode', lama_kode,
                               'induk', public._jtm_nama_di(t.induk_id, v_lama)),
            hasil || jsonb_build_object('sebab', p_sebab, 'alasan', NULLIF(btrim(COALESCE(p_alasan, '')), '')),
            CASE WHEN p_sebab = 'web' THEN 'koreksi_meja' ELSE 'lapangan' END,
            auth.uid(), p_oleh);
  EXCEPTION WHEN SQLSTATE 'P0099' THEN
    NULL;  -- pratinjau: semua perubahan di blok ini dibatalkan, `hasil` tetap terisi
  END;

  RETURN hasil || jsonb_build_object('pratinjau', NOT p_terapkan);
END $fn$;
COMMENT ON FUNCTION public._jtm_tukar_pemilik IS
  'Inti penukaran pemilik batang tiang JTM (jtm-posisi-kabel.sql). Nama & induk tiap jalur dijaga sama; p_terapkan=false = pratinjau.';
REVOKE ALL ON FUNCTION public._jtm_tukar_pemilik(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;


-- ── 2. Hak akun HP (sama dengan kirim_tiang_jtm) ─────────────────────────────
CREATE OR REPLACE FUNCTION public._jtm_wajib_akun_segmen(p_segmen UUID)
RETURNS public.segmen
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_role TEXT; v_unit TEXT; s public.segmen;
BEGIN
  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi, kemudian ulangi — isian tetap tersimpan di HP.';
  END IF;
  SELECT * INTO s FROM public.segmen WHERE id = p_segmen;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Segmen tidak ditemukan — mungkin sudah dibatalkan admin. Muat ulang daftar segmen.';
  END IF;
  IF s.status <> 'aktif' THEN
    RAISE EXCEPTION 'Segmen % sudah tidak aktif (%).', s.nama, s.status;
  END IF;
  IF v_role <> 'UP3' AND upper(COALESCE(v_unit, '')) <> upper(COALESCE(s.ulp, '')) THEN
    RAISE EXCEPTION 'Segmen ini milik ULP %, akun ini ULP %.', COALESCE(s.ulp, '-'), COALESCE(v_unit, '-');
  END IF;
  RETURN s;
END $fn$;
REVOKE ALL ON FUNCTION public._jtm_wajib_akun_segmen(UUID) FROM PUBLIC, anon, authenticated;


-- ── 3. HP: menumpang + posisi ────────────────────────────────────────────────
-- Bentuk hasil = tumpangi_tiang_jtm_dari (kode, pemilik, menumpang, induk_diatur)
-- + posisi + pemilik sesudahnya. 'bawah' = persis menumpang yang lama.
CREATE OR REPLACE FUNCTION public.tumpangi_tiang_jtm_posisi(
  p_segmen_id UUID,
  p_tiang_id  UUID,
  p_dari_id   UUID,
  p_posisi    TEXT,
  p_nama      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  s public.segmen;
  d JSONB;
  x JSONB;
BEGIN
  s := public._jtm_wajib_akun_segmen(p_segmen_id);
  IF p_posisi IS NULL OR p_posisi NOT IN ('atas', 'bawah') THEN
    RAISE EXCEPTION 'Posisi kabel harus "atas" atau "bawah" (diterima: %). Perbarui aplikasi.', COALESCE(p_posisi, 'kosong');
  END IF;

  d := public.tumpangi_tiang_jtm_dari(p_segmen_id, p_tiang_id, p_dari_id, p_nama);

  IF p_posisi = 'atas' THEN
    x := public._jtm_tukar_pemilik(p_tiang_id, s.penyulang, 'hp', NULL, p_nama, true);
    d := d || jsonb_build_object('pemilik', s.penyulang, 'menumpang', NULL,
                                 'induk_khusus_ditambah', x->'induk_khusus_ditambah');
  END IF;

  RETURN d || jsonb_build_object('posisi', p_posisi);
END $fn$;
GRANT EXECUTE ON FUNCTION public.tumpangi_tiang_jtm_posisi(UUID, UUID, UUID, TEXT, TEXT) TO authenticated;


-- ── 4. HP: koreksi posisi dari kepala formulir ───────────────────────────────
CREATE OR REPLACE FUNCTION public.atur_posisi_tiang_jtm(
  p_segmen_id UUID,
  p_tiang_id  UUID,
  p_posisi    TEXT,
  p_nama      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  s      public.segmen;
  t      public.tiang;
  kode_s TEXT;
  lain   TEXT[];
BEGIN
  s := public._jtm_wajib_akun_segmen(p_segmen_id);
  IF p_posisi IS NULL OR p_posisi NOT IN ('atas', 'bawah') THEN
    RAISE EXCEPTION 'Posisi kabel harus "atas" atau "bawah" (diterima: %). Perbarui aplikasi.', COALESCE(p_posisi, 'kosong');
  END IF;
  SELECT * INTO t FROM public.tiang WHERE id = p_tiang_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tiang tidak ditemukan — mungkin sudah dibatalkan. Muat ulang daftar.';
  END IF;
  SELECT kode INTO kode_s FROM public.tiang_kode_penyulang
   WHERE tiang_id = p_tiang_id AND upper(penyulang) = upper(s.penyulang);
  IF kode_s IS NULL THEN
    RAISE EXCEPTION 'Tiang % belum tercatat di segmen ini — tumpangi dulu, baru pilih posisinya.', t.kode;
  END IF;

  IF p_posisi = 'atas' THEN
    RETURN public._jtm_tukar_pemilik(p_tiang_id, s.penyulang, 'hp', NULL, p_nama, true)
           || jsonb_build_object('posisi', 'atas');
  END IF;

  -- 'bawah': jalur ini bukan pemilik → sudah di bawah.
  IF upper(COALESCE(t.penyulang, '')) <> upper(s.penyulang) THEN
    RETURN jsonb_build_object('berubah', false, 'tiang', kode_s, 'pemilik', t.penyulang, 'posisi', 'bawah');
  END IF;
  SELECT array_agg(k.penyulang ORDER BY k.penyulang) INTO lain
  FROM public.tiang_kode_penyulang k
  WHERE k.tiang_id = p_tiang_id AND upper(k.penyulang) <> upper(s.penyulang);
  IF lain IS NULL THEN
    RAISE EXCEPTION 'Tiang % hanya dilewati segmen ini, jadi kabelnya tetap di atas. Kalau ada kabel lain di tiang ini, tumpangi dulu dari segmen kabel itu.', kode_s;
  END IF;
  IF array_length(lain, 1) > 1 THEN
    RAISE EXCEPTION 'Tiang % dilewati % jalur lain (%) — HP tidak bisa menebak mana yang di atas. Minta admin memilih pemiliknya di web: /peta → Tetapkan pemilik tiang.',
      kode_s, array_length(lain, 1), array_to_string(lain, ', ');
  END IF;
  RETURN public._jtm_tukar_pemilik(p_tiang_id, lain[1], 'hp', NULL, p_nama, true)
         || jsonb_build_object('posisi', 'bawah');
END $fn$;
GRANT EXECUTE ON FUNCTION public.atur_posisi_tiang_jtm(UUID, UUID, TEXT, TEXT) TO authenticated;


-- ── 5. Web ───────────────────────────────────────────────────────────────────
-- Jalur yang melewati tiang (+ pratinjau bila p_penyulang diisi).
CREATE OR REPLACE FUNCTION public.pratinjau_pemilik_tiang_jtm(p_tiang UUID, p_penyulang TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  jalur JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesi tidak dikenali server. Masuk lagi.'; END IF;
  SELECT jsonb_agg(jsonb_build_object(
           'penyulang', k.penyulang, 'kode', k.kode, 'pemilik', k.utama,
           'induk', public._jtm_nama_di(public.jtm_induk_di_penyulang(k.tiang_id, k.penyulang), k.penyulang))
           ORDER BY k.utama DESC, k.penyulang)
    INTO jalur
  FROM public.tiang_kode_penyulang k WHERE k.tiang_id = p_tiang;
  IF jalur IS NULL THEN
    RAISE EXCEPTION 'Tiang ini tidak bernama di jalur JTM mana pun.';
  END IF;
  IF NULLIF(btrim(COALESCE(p_penyulang, '')), '') IS NULL THEN
    RETURN jsonb_build_object('jalur', jalur);
  END IF;
  RETURN jsonb_build_object('jalur', jalur,
    'hasil', public._jtm_tukar_pemilik(p_tiang, p_penyulang, 'web', NULL, NULL, false));
END $fn$;
GRANT EXECUTE ON FUNCTION public.pratinjau_pemilik_tiang_jtm(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.tetapkan_pemilik_tiang_jtm(
  p_tiang     UUID,
  p_penyulang TEXT,
  p_alasan    TEXT,
  p_oleh      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public.wajib_boleh_ulp((SELECT ulp FROM public.tiang WHERE id = p_tiang));
  IF COALESCE(btrim(p_alasan), '') = '' THEN
    RAISE EXCEPTION 'Alasan wajib diisi — tercatat di riwayat tiang.';
  END IF;
  RETURN public._jtm_tukar_pemilik(p_tiang, p_penyulang, 'web', p_alasan, p_oleh, true);
END $fn$;
GRANT EXECUTE ON FUNCTION public.tetapkan_pemilik_tiang_jtm(UUID, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Periksa hasilnya
--   a. Fungsi ada (harus 5):
--      SELECT proname FROM pg_proc WHERE proname IN ('_jtm_tukar_pemilik','tumpangi_tiang_jtm_posisi',
--        'atur_posisi_tiang_jtm','pratinjau_pemilik_tiang_jtm','tetapkan_pemilik_tiang_jtm');
--   b. Satu pemilik per tiang (harus 0 baris):
--      SELECT tiang_id FROM tiang_kode_penyulang GROUP BY tiang_id HAVING count(*) FILTER (WHERE utama) > 1;
--   c. Riwayat penukaran:
--      SELECT entitas_kode, nilai_lama, nilai_baru, oleh_nama, created_at FROM master_audit
--      WHERE field = 'pemilik_tiang' ORDER BY created_at DESC LIMIT 10;
