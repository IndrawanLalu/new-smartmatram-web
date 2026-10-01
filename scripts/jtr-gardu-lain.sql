-- =============================================================================
-- Tiang bersama dua gardu JTR: "Ada JTR gardu lain di tiang ini" + gabungkan
-- tiang kembar dari peta. Keputusan user 1 Okt 2026. Jalankan manual di
-- Supabase SQL Editor, SESUDAH `peta-jtr-di-jtm.sql` dan
-- `inspeksi-wajib-dinilai.sql`. Idempoten.
--
-- Kejadian (AM038-B3): satu batang memikul JTR dua gardu — kabel atas milik
-- gardu lain, kabel kedua milik AM038. Nomor kabel dihitung PER GARDU, jadi
-- kabel AM038 tetap "kabel ke-1" (sudah benar). Yang belum bisa: regu AM038
-- menyatakan bahwa ada JTR gardu lain di batang itu, sebelum gardu itu disapu.
--
--   1. tiang.jtr_gardu_lain (+ _kode)  — dinyatakan regu dari HP.
--   2. koreksi_tiang                   — menyimpan keduanya, tercatat di audit.
--   3. kirim_tiang_jtr                 — meneruskannya dari isian HP.
--   4. peta_tiang.gardu_bersama        — gardu lain di batang ini (tercatat
--                                        maupun dinyatakan) untuk penanda peta.
--   5. gabung_tiang_jtr                — tiang kembar (gardu kedua melahirkan
--                                        batang baru di batang yang sama) dijadikan
--                                        pinjaman batang aslinya.
-- Lepas dari batang memakai `lepas_tumpang_jtr` yang sudah ada.
-- =============================================================================


-- ── 1. Kolom ─────────────────────────────────────────────────────────────────
ALTER TABLE public.tiang
  ADD COLUMN IF NOT EXISTS jtr_gardu_lain BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS jtr_gardu_lain_kode TEXT;

COMMENT ON COLUMN public.tiang.jtr_gardu_lain IS
  'Dinyatakan regu: batang ini juga memikul JTR gardu lain (yang mungkin belum disapu). Kodenya di jtr_gardu_lain_kode bila diketahui.';

