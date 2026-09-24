-- =============================================================================
-- H1 `rencana-mobile-harjar.md` (25 Sep 2026)
-- Jalankan manual di Supabase SQL Editor, SESUDAH `pemeliharaan-jaringan.sql`,
-- `pemeliharaan-jaringan-koreksi.sql` dan `perabasan-kerja-hp.sql`. Idempoten.
--
--   1. pemeliharaan_jaringan: inspeksi_id, status Dikembalikan, jejak kembali
--   2. mulai_tugas_harjar      — tugas jadi "Dalam Proses" saat Simpan di HP
--   3. kirim_pemeliharaan_jaringan(p_isi) — id & tanggal dari HP, idempoten,
--      menutup tugasnya dalam transaksi yang sama
--   4. kembalikan_pemeliharaan_jaringan   — tombol web "Kembalikan ke petugas"
--   5. batalkan_pemeliharaan_jaringan     — tugasnya dibuka lagi
--   6. pemeliharaan_jaringan_daftar       — + tugas asal & jejak kembali
--   7. rekap_kinerja                      — yang dikembalikan tidak dihitung
-- =============================================================================


-- ── 1. Kolom & status ────────────────────────────────────────────────────────
-- Tipe `inspeksi.id` diikuti apa adanya (uuid atau text), supaya FK-nya sah.
DO $$
DECLARE
  t TEXT;
BEGIN
  SELECT data_type INTO t FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'inspeksi' AND column_name = 'id';
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pemeliharaan_jaringan' AND column_name = 'inspeksi_id'
  ) THEN
    EXECUTE format(
      'ALTER TABLE public.pemeliharaan_jaringan ADD COLUMN inspeksi_id %s REFERENCES public.inspeksi(id) ON DELETE SET NULL',
      CASE WHEN t = 'uuid' THEN 'UUID' ELSE 'TEXT' END);
  END IF;
END $$;

ALTER TABLE public.pemeliharaan_jaringan
  ADD COLUMN IF NOT EXISTS dikembalikan_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dikembalikan_alasan TEXT,
  ADD COLUMN IF NOT EXISTS dikembalikan_oleh   TEXT;

ALTER TABLE public.pemeliharaan_jaringan DROP CONSTRAINT IF EXISTS pemeliharaan_jaringan_status_valid;
ALTER TABLE public.pemeliharaan_jaringan ADD CONSTRAINT pemeliharaan_jaringan_status_valid
  CHECK (status IN ('Selesai', 'Diverifikasi', 'Dibatalkan', 'Dikembalikan'));

-- Satu tugas = satu catatan hidup. Dua regu yang mengirim tugas yang sama
-- ditolak di sini juga, bukan hanya di fungsi.
CREATE UNIQUE INDEX IF NOT EXISTS pemeliharaan_jaringan_satu_per_tugas
  ON public.pemeliharaan_jaringan (inspeksi_id)
  WHERE inspeksi_id IS NOT NULL AND status <> 'Dibatalkan';

COMMENT ON COLUMN public.pemeliharaan_jaringan.inspeksi_id IS
  'Tugas temuan (baris `inspeksi`) yang dikerjakan catatan ini. NULL = pekerjaan di luar tugas.';


-- Hak regu atas satu tugas: eksekutornya = role akun (atau admin/UP3), dan
-- ULP-nya = ULP akun (kecuali UP3).
CREATE OR REPLACE FUNCTION public._harjar_boleh_tugas(t public.inspeksi)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_role TEXT;
  v_unit TEXT;
BEGIN
  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi, kemudian kirim ulang — isian tetap tersimpan di HP.';
  END IF;
  IF v_role NOT IN ('UP3', 'admin') AND upper(COALESCE(t.eksekutor, '')) <> upper(v_role) THEN
    RAISE EXCEPTION 'Tugas ini untuk %, bukan untuk akun %.', COALESCE(NULLIF(t.eksekutor, ''), '-'), v_role;
  END IF;
  IF v_role <> 'UP3' AND upper(COALESCE(v_unit, '')) <> upper(COALESCE(t.ulp, '')) THEN
    RAISE EXCEPTION 'Tugas ini milik ULP %, akun ini ULP %.', COALESCE(t.ulp, '-'), COALESCE(v_unit, '-');
  END IF;
END $fn$;


