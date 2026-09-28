-- =============================================================================
-- Tegangan ujung hanya di jurusan BERBEBAN (28 Sep 2026)
-- Jalankan manual di Supabase SQL Editor, SESUDAH `tegangan-ujung.sql`. Idempoten.
--
-- User: "pengukuran tegangan ujung itu harusnya diukur jurusan yang ada
-- bebannya di pengukuran terakhir, bukan boleh diukur jurusannya asal-asalan."
--
--   • kirim_tegangan_ujung menolak jurusan yang arusnya nol di beban pasangannya
--   • jurusan wajib (ujung JTR terjauh) dipilih di antara jurusan berbeban saja
--
-- Badan fungsi disalin dari `tegangan-ujung.sql` (satu-satunya versi yang
-- terpasang) dan hanya ditambah dua penjaga itu.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.kirim_tegangan_ujung(p_isi JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pid   TEXT := NULLIF(btrim(p_isi->>'pengukuran_id'), '');
  v_nama  TEXT := NULLIF(btrim(COALESCE(p_isi->>'nama', '')), '');
  v_role  TEXT;
  v_unit  TEXT;
  hari    DATE := (now() AT TIME ZONE 'Asia/Makassar')::date;
  m       RECORD;
  r       JSONB;
  v_id    UUID;
  v_jur   TEXT;
  v_tgl   DATE;
  v_lat   DOUBLE PRECISION;
  v_lng   DOUBLE PRECISION;
  ada     RECORD;
  uj      RECORD;
  wajib   TEXT;
  n       INT := 0;
  berbeban TEXT[];
BEGIN
  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi, kemudian kirim ulang — isian tetap tersimpan di HP.';
  END IF;
  IF v_pid IS NULL THEN RAISE EXCEPTION 'Pengukuran beban tidak disebut — perbarui aplikasi lalu kirim ulang.'; END IF;

  SELECT * INTO m FROM public.pengukuran_gardu WHERE id = v_pid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pengukuran beban gardu ini belum ada di server. Kirim bebannya dulu, lalu tegangan ujungnya.';
  END IF;
  IF v_role <> 'UP3' AND upper(COALESCE(v_unit, '')) <> upper(m.petugas_unit) THEN
    RAISE EXCEPTION 'Akun ini untuk ULP %, bukan %.', COALESCE(v_unit, '-'), m.petugas_unit;
  END IF;
  IF m.hasil_penyeimbangan_id IS NOT NULL THEN
    RAISE EXCEPTION 'Baris ini hasil penyeimbangan, bukan pengukuran petugas.';
  END IF;
  IF m.dikembalikan_at IS NOT NULL THEN
    RAISE EXCEPTION 'Pengukuran beban % sedang dikembalikan admin — perbaiki dan kirim bebannya dulu.', m.no_gardu;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tegangan-ujung|' || v_pid));

  -- Jurusan yang BERBEBAN di pengukuran beban pasangannya (arus R/S/T > 0).
  -- Tegangan ujung hanya diukur di jurusan itu (user 28 Sep 2026: "harusnya
  -- diukur jurusan yang ada bebannya, bukan asal-asalan"). Beban tanpa rincian
  -- per jurusan (data lama) = tidak bisa dicek → semua jurusan sah.
  SELECT array_agg(j.key ORDER BY j.key) INTO berbeban
  FROM jsonb_each(CASE WHEN jsonb_typeof(m.perjurusan) = 'object' THEN m.perjurusan ELSE '{}'::jsonb END) j
  WHERE greatest(COALESCE(NULLIF(j.value->'arus'->>'R', '')::numeric, 0),
                 COALESCE(NULLIF(j.value->'arus'->>'S', '')::numeric, 0),
                 COALESCE(NULLIF(j.value->'arus'->>'T', '')::numeric, 0)) > 0;

  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_isi->'titik', '[]'::jsonb)) LOOP
    v_id  := NULLIF(r->>'id', '')::uuid;
    v_jur := upper(NULLIF(btrim(r->>'jurusan'), ''));
    v_tgl := NULLIF(r->>'tgl_ukur', '')::date;
    v_lat := NULLIF(r->>'lat', '')::double precision;
    v_lng := NULLIF(r->>'lng', '')::double precision;

    IF v_id IS NULL OR v_jur IS NULL OR v_tgl IS NULL THEN
      RAISE EXCEPTION 'Satu titik tidak lengkap (id, jurusan, tanggal) — perbarui aplikasi lalu kirim ulang.';
    END IF;
    IF v_lat IS NULL OR v_lng IS NULL THEN
      RAISE EXCEPTION 'Titik koordinat jurusan % belum ada — buka lagi, tunggu GPS, lalu simpan.', v_jur;
    END IF;
    IF COALESCE(r->>'foto_url', '') NOT LIKE 'http%' THEN
      RAISE EXCEPTION 'Foto tegangan ujung jurusan % belum terunggah. Kirim ulang saat sinyal lebih baik.', v_jur;
    END IF;
    IF berbeban IS NOT NULL AND NOT (v_jur = ANY (berbeban)) THEN
      RAISE EXCEPTION 'Jurusan % gardu % tidak berbeban di pengukuran bebannya (berbeban: %) — tegangan ujung hanya diukur di jurusan yang berarus.',
        v_jur, m.no_gardu, array_to_string(berbeban, ', ');
    END IF;
    IF v_tgl > hari THEN
      RAISE EXCEPTION 'Tanggal ukur % ada di masa depan.', to_char(v_tgl, 'DD-MM-YYYY');
    END IF;
    -- Sebulan dengan bebannya (keputusan user 27 Sep 2026).
    IF date_trunc('month', v_tgl) <> date_trunc('month', m.tanggal_pengukuran::date) OR v_tgl < m.tanggal_pengukuran::date THEN
      RAISE EXCEPTION 'Tegangan ujung jurusan % diukur %, sedangkan bebannya %. Keduanya harus di bulan yang sama, dan ujung tidak mendahului beban.',
        v_jur, to_char(v_tgl, 'DD-MM-YYYY'), to_char(m.tanggal_pengukuran::date, 'DD-MM-YYYY');
    END IF;
    IF COALESCE(NULLIF(r->>'v_rn', '')::numeric, 0) <= 0 OR COALESCE(NULLIF(r->>'v_sn', '')::numeric, 0) <= 0
       OR COALESCE(NULLIF(r->>'v_tn', '')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Tegangan R-N, S-N, dan T-N jurusan % wajib diisi.', v_jur;
    END IF;
    IF greatest((r->>'v_rn')::numeric, (r->>'v_sn')::numeric, (r->>'v_tn')::numeric) > 300 THEN
      RAISE EXCEPTION 'Tegangan jurusan % di atas 300 V — periksa ketikannya (fasa-netral, bukan fasa-fasa).', v_jur;
    END IF;

    SELECT * INTO ada FROM public.pengukuran_tegangan_ujung WHERE id = v_id FOR UPDATE;
    IF FOUND THEN
      IF ada.pengukuran_id <> v_pid THEN RAISE EXCEPTION 'Id titik ini milik pengukuran lain.'; END IF;
      -- Terkirim & jawabannya hilang di jalan: dianggap berhasil, tidak diubah.
      IF ada.status = 'Terkirim' THEN n := n + 1; CONTINUE; END IF;
      IF ada.status = 'Dibatalkan' THEN RAISE EXCEPTION 'Titik jurusan % sudah dibatalkan admin.', ada.jurusan; END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM public.pengukuran_tegangan_ujung x
               WHERE x.pengukuran_id = v_pid AND x.jurusan = v_jur AND x.status <> 'Dibatalkan' AND x.id <> v_id) THEN
      RAISE EXCEPTION 'Jurusan % gardu % sudah punya tegangan ujung — satu jurusan satu titik.', v_jur, m.no_gardu;
    END IF;

    SELECT * INTO uj FROM public.jtr_ujung_terjauh(m.petugas_unit, m.no_gardu) x WHERE x.jurusan = v_jur;

    INSERT INTO public.pengukuran_tegangan_ujung (
      id, pengukuran_id, gardu_kode, ulp, jurusan, v_rn, v_sn, v_tn, lat, lng, akurasi_m, foto_url,
      tiang_rekomendasi_id, jarak_rekomendasi_m, panjang_jaringan_m,
      tgl_ukur, jam_ukur, petugas_nama, petugas_uid, status, alasan, diubah_oleh
    ) VALUES (
      v_id, v_pid, upper(m.no_gardu), upper(m.petugas_unit), v_jur,
      (r->>'v_rn')::numeric, (r->>'v_sn')::numeric, (r->>'v_tn')::numeric,
      v_lat, v_lng, NULLIF(r->>'akurasi', '')::numeric, r->>'foto_url',
      uj.tiang_id,
      CASE WHEN uj.tiang_id IS NOT NULL THEN round(public.jarak_meter(v_lat, v_lng, uj.lat, uj.lng)::numeric, 1) END,
      uj.panjang_jaringan_m,
      v_tgl, NULLIF(r->>'jam_ukur', '')::time, v_nama, auth.uid(), 'Terkirim', NULL, v_nama
    )
    ON CONFLICT (id) DO UPDATE SET
      jurusan = EXCLUDED.jurusan, v_rn = EXCLUDED.v_rn, v_sn = EXCLUDED.v_sn, v_tn = EXCLUDED.v_tn,
      lat = EXCLUDED.lat, lng = EXCLUDED.lng, akurasi_m = EXCLUDED.akurasi_m, foto_url = EXCLUDED.foto_url,
      tiang_rekomendasi_id = EXCLUDED.tiang_rekomendasi_id, jarak_rekomendasi_m = EXCLUDED.jarak_rekomendasi_m,
      panjang_jaringan_m = EXCLUDED.panjang_jaringan_m,
      tgl_ukur = EXCLUDED.tgl_ukur, jam_ukur = EXCLUDED.jam_ukur,
      petugas_nama = COALESCE(EXCLUDED.petugas_nama, public.pengukuran_tegangan_ujung.petugas_nama),
      petugas_uid = EXCLUDED.petugas_uid,
      status = 'Terkirim', alasan = NULL, diubah_oleh = EXCLUDED.diubah_oleh, updated_at = now();
    n := n + 1;
  END LOOP;

  IF n = 0 THEN RAISE EXCEPTION 'Tidak ada titik tegangan ujung yang dikirim.'; END IF;

  -- Kewajiban jurusan terjauh (u3) — di antara jurusan yang BERBEBAN.
  SELECT x.jurusan INTO wajib FROM public.jtr_ujung_terjauh(m.petugas_unit, m.no_gardu) x
  WHERE berbeban IS NULL OR x.jurusan = ANY (berbeban)
  ORDER BY x.panjang_jaringan_m DESC LIMIT 1;
  IF wajib IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.pengukuran_tegangan_ujung x
       WHERE x.pengukuran_id = v_pid AND x.jurusan = wajib AND x.status = 'Terkirim') THEN
    RAISE EXCEPTION 'Jurusan % gardu % punya ujung JTR terjauh — tegangan ujungnya wajib diukur di sana.', wajib, m.no_gardu;
  END IF;

  RETURN jsonb_build_object('pengukuran_id', v_pid, 'titik', n, 'jurusan_wajib', wajib);
END $$;

GRANT EXECUTE ON FUNCTION public.kirim_tegangan_ujung(JSONB) TO authenticated;
