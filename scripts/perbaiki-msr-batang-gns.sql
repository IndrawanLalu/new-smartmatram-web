-- ════════════════════════════════════════════════════════════════════════════
-- Perbaikan sekali jalan: batang GUNUNG SARI di GNS-003L003/L004 (22 Okt 2026)
-- ════════════════════════════════════════════════════════════════════════════
-- 21 Okt, untuk menghilangkan tanda "?" di MVTIC SHERATON, induk BATANG diganti:
--   GNS-003L004: GNS-003L003 → MSR-001
--   GNS-003L003: GNS-003L002 → GNS-003L004
-- Akibatnya GUNUNG SARI & AMPENAN putus di L002–L003 (GNS-003L004 dan
-- AMP-002L004 jadi "pangkal"), dan L005 dst. menggantung dari MSR-001.
--
-- Kenyataannya dua arah berlawanan di tiang yang sama:
--   GUNUNG SARI/AMPENAN: GNS-003 → L001 → L002 → L003 → L004 → L005 …
--   MVTIC SHERATON     : MSR-001 → L004 → L003 → L002 → L001 → GNS-003 …
-- Arah MVTIC sudah benar lewat induk per penyulang (MSR-003…006). Yang
-- dikembalikan di sini hanya batangnya, plus MSR-002 (di L004) yang selama ini
-- "ikut batang" ke MSR-001 kini dicatat tegas menyambung dari MSR-001.
-- Tanda "?" yang salah tafsir dibetulkan di web (useIndukLoncat, arah berlawanan).
--
-- Urutan penting (trg_tiang_cegah_lingkaran per baris): L003 dulu, baru L004.
-- Berhenti tanpa mengubah apa pun bila keadaannya sudah tidak seperti di atas.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  l002 UUID; l003 UUID; l004 UUID; msr1 UUID;
  ulp_ TEXT;
BEGIN
  SELECT id, ulp INTO l002, ulp_ FROM public.tiang
  WHERE kode = 'GNS-003L002' AND penyulang = 'GUNUNG SARI' AND status_hidup = 'aktif';
  SELECT id INTO l003 FROM public.tiang
  WHERE kode = 'GNS-003L003' AND penyulang = 'GUNUNG SARI' AND status_hidup = 'aktif';
  SELECT id INTO l004 FROM public.tiang
  WHERE kode = 'GNS-003L004' AND penyulang = 'GUNUNG SARI' AND status_hidup = 'aktif';
  SELECT id INTO msr1 FROM public.tiang
  WHERE kode = 'MSR-001' AND penyulang = 'MVTIC SHERATON' AND status_hidup = 'aktif';

  IF l002 IS NULL OR l003 IS NULL OR l004 IS NULL OR msr1 IS NULL THEN
    RAISE EXCEPTION 'Tiang tidak lengkap ditemukan — tidak ada yang diubah.';
  END IF;
  IF (SELECT induk_id FROM public.tiang WHERE id = l004) IS DISTINCT FROM msr1
     OR (SELECT induk_id FROM public.tiang WHERE id = l003) IS DISTINCT FROM l004 THEN
    RAISE EXCEPTION 'Induk batang L003/L004 sudah berubah sejak diperiksa — tidak ada yang diubah.';
  END IF;

  UPDATE public.tiang SET induk_id = l002, updated_at = now() WHERE id = l003;
  UPDATE public.tiang SET induk_id = l003, updated_at = now() WHERE id = l004;

  UPDATE public.tiang_kode_penyulang SET induk_id = msr1, updated_at = now()
  WHERE tiang_id = l004 AND penyulang = 'MVTIC SHERATON';

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_nama)
  VALUES
    ('tiang', 'GNS-003L003', COALESCE(ulp_, '-'), 'induk_id', to_jsonb('GNS-003L004'::text), to_jsonb('GNS-003L002'::text),
     'koreksi_meja', 'SQL perbaiki-msr-batang-gns (batang GUNUNG SARI dikembalikan)'),
    ('tiang', 'GNS-003L004', COALESCE(ulp_, '-'), 'induk_id', to_jsonb('MSR-001'::text), to_jsonb('GNS-003L003'::text),
     'koreksi_meja', 'SQL perbaiki-msr-batang-gns (batang GUNUNG SARI dikembalikan)'),
    ('tiang', 'MSR-002', COALESCE(ulp_, '-'), 'induk_penyulang',
     jsonb_build_object('induk', NULL, 'penyulang', 'MVTIC SHERATON'),
     jsonb_build_object('induk', 'MSR-001', 'penyulang', 'MVTIC SHERATON', 'lewat', 'sql'),
     'koreksi_meja', 'SQL perbaiki-msr-batang-gns (arah MVTIC dipertahankan)');

  RAISE NOTICE 'Selesai: GNS-003L003 → GNS-003L002, GNS-003L004 → GNS-003L003, MSR-002 di MVTIC → MSR-001.';
END $$;

-- Periksa (pangkal harus false untuk GNS-003L004 & AMP-002L004, true untuk MSR-001):
--   SELECT kode, induk_kelompok, pangkal FROM public.peta_tiang
--   WHERE kode IN ('GNS-003L004', 'AMP-002L004', 'MSR-001', 'MSR-002');
