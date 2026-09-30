-- =============================================================================
-- Inspeksi JTM & JTR: "Selesai" hanya kalau SEMUA tiang sudah dinilai
-- Jalankan SESUDAH wo-inspeksi-jtr.sql, jtr-tiang-bersama.sql, jtm-lanjut.sql,
-- istilah-inspeksi.sql. Aman diulang.
--
-- ── KEPUTUSAN USER 30 SEP 2026 ──────────────────────────────────────────────
-- "Tiang belum dinilai tapi sudah bisa klik Selesai dan kirim, baik di JTM dan
-- JTR." Diputuskan:
--   • Selesai DITOLAK selama masih ada tiang segmen (JTM) / gardu (JTR) yang
--     belum dinilai pada inspeksi ini. Belum tuntas = inspeksi tetap terbuka.
--   • Kirim sementara tetap boleh — termasuk tiang baru yang belum dinilai,
--     supaya dapat nama untuk menyambung tiang berikutnya.
--
-- ── YANG SALAH SEBELUMNYA ───────────────────────────────────────────────────
--   JTR  `selesaikan_inspeksi_jtr` mendaftarkan SETIAP tiang aktif gardu
--        sebagai "cocok" saat Selesai — tiang yang tidak pernah dibuka regu
--        tercatat sudah diperiksa dan sesuai. Kiriman tiang tidak meninggalkan
--        catatan per inspeksi, jadi server tidak bisa membedakannya.
--   JTM  Selesai hanya ditolak kalau belum ada SATU pun tiang dinilai.
--
-- Penjaga ada di SERVER, bukan cuma di HP: HP lama yang belum ter-OTA pun
-- tidak bisa lagi menutup inspeksi yang belum tuntas.
-- =============================================================================


-- ── 1. JTR: kiriman mencatat tiang yang dinilai ──────────────────────────────
-- Disalin utuh dari `wo-inspeksi-jtr.sql`; satu tambahan (★).

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
        'foto_temuan', kol->'foto_temuan')));

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


-- ── 2. JTR: Selesai hanya kalau semua tiang aktif gardu sudah dinilai ────────
-- Disalin dari `jtr-tiang-bersama.sql`; pendaftaran otomatis "cocok" DIGANTI
-- penolakan yang menyebut tiang mana yang belum (★).

