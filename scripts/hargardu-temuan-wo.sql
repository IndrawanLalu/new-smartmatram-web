-- =============================================================================
-- Temuan gardu → WO: dalam garansi = WO Perbaikan, luar garansi = WO
-- Pemeliharaan Gardu biasa (10 Nov 2026). Jalankan SESUDAH inspeksi-gardu.sql
-- dan wo-daftar-garansi.sql. Idempoten.
--
-- Keputusan user 10 Nov:
--   • Temuan (dari Pemeliharaan Gardu maupun Inspeksi Gardu) di Perlu
--     Perbaikan → "Jadikan WO" memilih jalur OTOMATIS per gardu:
--       – DALAM masa garansi Pemeliharaan Gardu (pemeliharaan terakhir yang
--         SELESAI + garansi_bulan('hargardu') > awal bulan WO): WO PERBAIKAN —
--         isiannya hanya temuan itu, menyelesaikan temuannya, TIDAK dihitung
--         realisasi Pemeliharaan Gardu.
--       – LUAR garansi: gardu masuk WO Pemeliharaan Gardu bulan itu (tempel_wo)
--         → formulir lengkap, dihitung realisasi.
--   • Temuan yang sudah dikerjakan tetap terlihat di Perlu Perbaikan (chip
--     "Sudah dikerjakan"), lewat jalur mana pun.
--   • HP: tab baru "WO temuan" berisi keduanya, dengan keterangan masuk WO
--     (dihitung realisasi) atau perbaikan saja.
--   • WO "Tindak Lanjut Gardu" lama (WO tugas) dibiarkan (jalur 'wo_tugas').
--
-- Kinerja: gardu_perlu_perbaikan dulu 6,4 dtk (Ampenan) / 7,9 dtk (semua,
-- batas 8 dtk!). Kini jawaban TIDAK NORMAL disaring sejak awal (bukan seluruh
-- keadaan terakhir lalu disaring), master gardu sekali lewat hash join, bukan
-- upper() per baris (teknisaplikasi.md butir 23).
-- =============================================================================


-- ── 1. Tindak lanjut per temuan: jalur, status, salinan isi temuan ──────────
ALTER TABLE public.tindak_lanjut_gardu
  ADD COLUMN IF NOT EXISTS jalur            TEXT NOT NULL DEFAULT 'wo_tugas',
  ADD COLUMN IF NOT EXISTS status           TEXT NOT NULL DEFAULT 'Di-WO',
  ADD COLUMN IF NOT EXISTS sumber           TEXT,
  ADD COLUMN IF NOT EXISTS temuan_id        UUID,
  ADD COLUMN IF NOT EXISTS item_nama        TEXT,
  ADD COLUMN IF NOT EXISTS nilai_label      TEXT,
  ADD COLUMN IF NOT EXISTS uraian           TEXT,
  ADD COLUMN IF NOT EXISTS foto_url         TEXT,
  -- Tanda regu di formulir Pemeliharaan Gardu (jalur wo_har): pemeliharaan
  -- mana + 'dikerjakan' | 'belum'. Berlaku saat pemeliharaan itu Diverifikasi.
  ADD COLUMN IF NOT EXISTS har_pemeliharaan_id UUID,
  ADD COLUMN IF NOT EXISTS har_hasil        TEXT,
  ADD COLUMN IF NOT EXISTS prioritas        TEXT,
  ADD COLUMN IF NOT EXISTS ditemukan_pada   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS perbaikan_id     UUID,
  ADD COLUMN IF NOT EXISTS wo_har_item_id   UUID,
  ADD COLUMN IF NOT EXISTS dikerjakan_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dikerjakan_oleh  TEXT,
  ADD COLUMN IF NOT EXISTS foto_sesudah_url TEXT,
  ADD COLUMN IF NOT EXISTS hasil_catatan    TEXT;
ALTER TABLE public.tindak_lanjut_gardu DROP CONSTRAINT IF EXISTS tindak_lanjut_gardu_jalur_valid;
ALTER TABLE public.tindak_lanjut_gardu ADD CONSTRAINT tindak_lanjut_gardu_jalur_valid
  CHECK (jalur IN ('wo_tugas', 'wo_har', 'perbaikan'));
ALTER TABLE public.tindak_lanjut_gardu DROP CONSTRAINT IF EXISTS tindak_lanjut_gardu_status_valid;
ALTER TABLE public.tindak_lanjut_gardu ADD CONSTRAINT tindak_lanjut_gardu_status_valid
  CHECK (status IN ('Di-WO', 'Dikerjakan', 'Belum bisa'));
COMMENT ON COLUMN public.tindak_lanjut_gardu.jalur IS
  'wo_tugas = WO "Tindak Lanjut Gardu" lama · wo_har = WO Pemeliharaan Gardu (luar garansi) · perbaikan = WO Perbaikan (dalam garansi).';