-- ── 2. koreksi_tiang — disalin dari `jtr-kabel-aksesoris.sql`; perubahan ★ ──
CREATE OR REPLACE FUNCTION public.koreksi_tiang(
  p_id      UUID,
  p_jenis   TEXT DEFAULT NULL,
  p_tinggi  NUMERIC DEFAULT NULL,
  p_kondisi TEXT DEFAULT NULL,
  p_lat     DOUBLE PRECISION DEFAULT NULL,
  p_lng     DOUBLE PRECISION DEFAULT NULL,
  p_nama    TEXT DEFAULT NULL,
  p_catatan TEXT DEFAULT NULL,
  p_atribut JSONB DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t    RECORD;
  diff JSONB := '{}'::jsonb;
BEGIN
  SELECT * INTO t FROM public.tiang WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang tidak ditemukan'; END IF;
  IF t.status_hidup <> 'aktif' THEN
    RAISE EXCEPTION 'Tiang % sudah tidak aktif (%)', t.kode, t.status_hidup;
  END IF;

  IF p_jenis IS NOT NULL AND p_jenis IS DISTINCT FROM t.jenis THEN
    INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', t.kode, t.ulp, 'jenis', to_jsonb(t.jenis), to_jsonb(p_jenis), 'koreksi_lapangan', auth.uid(), p_nama);
  END IF;
  IF p_tinggi IS NOT NULL AND p_tinggi IS DISTINCT FROM t.tinggi THEN
    INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', t.kode, t.ulp, 'tinggi', to_jsonb(t.tinggi), to_jsonb(p_tinggi), 'koreksi_lapangan', auth.uid(), p_nama);
  END IF;
  IF p_kondisi IS NOT NULL AND p_kondisi IS DISTINCT FROM t.kondisi THEN
    INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', t.kode, t.ulp, 'kondisi', to_jsonb(t.kondisi), to_jsonb(p_kondisi), 'koreksi_lapangan', auth.uid(), p_nama);
  END IF;
  IF p_lat IS NOT NULL AND p_lng IS NOT NULL
     AND (p_lat IS DISTINCT FROM t.lat::double precision OR p_lng IS DISTINCT FROM t.lng::double precision) THEN
    INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', t.kode, t.ulp, 'koordinat',
            jsonb_build_object('lat', t.lat, 'lng', t.lng),
            jsonb_build_object('lat', p_lat, 'lng', p_lng), 'koreksi_lapangan', auth.uid(), p_nama);
  END IF;

  IF p_atribut IS NOT NULL THEN
    -- Kumpulkan hanya yang benar-benar berbeda.
    IF p_atribut ? 'andongan'        AND (p_atribut->>'andongan')        IS DISTINCT FROM t.andongan        THEN diff := diff || jsonb_build_object('andongan',        jsonb_build_array(t.andongan,        p_atribut->>'andongan'));        END IF;
    IF p_atribut ? 'arde_kondisi'    AND (p_atribut->>'arde_kondisi')    IS DISTINCT FROM t.arde_kondisi    THEN diff := diff || jsonb_build_object('arde_kondisi',    jsonb_build_array(t.arde_kondisi,    p_atribut->>'arde_kondisi'));    END IF;
    IF p_atribut ? 'stay_kondisi'    AND (p_atribut->>'stay_kondisi')    IS DISTINCT FROM t.stay_kondisi    THEN diff := diff || jsonb_build_object('stay_kondisi',    jsonb_build_array(t.stay_kondisi,    p_atribut->>'stay_kondisi'));    END IF;
    IF p_atribut ? 'underbuild_tm'   AND (p_atribut->>'underbuild_tm')::boolean IS DISTINCT FROM t.underbuild_tm THEN diff := diff || jsonb_build_object('underbuild_tm', jsonb_build_array(t.underbuild_tm, (p_atribut->>'underbuild_tm')::boolean)); END IF;
    IF p_atribut ? 'catatan_perbaikan' AND (p_atribut->>'catatan_perbaikan') IS DISTINCT FROM t.catatan_perbaikan THEN diff := diff || jsonb_build_object('catatan_perbaikan', jsonb_build_array(t.catatan_perbaikan, p_atribut->>'catatan_perbaikan')); END IF;
    -- ★ Ada JTR gardu lain di tiang ini (+ kodenya bila diketahui).
    IF p_atribut ? 'jtr_gardu_lain' AND (p_atribut->>'jtr_gardu_lain')::boolean IS DISTINCT FROM t.jtr_gardu_lain THEN diff := diff || jsonb_build_object('jtr_gardu_lain', jsonb_build_array(t.jtr_gardu_lain, (p_atribut->>'jtr_gardu_lain')::boolean)); END IF;
    IF p_atribut ? 'jtr_gardu_lain_kode' AND NULLIF(upper(btrim(p_atribut->>'jtr_gardu_lain_kode')), '') IS DISTINCT FROM t.jtr_gardu_lain_kode THEN diff := diff || jsonb_build_object('jtr_gardu_lain_kode', jsonb_build_array(t.jtr_gardu_lain_kode, NULLIF(upper(btrim(p_atribut->>'jtr_gardu_lain_kode')), ''))); END IF;

    UPDATE public.tiang SET
      andongan        = COALESCE(p_atribut->>'andongan',        andongan),
      tarikan_sr      = COALESCE((p_atribut->>'tarikan_sr')::int,        tarikan_sr),
      arde_kondisi    = COALESCE(p_atribut->>'arde_kondisi',    arde_kondisi),
      arde_nilai_ohm  = COALESCE((p_atribut->>'arde_nilai_ohm')::numeric, arde_nilai_ohm),
      stay_jenis      = COALESCE(p_atribut->>'stay_jenis',      stay_jenis),
      stay_kondisi    = COALESCE(p_atribut->>'stay_kondisi',    stay_kondisi),
      rawan_row       = COALESCE(
                          (SELECT array_agg(x) FROM jsonb_array_elements_text(p_atribut->'rawan_row') AS x),
                          rawan_row),
      jamperan        = COALESCE(p_atribut->'jamperan', jamperan),
      underbuild_tm   = COALESCE((p_atribut->>'underbuild_tm')::boolean, underbuild_tm),
      catatan_perbaikan = COALESCE(p_atribut->>'catatan_perbaikan', catatan_perbaikan),
      -- ★
      jtr_gardu_lain  = COALESCE((p_atribut->>'jtr_gardu_lain')::boolean, jtr_gardu_lain),
      jtr_gardu_lain_kode = CASE
        WHEN (p_atribut->>'jtr_gardu_lain')::boolean IS FALSE THEN NULL
        WHEN p_atribut ? 'jtr_gardu_lain_kode' THEN NULLIF(upper(btrim(p_atribut->>'jtr_gardu_lain_kode')), '')
        ELSE jtr_gardu_lain_kode END,
      -- Foto DIGABUNG, tidak ditimpa: koreksi yang cuma menyentuh andongan
      -- tidak boleh menghapus bukti temuan arde yang sudah difoto sebelumnya.
      foto_temuan     = foto_temuan || COALESCE(p_atribut->'foto_temuan', '{}'::jsonb)
    WHERE id = p_id;

    IF diff <> '{}'::jsonb THEN
      INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
      VALUES ('tiang', t.kode, t.ulp, 'atribut', NULL, diff, 'koreksi_lapangan', auth.uid(), p_nama);
    END IF;
  END IF;

  UPDATE public.tiang
  SET jenis   = COALESCE(p_jenis, jenis),
      tinggi  = COALESCE(p_tinggi, tinggi),
      kondisi = COALESCE(p_kondisi, kondisi),
      lat     = COALESCE(p_lat, lat),
      lng     = COALESCE(p_lng, lng),
      dikonfirmasi_at   = now(),
      dikonfirmasi_oleh = COALESCE(p_nama, dikonfirmasi_oleh),
      updated_at = now()
  WHERE id = p_id;
