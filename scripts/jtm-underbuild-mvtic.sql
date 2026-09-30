-- =============================================================================
-- Inspeksi JTM: tiang underbuild diisi per kabel · MVTIC · posisi pohon ·
-- tekep "tidak ada" bukan temuan
-- Jalankan SESUDAH jtm-acuan/normal/syarat/temuan/master/temuan-tugas.sql dan
-- perabasan-pohon-belum-verifikasi.sql. Aman diulang.
--
-- ── KEPUTUSAN USER 30 SEP 2026 ──────────────────────────────────────────────
--   • Regu yang MENUMPANG (tiang underbuild) wajib mengisi Konstruksi,
--     Konduktor, Aksesoris (isolator/tekep/MVTIC), Sambungan, dan ROW.
--     Isian badan tiang (kondisi/jenis tiang, papan nomor, pengaman,
--     pentanahan, skur, peralatan, gardu) DISEMBUNYIKAN — urusan pemilik.
--   • Kabel MVTIC: konstruksinya SUSPENSION / FIXED / DEADEND / LA, bukan
--     A1–D1; aksesorisnya diperiksa kondisinya (misal lepas); isolator
--     disembunyikan.
--   • ROW buruk → ditanya posisi pohonnya: di atas / di bawah jaringan.
--   • Tekep isolator & tekep konduktor "Tidak ada" = BAIK, bukan temuan.
--
-- ── ARTI `milik` SEKARANG ───────────────────────────────────────────────────
--   'tiang'  = hanya penyulang pemilik batang yang mengisi; tersembunyi bagi
--              penumpang (diatur di HP).
--   'sirkit' = diisi TIAP penyulang untuk kabelnya sendiri, disimpan per kabel
--              (`sirkit_segmen_id` = segmen inspeksinya).
--
-- ── KENAPA DATA LAMA IKUT DIPINDAH (bagian 3) ───────────────────────────────
-- `tiang_kondisi_terakhir` memisahkan jawaban per kabel lewat
-- `sirkit_segmen_id`. Selama item milik kabel disimpan tanpa kolom itu, jawaban
-- pemilik dan penumpang bercampur: "aman" dari pemilik lalu "menyentuh" dari
-- penumpang membuat temuannya bolak-balik mengikuti siapa yang terakhir. Baris
-- lama diisi segmen inspeksinya sendiri, jadi satu aturan berlaku untuk semua.
-- =============================================================================


-- ── 1. Tekep "tidak ada" bukan temuan ────────────────────────────────────────

UPDATE public.jtm_opsi_ref SET normal = true
WHERE item_kode IN ('tekep_isolator', 'tekep_konduktor') AND kode = 'tidak';


-- ── 2. Siapa mengisi apa ─────────────────────────────────────────────────────

UPDATE public.jtm_item_ref SET milik = 'sirkit', updated_at = now()
WHERE kode IN (
  'konstruksi', 'kondisi_travers', 'baut_mur',           -- Konstruksi
  'jumperan',                                            -- penentu Sambungan
  'vegetasi', 'jenis_pohon', 'layangan', 'jarak_bangunan' -- ROW
);

-- Jenis konduktor ditanyakan PALING DULU sesudah badan tiang: dialah yang
-- menentukan apakah konstruksi A1–D1 + isolator, atau konstruksi & aksesoris
-- MVTIC. Syarat di HP dinilai dari jawaban yang sudah ada, dan "Tiang normal"
-- mengisi berurutan — penentu yang datang belakangan membuat keduanya buta.
UPDATE public.jtm_item_ref SET urutan = 14 WHERE kode = 'jenis_konduktor';
UPDATE public.jtm_item_ref SET urutan = 15 WHERE kode = 'ukuran_konduktor';
UPDATE public.jtm_item_ref SET urutan = 16 WHERE kode = 'kondisi_konduktor';
UPDATE public.jtm_item_ref SET urutan = 17 WHERE kode = 'andongan';


-- ── 2b. MVTIC ────────────────────────────────────────────────────────────────

INSERT INTO public.jtm_item_ref
  (kode, nama, kelompok, dimensi, tipe, tier, milik, wajib, urutan, aktif, tampil_dashboard,
   master_field, syarat_item, syarat_nilai, syarat_negasi)
