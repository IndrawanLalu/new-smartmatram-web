-- =============================================================================
-- Tegangan ujung: batas jarak titik ukur, semua tiang JTR boleh dipakai,
-- buang yang dikembalikan = batal di server (5 Okt 2026).
-- Jalankan manual di Supabase SQL Editor. Idempoten. Tidak mengganggu lapangan
-- (HP lama tetap bisa mengirim; yang berubah hanya penolakan titik > batas
-- jarak dan dilepasnya aturan "jurusan wajib").
--
-- Keputusan user:
--   • Titik ukur DITOLAK bila lebih dari batas (bawaan 100 m) dari tiang JTR
--     gardu itu yang mana pun; batasnya diatur per ULP di web.
--   • Ujung JTR terjauh tinggal REKOMENDASI; semua tiang JTR gardu tampil dan
--     boleh dipakai. Aturan "jurusan X wajib diukur" dilepas — huruf jurusan
--     JTR tidak selalu sama dengan jurusan pengukuran.
--   • Data yang DIKEMBALIKAN admin lalu dibuang regu di HP ikut dibatalkan di
--     server (tegangan ujung: Dibatalkan; beban: dihapus, sama dengan Batal di
--     web).
-- =============================================================================


-- ── 1. Pengaturan & kolom ────────────────────────────────────────────────────
ALTER TABLE public.aturan_tegangan_ujung
  ADD COLUMN IF NOT EXISTS jarak_maks_m INT NOT NULL DEFAULT 100;
ALTER TABLE public.aturan_tegangan_ujung DROP CONSTRAINT IF EXISTS aturan_tegangan_ujung_jarak_check;
ALTER TABLE public.aturan_tegangan_ujung ADD CONSTRAINT aturan_tegangan_ujung_jarak_check
  CHECK (jarak_maks_m BETWEEN 10 AND 1000);

ALTER TABLE public.pengukuran_tegangan_ujung
  ADD COLUMN IF NOT EXISTS tiang_terdekat_id UUID,
  ADD COLUMN IF NOT EXISTS jarak_tiang_terdekat_m NUMERIC(8,1);


