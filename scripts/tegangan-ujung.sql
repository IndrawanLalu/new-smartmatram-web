-- =============================================================================
-- T1 `rencana-tegangan-ujung.md` (27 Sep 2026) — Pengukuran Tegangan Ujung
-- Jalankan manual di Supabase SQL Editor, SESUDAH `jtr-tiang-bersama.sql` dan
-- `pengukuran-kirim-kembalikan.sql`. Idempoten.
--
--   1. aturan_tegangan_ujung        — "berlaku mulai bulan …" per ULP. KOSONG =
--                                     semuanya seperti semula (keputusan user:
--                                     aturan baru diterapkan bulan depan)
--   2. pengukuran_tegangan_ujung    — satu baris = satu titik ukur di ujung JTR:
--                                     R-N/S-N/T-N, titik WAJIB, foto WAJIB,
--                                     tiang rekomendasi & jarak ke sana
--   3. jtr_ujung_terjauh(ulp,gardu) — per jurusan: ujung dengan PANJANG
--                                     JARINGAN terpanjang dari gardu (u8)
--   4. kirim_tegangan_ujung(p_isi)  — kiriman HP, satu transaksi, idempoten
--   5. kembalikan_ / batalkan_tegangan_ujung — tombol web
--   6. wo_pengukuran_realisasi      — beban + tegangan ujung, HANYA untuk bulan
--                                     sejak aturan berlaku (u5)
--   7. alasan_tahan_amg(id)         — gerbang tombol "Kirim ke AMG" (u6)
--
-- Kenapa TANGGAL, bukan saklar: realisasi WO diturunkan dari view, tidak
-- disimpan. Saklar yang dinyalakan bulan depan akan menghitung ulang bulan-bulan
-- lalu dengan aturan baru. Tanggal berlaku membiarkan yang sudah lewat apa adanya.
-- =============================================================================


-- ── 1. Aturan berlaku mulai ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.aturan_tegangan_ujung (
  ulp           TEXT PRIMARY KEY,
  berlaku_mulai DATE,           -- tanggal 1 sebuah bulan; NULL = belum berlaku
  diubah_oleh   TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.aturan_tegangan_ujung IS
  'Sejak bulan berapa aturan tegangan ujung berlaku per ULP: realisasi WO Pengukuran butuh beban + tegangan ujung, "Kirim ke AMG" menunggu tegangan ujung, formulir beban tanpa isian tegangan ujung.';
ALTER TABLE public.aturan_tegangan_ujung ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aturan_tegangan_ujung_baca ON public.aturan_tegangan_ujung;
CREATE POLICY aturan_tegangan_ujung_baca ON public.aturan_tegangan_ujung FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.aturan_tegangan_ujung TO authenticated;

/** Berlaku untuk ULP itu pada bulan tanggal itu? */
CREATE OR REPLACE FUNCTION public.tegangan_ujung_berlaku(p_ulp TEXT, p_tgl DATE)
RETURNS BOOLEAN
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.aturan_tegangan_ujung a
    WHERE a.ulp = upper(btrim(COALESCE(p_ulp, '')))
      AND a.berlaku_mulai IS NOT NULL
      AND a.berlaku_mulai <= date_trunc('month', p_tgl)::date
  );
$$;
GRANT EXECUTE ON FUNCTION public.tegangan_ujung_berlaku(TEXT, DATE) TO authenticated;

/** Atur "berlaku mulai". Bulan yang sudah lewat tidak boleh dipilih — itu
 *  mengubah realisasi bulan yang sudah dilaporkan. */