CREATE INDEX IF NOT EXISTS tindak_lanjut_gardu_perbaikan_idx ON public.tindak_lanjut_gardu (perbaikan_id);
CREATE INDEX IF NOT EXISTS tindak_lanjut_gardu_kode_idx ON public.tindak_lanjut_gardu (upper(gardu_kode), upper(ulp));
-- Join master gardu per kode+ULP (dipakai banyak view).
CREATE INDEX IF NOT EXISTS gardu_upper_kode_ulp_idx ON public.gardu (upper(kode), upper(ulp));


-- ── 2. WO Perbaikan (dalam garansi) ─────────────────────────────────────────
-- Satu baris = satu gardu dalam satu bulan; temuannya = tindak_lanjut_gardu
-- dengan perbaikan_id ini.
CREATE TABLE IF NOT EXISTS public.wo_perbaikan_gardu (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ulp            TEXT NOT NULL,
  gardu_kode     TEXT NOT NULL,
  tahun          INT  NOT NULL,
  bulan          INT  NOT NULL CHECK (bulan BETWEEN 1 AND 12),
  regu           TEXT,
  catatan        TEXT,
  garansi_sampai DATE,
  status         TEXT NOT NULL DEFAULT 'Terbuka' CHECK (status IN ('Terbuka', 'Dikirim', 'Dibatalkan')),
  dikirim_at     TIMESTAMPTZ,
  petugas_nama   TEXT,
  petugas_uid    UUID,
  catatan_regu   TEXT,
  created_by     UUID,
  created_oleh   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.wo_perbaikan_gardu IS
  'WO Perbaikan temuan gardu DALAM masa garansi Pemeliharaan Gardu (hargardu-temuan-wo.sql) — tidak dihitung realisasi.';
CREATE INDEX IF NOT EXISTS wo_perbaikan_gardu_ulp_idx ON public.wo_perbaikan_gardu (ulp, status);
ALTER TABLE public.wo_perbaikan_gardu ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wo_perbaikan_gardu_baca ON public.wo_perbaikan_gardu;
CREATE POLICY wo_perbaikan_gardu_baca ON public.wo_perbaikan_gardu FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.wo_perbaikan_gardu TO authenticated;


-- ── 3. Masa garansi dari pemeliharaan yang SELESAI ──────────────────────────
-- Sama dengan _riwayat_pekerjaan('hargardu'): dasar = tanggal selesai (WITA),
-- lama = garansi_bulan('hargardu', ULP, bulan WO). TIDAK menghitung item WO yang
-- belum dikerjakan (garansi_objek menghitungnya — gardu yang sedang di-WO bulan
-- ini bukan berarti sudah dipelihara). NULL = di luar garansi.
CREATE OR REPLACE FUNCTION public.hargardu_garansi_sampai(p_ulp TEXT, p_kode TEXT, p_awal DATE)
RETURNS DATE LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT x.s FROM (
    SELECT (max((COALESCE(p.tgl_selesai, p.created_at) AT TIME ZONE 'Asia/Makassar')::date)
            + make_interval(months => public.garansi_bulan('hargardu', p_ulp, p_awal)))::date AS s
    FROM public.pemeliharaan_gardu p
    WHERE upper(p.ulp) = upper(p_ulp) AND upper(p.gardu_kode) = upper(p_kode)
      AND p.status IN ('Selesai', 'Diverifikasi')
  ) x
  WHERE x.s > date_trunc('month', p_awal)::date;
$fn$;
GRANT EXECUTE ON FUNCTION public.hargardu_garansi_sampai(TEXT, TEXT, DATE) TO authenticated;


-- ── 4. Jadikan WO (pengganti WO "Tindak Lanjut Gardu" untuk temuan gardu) ──
-- p_temuan: [{gardu_kode, ulp, item_kode, bagian, sumber, temuan_id, item_nama,
--             nilai_label, catatan, ditemukan_pada, foto_url, prioritas}]
CREATE OR REPLACE FUNCTION public.jadikan_wo_temuan_gardu(
  p_temuan JSONB, p_tahun INT, p_bulan INT, p_regu TEXT DEFAULT NULL, p_catatan TEXT DEFAULT NULL, p_oleh TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  awal     DATE := make_date(p_tahun, p_bulan, 1);
  g        RECORD;
  x        JSONB;
  sampai   DATE;
  v_pb     UUID;
  v_item   UUID;
  hasil    JSONB;
  n_pb     INT := 0;
  n_wo     INT := 0;
  n_temuan INT := 0;
  ditolak  JSONB := '[]'::jsonb;
  ket      TEXT;
BEGIN
  IF jsonb_typeof(COALESCE(p_temuan, 'null'::jsonb)) <> 'array' OR jsonb_array_length(p_temuan) = 0 THEN
    RAISE EXCEPTION 'Belum ada temuan yang dipilih.';
  END IF;

  -- Per gardu: jalur ditentukan sekali.
  FOR g IN
    SELECT upper(btrim(t->>'ulp')) AS ulp, btrim(t->>'gardu_kode') AS kode, jsonb_agg(t) AS isi
    FROM jsonb_array_elements(p_temuan) t
    GROUP BY 1, 2
  LOOP
    PERFORM public.wajib_boleh_ulp(g.ulp);
    sampai := public.hargardu_garansi_sampai(g.ulp, g.kode, awal);

    IF sampai IS NOT NULL THEN
      -- Dalam garansi → WO Perbaikan (satu per gardu per bulan yang masih terbuka).
      SELECT id INTO v_pb FROM public.wo_perbaikan_gardu
      WHERE upper(ulp) = g.ulp AND upper(gardu_kode) = upper(g.kode) AND tahun = p_tahun AND bulan = p_bulan AND status = 'Terbuka'
      LIMIT 1;
      IF v_pb IS NULL THEN
        INSERT INTO public.wo_perbaikan_gardu (ulp, gardu_kode, tahun, bulan, regu, catatan, garansi_sampai, created_by, created_oleh)
        VALUES (g.ulp, g.kode, p_tahun, p_bulan, NULLIF(btrim(COALESCE(p_regu, '')), ''),
                NULLIF(btrim(COALESCE(p_catatan, '')), ''), sampai, auth.uid(), p_oleh)
        RETURNING id INTO v_pb;
      END IF;
      n_pb := n_pb + 1;
      v_item := NULL;
    ELSE
      -- Luar garansi → gardu masuk WO Pemeliharaan Gardu bulan itu.
      SELECT string_agg(DISTINCT (t->>'item_nama') || COALESCE(': ' || (t->>'nilai_label'), ''), '; ')
      INTO ket FROM jsonb_array_elements(g.isi) t;
      hasil := public.tempel_wo(g.ulp, p_tahun, p_bulan, 'hargardu',
        jsonb_build_array(jsonb_build_object('objek', g.kode, 'pelaksana', p_regu,
          'keterangan', left('Temuan: ' || COALESCE(ket, '-') || COALESCE(' · ' || NULLIF(btrim(COALESCE(p_catatan, '')), ''), ''), 500))),
        p_oleh);
      IF jsonb_array_length(COALESCE(hasil->'ditolak', '[]'::jsonb)) > 0 THEN
        ditolak := ditolak || hasil->'ditolak';
        CONTINUE;
      END IF;
      SELECT i.id INTO v_item
      FROM public.wo_hargardu_item i JOIN public.wo_hargardu w ON w.id = i.wo_id
      WHERE upper(w.ulp) = g.ulp AND w.tahun = p_tahun AND w.bulan = p_bulan AND upper(i.gardu_kode) = upper(g.kode)
      LIMIT 1;
      n_wo := n_wo + 1;
      v_pb := NULL;
    END IF;

    FOR x IN SELECT * FROM jsonb_array_elements(g.isi) LOOP
      INSERT INTO public.tindak_lanjut_gardu AS tl
        (gardu_kode, ulp, item_kode, bagian, wo_item_id, ditugaskan_pada, ditugaskan_oleh, catatan,
         jalur, status, sumber, temuan_id, item_nama, nilai_label, uraian, foto_url, prioritas, ditemukan_pada,
         perbaikan_id, wo_har_item_id, dikerjakan_at, dikerjakan_oleh, foto_sesudah_url, hasil_catatan)
      VALUES (g.kode, g.ulp, x->>'item_kode', COALESCE(NULLIF(x->>'bagian', ''), '-'), NULL, now(), p_oleh,
              NULLIF(btrim(COALESCE(p_catatan, '')), ''),
              CASE WHEN v_pb IS NOT NULL THEN 'perbaikan' ELSE 'wo_har' END, 'Di-WO',
              x->>'sumber', NULLIF(x->>'temuan_id', '')::uuid, x->>'item_nama', x->>'nilai_label', x->>'catatan',
              -- Foto temuan Inspeksi Gardu diambil dari sumbernya, bukan dari layar.
              COALESCE((SELECT t.foto_url[1] FROM public.inspeksi_gardu_temuan t WHERE t.id = NULLIF(x->>'temuan_id', '')::uuid),
                       NULLIF(x->>'foto_url', '')),
              NULLIF(x->>'prioritas', ''), NULLIF(x->>'ditemukan_pada', '')::timestamptz,
              v_pb, v_item, NULL, NULL, NULL, NULL)
      ON CONFLICT (gardu_kode, ulp, item_kode, bagian) DO UPDATE SET
        wo_item_id = NULL, ditugaskan_pada = now(), ditugaskan_oleh = EXCLUDED.ditugaskan_oleh, catatan = EXCLUDED.catatan,
        jalur = EXCLUDED.jalur, status = 'Di-WO', sumber = EXCLUDED.sumber, temuan_id = EXCLUDED.temuan_id,
        item_nama = EXCLUDED.item_nama, nilai_label = EXCLUDED.nilai_label, uraian = EXCLUDED.uraian,
        foto_url = EXCLUDED.foto_url, prioritas = EXCLUDED.prioritas, ditemukan_pada = EXCLUDED.ditemukan_pada,
        perbaikan_id = EXCLUDED.perbaikan_id, wo_har_item_id = EXCLUDED.wo_har_item_id,
        dikerjakan_at = NULL, dikerjakan_oleh = NULL, foto_sesudah_url = NULL, hasil_catatan = NULL;
      n_temuan := n_temuan + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('perbaikan', n_pb, 'wo_pemeliharaan', n_wo, 'temuan', n_temuan, 'ditolak', ditolak);
END $fn$;
REVOKE ALL ON FUNCTION public.jadikan_wo_temuan_gardu(JSONB, INT, INT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jadikan_wo_temuan_gardu(JSONB, INT, INT, TEXT, TEXT, TEXT) TO authenticated;


-- ── 5. Kirim perbaikan dari HP ──────────────────────────────────────────────
-- p_hasil: [{id (tindak_lanjut), hasil: 'diperbaiki'|'belum', foto, catatan}]
-- Diperbaiki → temuan "Sudah dikerjakan" (Inspeksi Gardu: status_tl Selesai);
-- belum → tetap di Perlu Perbaikan, berstatus "Belum bisa" beserta alasannya.
CREATE OR REPLACE FUNCTION public.kirim_perbaikan_gardu(p_id UUID, p_hasil JSONB, p_catatan TEXT DEFAULT NULL, p_nama TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  pb     RECORD;
  v_role TEXT;
  v_unit TEXT;
  x      JSONB;
  tl     RECORD;
  n_ok   INT := 0;
  n_blm  INT := 0;
BEGIN
  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL THEN RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi, kemudian kirim ulang.'; END IF;
  SELECT * INTO pb FROM public.wo_perbaikan_gardu WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WO perbaikan ini tidak ada di server (mungkin dibatalkan).'; END IF;
  IF pb.status <> 'Terbuka' THEN RAISE EXCEPTION 'WO perbaikan gardu % sudah %.', pb.gardu_kode, lower(pb.status); END IF;
  IF v_role <> 'UP3' AND upper(COALESCE(v_unit, '')) <> upper(pb.ulp) THEN
    RAISE EXCEPTION 'Akun ini untuk ULP %, bukan %.', COALESCE(v_unit, '-'), pb.ulp;
  END IF;
  IF jsonb_typeof(COALESCE(p_hasil, 'null'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Isi kiriman tidak terbaca — perbarui aplikasi.'; END IF;

  FOR x IN SELECT * FROM jsonb_array_elements(p_hasil) LOOP
    SELECT * INTO tl FROM public.tindak_lanjut_gardu WHERE id = NULLIF(x->>'id', '')::uuid AND perbaikan_id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Satu temuan tidak termasuk WO perbaikan ini — muat ulang lalu kirim lagi.'; END IF;
    IF x->>'hasil' = 'diperbaiki' THEN
      IF COALESCE(x->>'foto', '') NOT LIKE 'http%' THEN
        RAISE EXCEPTION 'Foto sesudah perbaikan "%" belum terunggah — kirim ulang saat sinyal lebih baik.', tl.item_nama;
      END IF;
      UPDATE public.tindak_lanjut_gardu SET status = 'Dikerjakan', dikerjakan_at = now(), dikerjakan_oleh = p_nama,
        foto_sesudah_url = x->>'foto', hasil_catatan = NULLIF(btrim(COALESCE(x->>'catatan', '')), '')
      WHERE id = tl.id;
      IF tl.temuan_id IS NOT NULL THEN
        UPDATE public.inspeksi_gardu_temuan SET status_tl = 'Selesai', selesai_at = now(), selesai_oleh = p_nama,
          selesai_catatan = 'Diperbaiki (WO perbaikan)' || COALESCE(': ' || NULLIF(btrim(COALESCE(x->>'catatan', '')), ''), '')
        WHERE id = tl.temuan_id AND status_tl = 'Terbuka';
      END IF;
      n_ok := n_ok + 1;
    ELSIF x->>'hasil' = 'belum' THEN
      IF btrim(COALESCE(x->>'catatan', '')) = '' THEN
        RAISE EXCEPTION 'Tulis alasan "%" belum bisa diperbaiki.', tl.item_nama;
      END IF;
      UPDATE public.tindak_lanjut_gardu SET status = 'Belum bisa', dikerjakan_at = now(), dikerjakan_oleh = p_nama,
        hasil_catatan = btrim(x->>'catatan')
      WHERE id = tl.id;
      n_blm := n_blm + 1;
    ELSE
      RAISE EXCEPTION 'Hasil "%" tidak dikenal — perbarui aplikasi.', x->>'hasil';
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.tindak_lanjut_gardu WHERE perbaikan_id = p_id AND status = 'Di-WO') THEN
    RAISE EXCEPTION 'Masih ada temuan di WO ini yang belum dinilai — isi semuanya lalu kirim lagi.';
  END IF;
  UPDATE public.wo_perbaikan_gardu SET status = 'Dikirim', dikirim_at = now(), petugas_nama = p_nama, petugas_uid = auth.uid(),
    catatan_regu = NULLIF(btrim(COALESCE(p_catatan, '')), ''), updated_at = now()
  WHERE id = p_id;
  RETURN jsonb_build_object('diperbaiki', n_ok, 'belum', n_blm);
END $fn$;
REVOKE ALL ON FUNCTION public.kirim_perbaikan_gardu(UUID, JSONB, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kirim_perbaikan_gardu(UUID, JSONB, TEXT, TEXT) TO authenticated;


-- ── 5b. Tanda regu di formulir Pemeliharaan Gardu (HP) ─────────────────────
-- Dipanggil HP SEBELUM kirim_pemeliharaan_gardu, dengan id pemeliharaan dari
-- draf (belum tentu sudah ada barisnya — sengaja tanpa FK). Kirim ulang
-- menimpa. Baru berlaku saat pemeliharaan itu Diverifikasi (trigger 6).
-- p_hasil: [{id, hasil: 'dikerjakan'|'belum', catatan}]
CREATE OR REPLACE FUNCTION public.tandai_temuan_pemeliharaan(p_pemeliharaan_id UUID, p_hasil JSONB)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_role TEXT;
  v_unit TEXT;
  x      JSONB;
  tl     RECORD;
  n      INT := 0;
BEGIN
  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL THEN RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi, kemudian kirim ulang.'; END IF;
  IF p_pemeliharaan_id IS NULL OR jsonb_typeof(COALESCE(p_hasil, 'null'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Isi kiriman temuan tidak terbaca — perbarui aplikasi.';
  END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(p_hasil) LOOP
    SELECT * INTO tl FROM public.tindak_lanjut_gardu WHERE id = NULLIF(x->>'id', '')::uuid AND jalur = 'wo_har';
    -- Ditarik admin / sudah dikerjakan: lewati, jangan gagalkan pemeliharaannya.
    IF NOT FOUND OR tl.status = 'Dikerjakan' THEN CONTINUE; END IF;
    IF v_role <> 'UP3' AND upper(COALESCE(v_unit, '')) <> upper(tl.ulp) THEN
      RAISE EXCEPTION 'Akun ini untuk ULP %, bukan %.', COALESCE(v_unit, '-'), tl.ulp;
    END IF;
    IF COALESCE(x->>'hasil', '') NOT IN ('dikerjakan', 'belum') THEN
      RAISE EXCEPTION 'Temuan "%" belum ditandai sudah atau belum dikerjakan.', tl.item_nama;
    END IF;
    IF x->>'hasil' = 'belum' AND btrim(COALESCE(x->>'catatan', '')) = '' THEN
      RAISE EXCEPTION 'Temuan "%" belum dikerjakan — tulis alasannya.', tl.item_nama;
    END IF;
    UPDATE public.tindak_lanjut_gardu
    SET har_pemeliharaan_id = p_pemeliharaan_id, har_hasil = x->>'hasil',
        hasil_catatan = NULLIF(btrim(COALESCE(x->>'catatan', '')), '')
    WHERE id = tl.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $fn$;
REVOKE ALL ON FUNCTION public.tandai_temuan_pemeliharaan(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tandai_temuan_pemeliharaan(UUID, JSONB) TO authenticated;


-- ── 6. WO Pemeliharaan (luar garansi) disetujui → temuannya "Dikerjakan" ────
-- Temuan dianggap dikerjakan bila pemeliharaan yang disetujui mencatat item
-- itu dan tidak ada yang tidak normal (temuan Pemeliharaan: bagian yang sama;
-- temuan Inspeksi Gardu: bagian mana pun, sama dengan aturan view).
CREATE OR REPLACE FUNCTION public.hargardu_tandai_temuan_dikerjakan()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  -- a. Ditandai regu di formulir (tandai_temuan_pemeliharaan) — tanda menang.
  WITH ubah AS (
    UPDATE public.tindak_lanjut_gardu tl
    SET status = CASE WHEN tl.har_hasil = 'dikerjakan' THEN 'Dikerjakan' ELSE 'Belum bisa' END,
        dikerjakan_at = CASE WHEN tl.har_hasil = 'dikerjakan' THEN COALESCE(NEW.tgl_selesai, now()) END,
        dikerjakan_oleh = CASE WHEN tl.har_hasil = 'dikerjakan' THEN NEW.petugas_nama END,
        foto_sesudah_url = CASE WHEN tl.har_hasil = 'dikerjakan' THEN COALESCE(
          (SELECT f.url FROM public.pemeliharaan_gardu_foto f JOIN public.hargardu_foto_ref fr ON fr.kode = f.slot
           JOIN public.hargardu_item_ref i ON i.kelompok = fr.kelompok
           WHERE f.pemeliharaan_id = NEW.id AND i.kode = tl.item_kode ORDER BY fr.urutan LIMIT 1),
          (SELECT f.url FROM public.pemeliharaan_gardu_foto f WHERE f.pemeliharaan_id = NEW.id AND f.slot = 'sesudah')) END,
        hasil_catatan = COALESCE(tl.hasil_catatan, CASE WHEN tl.har_hasil = 'dikerjakan' THEN 'Dikerjakan lewat Pemeliharaan Gardu' END)
    WHERE tl.jalur = 'wo_har' AND tl.status IN ('Di-WO', 'Belum bisa')
      AND tl.har_pemeliharaan_id = NEW.id AND tl.har_hasil IN ('dikerjakan', 'belum')
    RETURNING tl.temuan_id, tl.status
  )
  UPDATE public.inspeksi_gardu_temuan t
  SET status_tl = 'Selesai', selesai_at = now(), selesai_oleh = NEW.petugas_nama,
      selesai_catatan = 'Dikerjakan lewat Pemeliharaan Gardu'
  WHERE t.status_tl = 'Terbuka' AND t.id IN (SELECT temuan_id FROM ubah WHERE temuan_id IS NOT NULL AND status = 'Dikerjakan');

  -- b. Tidak ditandai (aplikasi lama): item itu tercatat normal = dikerjakan.
  WITH ubah AS (
    UPDATE public.tindak_lanjut_gardu tl
    SET status = 'Dikerjakan', dikerjakan_at = COALESCE(NEW.tgl_selesai, now()), dikerjakan_oleh = NEW.petugas_nama,
        hasil_catatan = 'Dikerjakan lewat Pemeliharaan Gardu'
    WHERE tl.jalur = 'wo_har' AND tl.status IN ('Di-WO', 'Belum bisa')
      AND tl.har_pemeliharaan_id IS DISTINCT FROM NEW.id
      AND upper(tl.gardu_kode) = upper(NEW.gardu_kode) AND upper(tl.ulp) = upper(NEW.ulp)
      AND EXISTS (SELECT 1 FROM public.pemeliharaan_gardu_periksa p
                  WHERE p.pemeliharaan_id = NEW.id AND p.item_kode = tl.item_kode
                    AND (tl.sumber = 'inspeksi_gardu' OR p.bagian = tl.bagian))
      AND NOT EXISTS (SELECT 1 FROM public.pemeliharaan_gardu_periksa p
                      JOIN public.hargardu_opsi_ref o ON o.item_kode = p.item_kode AND o.kode = p.nilai
                      WHERE p.pemeliharaan_id = NEW.id AND p.item_kode = tl.item_kode
                        AND (tl.sumber = 'inspeksi_gardu' OR p.bagian = tl.bagian) AND NOT o.normal)
    RETURNING tl.temuan_id
  )
  UPDATE public.inspeksi_gardu_temuan t
  SET status_tl = 'Selesai', selesai_at = now(), selesai_oleh = NEW.petugas_nama,
      selesai_catatan = 'Dikerjakan lewat Pemeliharaan Gardu'
  WHERE t.status_tl = 'Terbuka' AND t.id IN (SELECT temuan_id FROM ubah WHERE temuan_id IS NOT NULL);
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_hargardu_tandai_temuan ON public.pemeliharaan_gardu;
CREATE TRIGGER trg_hargardu_tandai_temuan AFTER UPDATE OF status ON public.pemeliharaan_gardu
  FOR EACH ROW WHEN (NEW.status = 'Diverifikasi' AND OLD.status IS DISTINCT FROM 'Diverifikasi')
  EXECUTE FUNCTION public.hargardu_tandai_temuan_dikerjakan();


-- ── 7. Perlu Perbaikan (lebih cepat + jalur & status) ───────────────────────
-- Kolom lama TIDAK berubah urutan/tipenya; kolom baru di AKHIR.
-- Temuan yang sudah DIKERJAKAN lewat WO Perbaikan (sesudah ditemukan) keluar
-- dari daftar ini — tetap terlihat di gardu_temuan_dikerjakan.
CREATE OR REPLACE VIEW public.gardu_perlu_perbaikan AS
WITH terakhir AS MATERIALIZED (
  SELECT DISTINCT ON (upper(gardu_kode), upper(ulp))
         id, gardu_kode, ulp, tgl_selesai, pr_keterangan, catatan_perbaikan, petugas_nama
  FROM public.pemeliharaan_gardu
  WHERE status = 'Diverifikasi'
  ORDER BY upper(gardu_kode), upper(ulp), tgl_selesai DESC NULLS LAST, created_at DESC
), gd AS MATERIALIZED (
  SELECT DISTINCT ON (upper(kode), upper(ulp)) upper(kode) AS k, upper(ulp) AS u, nama, alamat, feeder
  FROM public.gardu
  ORDER BY upper(kode), upper(ulp), kode
), tl AS MATERIALIZED (
  SELECT *, upper(gardu_kode) AS k, upper(ulp) AS u FROM public.tindak_lanjut_gardu
)
SELECT
  t.gardu_kode,
  t.ulp,
  g.nama    AS gardu_nama,
  g.alamat  AS gardu_alamat,
  g.feeder  AS penyulang,
  p.item_kode,
  i.nama    AS item_nama,
  i.kelompok,
  p.bagian,
  p.nilai,
  o.label   AS nilai_label,
  p.catatan,
  t.tgl_selesai AS ditemukan_pada,
  t.id      AS pemeliharaan_id,
  t.pr_keterangan,
  t.catatan_perbaikan,
  (tl.id IS NOT NULL AND tl.status <> 'Dikerjakan') AS sudah_di_wo,
  tl.wo_item_id,
  tl.ditugaskan_pada,
  'pemeliharaan'::text AS sumber,
  NULL::uuid           AS temuan_id,
  -- ★ baru (hargardu-temuan-wo.sql)
  CASE WHEN tl.status = 'Dikerjakan' THEN NULL ELSE tl.status END AS tl_status,
  CASE WHEN tl.status = 'Dikerjakan' THEN NULL ELSE tl.jalur END  AS jalur,
  tl.perbaikan_id,
  tl.wo_har_item_id,
  -- Foto temuan Pemeliharaan Gardu = foto bagian itu di catatan yang sama
  -- (slot foto sekelompok dengan item, hargardu-acuan.sql); bagian tanpa slot
  -- sendiri (mis. Jumperan) -> foto "sebelum" pekerjaan.
  COALESCE(
    (SELECT f.url FROM public.pemeliharaan_gardu_foto f JOIN public.hargardu_foto_ref fr ON fr.kode = f.slot
     WHERE f.pemeliharaan_id = t.id AND fr.kelompok = i.kelompok ORDER BY fr.urutan LIMIT 1),
    (SELECT f.url FROM public.pemeliharaan_gardu_foto f WHERE f.pemeliharaan_id = t.id AND f.slot = 'sebelum')
  ) AS foto_url,
  NULL::text AS prioritas,
  t.petugas_nama,
  tl.hasil_catatan
FROM terakhir t
JOIN public.pemeliharaan_gardu_periksa p ON p.pemeliharaan_id = t.id
-- Hanya jawaban TIDAK NORMAL (sama dengan gardu_kondisi_terakhir WHERE NOT normal).
JOIN public.hargardu_opsi_ref o ON o.item_kode = p.item_kode AND o.kode = p.nilai AND NOT o.normal
JOIN public.hargardu_item_ref i ON i.kode = p.item_kode
LEFT JOIN gd g ON g.k = upper(t.gardu_kode) AND g.u = upper(t.ulp)
LEFT JOIN tl ON tl.k = upper(t.gardu_kode) AND tl.u = upper(t.ulp) AND tl.item_kode = p.item_kode AND tl.bagian = p.bagian
-- Dikerjakan lewat WO Perbaikan SESUDAH pemeliharaan terakhir -> keluar. Lewat
-- WO Pemeliharaan, pemeliharaan itu sendiri jadi "terakhir": kalau masih
-- mencatat tidak normal, itu temuan baru dan memang harus tampil lagi.
WHERE NOT COALESCE(tl.status = 'Dikerjakan' AND tl.jalur = 'perbaikan' AND tl.dikerjakan_at >= t.tgl_selesai, false)
UNION ALL
SELECT
  x.gardu_kode,
  x.ulp,
  g.nama,
  g.alamat,
  COALESCE(g.feeder, x.penyulang),
  r.item_kode,
  ir.nama,
  ir.kelompok,
  -- Unik per gardu+item: satu kategori sekali per kunjungan, satu kunjungan
  -- per tier per bulan.
  format('Inspeksi T%s %s', x.tier, to_char(x.tgl AT TIME ZONE 'Asia/Makassar', 'DD-MM-YY')),
  t.prioritas,
  t.prioritas || ': ' || r.label,
  t.uraian,
  x.tgl,
  NULL::uuid,
  NULL::text,
  NULL::text,
  (tl.id IS NOT NULL AND tl.status <> 'Dikerjakan'),
  tl.wo_item_id,
  tl.ditugaskan_pada,
  'inspeksi_gardu'::text,
  t.id,
  CASE WHEN tl.status = 'Dikerjakan' THEN NULL ELSE tl.status END,
  CASE WHEN tl.status = 'Dikerjakan' THEN NULL ELSE tl.jalur END,
  tl.perbaikan_id,
  tl.wo_har_item_id,
  t.foto_url[1] AS foto_url,
  t.prioritas,
  x.petugas_nama,
  tl.hasil_catatan
FROM public.inspeksi_gardu_temuan t
JOIN public.inspeksi_gardu x ON x.id = t.inspeksi_id
JOIN public.igardu_ref r ON r.kode = t.kategori
JOIN public.hargardu_item_ref ir ON ir.kode = r.item_kode
LEFT JOIN gd g ON g.k = upper(x.gardu_kode) AND g.u = upper(x.ulp)
LEFT JOIN tl ON tl.k = upper(x.gardu_kode) AND tl.u = upper(x.ulp) AND tl.item_kode = r.item_kode
  AND tl.bagian = format('Inspeksi T%s %s', x.tier, to_char(x.tgl AT TIME ZONE 'Asia/Makassar', 'DD-MM-YY'))
WHERE t.status_tl = 'Terbuka'
  AND x.status IN ('Selesai', 'Diverifikasi')
  AND NOT COALESCE(tl.status = 'Dikerjakan', false)
  -- Langsung ke tabel (terindeks): pemeliharaan sesudah inspeksi yang mencatat
  -- item ini normal menutup temuannya.
  AND NOT EXISTS (
    SELECT 1 FROM public.pemeliharaan_gardu pg
    WHERE pg.gardu_kode = x.gardu_kode AND pg.ulp = x.ulp
      AND pg.status = 'Diverifikasi' AND pg.tgl_selesai > x.tgl
      AND EXISTS (SELECT 1 FROM public.pemeliharaan_gardu_periksa p
                  WHERE p.pemeliharaan_id = pg.id AND p.item_kode = r.item_kode)
      AND NOT EXISTS (SELECT 1 FROM public.pemeliharaan_gardu_periksa p
                      LEFT JOIN public.hargardu_opsi_ref o ON o.item_kode = p.item_kode AND o.kode = p.nilai
                      WHERE p.pemeliharaan_id = pg.id AND p.item_kode = r.item_kode
                        AND NOT COALESCE(o.normal, true)));
GRANT SELECT ON public.gardu_perlu_perbaikan TO authenticated;


-- ── 8. Temuan yang sudah dikerjakan (chip "Sudah dikerjakan", 12 bulan) ────
CREATE OR REPLACE VIEW public.gardu_temuan_dikerjakan AS
SELECT tl.id, tl.gardu_kode, tl.ulp, g.nama AS gardu_nama, g.alamat AS gardu_alamat, g.feeder AS penyulang,
       tl.item_kode, COALESCE(tl.item_nama, i.nama) AS item_nama, i.kelompok, tl.bagian, tl.nilai_label,
       tl.uraian, tl.sumber, tl.temuan_id, tl.jalur, tl.ditemukan_pada, tl.ditugaskan_pada,
       tl.dikerjakan_at, tl.dikerjakan_oleh, tl.foto_url, tl.foto_sesudah_url, tl.hasil_catatan, tl.prioritas
FROM public.tindak_lanjut_gardu tl
LEFT JOIN public.hargardu_item_ref i ON i.kode = tl.item_kode
LEFT JOIN LATERAL (
  SELECT nama, alamat, feeder FROM public.gardu x
  WHERE upper(x.kode) = upper(tl.gardu_kode) AND upper(x.ulp) = upper(tl.ulp) LIMIT 1
) g ON true
WHERE tl.status = 'Dikerjakan' AND tl.dikerjakan_at >= now() - INTERVAL '12 months';
GRANT SELECT ON public.gardu_temuan_dikerjakan TO authenticated;


-- ── 9. HP: tab "WO temuan" ──────────────────────────────────────────────────
-- Satu baris = satu temuan yang di-WO-kan dan belum dikerjakan. HP
-- mengelompokkan per gardu & jalur.
CREATE OR REPLACE VIEW public.wo_temuan_gardu AS
SELECT tl.id, tl.gardu_kode, tl.ulp, g.nama AS gardu_nama, g.alamat AS gardu_alamat, g.feeder AS penyulang,
       g.lat, g.lng, tl.jalur, tl.status, tl.item_kode, COALESCE(tl.item_nama, i.nama) AS item_nama, tl.bagian,
       tl.nilai_label, tl.uraian, tl.foto_url, tl.prioritas, tl.sumber, tl.ditemukan_pada, tl.ditugaskan_pada,
       tl.hasil_catatan, tl.perbaikan_id, pb.garansi_sampai, pb.tahun, pb.bulan,
       COALESCE(pb.regu, wi.pelaksana) AS regu, tl.wo_har_item_id
FROM public.tindak_lanjut_gardu tl
LEFT JOIN public.hargardu_item_ref i ON i.kode = tl.item_kode
LEFT JOIN public.wo_perbaikan_gardu pb ON pb.id = tl.perbaikan_id
LEFT JOIN public.wo_hargardu_item wi ON wi.id = tl.wo_har_item_id
LEFT JOIN LATERAL (
  SELECT nama, alamat, feeder, lat, lng FROM public.gardu x
  WHERE upper(x.kode) = upper(tl.gardu_kode) AND upper(x.ulp) = upper(tl.ulp) LIMIT 1
) g ON true
WHERE tl.jalur IN ('perbaikan', 'wo_har') AND tl.status IN ('Di-WO', 'Belum bisa')
  AND (tl.jalur <> 'perbaikan' OR pb.status = 'Terbuka');
GRANT SELECT ON public.wo_temuan_gardu TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT count(*) FROM gardu_perlu_perbaikan WHERE ulp = 'AMPENAN';      -- harus cepat (< 2 dtk)
--   SELECT hargardu_garansi_sampai('AMPENAN', 'AM004', date_trunc('month', now())::date);
--   EXPLAIN ANALYZE SELECT * FROM gardu_perlu_perbaikan WHERE ulp = 'AMPENAN';