END $$;


-- ── 3. kirim_tiang_jtr — disalin dari `inspeksi-wajib-dinilai.sql`; perubahan ★ ──
CREATE OR REPLACE FUNCTION public.kirim_tiang_jtr(p_isi JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_role  TEXT;
  v_unit  TEXT;
  v_gardu TEXT := upper(btrim(COALESCE(p_isi->>'gardu_kode', '')));
  v_ulp   TEXT := upper(btrim(COALESCE(p_isi->>'ulp', '')));
  v_nama  TEXT := NULLIF(btrim(COALESCE(p_isi->>'nama', '')), '');
  v_insp  UUID;
  v_stat  TEXT;
  peta    JSONB := '{}'::jsonb;   -- id_lokal → tiang_id
  hasil   JSONB := '[]'::jsonb;
  r       JSONB;
  b       JSONB;
  k       JSONB;
  kol     JSONB;
  kabel   JSONB;
  v_lokal UUID;
  v_tiang UUID;
  v_induk UUID;
  v_pinjam BOOLEAN;
  v_kode  TEXT;
  v_lat  DOUBLE PRECISION;
  v_lng   DOUBLE PRECISION;
  radius  NUMERIC;
  d_id    UUID;
  d_kode  TEXT;
  d_m     DOUBLE PRECISION;
  sisa    INT := 0;
BEGIN
  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi, kemudian kirim ulang — isian tetap tersimpan di HP.';
  END IF;
  IF v_gardu = '' OR v_ulp = '' THEN RAISE EXCEPTION 'Gardu tidak disebut — perbarui aplikasi lalu kirim ulang.'; END IF;
  IF v_role <> 'UP3' AND upper(COALESCE(v_unit, '')) <> v_ulp THEN
    RAISE EXCEPTION 'Gardu ini milik ULP %, akun ini ULP %.', v_ulp, COALESCE(v_unit, '-');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('inspeksi-jtr|' || v_gardu || '|' || v_ulp));
  radius := (public.jtm_ambang(v_ulp)).radius_tumpang_m;

  -- Foto temuan harus sudah terunggah.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_isi->'tiang', '[]'::jsonb)) t,
         LATERAL (
           SELECT value FROM jsonb_each_text(COALESCE(t->'kolom'->'foto_temuan', '{}'::jsonb))
           UNION ALL
           SELECT f.value FROM jsonb_array_elements(COALESCE(t->'konduktor', '[]'::jsonb)) c,
                  jsonb_each_text(COALESCE(c->'foto_temuan', '{}'::jsonb)) f
         ) foto
    WHERE foto.value NOT LIKE 'http%'
  ) THEN
    RAISE EXCEPTION 'Foto temuan belum terunggah. Kirim ulang saat sinyal lebih baik.';
  END IF;

  -- Inspeksi terakhir gardu ini.
  SELECT id, status INTO v_insp, v_stat FROM public.inspeksi_jtr
  WHERE upper(gardu_kode) = v_gardu AND upper(ulp) = v_ulp AND status <> 'Dibatalkan'
  ORDER BY created_at DESC LIMIT 1;

  IF v_stat = 'Selesai' THEN
    -- Kiriman "selesai" yang jawabannya hilang di jalan: semua tiang baru &
    -- pinjaman sudah tercatat → anggap berhasil. Selain itu: sudah dikirim.
    FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_isi->'tiang', '[]'::jsonb)) LOOP
      v_lokal := NULLIF(r->>'id_lokal', '')::uuid;
      IF (jsonb_typeof(r->'baru') = 'object' AND NOT EXISTS (SELECT 1 FROM public.tiang WHERE id_hp = v_lokal))
         OR (jsonb_typeof(r->'tumpang') = 'object' AND NOT EXISTS (SELECT 1 FROM public.tiang_jtr_tumpang WHERE id_hp = v_lokal)) THEN
        sisa := sisa + 1;
      END IF;
    END LOOP;
    IF sisa = 0 AND COALESCE((p_isi->>'selesai')::boolean, false) THEN
      RETURN jsonb_build_object('inspeksi_id', v_insp, 'sudah_ada', true, 'tiang', '[]'::jsonb);
    END IF;
    RAISE EXCEPTION 'Inspeksi gardu % sudah dikirim dan menunggu persetujuan — tidak bisa ditambah. Minta admin mengembalikannya bila perlu.', v_gardu;
  END IF;

  IF v_stat = 'Ditolak' THEN
    -- Dikembalikan admin: inspeksi yang SAMA dibuka lagi, bukan lahir baru.
    UPDATE public.inspeksi_jtr SET status = 'Dalam Proses', tgl_selesai = NULL, updated_at = now()
    WHERE id = v_insp;
  ELSIF v_stat IS NULL OR v_stat = 'Diverifikasi' THEN
    -- Belum ada yang berjalan: kepala Dalam Proses — kiriman sementara pun
    -- terlihat di web dan di HP tim lain.
    INSERT INTO public.inspeksi_jtr (gardu_kode, ulp, penyulang, tgl_mulai, status, inspektor_uid, inspektor_nama, petugas_2)
    VALUES (v_gardu, v_ulp, NULLIF(p_isi->>'penyulang', ''), (now() AT TIME ZONE 'Asia/Makassar')::date,
            'Dalam Proses', auth.uid(), v_nama, NULLIF(p_isi->>'petugas_2', ''))
    RETURNING id INTO v_insp;
  END IF;

  -- Putaran 1: tiang baru & pinjaman (idempoten lewat id_hp).
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_isi->'tiang', '[]'::jsonb)) LOOP
    v_lokal := NULLIF(r->>'id_lokal', '')::uuid;

    IF jsonb_typeof(r->'baru') = 'object' THEN
      b := r->'baru';
      SELECT id INTO v_tiang FROM public.tiang WHERE id_hp = v_lokal;
      IF v_tiang IS NULL THEN
        v_induk := COALESCE(NULLIF(b->>'induk_id', '')::uuid, public.jtr_id_lokal(peta, b->>'induk_lokal'));
        v_lat := NULLIF(b->>'lat', '')::double precision;
        v_lng := NULLIF(b->>'lng', '')::double precision;

        -- Satu batang tidak boleh lahir dua kali — kecuali regu menyatakan
        -- memang batang lain (JTR di sebelah JTM bisa berjarak 0,2 m).
        d_id := NULL;
        SELECT t.id, t.kode, public.jarak_meter(v_lat, v_lng, t.lat, t.lng)
          INTO d_id, d_kode, d_m
        FROM public.tiang t
        WHERE t.status_hidup = 'aktif' AND t.lat IS NOT NULL AND t.lng IS NOT NULL
          AND upper(COALESCE(t.ulp, '')) = v_ulp
        ORDER BY public.jarak_meter(v_lat, v_lng, t.lat, t.lng)
        LIMIT 1;
        IF d_id IS NOT NULL AND d_m <= radius AND NOT COALESCE((b->>'batang_beda')::boolean, false) THEN
          RAISE EXCEPTION 'Tiang % sudah berdiri % m dari titik tiang baru. Pilih "menumpang tiang itu", atau nyatakan dua batang berbeda.',
            d_kode, round(d_m::numeric, 1);
        END IF;

        IF v_induk IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM public.jtr_tiang
          WHERE id = v_induk AND upper(gardu_kode) = v_gardu AND upper(ulp) = v_ulp AND status_hidup = 'aktif') THEN
          RAISE EXCEPTION 'Tiang induk bukan bagian jaringan gardu % — tumpangi dulu tiang itu.', v_gardu;
        END IF;

        -- Induk tiang JTR gardu ini sendiri → induk_id; induk batang pinjaman
        -- → induk_jtr_id (pohon pemilik batang tidak ketambahan anak).
        v_pinjam := v_induk IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM public.tiang WHERE id = v_induk AND upper(gardu_kode) = v_gardu AND upper(ulp) = v_ulp);

        INSERT INTO public.tiang
          (gardu_kode, ulp, jurusan, induk_id, induk_jtr_id, lat, lng, status_hidup, sumber, dikonfirmasi_at, dikonfirmasi_oleh, id_hp,
           beda_dari_tiang_id, beda_dari_jarak_m)
        VALUES (v_gardu, v_ulp, NULLIF(b->>'jurusan', ''),
                CASE WHEN v_pinjam THEN NULL ELSE v_induk END,
                CASE WHEN v_pinjam THEN v_induk END,
                v_lat, v_lng,
                'aktif', 'lapangan', now(), v_nama, v_lokal,
                CASE WHEN d_m <= radius THEN d_id END,
                CASE WHEN d_m <= radius THEN round(d_m::numeric, 1) END)
        RETURNING id INTO v_tiang;
      END IF;
      peta := peta || jsonb_build_object(r->>'id_lokal', v_tiang);

    ELSIF jsonb_typeof(r->'tumpang') = 'object' THEN
      b := r->'tumpang';
      v_tiang := NULLIF(b->>'tiang_id', '')::uuid;
      PERFORM public.tumpangi_tiang_jtr(
        v_gardu, v_ulp, NULLIF(b->>'jurusan', ''), v_tiang,
        COALESCE(NULLIF(b->>'induk_id', '')::uuid, public.jtr_id_lokal(peta, b->>'induk_lokal')),
        v_nama, v_lokal);
      peta := peta || jsonb_build_object(r->>'id_lokal', v_tiang);
    END IF;
  END LOOP;

  -- Putaran 2: isian & kabel (tiang baru, pinjaman, maupun lama).
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_isi->'tiang', '[]'::jsonb)) LOOP
    v_tiang := COALESCE(NULLIF(r->>'tiang_id', '')::uuid, NULLIF(peta->>(r->>'id_lokal'), '')::uuid);
    IF v_tiang IS NULL THEN
      RAISE EXCEPTION 'Satu tiang di kiriman ini tidak punya id — perbarui aplikasi lalu kirim ulang.';
    END IF;
    kol := COALESCE(r->'kolom', '{}'::jsonb);

    -- Isian fisik menulis MASTER — satu batang, satu data, dari JTR maupun JTM.
    PERFORM public.koreksi_tiang(
      v_tiang,
      NULLIF(kol->>'jenis', ''),
      NULLIF(kol->>'tinggi', '')::numeric,
      NULLIF(kol->>'kondisi', ''),
      NULLIF(r->'titik'->>'lat', '')::double precision,
      NULLIF(r->'titik'->>'lng', '')::double precision,
      v_nama,
      NULL,
      jsonb_strip_nulls(jsonb_build_object(
        'andongan', kol->'andongan', 'tarikan_sr', kol->'tarikan_sr',
        'arde_kondisi', kol->'arde_kondisi', 'arde_nilai_ohm', kol->'arde_nilai_ohm',
        'stay_jenis', kol->'stay_jenis', 'stay_kondisi', kol->'stay_kondisi',
        'rawan_row', kol->'rawan_row', 'jamperan', kol->'jamperan',
        'underbuild_tm', kol->'underbuild_tm', 'catatan_perbaikan', kol->'catatan_perbaikan',
        'foto_temuan', kol->'foto_temuan',
        -- ★ Ada JTR gardu lain di tiang ini. Kode kosong dikirim sebagai ""
        --   (bukan null) supaya kode lama bisa dihapus — strip_nulls membuang null.
        'jtr_gardu_lain', kol->'jtr_gardu_lain', 'jtr_gardu_lain_kode', kol->'jtr_gardu_lain_kode')));

    -- ★ Tiang ini DINILAI pada inspeksi ini. Dulu tidak ada catatannya sama
    --   sekali, dan "Selesai" mendaftar SEMUA tiang aktif sebagai "cocok" —
    --   termasuk yang tidak pernah dibuka regu.
    INSERT INTO public.inspeksi_jtr_titik (inspeksi_id, tiang_id, hasil_periksa, lat, lng)
    SELECT v_insp, t.id,
           CASE WHEN jsonb_typeof(r->'baru') = 'object' THEN 'baru' ELSE 'cocok' END,
           t.lat, t.lng
    FROM public.tiang t WHERE t.id = v_tiang
    ON CONFLICT (inspeksi_id, tiang_id) WHERE tiang_id IS NOT NULL DO NOTHING;

    IF jsonb_typeof(r->'konduktor') = 'array' THEN
      kabel := '[]'::jsonb;
      FOR k IN SELECT * FROM jsonb_array_elements(r->'konduktor') LOOP
        kabel := kabel || jsonb_build_array(k || jsonb_build_object(
          'hulu_id', COALESCE(NULLIF(k->>'hulu_id', '')::uuid, public.jtr_id_lokal(peta, k->>'hulu_lokal'))));
      END LOOP;
      PERFORM public.simpan_konduktor_tiang(v_tiang, kabel, v_nama, v_gardu);
    END IF;

    -- Nama JTR di gardu ini (untuk batang pinjaman: nama pinjamannya).
    SELECT kode INTO v_kode FROM public.jtr_tiang
    WHERE id = v_tiang AND upper(gardu_kode) = v_gardu AND status_hidup = 'aktif'
    ORDER BY menumpang LIMIT 1;
    hasil := hasil || jsonb_build_object('id_lokal', r->>'id_lokal', 'tiang_id', v_tiang, 'kode', v_kode);
  END LOOP;

  -- Tutup: fungsi yang sudah ada (mendaftar semua tiang aktif & menutup).
  IF COALESCE((p_isi->>'selesai')::boolean, false) THEN
    v_insp := public.selesaikan_inspeksi_jtr(
      v_gardu, v_ulp, NULLIF(p_isi->>'penyulang', ''), v_nama,
      NULLIF(p_isi->>'petugas_2', ''), NULLIF(btrim(COALESCE(p_isi->>'catatan_selesai', '')), ''));
  END IF;

  RETURN jsonb_build_object('inspeksi_id', v_insp, 'sudah_ada', false, 'tiang', hasil);
