-- =============================================================================
-- Koreksi isian inspeksi JTM per rentang + daftar yang janggal (10 Okt 2026)
-- Jalankan manual di Supabase SQL Editor. Idempoten. Tidak mengubah data —
-- data hanya berubah saat admin menekan Terapkan di peta.
--
-- User: "hasil inspeksi JTM banyak yang keliru, ukuran kabel misalnya … skur
-- terisi drugschoer banyak … perlu cara menanganinya dengan baik, seperti ganti
-- nama tiang sekali ganti." 10 Okt: 29 dari 79 segmen ukuran konduktornya
-- campur; Drugschoer 62 tiang karena bawaan "tiang normal" sempat salah.
--
--   1. jtm_isian_terkini        — jawaban TERKINI per tiang/item/kabel, dari
--                                 inspeksi yang tidak dibatalkan
--   2. _jtm_jalur               — tiang dari tiang A ke tiang B di satu
--                                 penyulang, MENGIKUTI JALUR (bukan nomor nama)
--   3. pratinjau_koreksi_isian_jtm / koreksi_isian_jtm
--                               — lapis 1: ganti satu isian di sepanjang jalur
--   4. jtm_isian_janggal        — lapis 2: tiang yang isiannya beda sendiri
--                                 dari tiang sebelum & sesudahnya (70 → 150 → 70)
--
-- Yang diubah: jawaban terkini DAN jawaban dari inspeksi terakhir yang sudah
-- disetujui (bila berbeda), supaya dashboard (kondisi terakhir) ikut benar
-- tanpa menunggu inspeksi berikutnya. Nilai lama tercatat di master_audit.
-- Hanya item yang dinilai sekali per tiang atau per kabel (bukan per fasa).
-- =============================================================================


-- ── 1. Jawaban terkini ───────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.jtm_isian_terkini AS
SELECT DISTINCT ON (tk.tiang_id, p.item_kode, p.bagian, COALESCE(p.sirkit_segmen_id, '00000000-0000-0000-0000-000000000000'::uuid))
       p.id AS periksa_id,
       tk.tiang_id,
       p.item_kode,
       p.bagian,
       p.sirkit_segmen_id,
       upper(s.penyulang) AS sirkit_penyulang,
       p.nilai,
       m.id AS inspeksi_id,
       m.status,
       upper(m.penyulang) AS penyulang,
       upper(m.ulp) AS ulp
FROM public.inspeksi_jtm_periksa p
JOIN public.inspeksi_jtm_titik tk ON tk.id = p.titik_id
JOIN public.inspeksi_jtm m ON m.id = tk.inspeksi_id
LEFT JOIN public.segmen s ON s.id = p.sirkit_segmen_id
WHERE m.status <> 'Dibatalkan' AND tk.tiang_id IS NOT NULL AND p.nilai IS NOT NULL
ORDER BY tk.tiang_id, p.item_kode, p.bagian, COALESCE(p.sirkit_segmen_id, '00000000-0000-0000-0000-000000000000'::uuid),
         COALESCE(m.tgl_selesai, m.verified_at, m.tgl_mulai) DESC NULLS LAST, p.updated_at DESC;
COMMENT ON VIEW public.jtm_isian_terkini IS
  'Jawaban inspeksi JTM terkini per (tiang, item, bagian, kabel) dari inspeksi yang tidak dibatalkan — termasuk yang belum disetujui.';
GRANT SELECT ON public.jtm_isian_terkini TO authenticated;


-- ── 2. Jalur antara dua tiang di satu penyulang ──────────────────────────────
-- Naik dari tiang B lewat induk-di-penyulang sampai bertemu A (atau
-- sebaliknya). Tidak bertemu = keduanya tidak satu jalur (beda cabang).
CREATE OR REPLACE FUNCTION public._jtm_jalur(p_dari UUID, p_ke UUID, p_penyulang TEXT)
RETURNS TABLE (urut INT, tiang_id UUID)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  daftar UUID[];
  kini   UUID;
  tujuan UUID;
  n      INT;
BEGIN
  FOR putaran IN 1..2 LOOP
    -- Putaran 1: naik dari B mencari A. Putaran 2: naik dari A mencari B.
    kini   := CASE WHEN putaran = 1 THEN p_ke ELSE p_dari END;
    tujuan := CASE WHEN putaran = 1 THEN p_dari ELSE p_ke END;
    daftar := ARRAY[kini];
    n := 0;
    WHILE kini IS NOT NULL AND kini <> tujuan AND n < 3000 LOOP
      kini := public.jtm_induk_di_penyulang(kini, p_penyulang);
      IF kini IS NOT NULL THEN daftar := daftar || kini; END IF;
      n := n + 1;
    END LOOP;
    IF kini IS NOT NULL AND kini = tujuan THEN
      -- Urutan selalu dari A ke B: hasil putaran 1 (B → A) dibalik.
      RETURN QUERY
        SELECT (CASE WHEN putaran = 1 THEN cardinality(daftar) - x.i + 1 ELSE x.i END)::int, x.id
        FROM unnest(daftar) WITH ORDINALITY AS x(id, i)
        ORDER BY 1;
      RETURN;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'Dua tiang itu tidak satu jalur di penyulang % — pilih tiang awal & akhir di cabang yang sama.', p_penyulang;