CREATE OR REPLACE FUNCTION public.atur_tegangan_ujung(p_ulp TEXT, p_berlaku_mulai DATE, p_oleh TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  u      TEXT := upper(btrim(COALESCE(p_ulp, '')));
  awal   DATE := date_trunc('month', p_berlaku_mulai)::date;
  kini   DATE := date_trunc('month', (now() AT TIME ZONE 'Asia/Makassar'))::date;
  lama   DATE;
BEGIN
  IF u = '' THEN RAISE EXCEPTION 'ULP belum dipilih'; END IF;
  PERFORM public.wajib_boleh_ulp(u);
  IF awal IS NOT NULL AND awal < kini THEN
    RAISE EXCEPTION 'Bulan % sudah lewat — pilih bulan ini atau sesudahnya.', to_char(awal, 'MM-YYYY');
  END IF;

  SELECT berlaku_mulai INTO lama FROM public.aturan_tegangan_ujung WHERE ulp = u;
  IF lama IS NOT NULL AND lama < kini THEN
    RAISE EXCEPTION 'Aturan ULP % sudah berlaku sejak % — bulan yang sudah lewat tidak diubah dari sini.', u, to_char(lama, 'MM-YYYY');
  END IF;

  INSERT INTO public.aturan_tegangan_ujung (ulp, berlaku_mulai, diubah_oleh, updated_at)
  VALUES (u, awal, p_oleh, now())
  ON CONFLICT (ulp) DO UPDATE SET berlaku_mulai = EXCLUDED.berlaku_mulai, diubah_oleh = EXCLUDED.diubah_oleh, updated_at = now();

  INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('aturan_tegangan_ujung', u, u, 'berlaku_mulai', to_jsonb(lama), to_jsonb(awal), 'sunting_admin', auth.uid(), p_oleh);
END $$;
GRANT EXECUTE ON FUNCTION public.atur_tegangan_ujung(TEXT, DATE, TEXT) TO authenticated;


-- ── 2. Tabel pengukuran tegangan ujung ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pengukuran_tegangan_ujung (
  id                   UUID PRIMARY KEY,                 -- dari HP: kirim ulang idempoten
  pengukuran_id        TEXT NOT NULL REFERENCES public.pengukuran_gardu(id) ON DELETE CASCADE,
  gardu_kode           TEXT NOT NULL,
  ulp                  TEXT NOT NULL,
  jurusan              TEXT NOT NULL,
  v_rn                 NUMERIC NOT NULL,
  v_sn                 NUMERIC NOT NULL,
  v_tn                 NUMERIC NOT NULL,
  lat                  DOUBLE PRECISION NOT NULL,
  lng                  DOUBLE PRECISION NOT NULL,
  akurasi_m            NUMERIC,
  foto_url             TEXT NOT NULL,
  -- Ujung JTR terjauh jurusan itu SAAT dikirim & jarak titik ukur darinya:
  -- admin melihat "diukur 12 m dari ujung" vs "400 m sebelum ujung".
  tiang_rekomendasi_id UUID REFERENCES public.tiang(id) ON DELETE SET NULL,
  jarak_rekomendasi_m  NUMERIC,
  panjang_jaringan_m   NUMERIC,
  tgl_ukur             DATE NOT NULL,
  jam_ukur             TIME,
  petugas_nama         TEXT,
  petugas_uid          UUID,
  status               TEXT NOT NULL DEFAULT 'Terkirim',
  alasan               TEXT,                             -- dikembalikan / dibatalkan
  diubah_oleh          TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pengukuran_tegangan_ujung DROP CONSTRAINT IF EXISTS ptu_status_valid;
ALTER TABLE public.pengukuran_tegangan_ujung ADD CONSTRAINT ptu_status_valid
  CHECK (status IN ('Terkirim', 'Dikembalikan', 'Dibatalkan'));
ALTER TABLE public.pengukuran_tegangan_ujung DROP CONSTRAINT IF EXISTS ptu_jurusan_valid;
ALTER TABLE public.pengukuran_tegangan_ujung ADD CONSTRAINT ptu_jurusan_valid
  CHECK (jurusan IN ('A', 'B', 'C', 'D', 'K'));
-- Satu jurusan satu titik per pengukuran beban (yang dibatalkan tidak dihitung).
CREATE UNIQUE INDEX IF NOT EXISTS ptu_satu_per_jurusan
  ON public.pengukuran_tegangan_ujung (pengukuran_id, jurusan) WHERE status <> 'Dibatalkan';
CREATE INDEX IF NOT EXISTS ptu_gardu_idx ON public.pengukuran_tegangan_ujung (upper(gardu_kode), upper(ulp));

COMMENT ON TABLE public.pengukuran_tegangan_ujung IS
  'Tegangan ujung JTR (R-N/S-N/T-N) diukur DI LAPANGAN: titik & foto wajib, dipasangkan ke satu pengukuran beban. Menggantikan isian tegangan ujung per jurusan di formulir beban (perjurusan->tegangan), yang tetap tersimpan sebagai sejarah tanpa titik.';

ALTER TABLE public.pengukuran_tegangan_ujung ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ptu_baca ON public.pengukuran_tegangan_ujung;
CREATE POLICY ptu_baca ON public.pengukuran_tegangan_ujung FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.pengukuran_tegangan_ujung TO authenticated;
-- Penulisan HANYA lewat fungsi di bawah.


-- ── 3. Ujung JTR terjauh per jurusan ─────────────────────────────────────────
-- Menyusuri pohon JTR dari pangkal (`tiang_gawang`: milik + pinjaman, bentang
-- ke induk atau ke gardu), menjumlahkan bentang. Titik dengan jumlah terbesar
-- selalu sebuah ujung. Fungsi, bukan view: saringan ULP masuk ke titik awal
-- penyusuran, jadi yang dihitung hanya pohon ULP yang ditanya.
CREATE OR REPLACE FUNCTION public.jtr_ujung_terjauh(p_ulp TEXT, p_gardu TEXT DEFAULT NULL)
RETURNS TABLE (
  gardu_kode TEXT, ulp TEXT, jurusan TEXT, tiang_id UUID, tiang_kode TEXT,
  panjang_jaringan_m NUMERIC, lat DOUBLE PRECISION, lng DOUBLE PRECISION
)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH RECURSIVE jalur AS (
    SELECT upper(g.gardu_kode) AS gardu, upper(g.ulp) AS u, g.jurusan AS jur,
           g.tiang_id AS id, g.kode, COALESCE(g.panjang_m, 0) AS m, ARRAY[g.tiang_id] AS lewat
    FROM public.tiang_gawang g
    WHERE g.pangkal
      AND upper(g.ulp) = upper(btrim(p_ulp))
      AND (p_gardu IS NULL OR upper(g.gardu_kode) = upper(btrim(p_gardu)))
    UNION ALL
    SELECT j.gardu, j.u, j.jur, c.tiang_id, c.kode, j.m + COALESCE(c.panjang_m, 0), j.lewat || c.tiang_id
    FROM jalur j
    JOIN public.tiang_gawang c
      ON c.induk_id = j.id AND upper(c.gardu_kode) = j.gardu AND upper(c.ulp) = j.u
    WHERE NOT c.tiang_id = ANY (j.lewat) AND cardinality(j.lewat) < 5000
  )
  SELECT DISTINCT ON (j.gardu, j.u, j.jur)
    j.gardu, j.u, j.jur, j.id, j.kode, round(j.m::numeric, 1), t.lat::double precision, t.lng::double precision
  FROM jalur j
  JOIN public.tiang t ON t.id = j.id
  WHERE j.jur IS NOT NULL
  ORDER BY j.gardu, j.u, j.jur, j.m DESC;
$$;
GRANT EXECUTE ON FUNCTION public.jtr_ujung_terjauh(TEXT, TEXT) TO authenticated;


-- ── 4. Kiriman HP ────────────────────────────────────────────────────────────
-- p_isi: { "pengukuran_id", "nama",
--          "titik": [ { "id", "jurusan", "v_rn", "v_sn", "v_tn", "lat", "lng",
--                       "akurasi", "foto_url", "tgl_ukur", "jam_ukur" } ] }
--
-- Tiang rekomendasi & jaraknya dihitung DI SINI, bukan dipercaya dari HP.
-- Kewajiban (u3): bila gardu punya data JTR, jurusan dengan ujung terjauh harus
-- punya titik (boleh dari kiriman sebelumnya); tanpa data JTR, jurusan mana pun sah.
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

  -- Kewajiban jurusan terjauh (u3).
  SELECT x.jurusan INTO wajib FROM public.jtr_ujung_terjauh(m.petugas_unit, m.no_gardu) x
  ORDER BY x.panjang_jaringan_m DESC LIMIT 1;
  IF wajib IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.pengukuran_tegangan_ujung x
       WHERE x.pengukuran_id = v_pid AND x.jurusan = wajib AND x.status = 'Terkirim') THEN
    RAISE EXCEPTION 'Jurusan % gardu % punya ujung JTR terjauh — tegangan ujungnya wajib diukur di sana.', wajib, m.no_gardu;
  END IF;

  RETURN jsonb_build_object('pengukuran_id', v_pid, 'titik', n, 'jurusan_wajib', wajib);
END $$;
GRANT EXECUTE ON FUNCTION public.kirim_tegangan_ujung(JSONB) TO authenticated;


-- ── 5. Kembalikan / batalkan (web) ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kembalikan_tegangan_ujung(p_id UUID, p_alasan TEXT, p_nama TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  x RECORD;
  m RECORD;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan wajib diisi — petugas harus tahu apa yang diperbaiki.';
  END IF;
  SELECT * INTO x FROM public.pengukuran_tegangan_ujung WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tegangan ujung tidak ditemukan.'; END IF;
  PERFORM public.wajib_boleh_ulp(x.ulp);
  IF x.status <> 'Terkirim' THEN RAISE EXCEPTION 'Tegangan ujung ini sudah %.', lower(x.status); END IF;
  SELECT amg_queued_at, amg_sent_at INTO m FROM public.pengukuran_gardu WHERE id = x.pengukuran_id;
  IF m.amg_sent_at IS NOT NULL OR m.amg_queued_at IS NOT NULL THEN
    RAISE EXCEPTION 'Pengukuran gardu % sudah masuk antrean/terkirim ke AMG — tegangan ujungnya tidak bisa dikembalikan.', x.gardu_kode;
  END IF;
  UPDATE public.pengukuran_tegangan_ujung
  SET status = 'Dikembalikan', alasan = btrim(p_alasan), diubah_oleh = p_nama, updated_at = now()
  WHERE id = p_id;
END $$;

CREATE OR REPLACE FUNCTION public.batalkan_tegangan_ujung(p_id UUID, p_alasan TEXT, p_nama TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  x RECORD;
  m RECORD;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan pembatalan wajib diisi.'; END IF;
  SELECT * INTO x FROM public.pengukuran_tegangan_ujung WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tegangan ujung tidak ditemukan.'; END IF;
  PERFORM public.wajib_boleh_ulp(x.ulp);
  IF x.status = 'Dibatalkan' THEN RAISE EXCEPTION 'Tegangan ujung ini sudah dibatalkan.'; END IF;
  SELECT amg_queued_at, amg_sent_at INTO m FROM public.pengukuran_gardu WHERE id = x.pengukuran_id;
  IF m.amg_sent_at IS NOT NULL OR m.amg_queued_at IS NOT NULL THEN
    RAISE EXCEPTION 'Pengukuran gardu % sudah masuk antrean/terkirim ke AMG — tegangan ujungnya tidak bisa dibatalkan.', x.gardu_kode;
  END IF;
  UPDATE public.pengukuran_tegangan_ujung
  SET status = 'Dibatalkan', alasan = btrim(p_alasan), diubah_oleh = p_nama, updated_at = now()
  WHERE id = p_id;
END $$;
GRANT EXECUTE ON FUNCTION public.kembalikan_tegangan_ujung(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batalkan_tegangan_ujung(UUID, TEXT, TEXT) TO authenticated;


-- ── 6. Realisasi WO Pengukuran ───────────────────────────────────────────────
-- Definisi TERPASANG (dibaca lewat `_definisi` 27 Sep 2026) + tiga kolom di
-- ujung. `terealisasi` baru menuntut tegangan ujung pada bulan WO sejak aturan
-- ULP itu berlaku; bulan sebelumnya tetap dihitung seperti semula.
CREATE OR REPLACE VIEW public.wo_pengukuran_realisasi AS
SELECT i.id,
    i.wo_id,
    i.kode_gardu,
    i.ulp,
    i.nama,
    i.alamat,
    i.penyulang,
    i.kva_master,
    i.lat,
    i.lng,
    i.alasan,
    i.tgl_ukur_terakhir,
    i.umur_bulan,
    i.urutan,
    w.bulan,
    w.tahun,
    w.tgl_wo,
    p.id AS pengukuran_id,
    p.tanggal_pengukuran AS tgl_realisasi,
    p.petugas_nama,
    p.persen_beban,
    p.beban_kva,
    p.kva_trafo AS kva_pengukuran,
    p.id IS NOT NULL AND t.pengukuran_id IS NULL AND (NOT a.berlaku OR u.ada) AS terealisasi,
    t.pengukuran_id IS NOT NULL AS tertahan,
    COALESCE(t.titik_diperbarui, false) AS tertahan_titik,
    COALESCE(t.beda_kva, false) AS tertahan_kva,
    a.berlaku AS wajib_tegangan_ujung,
    COALESCE(u.ada, false) AS tegangan_ujung_ada,
    p.id IS NOT NULL AND t.pengukuran_id IS NULL AND a.berlaku AND NOT COALESCE(u.ada, false) AS menunggu_tegangan_ujung
   FROM wo_pengukuran_item i
     JOIN wo_pengukuran w ON w.id = i.wo_id
     CROSS JOIN LATERAL (SELECT public.tegangan_ujung_berlaku(i.ulp, w.tgl_wo::date) AS berlaku) a
     LEFT JOIN LATERAL ( SELECT pg.id,
            pg.tanggal_pengukuran,
            pg.petugas_nama,
            pg.persen_beban,
            pg.beban_kva,
            pg.kva_trafo
           FROM pengukuran_gardu pg
          WHERE upper(pg.no_gardu) = upper(i.kode_gardu) AND upper(pg.petugas_unit) = upper(i.ulp) AND pg.tanggal_pengukuran >= to_char(w.tgl_wo::timestamp with time zone, 'YYYY-MM-DD'::text) AND pg.tanggal_pengukuran < to_char(w.tgl_wo + '1 mon'::interval, 'YYYY-MM-DD'::text) AND pg.hasil_penyeimbangan_id IS NULL AND pg.dikembalikan_at IS NULL
          ORDER BY pg.tanggal_pengukuran
         LIMIT 1) p ON true
     LEFT JOIN LATERAL (SELECT EXISTS (
            SELECT 1 FROM public.pengukuran_tegangan_ujung x
            WHERE x.pengukuran_id = p.id AND x.status = 'Terkirim') AS ada) u ON true
     LEFT JOIN pengukuran_tertahan t ON t.pengukuran_id = p.id;


-- ── 7. Gerbang AMG ───────────────────────────────────────────────────────────
-- NULL = boleh dikirim ke AMG; teks = sebabnya ditahan. Sejak aturan berlaku,
-- pengukuran tanpa tegangan ujung terkirim ditahan (u6).
CREATE OR REPLACE FUNCTION public.alasan_tahan_amg(p_id TEXT)
RETURNS TEXT
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN m.id IS NULL THEN 'Pengukuran tidak ditemukan.'
    WHEN public.tegangan_ujung_berlaku(m.petugas_unit, m.tanggal_pengukuran::date)
         AND NOT EXISTS (SELECT 1 FROM public.pengukuran_tegangan_ujung x
                         WHERE x.pengukuran_id = m.id AND x.status = 'Terkirim')
      THEN 'Tegangan ujung gardu ini belum dikirim petugas — AMG menunggu tegangan ujung.'
  END
  FROM (SELECT 1) s
  LEFT JOIN public.pengukuran_gardu m ON m.id = p_id;
$$;
GRANT EXECUTE ON FUNCTION public.alasan_tahan_amg(TEXT) TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT * FROM aturan_tegangan_ujung;                         -- kosong = seperti semula
--   SELECT count(*) FILTER (WHERE terealisasi) FROM wo_pengukuran_realisasi;  -- sama dengan sebelum skrip
--   SELECT * FROM jtr_ujung_terjauh('TANJUNG');                  -- AI001 jurusan D
