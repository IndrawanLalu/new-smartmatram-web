-- =============================================================================
-- K1 — Tabel ringkas kondisi terakhir tiang (5 Nov 2026)
-- Rencana: rencana-kondisi-tiang-ringkas.md
-- -----------------------------------------------------------------------------
-- View `tiang_kondisi_terakhir` menghitung "jawaban terakhir per tiang × item ×
-- bagian × sirkit" atas SELURUH jawaban periksa inspeksi JTM terverifikasi
-- (±457 ribu baris, dua kali lipat dalam dua minggu) setiap kali dibaca;
-- saringan ULP baru berlaku sesudahnya. Temuan JTM semua ULP sudah habis waktu.
--
-- Sekarang hasilnya disimpan di tabel `kondisi_tiang_terakhir`, diperbarui oleh
-- pemicu HANYA untuk tiang yang berubah, dalam transaksi yang sama (temuan tetap
-- muncul saat inspeksi disetujui). View ditulis ulang membaca tabel itu dengan
-- kolom yang sama persis → web, HP, WA, dan view lain tidak berubah.
--
-- Label & status normal pilihan (jtm_opsi_ref), nama item, kode tiang, nama
-- sirkit TIDAK disimpan — tetap digabung saat dibaca, supaya ganti pilihan
-- (seperti vegetasi 5 Nov) langsung berlaku tanpa membangun ulang.
--
-- Isian draf/terkirim dari HP tidak memicu hitung ulang (hanya inspeksi
-- Diverifikasi). Pemeriksa selisih `kondisi_tiang_periksa` dijalankan pekerja
-- tiap malam; selisih diperbaiki otomatis.
--
-- Aman dijalankan ulang. Pengisian awal butuh beberapa puluh detik.
-- =============================================================================

-- ── 1. Tabel ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kondisi_tiang_terakhir (
  tiang_id         UUID NOT NULL REFERENCES public.tiang(id) ON DELETE CASCADE,
  item_kode        TEXT NOT NULL,
  bagian           TEXT NOT NULL,
  sirkit_segmen_id UUID,
  -- Kunci pengganti NULL: dua NULL dianggap berbeda oleh kunci utama.
  sirkit_kunci     UUID GENERATED ALWAYS AS
                     (COALESCE(sirkit_segmen_id, '00000000-0000-0000-0000-000000000000'::uuid)) STORED,
  nilai            TEXT,
  nilai_angka      NUMERIC,
  catatan          TEXT,
  foto_url         TEXT,
  inspeksi_id      UUID NOT NULL,
  penyulang        TEXT,
  ulp              TEXT,
  tier             TEXT,
  tgl              TIMESTAMPTZ,
  PRIMARY KEY (tiang_id, item_kode, bagian, sirkit_kunci)
);
CREATE INDEX IF NOT EXISTS ix_kondisi_tiang_ulp        ON public.kondisi_tiang_terakhir (ulp);
CREATE INDEX IF NOT EXISTS ix_kondisi_tiang_item_nilai ON public.kondisi_tiang_terakhir (item_kode, nilai);
CREATE INDEX IF NOT EXISTS ix_kondisi_tiang_inspeksi   ON public.kondisi_tiang_terakhir (inspeksi_id);

-- Dibaca lewat view (hak pemilik), tidak langsung oleh pengguna aplikasi.
ALTER TABLE public.kondisi_tiang_terakhir ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kondisi_tiang_terakhir FROM anon, authenticated;

-- Jalur hitung per tiang (nama sama dengan indeks-audit-nov.sql → tidak kembar).
CREATE INDEX IF NOT EXISTS ix_inspeksi_jtm_titik_tiang_id ON public.inspeksi_jtm_titik (tiang_id);