END $fn$;


-- ── 4. peta_tiang — disalin dari `peta-jtr-di-jtm.sql`; kolom baru di belakang ★ ──
CREATE OR REPLACE VIEW public.peta_tiang AS
SELECT t.id,
       k.kode,
       t.ulp,
       t.lat,
       t.lng,
       t.penanda,
       t.percabangan,
       'jtm'::text          AS jaringan,
       k.penyulang          AS induk_kelompok,
       t.induk_id,
       p.lat                AS induk_lat,
       p.lng                AS induk_lng,
       NOT k.utama          AS menumpang,
       NULL::int            AS jumlah_kabel,
       false                AS kabel_putus,
       false                AS di_jtm,
       NULL::text           AS gardu_bersama
FROM public.tiang t
JOIN public.tiang_kode_penyulang k ON k.tiang_id = t.id
LEFT JOIN public.tiang p ON p.id = t.induk_id AND p.status_hidup = 'aktif'
WHERE t.gardu_kode IS NULL
  AND t.status_hidup = 'aktif' AND t.lat IS NOT NULL AND t.lng IS NOT NULL

UNION ALL

SELECT t.id, t.kode, t.ulp, t.lat, t.lng, t.penanda, t.percabangan,
       'jtm'::text, t.penyulang, t.induk_id, p.lat, p.lng, false,
       NULL::int, false, false, NULL::text