-- ── 2. Atur batas jarak (web, admin ULP / UP3) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.atur_jarak_tegangan_ujung(p_ulp TEXT, p_jarak INT, p_oleh TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ulp TEXT := upper(btrim(COALESCE(p_ulp, '')));
BEGIN
  PERFORM public.wajib_boleh_ulp(v_ulp);
  IF p_jarak IS NULL OR p_jarak < 10 OR p_jarak > 1000 THEN
    RAISE EXCEPTION 'Batas jarak harus 10–1000 m.';
  END IF;
  INSERT INTO public.aturan_tegangan_ujung (ulp, jarak_maks_m, diubah_oleh, updated_at)
  VALUES (v_ulp, p_jarak, p_oleh, now())
  ON CONFLICT (ulp) DO UPDATE SET jarak_maks_m = EXCLUDED.jarak_maks_m, diubah_oleh = EXCLUDED.diubah_oleh, updated_at = now();
END $$;
GRANT EXECUTE ON FUNCTION public.atur_jarak_tegangan_ujung(TEXT, INT, TEXT) TO authenticated;


-- ── 3. Tiang JTR gardu yang terdekat dari satu titik ─────────────────────────
-- Milik + pinjaman (`jtr_tiang` — nama & koordinat sudah di view-nya).
CREATE OR REPLACE FUNCTION public._tiang_jtr_terdekat(p_ulp TEXT, p_gardu TEXT, p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION)
RETURNS TABLE (tiang_id UUID, kode TEXT, jarak_m DOUBLE PRECISION)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT j.id, j.kode, public.jarak_meter(p_lat, p_lng, j.lat::double precision, j.lng::double precision)
  FROM public.jtr_tiang j
  WHERE upper(j.gardu_kode) = upper(p_gardu) AND upper(j.ulp) = upper(p_ulp)
    AND j.status_hidup = 'aktif' AND j.lat IS NOT NULL AND j.lng IS NOT NULL
  ORDER BY 3
  LIMIT 1
$$;


-- ── 4. kirim_tegangan_ujung — salinan tegangan-ujung-berbeban.sql, ★ = baru ─

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
  dekat   RECORD;
  batas   INT;
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

  -- ★ Batas jarak titik ukur dari tiang JTR gardu ini, per ULP (bawaan 100 m).
  batas := COALESCE((SELECT a.jarak_maks_m FROM public.aturan_tegangan_ujung a WHERE upper(a.ulp) = upper(m.petugas_unit)), 100);
  -- ★ Rekomendasi = ujung JTR terjauh gardu ini, jurusan apa pun (huruf
  -- jurusan JTR tidak selalu sama dengan jurusan pengukuran).
  SELECT * INTO uj FROM public.jtr_ujung_terjauh(m.petugas_unit, m.no_gardu) x
  ORDER BY x.panjang_jaringan_m DESC NULLS LAST LIMIT 1;

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

    -- ★ Tiang JTR gardu ini yang terdekat dari titik ukur — regu bebas memilih
    -- tiangnya, asal di bawah tiang JTR gardu ini.
    SELECT * INTO dekat FROM public._tiang_jtr_terdekat(m.petugas_unit, m.no_gardu, v_lat, v_lng);
    IF dekat.tiang_id IS NOT NULL AND dekat.jarak_m > batas THEN
      RAISE EXCEPTION 'Titik ukur jurusan % berjarak % m dari tiang JTR gardu % yang terdekat (%), batasnya % m. Ukur di bawah salah satu tiang JTR gardu ini, lalu simpan ulang.',
        v_jur, round(dekat.jarak_m), m.no_gardu, dekat.kode, batas;
    END IF;

    INSERT INTO public.pengukuran_tegangan_ujung (
      id, pengukuran_id, gardu_kode, ulp, jurusan, v_rn, v_sn, v_tn, lat, lng, akurasi_m, foto_url,
      tiang_rekomendasi_id, jarak_rekomendasi_m, panjang_jaringan_m, tiang_terdekat_id, jarak_tiang_terdekat_m,
      tgl_ukur, jam_ukur, petugas_nama, petugas_uid, status, alasan, diubah_oleh
    ) VALUES (
      v_id, v_pid, upper(m.no_gardu), upper(m.petugas_unit), v_jur,
      (r->>'v_rn')::numeric, (r->>'v_sn')::numeric, (r->>'v_tn')::numeric,
      v_lat, v_lng, NULLIF(r->>'akurasi', '')::numeric, r->>'foto_url',
      uj.tiang_id,
      CASE WHEN uj.tiang_id IS NOT NULL THEN round(public.jarak_meter(v_lat, v_lng, uj.lat, uj.lng)::numeric, 1) END,
      uj.panjang_jaringan_m, dekat.tiang_id, round(dekat.jarak_m::numeric, 1),
      v_tgl, NULLIF(r->>'jam_ukur', '')::time, v_nama, auth.uid(), 'Terkirim', NULL, v_nama
    )
    ON CONFLICT (id) DO UPDATE SET
      jurusan = EXCLUDED.jurusan, v_rn = EXCLUDED.v_rn, v_sn = EXCLUDED.v_sn, v_tn = EXCLUDED.v_tn,
      lat = EXCLUDED.lat, lng = EXCLUDED.lng, akurasi_m = EXCLUDED.akurasi_m, foto_url = EXCLUDED.foto_url,
      tiang_rekomendasi_id = EXCLUDED.tiang_rekomendasi_id, jarak_rekomendasi_m = EXCLUDED.jarak_rekomendasi_m,
      panjang_jaringan_m = EXCLUDED.panjang_jaringan_m,
      tiang_terdekat_id = EXCLUDED.tiang_terdekat_id, jarak_tiang_terdekat_m = EXCLUDED.jarak_tiang_terdekat_m,
      tgl_ukur = EXCLUDED.tgl_ukur, jam_ukur = EXCLUDED.jam_ukur,
      petugas_nama = COALESCE(EXCLUDED.petugas_nama, public.pengukuran_tegangan_ujung.petugas_nama),
      petugas_uid = EXCLUDED.petugas_uid,
      status = 'Terkirim', alasan = NULL, diubah_oleh = EXCLUDED.diubah_oleh, updated_at = now();
    n := n + 1;
  END LOOP;

  IF n = 0 THEN RAISE EXCEPTION 'Tidak ada titik tegangan ujung yang dikirim.'; END IF;

  -- ★ Aturan "jurusan wajib (ujung terjauh)" DILEPAS (keputusan user 5 Okt 2026):
  -- ujung terjauh tinggal rekomendasi; semua tiang JTR gardu boleh dipakai.

  RETURN jsonb_build_object('pengukuran_id', v_pid, 'titik', n, 'tiang_rekomendasi', uj.tiang_kode);
END $$;
GRANT EXECUTE ON FUNCTION public.kirim_tegangan_ujung(JSONB) TO authenticated;


-- ── 5. View tab web — salinan tegangan-ujung-persetujuan.sql + kolom ★ ─────

CREATE OR REPLACE VIEW public.tegangan_ujung_daftar
WITH (security_invoker = true) AS
SELECT
  u.id, u.pengukuran_id, u.gardu_kode, u.ulp, u.jurusan,
  u.v_rn, u.v_sn, u.v_tn, least(u.v_rn, u.v_sn, u.v_tn) AS v_min,
  least(u.v_rn, u.v_sn, u.v_tn) < 198 AS di_bawah_standar,
  u.lat, u.lng, u.akurasi_m, u.foto_url, u.tgl_ukur, u.jam_ukur, u.petugas_nama,
  u.status, u.alasan, u.verified_at, u.verified_by, u.created_at,
  CASE WHEN u.status = 'Terkirim' AND u.verified_at IS NOT NULL THEN 'Disetujui'
       WHEN u.status = 'Terkirim' THEN 'Menunggu verifikasi' ELSE u.status END AS status_tampil,
  g.nama AS gardu_nama, g.feeder AS penyulang,
  g.lat::double precision AS gardu_lat, g.lng::double precision AS gardu_lng,
  CASE WHEN g.lat IS NOT NULL AND g.lng IS NOT NULL
       THEN round(public.jarak_meter(u.lat, u.lng, g.lat::double precision, g.lng::double precision)::numeric, 0) END AS jarak_gardu_m,
  u.tiang_rekomendasi_id, t.kode AS tiang_rekomendasi_kode,
  t.lat::double precision AS tiang_lat, t.lng::double precision AS tiang_lng,
  u.jarak_rekomendasi_m, u.panjang_jaringan_m,
  p.tanggal_pengukuran AS tgl_beban, p.amg_sent_at, p.amg_queued_at,
  -- ★ tiang JTR terdekat dari titik ukur (rencana tegangan-ujung-jarak.sql)
  u.tiang_terdekat_id, td.kode AS tiang_terdekat_kode, u.jarak_tiang_terdekat_m
FROM public.pengukuran_tegangan_ujung u
LEFT JOIN public.gardu g ON upper(g.kode) = upper(u.gardu_kode) AND upper(g.ulp) = upper(u.ulp)
LEFT JOIN public.tiang t ON t.id = u.tiang_rekomendasi_id
LEFT JOIN public.pengukuran_gardu p ON p.id = u.pengukuran_id
LEFT JOIN public.tiang td ON td.id = u.tiang_terdekat_id;
GRANT SELECT ON public.tegangan_ujung_daftar TO authenticated;


-- ── 6. Buang yang dikembalikan = batal di server (HP, regu ULP-nya) ──────────
-- Dipanggil HP saat regu membuang draf hasil "Dikembalikan" — tanpa ini draf
-- ditarik lagi dari server tiap daftar dimuat dan "muncul kembali".

-- Pemeriksa sesi HP: akun dikenal, dan ULP-nya sama (UP3 semua ULP).
CREATE OR REPLACE FUNCTION public._wajib_akun_ulp(p_ulp TEXT)
RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role TEXT;
  v_unit TEXT;
BEGIN
  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi, kemudian coba lagi.';
  END IF;
  IF v_role <> 'UP3' AND upper(COALESCE(v_unit, '')) <> upper(COALESCE(p_ulp, '')) THEN
    RAISE EXCEPTION 'Akun ini untuk ULP %, bukan %.', COALESCE(v_unit, '-'), p_ulp;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.buang_tegangan_ujung_dikembalikan(p_id UUID, p_nama TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  x RECORD;
BEGIN
  SELECT * INTO x FROM public.pengukuran_tegangan_ujung WHERE id = p_id FOR UPDATE;
  -- Sudah tidak ada / sudah dibatalkan: draf di HP cukup dibuang.
  IF NOT FOUND THEN RETURN 'tidak_ada'; END IF;
  PERFORM public._wajib_akun_ulp(x.ulp);
  IF x.status = 'Dibatalkan' THEN RETURN 'sudah_batal'; END IF;
  IF x.status <> 'Dikembalikan' THEN
    RAISE EXCEPTION 'Tegangan ujung % jurusan % sudah terkirim ulang — tidak bisa dibuang dari HP. Minta admin membatalkannya bila salah.', x.gardu_kode, x.jurusan;
  END IF;
  UPDATE public.pengukuran_tegangan_ujung
  SET status = 'Dibatalkan',
      alasan = 'Dibuang petugas' || COALESCE(' (dikembalikan: ' || x.alasan || ')', ''),
      diubah_oleh = p_nama, updated_at = now()
  WHERE id = p_id;
  RETURN 'dibatalkan';
END $$;
GRANT EXECUTE ON FUNCTION public.buang_tegangan_ujung_dikembalikan(UUID, TEXT) TO authenticated;

-- Beban yang dikembalikan & dibuang regu: dihapus, sama dengan Batal di web
-- (tegangan ujung pasangannya ikut terhapus lewat ON DELETE CASCADE).
CREATE OR REPLACE FUNCTION public.buang_pengukuran_dikembalikan(p_id TEXT, p_nama TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m RECORD;
BEGIN
  SELECT * INTO m FROM public.pengukuran_gardu WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'tidak_ada'; END IF;
  PERFORM public._wajib_akun_ulp(m.petugas_unit);
  IF m.dikembalikan_at IS NULL THEN
    RAISE EXCEPTION 'Pengukuran % sudah terkirim ulang — tidak bisa dibuang dari HP. Minta admin membatalkannya bila salah.', m.no_gardu;
  END IF;
  IF m.amg_sent_at IS NOT NULL OR m.amg_queued_at IS NOT NULL THEN
    RAISE EXCEPTION 'Pengukuran % sudah masuk antrean/terkirim ke AMG — tidak bisa dibuang.', m.no_gardu;
  END IF;
  DELETE FROM public.pengukuran_gardu WHERE id = p_id;
  RETURN 'dihapus';
END $$;
GRANT EXECUTE ON FUNCTION public.buang_pengukuran_dikembalikan(TEXT, TEXT) TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT ulp, berlaku_mulai, jarak_maks_m FROM aturan_tegangan_ujung;
--   SELECT * FROM _tiang_jtr_terdekat('AMPENAN', 'AM136', -8.58, 116.09);