-- ── 2. Rumus (satu-satunya tempat) ───────────────────────────────────────────
-- Sama dengan view lama: inspeksi Diverifikasi, jawaban berisi, tiang ada;
-- terbaru = tanggal inspeksi (selesai → disetujui → mulai), lalu jawaban yang
-- terakhir diubah. + p.id sebagai penentu terakhir supaya hasilnya pasti.
CREATE OR REPLACE FUNCTION public._kondisi_tiang_hitung(p_tiang UUID[])
RETURNS TABLE (tiang_id UUID, item_kode TEXT, bagian TEXT, sirkit_segmen_id UUID,
               nilai TEXT, nilai_angka NUMERIC, catatan TEXT, foto_url TEXT,
               inspeksi_id UUID, penyulang TEXT, ulp TEXT, tier TEXT, tgl TIMESTAMPTZ)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT DISTINCT ON (tk.tiang_id, p.item_kode, p.bagian,
                      COALESCE(p.sirkit_segmen_id, '00000000-0000-0000-0000-000000000000'::uuid))
    tk.tiang_id, p.item_kode, p.bagian, p.sirkit_segmen_id,
    p.nilai, p.nilai_angka, p.catatan, p.foto_url,
    m.id, m.penyulang, m.ulp, m.tier,
    COALESCE(m.tgl_selesai, m.verified_at, m.tgl_mulai)
  FROM public.inspeksi_jtm_titik tk
  JOIN public.inspeksi_jtm m         ON m.id = tk.inspeksi_id
  JOIN public.inspeksi_jtm_periksa p ON p.titik_id = tk.id
  WHERE tk.tiang_id = ANY (p_tiang)
    AND m.status = 'Diverifikasi'
    AND (p.nilai IS NOT NULL OR p.nilai_angka IS NOT NULL)
    AND EXISTS (SELECT 1 FROM public.tiang t WHERE t.id = tk.tiang_id)
  ORDER BY tk.tiang_id, p.item_kode, p.bagian,
           COALESCE(p.sirkit_segmen_id, '00000000-0000-0000-0000-000000000000'::uuid),
           COALESCE(m.tgl_selesai, m.verified_at, m.tgl_mulai) DESC, p.updated_at DESC, p.id DESC
$$;

-- Hitung ulang tiang-tiang tertentu. Tanpa kunci antar-transaksi: dua
-- persetujuan serentak pada tiang yang sama (jarang) paling buruk menyisakan
-- baris lama sampai pemeriksa malam memperbaikinya — tidak pernah gagal simpan.
CREATE OR REPLACE FUNCTION public._segarkan_kondisi_tiang(p_tiang UUID[])
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_tiang IS NULL OR cardinality(p_tiang) = 0 THEN RETURN; END IF;
  DELETE FROM public.kondisi_tiang_terakhir WHERE tiang_id = ANY (p_tiang);
  INSERT INTO public.kondisi_tiang_terakhir AS k
    (tiang_id, item_kode, bagian, sirkit_segmen_id, nilai, nilai_angka, catatan, foto_url,
     inspeksi_id, penyulang, ulp, tier, tgl)
  SELECT * FROM public._kondisi_tiang_hitung(p_tiang)
  ON CONFLICT (tiang_id, item_kode, bagian, sirkit_kunci) DO UPDATE SET
    sirkit_segmen_id = EXCLUDED.sirkit_segmen_id, nilai = EXCLUDED.nilai,
    nilai_angka = EXCLUDED.nilai_angka, catatan = EXCLUDED.catatan, foto_url = EXCLUDED.foto_url,
    inspeksi_id = EXCLUDED.inspeksi_id, penyulang = EXCLUDED.penyulang, ulp = EXCLUDED.ulp,
    tier = EXCLUDED.tier, tgl = EXCLUDED.tgl;