FROM public.tiang t
LEFT JOIN public.tiang p ON p.id = t.induk_id AND p.status_hidup = 'aktif'
WHERE t.gardu_kode IS NULL
  AND t.status_hidup = 'aktif' AND t.lat IS NOT NULL AND t.lng IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.tiang_kode_penyulang k WHERE k.tiang_id = t.id)

UNION ALL

SELECT j.id, j.kode, j.ulp, j.lat, j.lng, j.penanda, j.percabangan,
       'jtr'::text, j.gardu_kode, j.induk_id,
       -- ★ Tiang pertama (tanpa induk) bergaris ke gardunya.
       -- Koordinat gardu double precision, tiang numeric(12,8): disamakan ke
       -- tipe kolom lama view ini (CREATE OR REPLACE tidak boleh mengubahnya).
       (CASE WHEN j.induk_id IS NULL THEN g.lat::numeric ELSE p.lat END)::numeric(12,8),
       (CASE WHEN j.induk_id IS NULL THEN g.lng::numeric ELSE p.lng END)::numeric(12,8),
       j.menumpang,
       -- ★ Kabel JTR gardu ini di tiang ini; ≥2 = underbuild JTR.
       (SELECT count(*)::int FROM public.jtr_kabel kb
         WHERE kb.tiang_id = j.id AND kb.gardu = upper(j.gardu_kode)),
       -- ★ Ada kabel yang belum jelas datang dari tiang mana.
       EXISTS (SELECT 1 FROM public.tiang_gawang_kabel gk
                WHERE gk.tiang_id = j.id AND upper(gk.gardu_kode) = upper(j.gardu_kode) AND NOT gk.tersambung),
       -- ★ JTR di tiang JTM: dicatat regu "ada JTM di atasnya" (underbuild_tm),
       -- atau batang pinjamannya tiang JTM (punya nama di sebuah penyulang).
       COALESCE(j.underbuild_tm, false)
         OR (j.menumpang AND EXISTS (SELECT 1 FROM public.tiang_kode_penyulang kp WHERE kp.tiang_id = j.id)),
       -- ★ Gardu JTR LAIN di batang ini: yang tercatat (baris jtr_tiang gardu
       -- lain) + yang dinyatakan regu ("Ada JTR gardu lain", kode bila tahu).
       -- '?' = dinyatakan ada, kodenya belum diketahui. NULL = tidak ada.
       NULLIF(concat_ws(', ',
         (SELECT string_agg(DISTINCT upper(o.gardu_kode), ', ') FROM public.jtr_tiang o
           WHERE o.id = j.id AND upper(o.gardu_kode) <> upper(j.gardu_kode) AND o.status_hidup = 'aktif'),
         CASE
           WHEN NOT bt.jtr_gardu_lain THEN NULL
           -- Kode tak diketahui: '?' hanya selama belum ada gardu lain tercatat.
           WHEN bt.jtr_gardu_lain_kode IS NULL THEN
             CASE WHEN NOT EXISTS (SELECT 1 FROM public.jtr_tiang o2
                                    WHERE o2.id = j.id AND upper(o2.gardu_kode) <> upper(j.gardu_kode) AND o2.status_hidup = 'aktif')
                  THEN '?' END
           -- Kode diketahui: tampil selama gardu itu belum tercatat di batang ini.
           WHEN upper(bt.jtr_gardu_lain_kode) <> upper(j.gardu_kode)
                AND NOT EXISTS (SELECT 1 FROM public.jtr_tiang o2
                                 WHERE o2.id = j.id AND upper(o2.gardu_kode) = upper(bt.jtr_gardu_lain_kode) AND o2.status_hidup = 'aktif')
             THEN upper(bt.jtr_gardu_lain_kode)
         END), '')