CREATE OR REPLACE FUNCTION public.selesaikan_inspeksi_jtr(
  p_gardu text, p_ulp text, p_penyulang text DEFAULT NULL::text, p_nama text DEFAULT NULL::text,
  p_petugas_2 text DEFAULT NULL::text, p_catatan text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  id_sapu UUID;
  n_belum INT;
  daftar  TEXT;
BEGIN
  SELECT id INTO id_sapu
  FROM public.inspeksi_jtr
  WHERE upper(gardu_kode) = upper(p_gardu)
    AND upper(ulp) = upper(p_ulp)
    AND (status IN ('Dijadwalkan', 'Dalam Proses')
         OR (status = 'Selesai' AND tgl_selesai = CURRENT_DATE))
  ORDER BY created_at DESC
  LIMIT 1;

  IF id_sapu IS NULL THEN
    RAISE EXCEPTION 'Belum ada tiang gardu % yang dinilai — tidak ada yang bisa dinyatakan selesai.', upper(p_gardu);
  END IF;

  -- ★ Tiang milik gardu ini DAN yang dipinjam (menumpang) — `jtr_tiang`.
  SELECT count(*),
         (SELECT string_agg(z.kode, ', ') FROM (
            SELECT b.kode FROM public.jtr_tiang b
            WHERE upper(b.gardu_kode) = upper(p_gardu) AND upper(b.ulp) = upper(p_ulp)
              AND b.status_hidup = 'aktif'
              AND NOT EXISTS (SELECT 1 FROM public.inspeksi_jtr_titik x
                              WHERE x.inspeksi_id = id_sapu AND x.tiang_id = b.id)
            ORDER BY b.kode LIMIT 8) z)
    INTO n_belum, daftar
  FROM public.jtr_tiang t
  WHERE upper(t.gardu_kode) = upper(p_gardu)
    AND upper(t.ulp) = upper(p_ulp)
    AND t.status_hidup = 'aktif'
    AND NOT EXISTS (SELECT 1 FROM public.inspeksi_jtr_titik x
                    WHERE x.inspeksi_id = id_sapu AND x.tiang_id = t.id);

  IF n_belum > 0 THEN
    RAISE EXCEPTION 'Masih % tiang gardu % belum dinilai: %. Buka tiangnya, periksa, simpan, lalu kirim lagi.',
      n_belum, upper(p_gardu), daftar || CASE WHEN n_belum > 8 THEN ', …' ELSE '' END;
  END IF;

  UPDATE public.inspeksi_jtr
  SET status = 'Selesai',
      tgl_selesai = CURRENT_DATE,
      inspektor_nama = COALESCE(p_nama, inspektor_nama),
      petugas_2 = COALESCE(p_petugas_2, petugas_2),
      catatan = COALESCE(p_catatan, catatan),
      updated_at = now()
  WHERE id = id_sapu;

  RETURN id_sapu;
END $function$;


-- ── 3. JTR: inspeksi yang sedang berjalan ────────────────────────────────────
-- Tiang yang SUDAH dikirim sebelum berkas ini dijalankan belum punya catatan
-- per inspeksi. Tanpa ini, regu yang sedang di tengah penyapuan harus membuka
-- ulang tiang yang sudah dia periksa. Tandanya: tiang itu lahir atau berubah
-- sejak inspeksinya dibuka.

INSERT INTO public.inspeksi_jtr_titik (inspeksi_id, tiang_id, hasil_periksa, lat, lng)
SELECT i.id, t.id,
       CASE WHEN t.created_at >= i.created_at THEN 'baru' ELSE 'cocok' END,
       t.lat, t.lng
FROM public.inspeksi_jtr i
JOIN public.jtr_tiang j ON upper(j.gardu_kode) = upper(i.gardu_kode) AND upper(j.ulp) = upper(i.ulp)
                       AND j.status_hidup = 'aktif'
JOIN public.tiang t ON t.id = j.id
WHERE i.status IN ('Dijadwalkan', 'Dalam Proses')
  AND (t.created_at >= i.created_at OR t.updated_at >= i.created_at)
ON CONFLICT (inspeksi_id, tiang_id) WHERE tiang_id IS NOT NULL DO NOTHING;


-- ── 4. JTM: Selesai hanya kalau semua anggota segmen sudah dinilai ───────────
-- Disalin dari `jtm-lanjut.sql` (namanya kini `selesaikan_inspeksi_jtm`,
-- lihat istilah-inspeksi.sql); satu penjaga baru (★).

CREATE OR REPLACE FUNCTION public.selesaikan_inspeksi_jtm(
  p_id      UUID,
  p_nama    TEXT DEFAULT NULL,
  p_catatan TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m        RECORD;
  jml_t    INT;
  jml_d    INT;
  jml_seg  INT;
  n_belum  INT;
  daftar   TEXT;
BEGIN
  SELECT * INTO m FROM public.inspeksi_jtm WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Penyapuan tidak ditemukan'; END IF;
  IF m.status NOT IN ('Dijadwalkan', 'Dalam Proses') THEN
    RAISE EXCEPTION 'Penyapuan sudah berstatus %', m.status;
  END IF;

  SELECT count(*) INTO jml_t FROM public.segmen_tiang WHERE segmen_id = m.segmen_id;
  SELECT count(*) INTO jml_d FROM public.inspeksi_jtm_titik WHERE inspeksi_id = p_id;
  jml_seg := public.jtm_tiang_tersapu(m.segmen_id);

  IF jml_d = 0 THEN
    RAISE EXCEPTION 'Belum ada satu pun tiang yang dinilai — tidak ada yang bisa dinyatakan selesai.';
  END IF;

  -- ★ Tiang aktif segmen ini yang belum dinilai pada inspeksi INI, disebut
  --   dengan namanya di penyulang segmen ini.
  SELECT count(*),
         (SELECT string_agg(z.kode, ', ') FROM (
            SELECT COALESCE(k.kode, t2.kode) AS kode
            FROM public.segmen_tiang s2
            JOIN public.tiang t2 ON t2.id = s2.tiang_id AND t2.status_hidup = 'aktif'
            LEFT JOIN public.tiang_kode_penyulang k
              ON k.tiang_id = t2.id AND upper(k.penyulang) = upper(m.penyulang)
            WHERE s2.segmen_id = m.segmen_id
              AND NOT EXISTS (SELECT 1 FROM public.inspeksi_jtm_titik x
                              WHERE x.inspeksi_id = p_id AND x.tiang_id = t2.id)
            ORDER BY 1 LIMIT 8) z)
    INTO n_belum, daftar
  FROM public.segmen_tiang st
  JOIN public.tiang t ON t.id = st.tiang_id AND t.status_hidup = 'aktif'
  WHERE st.segmen_id = m.segmen_id
    AND NOT EXISTS (SELECT 1 FROM public.inspeksi_jtm_titik x
                    WHERE x.inspeksi_id = p_id AND x.tiang_id = t.id);

  IF n_belum > 0 THEN
    RAISE EXCEPTION 'Masih % tiang segmen ini belum dinilai: %. Nilai tiangnya dulu, lalu kirim lagi.',
      n_belum, daftar || CASE WHEN n_belum > 8 THEN ', …' ELSE '' END;
  END IF;

  UPDATE public.inspeksi_jtm
  SET status = 'Selesai',
      tgl_selesai = now(),
      petugas_nama = COALESCE(p_nama, petugas_nama),
      catatan = COALESCE(p_catatan, catatan),
      updated_at = now()
  WHERE id = p_id;

  RETURN jsonb_build_object(
    'tiang_segmen',  jml_t,
    'tiang_dinilai', jml_seg,            -- cakupan segmen, bukan isi satu penyapuan
    'sesi_ini',      jml_d,
    'persen', CASE WHEN jml_t > 0 THEN round(100.0 * jml_seg / jml_t, 1) ELSE NULL END
  );
END $$;


-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Inspeksi JTR yang sedang berjalan dan berapa tiangnya yang sudah dinilai:
--      SELECT i.gardu_kode, i.status,
--        (SELECT count(*) FROM jtr_tiang t WHERE upper(t.gardu_kode) = upper(i.gardu_kode)
--           AND upper(t.ulp) = upper(i.ulp) AND t.status_hidup = 'aktif') AS tiang,
--        (SELECT count(*) FROM inspeksi_jtr_titik x WHERE x.inspeksi_id = i.id) AS dinilai
--      FROM inspeksi_jtr i WHERE i.status IN ('Dijadwalkan','Dalam Proses');
--
-- b. Sama untuk JTM:
--      SELECT m.penyulang, s.nama, m.status,
--        (SELECT count(*) FROM segmen_tiang st WHERE st.segmen_id = m.segmen_id) AS tiang,
--        (SELECT count(*) FROM inspeksi_jtm_titik x WHERE x.inspeksi_id = m.id) AS dinilai
--      FROM inspeksi_jtm m JOIN segmen s ON s.id = m.segmen_id
--      WHERE m.status IN ('Dijadwalkan','Dalam Proses');
-- =============================================================================