END $fn$;


-- ── 3a. Pratinjau ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pratinjau_koreksi_isian_jtm(
  p_dari UUID, p_ke UUID, p_penyulang TEXT, p_item TEXT
) RETURNS TABLE (urut INT, tiang_id UUID, tiang_kode TEXT, nilai_lama TEXT, label_lama TEXT, ada_jawaban BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH it AS (SELECT dimensi FROM public.jtm_item_ref WHERE kode = p_item),
  jalur AS (SELECT * FROM public._jtm_jalur(p_dari, p_ke, upper(p_penyulang)))
  SELECT j.urut, j.tiang_id,
         COALESCE((SELECT kp.kode FROM public.tiang_kode_penyulang kp
                    WHERE kp.tiang_id = j.tiang_id AND upper(kp.penyulang) = upper(p_penyulang) LIMIT 1),
                  (SELECT t.kode FROM public.tiang t WHERE t.id = j.tiang_id)),
         s.nilai,
         (SELECT o.label FROM public.jtm_opsi_ref o WHERE o.item_kode = p_item AND o.kode = s.nilai),
         s.nilai IS NOT NULL
  FROM jalur j
  LEFT JOIN LATERAL (
    SELECT x.nilai FROM public.jtm_isian_terkini x, it
    WHERE x.tiang_id = j.tiang_id AND x.item_kode = p_item AND x.bagian = '-'
      AND (it.dimensi <> 'sirkit' OR x.sirkit_penyulang = upper(p_penyulang))
    LIMIT 1
  ) s ON true
  ORDER BY j.urut
$fn$;


-- ── 3b. Terapkan ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.koreksi_isian_jtm(
  p_dari UUID, p_ke UUID, p_penyulang TEXT, p_item TEXT, p_nilai TEXT,
  p_alasan TEXT, p_oleh TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  pen     TEXT := upper(btrim(COALESCE(p_penyulang, '')));
  it      RECORD;
  lbl     TEXT;
  v_ulp   TEXT;
  r       RECORD;
  diubah  INT := 0;
  sama    INT := 0;
  kosong  INT := 0;
  n_tiang INT := 0;
  awal    TEXT;
  akhir   TEXT;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan koreksi wajib diisi.'; END IF;
  SELECT kode, nama, dimensi, tipe INTO it FROM public.jtm_item_ref WHERE kode = p_item;
  IF it.kode IS NULL THEN RAISE EXCEPTION 'Isian % tidak dikenal.', p_item; END IF;
  IF it.dimensi NOT IN ('tunggal', 'sirkit') OR it.tipe <> 'pilihan' THEN
    RAISE EXCEPTION 'Isian % tidak bisa dikoreksi per rentang (hanya pilihan yang dinilai sekali per tiang / per kabel).', it.nama;
  END IF;
  SELECT label INTO lbl FROM public.jtm_opsi_ref WHERE item_kode = p_item AND kode = p_nilai;
  IF lbl IS NULL THEN RAISE EXCEPTION 'Pilihan "%" tidak ada pada %.', p_nilai, it.nama; END IF;

  SELECT upper(ulp) INTO v_ulp FROM public.tiang WHERE id = p_dari;
  PERFORM public.wajib_boleh_ulp(v_ulp);

  FOR r IN
    SELECT p.urut, p.tiang_id, p.tiang_kode, p.nilai_lama, p.ada_jawaban
    FROM public.pratinjau_koreksi_isian_jtm(p_dari, p_ke, pen, p_item) p
  LOOP
    n_tiang := n_tiang + 1;
    IF awal IS NULL THEN awal := r.tiang_kode; END IF;
    akhir := r.tiang_kode;
    IF NOT r.ada_jawaban THEN kosong := kosong + 1; CONTINUE; END IF;
    IF r.nilai_lama = p_nilai THEN sama := sama + 1; CONTINUE; END IF;

    -- Jawaban terkini + jawaban inspeksi terakhir yang SUDAH DISETUJUI (yang
    -- dibaca dashboard), bila keduanya baris berbeda.
    UPDATE public.inspeksi_jtm_periksa p SET nilai = p_nilai
    WHERE p.id IN (
      SELECT x.periksa_id FROM public.jtm_isian_terkini x
      WHERE x.tiang_id = r.tiang_id AND x.item_kode = p_item AND x.bagian = '-'
        AND (it.dimensi <> 'sirkit' OR x.sirkit_penyulang = pen)
      UNION
      SELECT q.periksa_id FROM (
        SELECT DISTINCT ON (pp.sirkit_segmen_id) pp.id AS periksa_id
        FROM public.inspeksi_jtm_periksa pp
        JOIN public.inspeksi_jtm_titik tk ON tk.id = pp.titik_id
        JOIN public.inspeksi_jtm m ON m.id = tk.inspeksi_id
        LEFT JOIN public.segmen s ON s.id = pp.sirkit_segmen_id
        WHERE tk.tiang_id = r.tiang_id AND pp.item_kode = p_item AND pp.bagian = '-' AND pp.nilai IS NOT NULL
          AND m.status = 'Diverifikasi'
          AND (it.dimensi <> 'sirkit' OR upper(s.penyulang) = pen)
        ORDER BY pp.sirkit_segmen_id, COALESCE(m.tgl_selesai, m.verified_at, m.tgl_mulai) DESC, pp.updated_at DESC
      ) q
    );
    diubah := diubah + 1;

    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', r.tiang_kode, COALESCE(v_ulp, '-'), 'jtm:' || p_item,
            to_jsonb(r.nilai_lama),
            jsonb_build_object('nilai', p_nilai, 'alasan', btrim(p_alasan), 'penyulang', pen),
            'sunting_admin', auth.uid(), p_oleh);
  END LOOP;

  RETURN jsonb_build_object('item', it.nama, 'nilai', lbl, 'tiang', n_tiang, 'diubah', diubah,
                            'sudah_sama', sama, 'belum_dinilai', kosong, 'dari', awal, 'ke', akhir);
END $fn$;


-- ── 4. Yang janggal: beda sendiri dari tiang sebelum & sesudahnya ────────────
-- Tiang T janggal bila: nilainya beda dari induknya, dan SEMUA anaknya yang
-- sudah dinilai sama dengan induknya (minimal satu anak). Contoh 70 → 150 → 70.
-- Usulan = nilai induknya. Hanya usulan — admin yang menerapkan.
CREATE OR REPLACE FUNCTION public.jtm_isian_janggal(p_ulp TEXT, p_item TEXT DEFAULT 'ukuran_konduktor')
RETURNS TABLE (tiang_id UUID, tiang_kode TEXT, penyulang TEXT, nilai TEXT, label TEXT,
               usulan TEXT, label_usulan TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH it AS (SELECT dimensi FROM public.jtm_item_ref WHERE kode = p_item),
  isi AS (
    SELECT x.tiang_id, CASE WHEN it.dimensi = 'sirkit' THEN x.sirkit_penyulang ELSE x.penyulang END AS pen, x.nilai
    FROM public.jtm_isian_terkini x, it
    WHERE x.item_kode = p_item AND x.bagian = '-' AND (p_ulp IS NULL OR x.ulp = upper(p_ulp))
  ),
  sisi AS (
    SELECT i.tiang_id, i.pen, i.nilai, public.jtm_induk_di_penyulang(i.tiang_id, i.pen) AS induk
    FROM isi i WHERE i.pen IS NOT NULL
  ),
  calon AS (
    SELECT s.tiang_id, s.pen, s.nilai, h.nilai AS nilai_induk
    FROM sisi s JOIN isi h ON h.tiang_id = s.induk AND h.pen = s.pen
    WHERE h.nilai <> s.nilai
  )
  SELECT c.tiang_id,
         COALESCE((SELECT kp.kode FROM public.tiang_kode_penyulang kp
                    WHERE kp.tiang_id = c.tiang_id AND upper(kp.penyulang) = c.pen LIMIT 1), t.kode),
         c.pen, c.nilai,
         (SELECT o.label FROM public.jtm_opsi_ref o WHERE o.item_kode = p_item AND o.kode = c.nilai),
         c.nilai_induk,
         (SELECT o.label FROM public.jtm_opsi_ref o WHERE o.item_kode = p_item AND o.kode = c.nilai_induk),
         t.lat::double precision, t.lng::double precision
  FROM calon c
  JOIN public.tiang t ON t.id = c.tiang_id
  WHERE EXISTS (SELECT 1 FROM sisi a WHERE a.induk = c.tiang_id AND a.pen = c.pen)
    AND NOT EXISTS (SELECT 1 FROM sisi a WHERE a.induk = c.tiang_id AND a.pen = c.pen AND a.nilai <> c.nilai_induk)
  ORDER BY c.pen, 2
$fn$;

GRANT EXECUTE ON FUNCTION public.pratinjau_koreksi_isian_jtm(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.koreksi_isian_jtm(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.jtm_isian_janggal(TEXT, TEXT) TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT penyulang, count(*) FROM jtm_isian_janggal(NULL, 'ukuran_konduktor') GROUP BY 1 ORDER BY 2 DESC;