-- ── 2. Tugas mulai dikerjakan ────────────────────────────────────────────────
-- Dikirim HP saat regu menyimpan draf tugas, bila ada sinyal (keputusan c).
-- Hanya Ditugaskan → Dalam Proses; selain itu diam (sudah dipegang / selesai).
CREATE OR REPLACE FUNCTION public.mulai_tugas_harjar(p_inspeksi_id TEXT, p_nama TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  t public.inspeksi;
BEGIN
  SELECT * INTO t FROM public.inspeksi WHERE id::text = p_inspeksi_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tugas tidak ditemukan — mungkin sudah dihapus admin.'; END IF;
  PERFORM public._harjar_boleh_tugas(t);

  UPDATE public.inspeksi
  SET status = 'Dalam Proses', updated_by = COALESCE(p_nama, updated_by), updated_at = now()
  WHERE id = t.id AND status = 'Ditugaskan';
END $fn$;


-- ── 3. Kirim dari HP ─────────────────────────────────────────────────────────
-- p_isi: {id, inspeksi_id?, jenis, penyulang, kategori, pekerjaan, alamat,
--         lat, lng, akurasi, foto_sebelum_url, foto_sesudah_url, catatan,
--         tgl, nama, ulp}
--
-- • id dari HP → kirim ulang sesudah putus mengembalikan {sudah_ada:true}.
-- • Catatan yang DIKEMBALIKAN dikirim ulang dengan id yang sama → diperbarui.
-- • Pemeriksaan isian disalin dari `simpan_pemeliharaan_jaringan` (penyulang,
--   kategori aktif, ULP dari master penyulang).
-- • Ber-tugas: tugas ditutup Selesai + foto sesudah + tanggal eksekusi dalam
--   transaksi yang sama. Dua regu satu tugas → yang kedua ditolak.
CREATE OR REPLACE FUNCTION public.kirim_pemeliharaan_jaringan(p_isi JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_id    UUID := NULLIF(p_isi->>'id', '')::uuid;
  v_insp  TEXT := NULLIF(btrim(COALESCE(p_isi->>'inspeksi_id', '')), '');
  v_jenis TEXT := upper(btrim(COALESCE(p_isi->>'jenis', '')));
  v_peny  TEXT := upper(btrim(COALESCE(p_isi->>'penyulang', '')));
  v_kat   TEXT := p_isi->>'kategori';
  v_kerja TEXT := btrim(COALESCE(p_isi->>'pekerjaan', ''));
  v_fs    TEXT := COALESCE(p_isi->>'foto_sebelum_url', '');
  v_fd    TEXT := COALESCE(p_isi->>'foto_sesudah_url', '');
  v_hari  DATE := (now() AT TIME ZONE 'Asia/Makassar')::date;
  v_tgl   DATE := COALESCE(NULLIF(p_isi->>'tgl', '')::date, (now() AT TIME ZONE 'Asia/Makassar')::date);
  v_nama  TEXT := NULLIF(btrim(COALESCE(p_isi->>'nama', '')), '');
  v_ulp   TEXT;
  ada     public.pemeliharaan_jaringan;
  t       public.inspeksi;
  lain    public.pemeliharaan_jaringan;
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'Catatan tanpa id — perbarui aplikasi lalu kirim ulang.'; END IF;

  SELECT * INTO ada FROM public.pemeliharaan_jaringan WHERE id = v_id FOR UPDATE;
  IF FOUND AND ada.status <> 'Dikembalikan' THEN
    -- Kiriman ulang setelah jawaban server hilang di jalan.
    RETURN jsonb_build_object('id', v_id, 'ulp', ada.ulp, 'sudah_ada', true);
  END IF;

  -- ── isian (sama dengan simpan_pemeliharaan_jaringan) ──
  IF v_jenis NOT IN ('JTM', 'JTR') THEN RAISE EXCEPTION 'Jenis jaringan harus JTM atau JTR'; END IF;
  IF v_peny = '' THEN RAISE EXCEPTION 'Penyulang wajib dipilih'; END IF;
  IF v_kerja = '' THEN RAISE EXCEPTION 'Pekerjaan wajib diisi'; END IF;
  IF v_fs NOT LIKE 'http%' OR v_fd NOT LIKE 'http%' THEN
    RAISE EXCEPTION 'Foto sebelum dan sesudah dua-duanya wajib dan harus sudah terunggah.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pemeliharaan_jaringan_ref r WHERE r.kode = v_kat AND r.aktif) THEN
    RAISE EXCEPTION 'Kategori "%" tidak ada di daftar yang aktif', v_kat;
  END IF;
  IF v_tgl > v_hari THEN RAISE EXCEPTION 'Tanggal pekerjaan tidak boleh di masa depan.'; END IF;

  SELECT upper(pr.ulp) INTO v_ulp FROM public.penyulang_ref pr WHERE upper(pr.penyulang) = v_peny LIMIT 1;
  v_ulp := COALESCE(v_ulp, NULLIF(upper(btrim(COALESCE(p_isi->>'ulp', ''))), ''));
  IF v_ulp IS NULL THEN RAISE EXCEPTION 'ULP tidak diketahui untuk penyulang %', v_peny; END IF;

  -- ── tugas ──
  IF v_insp IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('tugas-harjar|' || v_insp));
    SELECT * INTO t FROM public.inspeksi WHERE id::text = v_insp FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tugas tidak ditemukan — mungkin sudah dihapus admin. Hapus kaitannya lalu kirim sebagai pekerjaan di luar tugas.'; END IF;
    PERFORM public._harjar_boleh_tugas(t);

    SELECT * INTO lain FROM public.pemeliharaan_jaringan
    WHERE inspeksi_id::text = v_insp AND status <> 'Dibatalkan' AND id <> v_id;
    IF FOUND THEN
      RAISE EXCEPTION 'Tugas ini sudah dikirim % pada %. Satu tugas satu catatan.',
        COALESCE(lain.petugas_nama, 'regu lain'), lain.tgl;
    END IF;
    IF t.status NOT IN ('Ditugaskan', 'Dalam Proses') THEN
      RAISE EXCEPTION 'Tugas ini sudah berstatus % — tidak bisa dikirim lagi.', t.status;
    END IF;
  END IF;

  IF ada.id IS NULL THEN
    INSERT INTO public.pemeliharaan_jaringan
      (id, inspeksi_id, jenis, penyulang, ulp, kategori, pekerjaan, alamat,
       lat, lng, akurasi, foto_sebelum_url, foto_sesudah_url,
       petugas_uid, petugas_nama, catatan, tgl)
    VALUES
      (v_id, t.id, v_jenis, v_peny, v_ulp, v_kat, v_kerja,
       NULLIF(btrim(COALESCE(p_isi->>'alamat', '')), ''),
       NULLIF(p_isi->>'lat', '')::double precision, NULLIF(p_isi->>'lng', '')::double precision,
       NULLIF(p_isi->>'akurasi', '')::double precision,
       v_fs, v_fd, auth.uid(), v_nama, NULLIF(btrim(COALESCE(p_isi->>'catatan', '')), ''), v_tgl);
  ELSE
    -- Kiriman ulang yang dikembalikan: baris yang sama diperbarui.
    UPDATE public.pemeliharaan_jaringan SET
      inspeksi_id = t.id, jenis = v_jenis, penyulang = v_peny, ulp = v_ulp, kategori = v_kat,
      pekerjaan = v_kerja, alamat = NULLIF(btrim(COALESCE(p_isi->>'alamat', '')), ''),
      lat = NULLIF(p_isi->>'lat', '')::double precision, lng = NULLIF(p_isi->>'lng', '')::double precision,
      akurasi = NULLIF(p_isi->>'akurasi', '')::double precision,
      foto_sebelum_url = v_fs, foto_sesudah_url = v_fd,
      petugas_uid = auth.uid(), petugas_nama = COALESCE(v_nama, petugas_nama),
      catatan = NULLIF(btrim(COALESCE(p_isi->>'catatan', '')), ''), tgl = v_tgl,
      status = 'Selesai', verified_at = NULL, verified_by = NULL, updated_at = now()
    WHERE id = v_id;
  END IF;

  IF t.id IS NOT NULL THEN
    UPDATE public.inspeksi
    SET status = 'Selesai', foto_sesudah_url = v_fd, tgl_eksekusi = v_tgl,
        updated_by = COALESCE(v_nama, updated_by), updated_at = now()
    WHERE id = t.id;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'ulp', v_ulp, 'sudah_ada', false);
