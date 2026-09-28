-- =============================================================================
-- P1 (28 Sep 2026) — Rencana Pemeliharaan Gardu
-- Jalankan manual di Supabase SQL Editor, SESUDAH `wo-hargardu.sql`. Idempoten.
--
-- Permulaan tanpa riwayat: tiap ULP mengunggah Excel berisi gardu mana
-- dipelihara bulan apa (kisi 12 bulan, satu gardu boleh lebih dari sekali —
-- SLA bisa berubah). "Terbitkan WO" bulan yang ada rencananya mengambil gardu
-- dari sini; bulan tanpa rencana kembali ke rekomendasi sistem (umur/riwayat).
-- Rencana SEMENTARA: setelah riwayat terbentuk, sistem yang menyusun.
--
-- Keputusan user:
--   • nama di layar "Rencana Pemeliharaan", alasan di WO/HP "Sesuai rencana ULP"
--   • kode yang tidak ada di Master Gardu DITOLAK — daftarkan di master dulu
--   • unggah ulang hanya mengganti bulan yang WO-nya belum terbit
-- =============================================================================


-- ── 1. Tabel rencana: satu baris = satu gardu di satu bulan ──────────────────
-- Kunci master gardu = (kode, ulp) — `gardu-master-state-view.sql`. Dijamin
-- ada di sini karena foreign key di bawah membutuhkannya.
CREATE UNIQUE INDEX IF NOT EXISTS gardu_kode_ulp_unik ON public.gardu (kode, ulp);

