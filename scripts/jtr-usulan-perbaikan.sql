-- =============================================================================
-- Usulan Perbaikan JTR (P2–P4, 20 Okt 2026) — lanjutan Analisis JTR.
-- Jalankan manual di Supabase SQL Editor. Idempoten (aman diulang).
--
-- Alur: rencana di Analisis JTR → SIMPAN USULAN (angka dibekukan + material)
-- → JADIKAN WO lewat jalur WO yang SUDAH ADA:
--   · tambah jurusan / ganti kabel → tugas HARJAR JTR (buat_tugas_harjar),
--     termasuk pekerjaan PHB-TR (keputusan user 20 Okt)
--   · pemerataan  → WO Pemerataan (pengukuran terakhir gardu, PEMERATAAN BEBAN)
--   · naik daya   → WO Optimasi Trafo (pengukuran terakhir gardu, OPTIMASI TRAFO)
--   · sisip gardu → TIDAK di-WO-kan; tetap usulan untuk perencanaan (Excel)
-- Tahap Dikerjakan/Selesai DITURUNKAN dari tugas/catatan asalnya (view), tidak
-- pernah diisi dua kali.
-- =============================================================================


-- ── 1. Daftar material bawaan per pekerjaan (diatur UP3) ────────────────────
-- jumlah = pembulatan ke atas (faktor × dasar):
--   tetap   → faktor saja
--   kabel_m → panjang kabel baru / kabel yang diganti (m)
--   tiang   → jumlah tiang yang dilalui kabel baru
--   sr      → perkiraan tarikan SR yang dipindah fasa
-- "{kabel}" di nama diganti ukuran kabel jurusan itu.
CREATE TABLE IF NOT EXISTS public.jtr_material_ref (
  id        SERIAL PRIMARY KEY,
  pekerjaan TEXT NOT NULL CHECK (pekerjaan IN ('tambah-jurusan', 'ganti-kabel', 'pemerataan')),
  nama      TEXT NOT NULL,
  satuan    TEXT NOT NULL,
  dasar     TEXT NOT NULL CHECK (dasar IN ('tetap', 'kabel_m', 'tiang', 'sr')),
  faktor    NUMERIC NOT NULL DEFAULT 1 CHECK (faktor >= 0),
  urutan    INT NOT NULL DEFAULT 0
);
COMMENT ON TABLE public.jtr_material_ref IS
  'Perkiraan material usulan perbaikan JTR. Bawaan, disunting UP3; user tetap memeriksa jumlahnya sebelum WO terbit.';

INSERT INTO public.jtr_material_ref (pekerjaan, nama, satuan, dasar, faktor, urutan)
SELECT * FROM (VALUES
  ('tambah-jurusan', 'Kabel {kabel}',                    'm',   'kabel_m', 1.05, 1),
  ('tambah-jurusan', 'Suspension clamp (penggantung)',   'bh',  'tiang',   1,    2),
  ('tambah-jurusan', 'Strain clamp (dead end)',          'bh',  'tetap',   2,    3),
  ('tambah-jurusan', 'Konektor press / piercing',        'bh',  'tetap',   4,    4),
  ('tambah-jurusan', 'Sepatu kabel (skun)',              'bh',  'tetap',   4,    5),
  ('tambah-jurusan', 'NH fuse + dudukan (PHB-TR)',       'set', 'tetap',   3,    6),
  ('ganti-kabel',    'Kabel pengganti (ukuran lebih besar)', 'm',   'kabel_m', 1.05, 1),
  ('ganti-kabel',    'Suspension clamp (penggantung)',   'bh',  'tiang',   1,    2),
  ('ganti-kabel',    'Konektor press / piercing',        'bh',  'tetap',   8,    3),
  ('pemerataan',     'Konektor piercing SR',             'bh',  'sr',      1,    1)
) v(pekerjaan, nama, satuan, dasar, faktor, urutan)
WHERE NOT EXISTS (SELECT 1 FROM public.jtr_material_ref);

ALTER TABLE public.jtr_material_ref ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jtr_material_ref_baca ON public.jtr_material_ref;
CREATE POLICY jtr_material_ref_baca ON public.jtr_material_ref FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS jtr_material_ref_ubah ON public.jtr_material_ref;
CREATE POLICY jtr_material_ref_ubah ON public.jtr_material_ref FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'UP3'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'UP3'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jtr_material_ref TO authenticated;
GRANT USAGE ON SEQUENCE public.jtr_material_ref_id_seq TO authenticated;