FROM public.jtr_tiang j
LEFT JOIN public.tiang p ON p.id = j.induk_id AND p.status_hidup = 'aktif'
LEFT JOIN public.gardu g ON upper(g.kode) = upper(j.gardu_kode) AND upper(g.ulp) = upper(j.ulp)
JOIN public.tiang bt ON bt.id = j.id
WHERE j.status_hidup = 'aktif' AND j.lat IS NOT NULL AND j.lng IS NOT NULL;

GRANT SELECT ON public.peta_tiang TO authenticated;


-- ── 5. Gabungkan tiang kembar ────────────────────────────────────────────────
-- p_kembar = tiang MILIK gardu p_gardu yang ternyata batang yang sama dengan
-- p_batang (milik jaringan lain). Sesudahnya: gardu p_gardu MENUMPANG di
-- p_batang dengan nama, jurusan, induk, kabel, dan tiang sesudahnya yang sama;
-- batang kembarnya dibatalkan.
CREATE OR REPLACE FUNCTION public.gabung_tiang_jtr(
  p_kembar UUID, p_gardu TEXT, p_batang UUID, p_alasan TEXT, p_nama TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  g  TEXT := upper(btrim(p_gardu));
  k  RECORD;
  b  RECORD;
  bk TEXT;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan wajib diisi'; END IF;
  IF p_kembar = p_batang THEN RAISE EXCEPTION 'Tiang kembar dan batang tujuan sama'; END IF;

  SELECT * INTO k FROM public.tiang WHERE id = p_kembar AND status_hidup = 'aktif' FOR UPDATE;
  IF NOT FOUND OR upper(COALESCE(k.gardu_kode, '')) <> g THEN
    RAISE EXCEPTION 'Tiang kembar harus tiang JTR aktif MILIK gardu % (bukan pinjaman)', g;
  END IF;
  PERFORM public.wajib_boleh_ulp(k.ulp);
  IF EXISTS (SELECT 1 FROM public.tiang_kode_penyulang WHERE tiang_id = p_kembar) THEN
    RAISE EXCEPTION 'Tiang % juga tiang JTM — gabungkan lewat Inspeksi JTM', k.kode;
  END IF;

  SELECT * INTO b FROM public.tiang WHERE id = p_batang AND status_hidup = 'aktif' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batang tujuan tidak ditemukan / tidak aktif'; END IF;
  IF upper(COALESCE(b.ulp, '')) <> upper(COALESCE(k.ulp, '')) THEN RAISE EXCEPTION 'Batang tujuan beda ULP'; END IF;
  IF EXISTS (SELECT 1 FROM public.jtr_tiang WHERE id = p_batang AND upper(gardu_kode) = g AND status_hidup = 'aktif') THEN
    RAISE EXCEPTION 'Batang tujuan sudah bagian jaringan gardu % — bukan kembar, pakai Ganti induk', g;
  END IF;
  bk := COALESCE(b.kode, '(tanpa nama)');

  -- Pinjaman baru: nama, jurusan, induk gardu ini ikut. Nama sementara dulu —
  -- nama kembar masih dipakai baris tiangnya sampai dibatalkan di bawah.
  INSERT INTO public.tiang_jtr_tumpang (tiang_id, gardu_kode, ulp, jurusan, induk_id, kode, status, dibuat_oleh, dibuat_uid)
  VALUES (p_batang, g, upper(k.ulp), k.jurusan, COALESCE(k.induk_jtr_id, k.induk_id),
          k.kode || '~gabung', 'aktif', p_nama, auth.uid());

  -- Kabel gardu ini pindah ke batang (milik gardu ini di batang orang lain).
  UPDATE public.tiang_konduktor
     SET tiang_id = p_batang, pemilik_gardu_kode = g
   WHERE tiang_id = p_kembar AND upper(COALESCE(pemilik_gardu_kode, k.gardu_kode)) = g;

  -- Semua yang menunjuk kembar sebagai hulu → batang.
  -- Anak milik sendiri yang berinduk ke batang PINJAMAN → induk_jtr_id (aturan
  -- kirim_tiang_jtr: pohon pemilik batang tidak ketambahan anak).
  UPDATE public.tiang SET induk_id = NULL, induk_jtr_id = p_batang, updated_at = now()
   WHERE induk_id = p_kembar AND status_hidup = 'aktif';
  UPDATE public.tiang SET induk_jtr_id = p_batang, updated_at = now() WHERE induk_jtr_id = p_kembar AND status_hidup = 'aktif';
  UPDATE public.tiang_jtr_tumpang SET induk_id = p_batang, updated_at = now() WHERE induk_id = p_kembar AND status = 'aktif';
  UPDATE public.tiang_konduktor SET induk_tiang_id = p_batang WHERE induk_tiang_id = p_kembar;
  -- Gardu lain yang (keliru) menumpang di kembar ikut pindah ke batang asli.
  UPDATE public.tiang_jtr_tumpang SET tiang_id = p_batang, updated_at = now()
   WHERE tiang_id = p_kembar AND status = 'aktif'
     AND NOT EXISTS (SELECT 1 FROM public.tiang_jtr_tumpang x
                      WHERE x.tiang_id = p_batang AND upper(x.gardu_kode) = upper(tiang_jtr_tumpang.gardu_kode) AND x.status = 'aktif');

  -- Kembar dibatalkan, namanya dibebaskan untuk baris pinjaman.
  UPDATE public.tiang
     SET status_hidup = 'batal', aktif_sampai = CURRENT_DATE,
         catatan = 'Digabung ke batang ' || bk || ': ' || btrim(p_alasan), updated_at = now()
   WHERE id = p_kembar;
  UPDATE public.tiang_jtr_tumpang SET kode = k.kode, updated_at = now()
   WHERE tiang_id = p_batang AND upper(gardu_kode) = g AND status = 'aktif';

  INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', k.kode, k.ulp, 'gabung_batang',
          jsonb_build_object('batang', k.kode),
          jsonb_build_object('batang', bk, 'alasan', p_alasan),
          'sunting_admin', auth.uid(), p_nama);
  RETURN bk;
END $fn$;

GRANT EXECUTE ON FUNCTION public.gabung_tiang_jtr(UUID, TEXT, UUID, TEXT, TEXT) TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT kode, jtr_gardu_lain, jtr_gardu_lain_kode FROM tiang WHERE jtr_gardu_lain;
--   SELECT kode, induk_kelompok, gardu_bersama FROM peta_tiang WHERE gardu_bersama IS NOT NULL;
