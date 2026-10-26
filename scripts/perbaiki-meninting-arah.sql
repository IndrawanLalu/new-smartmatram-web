-- =============================================================================
-- Perbaikan data MENINTING — arah ruas yang menumpang di batang AMPENAN (26 Okt 2026)
-- Sekali jalan. Aman diulang (hasilnya sama).
--
-- Kasus: regu menyusuri MENINTING MEN-071 → MEN-074 → MEN-073 → AMP-002R079L019
-- → L017 → … → L003 (22 Okt), berlawanan arah batang AMPENAN (L003 → … → L023).
-- Asal regu ditolak server ("asal di hilir batang"), sehingga induk MENINTING
-- tiap tiang naik lewat batang AMPENAN sampai MEN-055 → 15 cabang bertumpuk
-- MEN-055RRRR001 … MEN-055 + 18 R + 001.
--
-- Di sini: induk KHUSUS MENINTING (tiang_kode_penyulang.induk_id) diisi
-- mengikuti urutan jalan regu — sama seperti tombol "Induk di MENINTING" di
-- /peta, 17 kali. Batang AMPENAN, nama, segmen TIDAK disentuh. L003R001 di
-- MENINTING ditandai lurus (satu-satunya lanjutan L003).
--
-- Sesudahnya di /peta: klik MEN-071 → Ganti nama (hilir ikut), nama tetap
-- MEN-071 → pratinjau → Terapkan. Seluruh ruas ikut dinamai ulang sekaligus.
-- =============================================================================

DO $$
DECLARE
  -- (tiang, induknya di MENINTING) — urut dari hulu
  pasangan TEXT[][] := ARRAY[
    ['MEN-074',                         'MEN-071'],
    ['MEN-073',                         'MEN-074'],
    ['MEN-055RRRR001',                  'MEN-073'],
    ['MEN-055RRRRR001',                 'MEN-055RRRR001'],
    ['MEN-055RRRRRR001',                'MEN-055RRRRR001'],
    ['MEN-055RRRRRRR001',               'MEN-055RRRRRR001'],
    ['MEN-055RRRRRRRR001',              'MEN-055RRRRRRR001'],
    ['MEN-055RRRRRRRRR001',             'MEN-055RRRRRRRR001'],
    ['MEN-055RRRRRRRRRR001',            'MEN-055RRRRRRRRR001'],
    ['MEN-055RRRRRRRRRRR001',           'MEN-055RRRRRRRRRR001'],
    ['MEN-055RRRRRRRRRRRR001',          'MEN-055RRRRRRRRRRR001'],
    ['MEN-055RRRRRRRRRRRRR001',         'MEN-055RRRRRRRRRRRR001'],
    ['MEN-055RRRRRRRRRRRRRR001',        'MEN-055RRRRRRRRRRRRR001'],
    ['MEN-055RRRRRRRRRRRRRRR001',       'MEN-055RRRRRRRRRRRRRR001'],
    ['MEN-055RRRRRRRRRRRRRRRR001',      'MEN-055RRRRRRRRRRRRRRR001'],
    ['MEN-055RRRRRRRRRRRRRRRRR001',     'MEN-055RRRRRRRRRRRRRRRR001'],
    ['MEN-055RRRRRRRRRRRRRRRRRR001',    'MEN-055RRRRRRRRRRRRRRRRR001']
  ];
  i      INT;
  a      RECORD;
  ind    RECORD;
  lama   TEXT;
  naik   UUID;
  n      INT;
BEGIN
  FOR i IN 1 .. array_length(pasangan, 1) LOOP
    SELECT kp.* INTO a FROM public.tiang_kode_penyulang kp
     WHERE kp.penyulang = 'MENINTING' AND upper(kp.kode) = pasangan[i][1];
    IF NOT FOUND THEN RAISE EXCEPTION 'Tiang % tidak ditemukan di MENINTING — sudah diganti namanya?', pasangan[i][1]; END IF;
    IF a.utama THEN RAISE EXCEPTION '% milik batang MENINTING, bukan tumpangan', a.kode; END IF;
    SELECT kp.* INTO ind FROM public.tiang_kode_penyulang kp
     WHERE kp.penyulang = 'MENINTING' AND upper(kp.kode) = pasangan[i][2];
    IF NOT FOUND THEN RAISE EXCEPTION 'Induk % tidak ditemukan di MENINTING', pasangan[i][2]; END IF;
    CONTINUE WHEN a.induk_id IS NOT DISTINCT FROM ind.tiang_id;

    SELECT k.kode INTO lama FROM public.tiang_kode_penyulang k
     WHERE k.tiang_id = a.induk_id AND k.penyulang = 'MENINTING';
    UPDATE public.tiang_kode_penyulang SET induk_id = ind.tiang_id, updated_at = now()
     WHERE tiang_id = a.tiang_id AND penyulang = 'MENINTING';
    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', a.kode, COALESCE(a.ulp, '-'), 'induk_penyulang',
            jsonb_build_object('penyulang', 'MENINTING', 'induk', lama),
            jsonb_build_object('penyulang', 'MENINTING', 'induk', ind.kode, 'lewat', 'perbaikan arah 26 Okt'),
            'sunting_admin', NULL, 'Perbaikan data (SQL)');
  END LOOP;

  -- L003R001 bertanda cabang (dibaca dari nama lamanya). Di MENINTING ia satu-
  -- satunya lanjutan L003 sesudah arahnya dibetulkan → lurus, bukan cabang.
  UPDATE public.tiang_kode_penyulang SET cabang = false, updated_at = now()
   WHERE penyulang = 'MENINTING' AND upper(kode) = 'MEN-055RRRRRRRRRRRRRRRRRR001R001'
     AND cabang IS DISTINCT FROM false;

  -- Tidak boleh melingkar: dari ujung ruas naik sampai pangkal MENINTING.
  SELECT tiang_id INTO naik FROM public.tiang_kode_penyulang
   WHERE penyulang = 'MENINTING' AND upper(kode) = 'MEN-055RRRRRRRRRRRRRRRRRR001';
  n := 0;
  WHILE naik IS NOT NULL LOOP
    n := n + 1;
    IF n > 1000 THEN RAISE EXCEPTION 'Jaringan MENINTING melingkar — dibatalkan'; END IF;
    naik := public.jtm_induk_di_penyulang(naik, 'MENINTING');
  END LOOP;
  RAISE NOTICE 'MENINTING: ujung ruas berjarak % tiang dari pangkal', n;
END $$;