END $$;
REVOKE ALL ON FUNCTION public._segarkan_kondisi_tiang(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._kondisi_tiang_hitung(UUID[]) FROM PUBLIC, anon, authenticated;


-- ── 3. Pemicu ────────────────────────────────────────────────────────────────
-- Sekali per pernyataan (tabel transisi), bukan per baris: menyetujui satu
-- inspeksi ratusan tiang = satu hitung ulang. Transisi tabel hanya boleh satu
-- jenis kejadian per pemicu, jadi INSERT/UPDATE/DELETE dipisah.

-- 3a. Inspeksi: status dari/ke Diverifikasi, atau asal jawaban (tanggal, ULP,
--     penyulang, tier) pada inspeksi terverifikasi berubah. Inspeksi dihapus →
--     titiknya ikut terhapus → ditangani pemicu titik.
CREATE OR REPLACE FUNCTION public._kondisi_tiang_dari_inspeksi()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ids UUID[];
BEGIN
  SELECT array_agg(DISTINCT tk.tiang_id) INTO ids
  FROM lama o
  JOIN baru n ON n.id = o.id
  JOIN public.inspeksi_jtm_titik tk ON tk.inspeksi_id = n.id
  WHERE (o.status = 'Diverifikasi' OR n.status = 'Diverifikasi')
    AND (o.status, o.tgl_selesai, o.verified_at, o.tgl_mulai, o.ulp, o.penyulang, o.tier)
        IS DISTINCT FROM
        (n.status, n.tgl_selesai, n.verified_at, n.tgl_mulai, n.ulp, n.penyulang, n.tier);
  PERFORM public._segarkan_kondisi_tiang(ids);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_kondisi_tiang_inspeksi ON public.inspeksi_jtm;
CREATE TRIGGER trg_kondisi_tiang_inspeksi
  AFTER UPDATE ON public.inspeksi_jtm
  REFERENCING OLD TABLE AS lama NEW TABLE AS baru
  FOR EACH STATEMENT EXECUTE FUNCTION public._kondisi_tiang_dari_inspeksi();

-- 3b. Titik: pindah tiang / pindah inspeksi / dihapus (tiang kembar, koreksi,
--     batal segmen, inspeksi dihapus). Tiang lama DAN baru.
CREATE OR REPLACE FUNCTION public._kondisi_tiang_dari_titik()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ids UUID[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT array_agg(DISTINCT o.tiang_id) INTO ids FROM lama o;
  ELSE
    SELECT array_agg(DISTINCT x) INTO ids
    FROM lama o JOIN baru n ON n.id = o.id
    CROSS JOIN LATERAL unnest(ARRAY[o.tiang_id, n.tiang_id]) x
    WHERE (o.tiang_id, o.inspeksi_id) IS DISTINCT FROM (n.tiang_id, n.inspeksi_id);
  END IF;
  PERFORM public._segarkan_kondisi_tiang(ids);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_kondisi_tiang_titik_ubah ON public.inspeksi_jtm_titik;
CREATE TRIGGER trg_kondisi_tiang_titik_ubah
  AFTER UPDATE ON public.inspeksi_jtm_titik
  REFERENCING OLD TABLE AS lama NEW TABLE AS baru
  FOR EACH STATEMENT EXECUTE FUNCTION public._kondisi_tiang_dari_titik();
DROP TRIGGER IF EXISTS trg_kondisi_tiang_titik_hapus ON public.inspeksi_jtm_titik;
CREATE TRIGGER trg_kondisi_tiang_titik_hapus
  AFTER DELETE ON public.inspeksi_jtm_titik
  REFERENCING OLD TABLE AS lama
  FOR EACH STATEMENT EXECUTE FUNCTION public._kondisi_tiang_dari_titik();

-- 3c. Jawaban periksa pada inspeksi TERVERIFIKASI (koreksi isian, lepas
--     tumpang, sirkit terhapus, …). Draf HP tersaring di sini.
CREATE OR REPLACE FUNCTION public._kondisi_tiang_dari_periksa()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ids UUID[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT array_agg(DISTINCT tk.tiang_id) INTO ids
    FROM (SELECT DISTINCT titik_id FROM baru) x
    JOIN public.inspeksi_jtm_titik tk ON tk.id = x.titik_id
    JOIN public.inspeksi_jtm m ON m.id = tk.inspeksi_id AND m.status = 'Diverifikasi';
  ELSIF TG_OP = 'DELETE' THEN
    SELECT array_agg(DISTINCT tk.tiang_id) INTO ids
    FROM (SELECT DISTINCT titik_id FROM lama) x
    JOIN public.inspeksi_jtm_titik tk ON tk.id = x.titik_id
    JOIN public.inspeksi_jtm m ON m.id = tk.inspeksi_id AND m.status = 'Diverifikasi';
  ELSE
    -- Hanya perubahan yang memengaruhi hasil (bukan kategori, sebab tutup, dsb.).
    SELECT array_agg(DISTINCT tk.tiang_id) INTO ids
    FROM (
      SELECT unnest(ARRAY[o.titik_id, n.titik_id]) AS titik_id
      FROM lama o JOIN baru n ON n.id = o.id
      WHERE (o.titik_id, o.item_kode, o.bagian, o.sirkit_segmen_id, o.nilai, o.nilai_angka, o.catatan, o.foto_url)
            IS DISTINCT FROM
            (n.titik_id, n.item_kode, n.bagian, n.sirkit_segmen_id, n.nilai, n.nilai_angka, n.catatan, n.foto_url)
    ) x
    JOIN public.inspeksi_jtm_titik tk ON tk.id = x.titik_id
    JOIN public.inspeksi_jtm m ON m.id = tk.inspeksi_id AND m.status = 'Diverifikasi';
  END IF;
  PERFORM public._segarkan_kondisi_tiang(ids);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_kondisi_tiang_periksa_tambah ON public.inspeksi_jtm_periksa;
CREATE TRIGGER trg_kondisi_tiang_periksa_tambah
  AFTER INSERT ON public.inspeksi_jtm_periksa
  REFERENCING NEW TABLE AS baru
  FOR EACH STATEMENT EXECUTE FUNCTION public._kondisi_tiang_dari_periksa();
DROP TRIGGER IF EXISTS trg_kondisi_tiang_periksa_ubah ON public.inspeksi_jtm_periksa;
CREATE TRIGGER trg_kondisi_tiang_periksa_ubah
  AFTER UPDATE ON public.inspeksi_jtm_periksa
  REFERENCING OLD TABLE AS lama NEW TABLE AS baru
  FOR EACH STATEMENT EXECUTE FUNCTION public._kondisi_tiang_dari_periksa();
DROP TRIGGER IF EXISTS trg_kondisi_tiang_periksa_hapus ON public.inspeksi_jtm_periksa;
CREATE TRIGGER trg_kondisi_tiang_periksa_hapus
  AFTER DELETE ON public.inspeksi_jtm_periksa
  REFERENCING OLD TABLE AS lama
  FOR EACH STATEMENT EXECUTE FUNCTION public._kondisi_tiang_dari_periksa();


-- ── 4. Pemeriksa selisih (dipanggil pekerja tiap malam, per 2.000 tiang) ─────
-- Membandingkan tabel dengan rumus untuk sepotong tiang, memperbaiki yang
-- berbeda, dan mengembalikan jumlah tiang yang berbeda + tiang terakhir
-- (panggil lagi dengan p_setelah = terakhir sampai terakhir NULL).
CREATE OR REPLACE FUNCTION public.kondisi_tiang_periksa(p_setelah UUID DEFAULT NULL, p_jumlah INT DEFAULT 2000)
RETURNS TABLE (selisih INT, terakhir UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ids UUID[]; beda UUID[];
BEGIN
  SELECT array_agg(s.id ORDER BY s.id) INTO ids
  FROM (SELECT t.id FROM public.tiang t
        WHERE p_setelah IS NULL OR t.id > p_setelah
        ORDER BY t.id LIMIT p_jumlah) s;
  IF ids IS NULL THEN
    RETURN QUERY SELECT 0, NULL::uuid; RETURN;
  END IF;

  SELECT array_agg(DISTINCT x.tiang_id) INTO beda FROM (
    (SELECT * FROM public._kondisi_tiang_hitung(ids)
     EXCEPT
     SELECT k.tiang_id, k.item_kode, k.bagian, k.sirkit_segmen_id, k.nilai, k.nilai_angka, k.catatan,
            k.foto_url, k.inspeksi_id, k.penyulang, k.ulp, k.tier, k.tgl
     FROM public.kondisi_tiang_terakhir k WHERE k.tiang_id = ANY (ids))
    UNION ALL
    (SELECT k.tiang_id, k.item_kode, k.bagian, k.sirkit_segmen_id, k.nilai, k.nilai_angka, k.catatan,
            k.foto_url, k.inspeksi_id, k.penyulang, k.ulp, k.tier, k.tgl
     FROM public.kondisi_tiang_terakhir k WHERE k.tiang_id = ANY (ids)
     EXCEPT
     SELECT * FROM public._kondisi_tiang_hitung(ids))
  ) x;

  PERFORM public._segarkan_kondisi_tiang(beda);
  RETURN QUERY SELECT COALESCE(cardinality(beda), 0), ids[cardinality(ids)];
END $$;
REVOKE ALL ON FUNCTION public.kondisi_tiang_periksa(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kondisi_tiang_periksa(UUID, INT) TO service_role;


-- ── 5. Pengisian awal (per 2.000 tiang) ──────────────────────────────────────
DO $$
DECLARE r RECORD; dari UUID := NULL; total INT := 0;
BEGIN
  LOOP
    SELECT * INTO r FROM public.kondisi_tiang_periksa(dari, 2000);
    EXIT WHEN r.terakhir IS NULL;
    total := total + r.selisih;
    dari := r.terakhir;
  END LOOP;
  RAISE NOTICE 'pengisian awal: % tiang diisi', total;
END $$;


-- ── 6. View dibaca dari tabel — kolom, urutan, tipe SAMA dengan sebelumnya ───
CREATE OR REPLACE VIEW public.tiang_kondisi_terakhir AS
SELECT
  j.tiang_id,
  t.kode          AS tiang_kode,
  t.penyulang     AS pemilik,
  j.ulp,
  j.item_kode,
  i.nama          AS item_nama,
  i.kelompok,
  i.tampil_dashboard,
  j.bagian,
  j.sirkit_segmen_id,
  s.nama          AS sirkit_nama,
  s.penyulang     AS sirkit_penyulang,
  j.nilai,
  o.label         AS nilai_label,
  j.nilai_angka,
  j.catatan,
  j.foto_url,
  j.tgl,
  j.inspeksi_id,
  COALESCE(o.normal, true) AS normal
FROM public.kondisi_tiang_terakhir j
JOIN public.tiang t          ON t.id = j.tiang_id
JOIN public.jtm_item_ref i   ON i.kode = j.item_kode
LEFT JOIN public.jtm_opsi_ref o ON o.item_kode = j.item_kode AND o.kode = j.nilai
LEFT JOIN public.segmen s    ON s.id = j.sirkit_segmen_id;

COMMENT ON VIEW public.tiang_kondisi_terakhir IS
  'Jawaban terakhir per tiang × item × bagian × sirkit dari inspeksi JTM terverifikasi. Sejak 5 Nov 2026 dibaca dari tabel kondisi_tiang_terakhir (diperbarui pemicu; kondisi-tiang-ringkas.sql).';
GRANT SELECT ON public.tiang_kondisi_terakhir TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
-- Jumlah baris (≈ 419 ribu pada 4 Nov) dan selisih sepotong pertama (harus 0).
SELECT (SELECT count(*) FROM public.kondisi_tiang_terakhir) AS baris,
       (SELECT selisih FROM public.kondisi_tiang_periksa(NULL, 2000)) AS selisih_potong_pertama;


-- =============================================================================
-- KEMBALI KE CARA LAMA (bila perlu) — jalankan bagian ini saja:
-- -----------------------------------------------------------------------------
-- DROP TRIGGER IF EXISTS trg_kondisi_tiang_inspeksi       ON public.inspeksi_jtm;
-- DROP TRIGGER IF EXISTS trg_kondisi_tiang_titik_ubah     ON public.inspeksi_jtm_titik;
-- DROP TRIGGER IF EXISTS trg_kondisi_tiang_titik_hapus    ON public.inspeksi_jtm_titik;
-- DROP TRIGGER IF EXISTS trg_kondisi_tiang_periksa_tambah ON public.inspeksi_jtm_periksa;
-- DROP TRIGGER IF EXISTS trg_kondisi_tiang_periksa_ubah   ON public.inspeksi_jtm_periksa;
-- DROP TRIGGER IF EXISTS trg_kondisi_tiang_periksa_hapus  ON public.inspeksi_jtm_periksa;
-- CREATE OR REPLACE VIEW public.tiang_kondisi_terakhir AS
-- WITH jawaban AS (
--   SELECT tk.tiang_id, p.item_kode, p.bagian, p.sirkit_segmen_id, p.nilai, p.nilai_angka,
--          p.catatan, p.foto_url, m.id AS inspeksi_id, m.penyulang, m.ulp, m.tier,
--          COALESCE(m.tgl_selesai, m.verified_at, m.tgl_mulai) AS tgl,
--          row_number() OVER (PARTITION BY tk.tiang_id, p.item_kode, p.bagian,
--            COALESCE(p.sirkit_segmen_id, '00000000-0000-0000-0000-000000000000'::uuid)
--            ORDER BY COALESCE(m.tgl_selesai, m.verified_at, m.tgl_mulai) DESC, p.updated_at DESC) AS urut
--   FROM public.inspeksi_jtm_periksa p
--   JOIN public.inspeksi_jtm_titik tk ON tk.id = p.titik_id
--   JOIN public.inspeksi_jtm m ON m.id = tk.inspeksi_id
--   WHERE m.status = 'Diverifikasi' AND (p.nilai IS NOT NULL OR p.nilai_angka IS NOT NULL)
-- )
-- SELECT j.tiang_id, t.kode AS tiang_kode, t.penyulang AS pemilik, j.ulp, j.item_kode,
--        i.nama AS item_nama, i.kelompok, i.tampil_dashboard, j.bagian, j.sirkit_segmen_id,
--        s.nama AS sirkit_nama, s.penyulang AS sirkit_penyulang, j.nilai, o.label AS nilai_label,
--        j.nilai_angka, j.catatan, j.foto_url, j.tgl, j.inspeksi_id, COALESCE(o.normal, true) AS normal
-- FROM jawaban j
-- JOIN public.tiang t ON t.id = j.tiang_id
-- JOIN public.jtm_item_ref i ON i.kode = j.item_kode
-- LEFT JOIN public.jtm_opsi_ref o ON o.item_kode = j.item_kode AND o.kode = j.nilai
-- LEFT JOIN public.segmen s ON s.id = j.sirkit_segmen_id
-- WHERE j.urut = 1;
-- =============================================================================