VALUES
  ('konstruksi_mvtic', 'Konstruksi MVTIC', 'Konstruksi', 'tunggal', 'pilihan', '12', 'sirkit',
   true, 20, true, false, 'konstruksi', 'jenis_konduktor', ARRAY['mvtic'], false),
  ('kondisi_aksesoris_mvtic', 'Kondisi Aksesoris MVTIC', 'Aksesoris MVTIC', 'tunggal', 'pilihan', '12', 'sirkit',
   true, 34, true, false, NULL, 'jenis_konduktor', ARRAY['mvtic'], false)
ON CONFLICT (kode) DO NOTHING;

INSERT INTO public.jtm_opsi_ref (item_kode, kode, label, normal, urutan, aktif, dari_ref) VALUES
  ('konstruksi_mvtic', 'suspension', 'SUSPENSION', true, 10, true, false),
  ('konstruksi_mvtic', 'fixed',      'FIXED',      true, 20, true, false),
  ('konstruksi_mvtic', 'deadend',    'DEADEND',    true, 30, true, false),
  ('konstruksi_mvtic', 'la',         'LA',         true, 40, true, false),
  ('kondisi_aksesoris_mvtic', 'baik',  'Baik',  true,  10, true, false),
  ('kondisi_aksesoris_mvtic', 'lepas', 'Lepas', false, 20, true, false),
  ('kondisi_aksesoris_mvtic', 'rusak', 'Rusak', false, 30, true, false)
ON CONFLICT (item_kode, kode) DO NOTHING;

-- Konstruksi A1–D1 dan isolator hanya untuk kabel yang BUKAN MVTIC.
UPDATE public.jtm_item_ref
SET syarat_item = 'jenis_konduktor', syarat_nilai = ARRAY['mvtic'], syarat_negasi = true, updated_at = now()
WHERE kode IN ('konstruksi', 'jenis_isolator', 'bahan_isolator', 'kondisi_isolator', 'tekep_isolator');


-- ── 2c. ROW: posisi pohon ────────────────────────────────────────────────────
-- Dicatat NORMAL keduanya: temuannya sudah dihitung dari Vegetasi. Menandainya
-- temuan juga membuat satu pohon terhitung dua kali.

UPDATE public.jtm_item_ref SET urutan = 102 WHERE kode = 'layangan';
UPDATE public.jtm_item_ref SET urutan = 103 WHERE kode = 'jarak_bangunan';
UPDATE public.jtm_item_ref SET urutan = 104 WHERE kode = 'akses_regu';

INSERT INTO public.jtm_item_ref
  (kode, nama, kelompok, dimensi, tipe, tier, milik, wajib, urutan, aktif, tampil_dashboard,
   syarat_item, syarat_nilai, syarat_negasi)
VALUES
  ('posisi_pohon', 'Posisi pohon', 'ROW', 'tunggal', 'pilihan', '12', 'sirkit',
   true, 101, true, false, 'vegetasi', ARRAY['aman'], true)
ON CONFLICT (kode) DO NOTHING;

INSERT INTO public.jtm_opsi_ref (item_kode, kode, label, normal, urutan, aktif, dari_ref) VALUES
  ('posisi_pohon', 'atas',  'Di atas jaringan',  true, 10, true, false),
  ('posisi_pohon', 'bawah', 'Di bawah jaringan', true, 20, true, false)
ON CONFLICT (item_kode, kode) DO NOTHING;


-- ── 3. Jawaban lama milik kabel → disimpan per kabel ─────────────────────────

UPDATE public.inspeksi_jtm_periksa p
SET sirkit_segmen_id = m.segmen_id
FROM public.inspeksi_jtm_titik tk
JOIN public.inspeksi_jtm m ON m.id = tk.inspeksi_id
JOIN public.jtm_item_ref i ON true
WHERE tk.id = p.titik_id
  AND i.kode = p.item_kode
  AND i.milik = 'sirkit'
  AND p.sirkit_segmen_id IS NULL;

-- Tugas temuan yang sudah terbit menunjuk alamat lama (tanpa kabel). Diarahkan
-- ke kabel yang sekarang memegang temuannya, supaya tautannya tidak putus.
UPDATE public.inspeksi x
SET sumber_sirkit_id = (
  SELECT k.sirkit_segmen_id FROM public.tiang_kondisi_terakhir k
  WHERE k.tiang_id = x.sumber_tiang_id AND k.item_kode = x.sumber_item
    AND k.bagian = COALESCE(x.sumber_bagian, '-')
  ORDER BY k.tgl DESC LIMIT 1)
WHERE x.sumber_tiang_id IS NOT NULL
  AND x.sumber_sirkit_id IS NULL
  AND x.sumber_item IN (SELECT kode FROM public.jtm_item_ref WHERE milik = 'sirkit');