-- ── 2. Usulan ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.jtr_usulan_perbaikan (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ulp           TEXT NOT NULL,
  gardu_kode    TEXT NOT NULL,
  jurusan       TEXT NOT NULL,
  penyulang     TEXT,
  pekerjaan     TEXT NOT NULL CHECK (pekerjaan IN ('pemerataan', 'tambah-jurusan', 'ganti-kabel', 'sisip', 'naik-daya')),
  ringkas       TEXT NOT NULL,
  -- Dibekukan saat disimpan: pengukuran berikutnya mengubah analisis, usulan
  -- tetap menunjukkan dasar keputusannya.
  dasar         JSONB NOT NULL,          -- arus R/S/T, kVA, %, kabel, terjauh, SR, tgl ukur
  opsi          JSONB,                   -- titik pecah terpilih (tambah jurusan)
  titik_lat     DOUBLE PRECISION,        -- lokasi kerja (titik pecah / sisip)
  titik_lng     DOUBLE PRECISION,
  material      JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{nama, satuan, jumlah}]
  catatan       TEXT,
  status        TEXT NOT NULL DEFAULT 'Usulan' CHECK (status IN ('Usulan', 'Di-WO-kan', 'Batal')),
  regu          TEXT,
  wo_bulan      DATE,
  inspeksi_id   TEXT,                    -- tugas HARJAR
  pengukuran_id TEXT,                    -- WO pemerataan / optimasi
  dibuat_oleh   TEXT,
  dibuat_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  wo_oleh       TEXT,
  wo_at         TIMESTAMPTZ,
  batal_alasan  TEXT,
  batal_oleh    TEXT,
  batal_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS jtr_usulan_gardu_idx ON public.jtr_usulan_perbaikan (gardu_kode, jurusan);
CREATE INDEX IF NOT EXISTS jtr_usulan_ulp_idx ON public.jtr_usulan_perbaikan (ulp, status);

-- Baca bebas (saring ULP di aplikasi, seperti Analisis JTR); tulis HANYA lewat
-- fungsi di bawah, yang memeriksa hak ULP.
ALTER TABLE public.jtr_usulan_perbaikan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jtr_usulan_baca ON public.jtr_usulan_perbaikan;
CREATE POLICY jtr_usulan_baca ON public.jtr_usulan_perbaikan FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.jtr_usulan_perbaikan TO authenticated;


-- ── 3. Tahap — diturunkan dari tugas/catatan asal ───────────────────────────
CREATE OR REPLACE VIEW public.jtr_usulan_daftar
WITH (security_invoker = true) AS
SELECT
  u.*,
  CASE
    WHEN u.status = 'Batal'  THEN 'Batal'
    WHEN u.status = 'Usulan' THEN 'Usulan'
    WHEN u.inspeksi_id IS NOT NULL THEN
      CASE
        WHEN i.dibatalkan_at IS NOT NULL THEN 'WO dibatalkan'
        WHEN pj.id IS NOT NULL           THEN 'Selesai'
        WHEN i.status = 'Dalam Proses'   THEN 'Dikerjakan'
        ELSE 'Di-WO-kan'
      END
    WHEN u.pekerjaan = 'pemerataan' THEN
      CASE ps.status WHEN 'Selesai' THEN 'Selesai' WHEN 'Dikerjakan' THEN 'Dikerjakan' ELSE 'Di-WO-kan' END
    WHEN u.pekerjaan = 'naik-daya' THEN
      CASE WHEN ot.id IS NOT NULL THEN 'Selesai' ELSE 'Di-WO-kan' END
    ELSE 'Di-WO-kan'
  END AS tahap,
  COALESCE(pj.tgl::text, ps.tgl, ot.tgl) AS tgl_selesai
FROM public.jtr_usulan_perbaikan u
LEFT JOIN public.inspeksi i ON i.id::text = u.inspeksi_id
LEFT JOIN LATERAL (
  SELECT j.id, j.tgl FROM public.pemeliharaan_jaringan j
  WHERE j.inspeksi_id = i.id AND j.status <> 'Dibatalkan'
  ORDER BY j.created_at DESC LIMIT 1
) pj ON u.inspeksi_id IS NOT NULL
LEFT JOIN LATERAL (
  SELECT p.status, p.tgl_penyeimbangan::text AS tgl FROM public.penyeimbangan_gardu p
  WHERE p.pengukuran_id = u.pengukuran_id
  ORDER BY p.created_at DESC LIMIT 1
) ps ON u.pekerjaan = 'pemerataan' AND u.pengukuran_id IS NOT NULL
LEFT JOIN LATERAL (
  SELECT o.id, o.tgl_operasi::text AS tgl FROM public.optimasi_trafo o
  WHERE o.pengukuran_id = u.pengukuran_id AND o.status <> 'Dibatalkan'
  LIMIT 1
) ot ON u.pekerjaan = 'naik-daya' AND u.pengukuran_id IS NOT NULL;
GRANT SELECT ON public.jtr_usulan_daftar TO authenticated;


