-- ════════════════════════════════════════════════════════════════════════════
-- Inspeksi JTM Tier 2 = inspeksi malam di tiang yang sudah ada (21 Okt 2026)
-- Rencana: rencana-jtm-tier2-malam.md. Jalankan SEBELUM OTA HP. Idempoten.
-- ════════════════════════════════════════════════════════════════════════════
-- Keputusan user 21 Okt:
--   • WO / inspeksi Tier 2 hanya untuk segmen yang Tier 1-nya DIVERIFIKASI.
--   • Tier 2 tidak menitik: tidak ada tiang baru (rintis, tambah, sisip).
--   • Isian Tier 2 ringkas (pemeriksaan malam), tetap diatur di Pengaturan;
--     item mana ikut Tier 1 / Tier 2 diatur di Pengaturan (kolom `tier`).
--   • Semua tiang wajib dinilai; batas jarak tetap berlaku (tidak diubah).
--
--   1. Isian: item '12' → '1'; item khusus Tier 2 lama dinonaktifkan; enam item
--      "Pemeriksaan malam" Tier 2.
--   2. jtm_settings: ambang ΔT (saran kategori temuan di HP).
--   3. Penjaga lewat PEMICU — fungsi besar (kirim_tiang_jtm, rintis_segmen_jtm,
--      terbitkan_wo_inspeksi_jtm) TIDAK disalin ulang:
--        a. inspeksi_jtm  BEFORE INSERT  tier 2 → segmen wajib Tier 1 Diverifikasi
--           (menutup rintis Tier 2: segmen rintisan belum punya Tier 1).
--        b. inspeksi_jtm_titik BEFORE INSERT  tier 2 → tiang tidak boleh dibuat
--           di transaksi yang sama (= tiang baru dari kiriman HP).
--        c. wo_inspeksi_item BEFORE INSERT  tier 2 → segmen wajib Tier 1 Diverifikasi.
--   4. jtm_segmen_dititik(ulp) — daftar segmen yang boleh Tier 2 (HP & web).
--
-- Inspeksi Tier 2 yang SUDAH berjalan tidak disentuh (pemicu hanya INSERT);
-- tiang yang sudah ada tetap bisa dinilai, tiang baru ditolak.
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1. Isian ─────────────────────────────────────────────────────────────────
-- Semua item yang dulu ditanyakan di kedua tier kini Tier 1 saja. Admin bisa
-- mengembalikannya ke Tier 2 dari Pengaturan (tombol tier per item).
-- Penanda "sudah dijalankan": item hasil_malam belum ada → baru boleh memindah,
-- supaya menjalankan ulang skrip ini tidak menimpa pilihan admin.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.jtm_item_ref WHERE kode = 'hasil_malam') THEN
    UPDATE public.jtm_item_ref SET tier = '1', updated_at = now() WHERE tier = '12';
    UPDATE public.jtm_item_ref SET aktif = false, updated_at = now()
    WHERE tier = '2' AND kode IN ('andongan', 'baut_mur', 'suhu_sambungan', 'nilai_pentanahan');
  END IF;
END $$;

-- Syarat bertingkat dilarang (jaga_jtm_syarat), jadi semua item bergantung
-- langsung pada "Hasil pemeriksaan". Pemeriksa syarat juga menuntut pilihan
-- penentunya sudah ada → item dulu tanpa syarat, lalu pilihan, lalu syarat.
INSERT INTO public.jtm_item_ref
  (kode, nama, kelompok, dimensi, tipe, satuan, tier, milik, wajib, urutan, aktif, keterangan)
VALUES
  ('hasil_malam',      'Hasil pemeriksaan',    'Pemeriksaan malam', 'tunggal', 'pilihan', NULL, '2', 'tiang', true,  300, true, NULL),
  ('titik_panas',      'Titik panas di',       'Pemeriksaan malam', 'tunggal', 'pilihan', NULL, '2', 'tiang', true,  310, true, NULL),
  ('suhu_titik_panas', 'Suhu titik panas',     'Pemeriksaan malam', 'tunggal', 'angka',   '°C', '2', 'tiang', true,  320, true, NULL),
  ('suhu_pembanding',  'Suhu pembanding',      'Pemeriksaan malam', 'tunggal', 'angka',   '°C', '2', 'tiang', false, 330, true,
   'Suhu fasa lain yang normal di tiang yang sama. ΔT = suhu titik panas − suhu pembanding.'),
  ('suara',            'Suara',                'Pemeriksaan malam', 'tunggal', 'pilihan', NULL, '2', 'tiang', true,  340, true, NULL),
  ('flashover',        'Flashover / percikan', 'Pemeriksaan malam', 'tunggal', 'pilihan', NULL, '2', 'tiang', true,  350, true, NULL)