-- ── 4. Master hanya dikoreksi pemilik batang ─────────────────────────────────
-- Disalin dari `jtm-master.sql`; satu perubahan (★). Konstruksi kabel yang
-- menumpang BUKAN konstruksi tiangnya — tanpa penjaga ini jawaban penumpang
-- menimpa `tiang.konstruksi` milik pemilik.

CREATE OR REPLACE FUNCTION public.jtm_koreksi_master()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  it       RECORD;
  v_tiang  UUID;
  v_label  TEXT;
  v_kini   TEXT;
  v_gardu  TEXT;
  v_penyulang_inspeksi TEXT;
BEGIN
  IF NEW.nilai IS NULL THEN RETURN NEW; END IF;

  SELECT kode, master_field INTO it
  FROM public.jtm_item_ref WHERE kode = NEW.item_kode;
  IF it.master_field IS NULL THEN RETURN NEW; END IF;

  SELECT tk.tiang_id, m.penyulang INTO v_tiang, v_penyulang_inspeksi
  FROM public.inspeksi_jtm_titik tk
  JOIN public.inspeksi_jtm m ON m.id = tk.inspeksi_id
  WHERE tk.id = NEW.titik_id;
  IF v_tiang IS NULL THEN RETURN NEW; END IF;

  -- ★ Penumpang tidak mengoreksi master batang orang lain.
  IF NOT EXISTS (
    SELECT 1 FROM public.tiang
    WHERE id = v_tiang AND upper(COALESCE(penyulang, '')) = upper(COALESCE(v_penyulang_inspeksi, ''))
  ) THEN
    RETURN NEW;
  END IF;

  SELECT label INTO v_label
  FROM public.jtm_opsi_ref
  WHERE item_kode = NEW.item_kode AND kode = NEW.nilai;

  IF it.master_field = 'jenis' THEN
    UPDATE public.tiang SET jenis = COALESCE(v_label, NEW.nilai), updated_at = now()
    WHERE id = v_tiang;

  ELSIF it.master_field = 'konstruksi' THEN
    UPDATE public.tiang SET konstruksi = COALESCE(v_label, NEW.nilai), updated_at = now()
    WHERE id = v_tiang;

  ELSIF it.master_field = 'penanda' THEN
    SELECT penanda INTO v_kini FROM public.tiang WHERE id = v_tiang;

    IF it.kode = 'peralatan_hubung' THEN
      IF NEW.nilai = 'tidak_ada' THEN
        SELECT p2.nilai INTO v_gardu
        FROM public.inspeksi_jtm_periksa p2
        JOIN public.inspeksi_jtm_titik tk2 ON tk2.id = p2.titik_id
        WHERE tk2.tiang_id = v_tiang AND p2.item_kode = 'gardu' AND p2.nilai IS NOT NULL
        ORDER BY p2.updated_at DESC
        LIMIT 1;

        UPDATE public.tiang
        SET penanda = CASE WHEN COALESCE(v_gardu, 'tidak_ada') <> 'tidak_ada'
                           THEN 'gardu' ELSE NULL END,
            updated_at = now()
        WHERE id = v_tiang;
      ELSIF EXISTS (
        SELECT 1 FROM public.jtm_ref
        WHERE kategori = 'penanda' AND kode = NEW.nilai AND aktif
      ) THEN
        UPDATE public.tiang SET penanda = NEW.nilai, updated_at = now() WHERE id = v_tiang;
      END IF;

    ELSIF it.kode = 'gardu' THEN
      IF NEW.nilai = 'tidak_ada' THEN
        IF v_kini = 'gardu' THEN
          UPDATE public.tiang SET penanda = NULL, updated_at = now() WHERE id = v_tiang;
        END IF;
      ELSIF v_kini IS NULL OR v_kini = 'gardu' THEN
        UPDATE public.tiang SET penanda = 'gardu', updated_at = now() WHERE id = v_tiang;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END $$;


-- ── 5. Pohon untuk WO Perabasan: vegetasi kabel segmen itu sendiri ───────────
-- Disalin dari `perabasan-peta.sql` (definisi terakhir, berkolom foto_url &
-- catatan); perubahan ditandai ★. Kolom & urutannya HARUS sama persis —
-- CREATE OR REPLACE VIEW menolak kolom yang hilang.
-- Dulu jawaban vegetasi satu penyulang berlaku untuk SEMUA segmen yang lewat
-- tiang itu. Sekarang tiap kabel punya jawabannya sendiri; segmen yang belum
-- pernah menjawab untuk tiang itu masih memakai jawaban penyulang lain —
-- data lama tidak hilang.