-- ── 4. Simpan usulan ────────────────────────────────────────────────────────
-- Satu gardu+jurusan hanya boleh punya satu usulan yang belum di-WO-kan.
CREATE OR REPLACE FUNCTION public.simpan_usulan_jtr(p JSONB, p_nama TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_ulp TEXT;
  v_gardu TEXT := upper(btrim(p->>'gardu_kode'));
  v_jur TEXT := upper(btrim(p->>'jurusan'));
  baru UUID;
BEGIN
  SELECT upper(g.ulp) INTO v_ulp FROM public.gardu g WHERE upper(g.kode) = v_gardu LIMIT 1;
  IF v_ulp IS NULL THEN RAISE EXCEPTION 'Gardu % tidak ada di master.', v_gardu; END IF;
  PERFORM public.wajib_boleh_ulp(v_ulp);
  IF EXISTS (
    SELECT 1 FROM public.jtr_usulan_perbaikan
    WHERE gardu_kode = v_gardu AND jurusan = v_jur AND status = 'Usulan'
  ) THEN
    RAISE EXCEPTION '% jurusan % sudah punya usulan yang belum di-WO-kan — buka di daftar Usulan.', v_gardu, v_jur;
  END IF;

  INSERT INTO public.jtr_usulan_perbaikan (
    ulp, gardu_kode, jurusan, penyulang, pekerjaan, ringkas, dasar, opsi,
    titik_lat, titik_lng, material, catatan, dibuat_oleh
  ) VALUES (
    v_ulp, v_gardu, v_jur, NULLIF(btrim(p->>'penyulang'), ''), p->>'pekerjaan', p->>'ringkas',
    COALESCE(p->'dasar', '{}'::jsonb), p->'opsi',
    (p->>'titik_lat')::double precision, (p->>'titik_lng')::double precision,
    COALESCE(p->'material', '[]'::jsonb), NULLIF(btrim(COALESCE(p->>'catatan', '')), ''), p_nama
  )
  RETURNING id INTO baru;
  RETURN baru;
END $fn$;
GRANT EXECUTE ON FUNCTION public.simpan_usulan_jtr(JSONB, TEXT) TO authenticated;


-- ── 5. Ubah material/catatan selama masih usulan ────────────────────────────
CREATE OR REPLACE FUNCTION public.ubah_usulan_jtr(p_id UUID, p_material JSONB, p_catatan TEXT, p_nama TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE u public.jtr_usulan_perbaikan;
BEGIN
  SELECT * INTO u FROM public.jtr_usulan_perbaikan WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usulan tidak ditemukan.'; END IF;
  PERFORM public.wajib_boleh_ulp(u.ulp);
  IF u.status <> 'Usulan' THEN RAISE EXCEPTION 'Usulan sudah %, tidak bisa diubah.', u.status; END IF;
  UPDATE public.jtr_usulan_perbaikan
     SET material = COALESCE(p_material, '[]'::jsonb), catatan = NULLIF(btrim(COALESCE(p_catatan, '')), '')
   WHERE id = p_id;
END $fn$;
GRANT EXECUTE ON FUNCTION public.ubah_usulan_jtr(UUID, JSONB, TEXT, TEXT) TO authenticated;


-- ── 6. Jadikan WO ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.jadikan_wo_usulan_jtr(
  p_id       UUID,
  p_material JSONB,
  p_catatan  TEXT,
  p_bulan    DATE,
  p_nama     TEXT
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  u        public.jtr_usulan_perbaikan;
  v_mat    TEXT;
  v_cat    TEXT := NULLIF(btrim(COALESCE(p_catatan, '')), '');
  v_tugas  TEXT;
  v_jenis  TEXT;
  pg       RECORD;
BEGIN
  SELECT * INTO u FROM public.jtr_usulan_perbaikan WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usulan tidak ditemukan.'; END IF;
  PERFORM public.wajib_boleh_ulp(u.ulp);
  IF u.status <> 'Usulan' THEN RAISE EXCEPTION 'Usulan sudah %.', u.status; END IF;
  IF u.pekerjaan = 'sisip' THEN
    RAISE EXCEPTION 'Sisip gardu tidak di-WO-kan ke regu — tetap sebagai usulan perencanaan.';
  END IF;

  -- Material ikut tertulis di catatan tugas, supaya terbaca di HP tanpa
  -- perubahan aplikasi.
  SELECT string_agg(format('%s %s %s', x->>'nama', x->>'jumlah', x->>'satuan'), '; ')
    INTO v_mat FROM jsonb_array_elements(COALESCE(p_material, '[]'::jsonb)) x
   WHERE COALESCE((x->>'jumlah')::numeric, 0) > 0;

  IF u.pekerjaan IN ('tambah-jurusan', 'ganti-kabel') THEN
    IF u.penyulang IS NULL THEN RAISE EXCEPTION 'Penyulang gardu % belum tercatat — tugas HARJAR butuh penyulang.', u.gardu_kode; END IF;
    v_tugas := public.buat_tugas_harjar(
      'JTR',
      u.penyulang,
      u.ringkas,
      format('Gardu %s jurusan %s', u.gardu_kode, u.jurusan),
      CASE WHEN u.titik_lat IS NOT NULL THEN format('%s, %s', round(u.titik_lat::numeric, 7), round(u.titik_lng::numeric, 7)) END,
      'Normal',
      concat_ws(E'\n', CASE WHEN v_mat IS NOT NULL THEN 'Material: ' || v_mat END, v_cat),
      p_nama
    );
    UPDATE public.jtr_usulan_perbaikan
       SET status = 'Di-WO-kan', regu = 'HARJAR', inspeksi_id = v_tugas,
           material = COALESCE(p_material, '[]'::jsonb), catatan = v_cat, wo_oleh = p_nama, wo_at = now()
     WHERE id = p_id;
    RETURN v_tugas;
  END IF;

  -- Pemerataan / naik daya: WO melekat pada pengukuran terakhir gardu itu.
  IF p_bulan IS NULL THEN RAISE EXCEPTION 'Bulan WO wajib dipilih.'; END IF;
  v_jenis := CASE u.pekerjaan WHEN 'pemerataan' THEN 'PEMERATAAN BEBAN' ELSE 'OPTIMASI TRAFO' END;
  SELECT id, wo_sent_at, jenis_pemeliharaan INTO pg
    FROM public.pengukuran_gardu
   WHERE upper(no_gardu) = u.gardu_kode AND dikembalikan_at IS NULL
   ORDER BY tanggal_pengukuran DESC, created_at DESC
   LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gardu % belum punya pengukuran.', u.gardu_kode; END IF;
  IF pg.wo_sent_at IS NOT NULL AND COALESCE(pg.jenis_pemeliharaan, '') <> v_jenis THEN
    RAISE EXCEPTION 'Pengukuran terakhir % sudah di-WO-kan sebagai %.', u.gardu_kode, pg.jenis_pemeliharaan;
  END IF;
  IF pg.wo_sent_at IS NULL THEN
    UPDATE public.pengukuran_gardu
       SET jenis_pemeliharaan = v_jenis, wo_sent_at = now(), wo_bulan = p_bulan
     WHERE id = pg.id;
  END IF;
  UPDATE public.jtr_usulan_perbaikan
     SET status = 'Di-WO-kan',
         regu = CASE u.pekerjaan WHEN 'pemerataan' THEN 'PEMERATAAN' ELSE 'OPTIMASI' END,
         pengukuran_id = pg.id, wo_bulan = p_bulan,
         material = COALESCE(p_material, '[]'::jsonb), catatan = v_cat, wo_oleh = p_nama, wo_at = now()
   WHERE id = p_id;
  RETURN pg.id;
END $fn$;
GRANT EXECUTE ON FUNCTION public.jadikan_wo_usulan_jtr(UUID, JSONB, TEXT, DATE, TEXT) TO authenticated;


-- ── 7. Batalkan usulan (selama belum di-WO-kan) ─────────────────────────────
-- WO yang sudah terbit dibatalkan di modul asalnya (Pemeliharaan Jaringan,
-- Penyeimbangan, Optimasi Trafo) — tahap usulan ikut terbaca dari sana.
CREATE OR REPLACE FUNCTION public.batalkan_usulan_jtr(p_id UUID, p_alasan TEXT, p_nama TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE u public.jtr_usulan_perbaikan;
BEGIN
  SELECT * INTO u FROM public.jtr_usulan_perbaikan WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usulan tidak ditemukan.'; END IF;
  PERFORM public.wajib_boleh_ulp(u.ulp);
  IF u.status <> 'Usulan' THEN
    RAISE EXCEPTION 'Usulan sudah di-WO-kan — batalkan WO-nya di modul pekerjaannya.';
  END IF;
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan pembatalan wajib diisi.'; END IF;
  UPDATE public.jtr_usulan_perbaikan
     SET status = 'Batal', batal_alasan = btrim(p_alasan), batal_oleh = p_nama, batal_at = now()
   WHERE id = p_id;
END $fn$;
GRANT EXECUTE ON FUNCTION public.batalkan_usulan_jtr(UUID, TEXT, TEXT) TO authenticated;