ON CONFLICT (kode) DO NOTHING;

-- "Ada titik panas" dan "Kelainan lain" bertanda temuan: satu temuan per tiang,
-- foto wajib, regu memilih kategori (HP menyarankan dari ΔT). Rincian lain
-- (lokasi, suara, flashover) = keterangan temuan itu, bukan temuan tersendiri.
INSERT INTO public.jtm_opsi_ref (item_kode, kode, label, normal, urutan, aktif)
VALUES
  ('hasil_malam', 'normal',      'Normal',                           true,  10, true),
  ('hasil_malam', 'titik_panas', 'Ada titik panas',                  false, 20, true),
  ('hasil_malam', 'kelainan',    'Kelainan lain (suara / flashover)', false, 30, true),
  ('titik_panas', 'isolator',    'Isolator',                         true,  10, true),
  ('titik_panas', 'jumperan',    'Jumperan / sambungan',             true,  20, true),
  ('titik_panas', 'peralatan',   'Peralatan (FCO, LBS, recloser)',   true,  30, true),
  ('titik_panas', 'arrester',    'Arrester',                         true,  40, true),
  ('suara',       'tidak_ada',   'Tidak ada',                        true,  10, true),
  ('suara',       'desis',       'Desis (korona)',                   true,  20, true),
  ('suara',       'dengung',     'Dengung',                          true,  30, true),
  ('suara',       'letupan',     'Letupan',                          true,  40, true),
  ('flashover',   'tidak',       'Tidak terlihat',                   true,  10, true),
  ('flashover',   'terlihat',    'Terlihat',                         true,  20, true)
ON CONFLICT (item_kode, kode) DO NOTHING;

UPDATE public.jtm_item_ref SET syarat_item = 'hasil_malam', syarat_nilai = ARRAY['titik_panas'], syarat_negasi = false
WHERE kode IN ('titik_panas', 'suhu_titik_panas', 'suhu_pembanding') AND syarat_item IS NULL;
UPDATE public.jtm_item_ref SET syarat_item = 'hasil_malam', syarat_nilai = ARRAY['titik_panas', 'kelainan'], syarat_negasi = false
WHERE kode IN ('suara', 'flashover') AND syarat_item IS NULL;


-- ── 2. Ambang ΔT ─────────────────────────────────────────────────────────────
-- Saran kategori di HP: ΔT ≥ biasa → Biasa, ≥ rawan → Rawan, ≥ urgent → Urgent;
-- di bawah ambang Biasa tidak ada saran. Flashover terlihat = saran Urgent.
ALTER TABLE public.jtm_settings ADD COLUMN IF NOT EXISTS dt_biasa  NUMERIC(5,1) NOT NULL DEFAULT 10;
ALTER TABLE public.jtm_settings ADD COLUMN IF NOT EXISTS dt_rawan  NUMERIC(5,1) NOT NULL DEFAULT 25;
ALTER TABLE public.jtm_settings ADD COLUMN IF NOT EXISTS dt_urgent NUMERIC(5,1) NOT NULL DEFAULT 40;
ALTER TABLE public.jtm_settings DROP CONSTRAINT IF EXISTS jtm_settings_dt_urut;
ALTER TABLE public.jtm_settings ADD CONSTRAINT jtm_settings_dt_urut
  CHECK (dt_biasa > 0 AND dt_biasa < dt_rawan AND dt_rawan < dt_urgent);
COMMENT ON COLUMN public.jtm_settings.dt_biasa IS
  'Ambang ΔT (°C) saran kategori temuan Tier 2: ≥ dt_biasa Biasa, ≥ dt_rawan Rawan, ≥ dt_urgent Urgent. Hanya saran — regu yang memilih.';
-- jtm_ambang() mengembalikan baris jtm_settings utuh → kolom baru ikut sendiri.