CREATE OR REPLACE VIEW public.perabasan_pohon AS
WITH per_titik AS (
  SELECT
    tk.tiang_id,
    m.segmen_id                                              AS kabel,   -- ★
    m.status                                                 AS status_inspeksi,
    COALESCE(m.tgl_selesai, m.tgl_mulai)                     AS tgl,
    max(p.nilai) FILTER (WHERE p.item_kode = 'vegetasi')     AS vegetasi,
    max(p.nilai) FILTER (WHERE p.item_kode = 'jenis_pohon')  AS jenis_pohon,
    max(p.foto_url) FILTER (WHERE p.item_kode = 'vegetasi')  AS foto_url,
    max(p.catatan)  FILTER (WHERE p.item_kode = 'vegetasi')  AS catatan,
    row_number() OVER (
      PARTITION BY tk.tiang_id, m.segmen_id                              -- ★
      ORDER BY COALESCE(m.tgl_selesai, m.tgl_mulai) DESC NULLS LAST, tk.id DESC
    )                                                        AS urut
  FROM public.inspeksi_jtm_titik tk
  JOIN public.inspeksi_jtm m         ON m.id = tk.inspeksi_id
  JOIN public.inspeksi_jtm_periksa p ON p.titik_id = tk.id
  WHERE p.item_kode IN ('vegetasi', 'jenis_pohon')
    AND m.status <> 'Dibatalkan'
  GROUP BY tk.tiang_id, m.segmen_id, tk.id, m.status, m.tgl_selesai, m.tgl_mulai
),
terkini AS (
  SELECT * FROM per_titik WHERE urut = 1
),
-- ★ Satu baris per (segmen, tiang): jawaban kabel segmen itu sendiri kalau ada,
--   kalau belum ada, jawaban penyulang lain yang paling baru.
pilih AS (
  SELECT DISTINCT ON (st.segmen_id, x.tiang_id)
    st.segmen_id, x.*
  FROM terkini x
  JOIN public.segmen_tiang st ON st.tiang_id = x.tiang_id
  ORDER BY st.segmen_id, x.tiang_id, (x.kabel = st.segmen_id) DESC, x.tgl DESC NULLS LAST
)
SELECT
  x.segmen_id,
  x.tiang_id,
  t.kode  AS tiang_kode,
  t.lat,
  t.lng,
  x.vegetasi,
  x.jenis_pohon,
  x.tgl   AS tgl_inspeksi,
  x.status_inspeksi,
  (x.status_inspeksi = 'Diverifikasi') AS terverifikasi,
  x.foto_url,
  x.catatan
FROM pilih x
JOIN public.tiang t ON t.id = x.tiang_id
WHERE x.vegetasi IN ('berpotensi', 'menyentuh');

COMMENT ON VIEW public.perabasan_pohon IS
  'Pohon yang menunggu dirabas per segmen, dari jawaban vegetasi inspeksi JTM KABEL SEGMEN ITU (jatuh ke penyulang lain bila kabelnya belum pernah menjawab), lengkap dengan foto dan koordinat tiangnya. Inspeksi yang belum diverifikasi ikut tampil, ditandai `terverifikasi`. Yang Dibatalkan tidak ikut.';

GRANT SELECT ON public.perabasan_pohon TO authenticated;


-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Tidak ada lagi jawaban milik kabel tanpa kabelnya (harus 0):
--      SELECT count(*) FROM inspeksi_jtm_periksa p JOIN jtm_item_ref i ON i.kode = p.item_kode
--      WHERE i.milik = 'sirkit' AND p.sirkit_segmen_id IS NULL;
--
-- b. Item MVTIC & posisi pohon:
--      SELECT kode, nama, kelompok, milik, syarat_item, syarat_nilai, syarat_negasi
--      FROM jtm_item_ref WHERE kode IN ('konstruksi','konstruksi_mvtic',
--        'kondisi_aksesoris_mvtic','posisi_pohon','tekep_isolator') ORDER BY urutan;
--
-- c. Pohon per segmen tidak kembar (harus 0 baris):
--      SELECT segmen_id, tiang_id, count(*) FROM perabasan_pohon GROUP BY 1,2 HAVING count(*) > 1;
-- =============================================================================