CREATE TABLE IF NOT EXISTS public.rencana_hargardu (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ulp           TEXT NOT NULL,
  gardu_kode    TEXT NOT NULL,
  tahun         INT  NOT NULL CHECK (tahun BETWEEN 2020 AND 2100),
  bulan         INT  NOT NULL CHECK (bulan BETWEEN 1 AND 12),
  catatan       TEXT,
  diunggah_oleh TEXT,
  diunggah_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Kode asing ditolak database, bukan hanya aplikasi. Kode gardu diganti di
  -- master → ikut; gardu dihapus dari master → rencananya ikut hilang.
  CONSTRAINT rencana_hargardu_gardu_fk FOREIGN KEY (gardu_kode, ulp)
    REFERENCES public.gardu (kode, ulp) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS rencana_hargardu_unik
  ON public.rencana_hargardu (ulp, tahun, bulan, gardu_kode);

COMMENT ON TABLE public.rencana_hargardu IS
  'Rencana Pemeliharaan Gardu hasil unggah Excel ULP — sumber WO selama riwayat belum ada.';

ALTER TABLE public.rencana_hargardu ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rencana_hargardu_baca ON public.rencana_hargardu;
CREATE POLICY rencana_hargardu_baca ON public.rencana_hargardu
  FOR SELECT TO authenticated USING (true);
-- Tulis HANYA lewat fungsi di bawah (satu transaksi, dijaga hak ULP).
GRANT SELECT ON public.rencana_hargardu TO authenticated;


-- ── 2. Alasan baru di baris WO ───────────────────────────────────────────────
ALTER TABLE public.wo_hargardu_item DROP CONSTRAINT IF EXISTS wo_hargardu_item_alasan_check;
ALTER TABLE public.wo_hargardu_item ADD CONSTRAINT wo_hargardu_item_alasan_check
  CHECK (alasan IN ('belum_pernah', 'jatuh_tempo', 'rencana'));


-- ── 3. Simpan unggahan ───────────────────────────────────────────────────────
-- p_dari  : bulan pertama jendela templat (tanggal 1); jendela = 12 bulan.
-- p_baris : [{ "kode", "tahun", "bulan", "catatan" }] — satu per tanda ✓.
--
-- Bulan jendela yang WO-nya SUDAH terbit dilewati (tidak dihapus, tidak
-- diisi) dan dilaporkan. Bulan lainnya di jendela DIGANTI seluruhnya: gardu
-- yang tandanya dihapus di Excel ikut hilang dari rencana.
CREATE OR REPLACE FUNCTION public.simpan_rencana_hargardu(
  p_ulp TEXT, p_dari DATE, p_baris JSONB, p_nama TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ulp     TEXT := upper(btrim(COALESCE(p_ulp, '')));
  v_kini    DATE := date_trunc('month', (now() AT TIME ZONE 'Asia/Makassar'))::date;
  v_sampai  DATE;
  v_asing   TEXT[];
  v_luar    TEXT[];
  v_terbit  TEXT[];
  v_n       INT;
BEGIN
  PERFORM public.wajib_boleh_ulp(v_ulp);

  IF p_dari IS NULL OR extract(day FROM p_dari) <> 1 THEN
    RAISE EXCEPTION 'Awal periode templat tidak sah — unduh ulang templatnya.';
  END IF;
  IF p_dari < v_kini THEN
    RAISE EXCEPTION 'Templat ini mulai % — sudah lewat. Unduh templat terbaru.', to_char(p_dari, 'MM-YYYY');
  END IF;
  v_sampai := (p_dari + interval '12 months')::date;
  IF jsonb_typeof(COALESCE(p_baris, 'null'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Isi rencana tidak terbaca — unduh ulang templatnya.';
  END IF;

  -- Baris unggahan, kode dicocokkan ke master (huruf besar/kecil diabaikan).
  CREATE TEMP TABLE _r ON COMMIT DROP AS
  SELECT upper(btrim(b->>'kode')) AS kode_asli,
         g.kode                   AS kode,
         (b->>'tahun')::int       AS tahun,
         (b->>'bulan')::int       AS bulan,
         NULLIF(btrim(b->>'catatan'), '') AS catatan
  FROM jsonb_array_elements(p_baris) b
  LEFT JOIN public.gardu g ON upper(g.kode) = upper(btrim(b->>'kode')) AND upper(g.ulp) = v_ulp;

  SELECT array_agg(DISTINCT kode_asli ORDER BY kode_asli) INTO v_asing FROM _r WHERE kode IS NULL;
  IF v_asing IS NOT NULL THEN
    RAISE EXCEPTION '% kode gardu tidak ada di Master Gardu ULP %: % — daftarkan di Master Gardu dulu, lalu unggah ulang.',
      cardinality(v_asing), v_ulp,
      array_to_string(v_asing[1:20], ', ') || CASE WHEN cardinality(v_asing) > 20 THEN ', …' ELSE '' END;
  END IF;

  SELECT array_agg(DISTINCT kode || ' (' || COALESCE(bulan::text, '?') || '/' || COALESCE(tahun::text, '?') || ')') INTO v_luar
  FROM _r
  -- CASE, bukan OR: make_date(…, 13, 1) melempar galat bila dievaluasi duluan.
  WHERE CASE WHEN bulan BETWEEN 1 AND 12 AND tahun BETWEEN 2020 AND 2100
             THEN make_date(tahun, bulan, 1) < p_dari OR make_date(tahun, bulan, 1) >= v_sampai
             ELSE true END;
  IF v_luar IS NOT NULL THEN
    RAISE EXCEPTION 'Bulan di luar periode templat: % — unduh ulang templatnya.', array_to_string(v_luar[1:10], ', ');
  END IF;

  -- Bulan jendela yang WO-nya sudah terbit: dikunci.
  SELECT array_agg(to_char(make_date(w.tahun, w.bulan, 1), 'MM-YYYY') ORDER BY w.tahun, w.bulan) INTO v_terbit
  FROM public.wo_hargardu w
  WHERE w.ulp = v_ulp AND w.tgl_wo >= p_dari AND w.tgl_wo < v_sampai;

  DELETE FROM public.rencana_hargardu r
  WHERE r.ulp = v_ulp
    AND make_date(r.tahun, r.bulan, 1) >= p_dari AND make_date(r.tahun, r.bulan, 1) < v_sampai
    AND NOT EXISTS (SELECT 1 FROM public.wo_hargardu w
                    WHERE w.ulp = v_ulp AND w.tahun = r.tahun AND w.bulan = r.bulan);

  INSERT INTO public.rencana_hargardu (ulp, gardu_kode, tahun, bulan, catatan, diunggah_oleh)
  SELECT DISTINCT ON (x.kode, x.tahun, x.bulan) v_ulp, x.kode, x.tahun, x.bulan, x.catatan, p_nama
  FROM _r x
  WHERE NOT EXISTS (SELECT 1 FROM public.wo_hargardu w
                    WHERE w.ulp = v_ulp AND w.tahun = x.tahun AND w.bulan = x.bulan)
  ORDER BY x.kode, x.tahun, x.bulan;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object('tersimpan', v_n, 'bulan_terkunci', COALESCE(to_jsonb(v_terbit), '[]'::jsonb));
END $$;
GRANT EXECUTE ON FUNCTION public.simpan_rencana_hargardu(TEXT, DATE, JSONB, TEXT) TO authenticated;


-- ── 4. Hapus rencana — serahkan penyusunan ke sistem ─────────────────────────
-- Hanya bulan berjalan ke depan yang WO-nya belum terbit. Yang sudah jadi WO
-- dan bulan lampau dibiarkan (jejak dari mana WO itu disusun).
CREATE OR REPLACE FUNCTION public.hapus_rencana_hargardu(p_ulp TEXT)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ulp  TEXT := upper(btrim(COALESCE(p_ulp, '')));
  v_kini DATE := date_trunc('month', (now() AT TIME ZONE 'Asia/Makassar'))::date;
  v_n    INT;
BEGIN
  PERFORM public.wajib_boleh_ulp(v_ulp);
  DELETE FROM public.rencana_hargardu r
  WHERE r.ulp = v_ulp
    AND make_date(r.tahun, r.bulan, 1) >= v_kini
    AND NOT EXISTS (SELECT 1 FROM public.wo_hargardu w
                    WHERE w.ulp = v_ulp AND w.tahun = r.tahun AND w.bulan = r.bulan);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;
GRANT EXECUTE ON FUNCTION public.hapus_rencana_hargardu(TEXT) TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT ulp, tahun, bulan, count(*) FROM rencana_hargardu GROUP BY 1,2,3 ORDER BY 1,2,3;
--   SELECT simpan_rencana_hargardu('AMPENAN', '2026-10-01', '[]'::jsonb);  -- tanpa sesi: ditolak