END $fn$;


-- ── 4. Kembalikan ke petugas ─────────────────────────────────────────────────
-- Hanya dari Selesai. Tugasnya kembali "Dalam Proses" — masih di tangan regu.
CREATE OR REPLACE FUNCTION public.kembalikan_pemeliharaan_jaringan(
  p_id     UUID,
  p_alasan TEXT,
  p_nama   TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  j public.pemeliharaan_jaringan;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan wajib diisi — petugas harus tahu apa yang diperbaiki.';
  END IF;
  SELECT * INTO j FROM public.pemeliharaan_jaringan WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Catatan tidak ditemukan.'; END IF;
  PERFORM public.wajib_boleh_ulp(j.ulp);
  IF j.status <> 'Selesai' THEN
    RAISE EXCEPTION 'Hanya catatan yang menunggu verifikasi yang bisa dikembalikan (status sekarang: %).', j.status;
  END IF;

  UPDATE public.pemeliharaan_jaringan
  SET status = 'Dikembalikan', dikembalikan_at = now(), dikembalikan_alasan = btrim(p_alasan),
      dikembalikan_oleh = p_nama, updated_at = now()
  WHERE id = p_id;

  IF j.inspeksi_id IS NOT NULL THEN
    UPDATE public.inspeksi
    SET status = 'Dalam Proses', foto_sesudah_url = NULL, tgl_eksekusi = NULL,
        updated_by = COALESCE(p_nama, updated_by), updated_at = now()
    WHERE id = j.inspeksi_id AND status = 'Selesai';
  END IF;
END $fn$;


-- ── 5. Batalkan — tugasnya dibuka lagi ───────────────────────────────────────
-- Badan lama disalin (`pemeliharaan-jaringan.sql`); yang baru: penjaga ULP dan
-- tugas yang tertaut kembali "Ditugaskan" (pekerjaannya masih harus ada).
CREATE OR REPLACE FUNCTION public.batalkan_pemeliharaan_jaringan(
  p_id     UUID,
  p_alasan TEXT,
  p_nama   TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  j public.pemeliharaan_jaringan;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan pembatalan wajib diisi';
  END IF;
  SELECT * INTO j FROM public.pemeliharaan_jaringan WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR j.status = 'Dibatalkan' THEN
    RAISE EXCEPTION 'Catatan tidak ditemukan, atau sudah dibatalkan sebelumnya';
  END IF;
  PERFORM public.wajib_boleh_ulp(j.ulp);

  UPDATE public.pemeliharaan_jaringan
  SET status = 'Dibatalkan',
      catatan = btrim(COALESCE(catatan || ' | ', '') || 'dibatalkan: ' || p_alasan),
      verified_by = p_nama,
      updated_at = now()
  WHERE id = p_id;

  IF j.inspeksi_id IS NOT NULL THEN
    UPDATE public.inspeksi
    SET status = 'Ditugaskan', foto_sesudah_url = NULL, tgl_eksekusi = NULL,
        updated_by = COALESCE(p_nama, updated_by), updated_at = now()
    WHERE id = j.inspeksi_id AND status IN ('Selesai', 'Dalam Proses');
  END IF;
END $fn$;


-- ── 6. Daftar web — kolom baru DITAMBAHKAN DI BELAKANG ───────────────────────
CREATE OR REPLACE VIEW public.pemeliharaan_jaringan_daftar AS
SELECT
  p.id,
  p.jenis,
  p.penyulang,
  p.ulp,
  p.kategori,
  r.label AS kategori_label,
  p.pekerjaan,
  p.alamat,
  p.lat,
  p.lng,
  p.foto_sebelum_url,
  p.foto_sesudah_url,
  p.status,
  p.petugas_nama,
  p.catatan,
  p.tgl,
  p.verified_at,
  p.verified_by,
  p.created_at,
  p.inspeksi_id,
  p.dikembalikan_at,
  p.dikembalikan_alasan,
  p.dikembalikan_oleh,
  i.temuan          AS tugas_temuan,
  i.deskripsi       AS tugas_deskripsi,
  i.assigned_at     AS tugas_ditugaskan,
  i.foto_sebelum_url AS tugas_foto
FROM public.pemeliharaan_jaringan p
LEFT JOIN public.pemeliharaan_jaringan_ref r ON r.kode = p.kategori
LEFT JOIN public.inspeksi i ON i.id = p.inspeksi_id;

GRANT SELECT ON public.pemeliharaan_jaringan_daftar TO authenticated;
GRANT EXECUTE ON FUNCTION public.mulai_tugas_harjar(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kirim_pemeliharaan_jaringan(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kembalikan_pemeliharaan_jaringan(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batalkan_pemeliharaan_jaringan(UUID, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public._harjar_boleh_tugas(public.inspeksi) FROM PUBLIC;


-- ── 7. rekap_kinerja (disalin dari versi terpasang; hanya baris harjtm) ─────
CREATE OR REPLACE FUNCTION public.rekap_kinerja(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS TABLE (kunci TEXT, wo_terbit NUMERIC, realisasi NUMERIC, belum_disetujui NUMERIC, luar_wo INT)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  u      TEXT := NULLIF(NULLIF(upper(btrim(COALESCE(p_ulp, ''))), ''), 'SEMUA');
  d_awal DATE := make_date(p_tahun, CASE WHEN p_bulan = 0 THEN 1 ELSE p_bulan END, 1);
  d_akhr DATE;  -- eksklusif
  t_awal TIMESTAMPTZ;
  t_akhr TIMESTAMPTZ;
  jadi   NUMERIC;
BEGIN
  d_akhr := CASE WHEN p_bulan = 0 THEN make_date(p_tahun + 1, 1, 1)
                 ELSE (d_awal + INTERVAL '1 month')::date END;
  t_awal := d_awal::timestamp AT TIME ZONE 'Asia/Makassar';
  t_akhr := d_akhr::timestamp AT TIME ZONE 'Asia/Makassar';

  -- Perabasan — km dari WO Perabasan. Belum punya tahap persetujuan.
  -- `luar_wo` = pohon dirabas DI LUAR WO (tanpa segmen, tanpa km), dihitung
  -- untuk ULP REGU yang mengerjakan (keputusan user 25 Sep 2026).
  RETURN QUERY
  SELECT 'perabasan'::text, round(COALESCE(sum(c.target_km), 0), 3), round(COALESCE(sum(c.capaian_km), 0), 3), 0::numeric,
    (SELECT count(*)::int FROM public.perabasan_luar_wo l
      WHERE l.status IN ('Selesai', 'Diverifikasi')
        AND l.tgl >= d_awal AND l.tgl < d_akhr
        AND (u IS NULL OR upper(l.ulp_regu) = u))
  FROM public.wo_perabasan_capaian c
  WHERE c.tgl_wo::date >= d_awal AND c.tgl_wo::date < d_akhr
    AND (u IS NULL OR upper(c.ulp) = u);

  -- Pemeliharaan Jaringan — tanpa WO (keputusan user 25 Sep 2026).
  -- `luar_wo` di baris INI = berapa dari realisasi itu yang berasal dari
  -- TUGAS temuan (bukan "di luar WO") — layar menuliskannya tersendiri.
  -- Yang dikembalikan ke petugas tidak dihitung sampai dikirim ulang.
  RETURN QUERY
  SELECT 'harjtm'::text, NULL::numeric, count(*)::numeric, count(*) FILTER (WHERE j.status = 'Selesai')::numeric,
    count(*) FILTER (WHERE j.inspeksi_id IS NOT NULL)::int
  FROM public.pemeliharaan_jaringan j
  WHERE j.status NOT IN ('Dibatalkan', 'Dikembalikan')
    AND j.tgl::date >= d_awal AND j.tgl::date < d_akhr
    AND (u IS NULL OR upper(j.ulp) = u);

  -- Pemeliharaan Gardu — WO bulanan, realisasi SAAT DIKIRIM.
  SELECT count(*) FILTER (WHERE r.terealisasi) INTO jadi
  FROM public.wo_hargardu_realisasi r
  WHERE r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan)
    AND (u IS NULL OR upper(r.ulp) = u);

  RETURN QUERY
  SELECT 'hargardu'::text,
    (SELECT count(*)::numeric FROM public.wo_hargardu_realisasi r
      WHERE r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan) AND (u IS NULL OR upper(r.ulp) = u)),
    jadi,
    (SELECT count(*) FILTER (WHERE r.terealisasi AND NOT r.disetujui)::numeric FROM public.wo_hargardu_realisasi r
      WHERE r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan) AND (u IS NULL OR upper(r.ulp) = u)),
    GREATEST(0, (SELECT count(*) FROM public.pemeliharaan_gardu g
                  WHERE g.status IN ('Selesai', 'Diverifikasi')
                    AND g.created_at >= t_awal AND g.created_at < t_akhr
                    AND (u IS NULL OR upper(g.ulp) = u)) - jadi)::int;

  -- Penyeimbangan — tanpa WO, tanpa persetujuan.
  RETURN QUERY
  SELECT 'penyeimbangan'::text, NULL::numeric, count(*)::numeric, NULL::numeric, NULL::int
  FROM public.penyeimbangan_gardu p
  WHERE p.created_at >= t_awal AND p.created_at < t_akhr
    AND (u IS NULL OR upper(p.ulp) = u);

  -- Optimasi Trafo — WO = ditandai OPTIMASI TRAFO, tanpa yang dibatalkan.
  RETURN QUERY
  SELECT 'optimasi'::text,
    (SELECT count(*)::numeric FROM public.pengukuran_gardu pg
      WHERE pg.jenis_pemeliharaan = 'OPTIMASI TRAFO'
        AND pg.wo_sent_at >= t_awal AND pg.wo_sent_at < t_akhr
        AND (u IS NULL OR upper(pg.petugas_unit) = u)
        AND NOT EXISTS (SELECT 1 FROM public.optimasi_wo_batal b WHERE b.pengukuran_id::text = pg.id::text)),
    count(*)::numeric,
    count(*) FILTER (WHERE o.status = 'Selesai')::numeric,
    NULL::int
  FROM public.optimasi_trafo o
  -- Dikembalikan ke petugas = belum realisasi sampai dikirim ulang.
  WHERE o.status NOT IN ('Dibatalkan', 'Dikembalikan')
    AND o.tgl_operasi::date >= d_awal AND o.tgl_operasi::date < d_akhr
    AND (u IS NULL OR upper(o.ulp) = u);

  -- Pengukuran beban — WO Pengukuran.
  RETURN QUERY
  SELECT 'pengukuran'::text, count(*)::numeric,
    count(*) FILTER (WHERE r.terealisasi)::numeric,
    count(*) FILTER (WHERE r.tertahan)::numeric, NULL::int
  FROM public.wo_pengukuran_realisasi r
  WHERE r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan)
    AND (u IS NULL OR upper(r.ulp) = u);

  -- Inspeksi JTM — km segmen yang penyapuannya selesai.
  RETURN QUERY
  SELECT 'jtm'::text, NULL::numeric,
    round(COALESCE(sum(sp.panjang_pakai_km) FILTER (WHERE m.status IN ('Selesai', 'Diverifikasi')), 0), 3),
    round(COALESCE(sum(sp.panjang_pakai_km) FILTER (WHERE m.status = 'Selesai'), 0), 3),
    NULL::int
  FROM public.inspeksi_jtm m
  LEFT JOIN public.segmen_panjang sp ON sp.segmen_id = m.segmen_id
  WHERE m.created_at >= t_awal AND m.created_at < t_akhr
    AND (u IS NULL OR upper(m.ulp) = u);

  -- Inspeksi JTR — km penghantar gardu (termasuk underbuild), kode + ULP.
  RETURN QUERY
  SELECT 'jtr'::text, NULL::numeric,
    round(COALESCE(sum(pj.km) FILTER (WHERE r.status IN ('Selesai', 'Diverifikasi')), 0), 3),
    round(COALESCE(sum(pj.km) FILTER (WHERE r.status = 'Selesai'), 0), 3),
    NULL::int
  FROM public.inspeksi_jtr r
  LEFT JOIN LATERAL (
    SELECT sum(g.panjang_km) AS km FROM public.gardu_jtr_penghantar g
    WHERE g.gardu_kode = r.gardu_kode AND g.ulp = r.ulp
  ) pj ON true
  WHERE r.created_at >= t_awal AND r.created_at < t_akhr
    AND (u IS NULL OR upper(r.ulp) = u);
END $$;

GRANT EXECUTE ON FUNCTION public.rekap_kinerja(TEXT, INT, INT) TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT * FROM rekap_kinerja(NULL, 2026, 9) WHERE kunci = 'harjtm';
--   SELECT status, (inspeksi_id IS NOT NULL) AS dari_tugas, count(*)
--   FROM pemeliharaan_jaringan GROUP BY 1, 2;