-- ── 3. Penjaga ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.jtm_sudah_dititik(p_segmen UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.inspeksi_jtm
                 WHERE segmen_id = p_segmen AND tier = '1' AND status = 'Diverifikasi')
$fn$;
COMMENT ON FUNCTION public.jtm_sudah_dititik(UUID) IS
  'Segmen sudah dititik = punya inspeksi Tier 1 Diverifikasi. Syarat inspeksi & WO Tier 2 (21 Okt 2026).';

-- a. Inspeksi Tier 2 baru
CREATE OR REPLACE FUNCTION public.jtm_tier2_wajib_dititik()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF NEW.tier = '2' AND NOT public.jtm_sudah_dititik(NEW.segmen_id) THEN
    RAISE EXCEPTION 'Inspeksi Tier 2 hanya untuk segmen yang Tier 1-nya sudah disetujui. Segmen ini belum dititik Tier 1 — kerjakan Tier 1 dulu (siang hari).';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_jtm_tier2_wajib_dititik ON public.inspeksi_jtm;
CREATE TRIGGER trg_jtm_tier2_wajib_dititik BEFORE INSERT ON public.inspeksi_jtm
  FOR EACH ROW EXECUTE FUNCTION public.jtm_tier2_wajib_dititik();

-- b. Tiang baru di inspeksi Tier 2. `tiang.created_at` bawaan now() = waktu
--    MULAI transaksi, jadi tiang yang dibuat kiriman ini persis sama dengan now().
CREATE OR REPLACE FUNCTION public.jtm_tier2_tanpa_tiang_baru()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM public.inspeksi_jtm WHERE id = NEW.inspeksi_id AND tier = '2')
     AND EXISTS (SELECT 1 FROM public.tiang WHERE id = NEW.tiang_id AND created_at = now()) THEN
    RAISE EXCEPTION 'Inspeksi Tier 2 hanya memakai tiang yang sudah ada — tiang baru tidak bisa ditambahkan. Titik tiang baru lewat inspeksi Tier 1.';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_jtm_tier2_tanpa_tiang_baru ON public.inspeksi_jtm_titik;
CREATE TRIGGER trg_jtm_tier2_tanpa_tiang_baru BEFORE INSERT ON public.inspeksi_jtm_titik
  FOR EACH ROW EXECUTE FUNCTION public.jtm_tier2_tanpa_tiang_baru();

-- c. Item WO Tier 2. Nama pemicu sengaja SESUDAH trg_wo_item_ikut_tier
--    (pemicu BEFORE berjalan urut abjad) supaya NEW.tier sudah terisi.
CREATE OR REPLACE FUNCTION public.wo_item_tier2_dititik()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF NEW.tier = '2' AND NEW.segmen_id IS NOT NULL AND NOT public.jtm_sudah_dititik(NEW.segmen_id) THEN
    RAISE EXCEPTION 'Segmen % belum dititik Tier 1 (belum ada Tier 1 yang disetujui) — tidak bisa masuk WO Tier 2.',
      COALESCE((SELECT nama FROM public.segmen WHERE id = NEW.segmen_id), NEW.segmen_id::text);
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_wo_item_tier2_dititik ON public.wo_inspeksi_item;
CREATE TRIGGER trg_wo_item_tier2_dititik BEFORE INSERT ON public.wo_inspeksi_item
  FOR EACH ROW EXECUTE FUNCTION public.wo_item_tier2_dititik();


-- ── 4. Daftar segmen yang sudah dititik ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.jtm_segmen_dititik(p_ulp TEXT DEFAULT NULL)
RETURNS TABLE (segmen_id UUID)
LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT DISTINCT m.segmen_id FROM public.inspeksi_jtm m
  WHERE m.tier = '1' AND m.status = 'Diverifikasi'
    AND (NULLIF(btrim(COALESCE(p_ulp, '')), '') IS NULL OR upper(m.ulp) = upper(p_ulp))
$fn$;
GRANT EXECUTE ON FUNCTION public.jtm_sudah_dititik(UUID)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.jtm_segmen_dititik(TEXT)  TO authenticated;

-- Periksa:
--   SELECT kode, nama, tier, aktif FROM jtm_item_ref ORDER BY urutan;
--   SELECT count(*) FROM jtm_segmen_dititik('AMPENAN');
