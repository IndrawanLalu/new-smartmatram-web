-- scripts/jtm-prefiks-abaikan-batal.sql
--
-- TIANG BATAL TIDAK BOLEH HIDUP LAGI LEWAT GANTI PREFIKS.
--
-- Kejadian 30 Sep 2026: ganti prefiks AKAR-AKAR (KRK → AKAR) ditolak dengan
-- `duplicate key value violates unique constraint "tiang_kode_penyulang_unik"`,
-- padahal di layar tidak ada dua tiang bernama sama.
--
-- Rantainya:
--   1. `batalkan_tiang` MEMBUANG nama tiang di `tiang_kode_penyulang` supaya
--      nomornya (mis. KRK-001) bisa dipakai tiang yang benar — tapi `tiang.kode`
--      tiang batal itu tetap 'KRK-001' sebagai sejarah.
--   2. `ubah_kode_singkat_penyulang` mengganti prefiks SEMUA tiang penyulang
--      itu, termasuk yang batal → 'AKAR-001'.
--   3. Trigger `jtm_cermin_kode_pemilik` menyalin kode itu ke
--      `tiang_kode_penyulang` — menghidupkan lagi nama yang sudah dibuang.
--   4. Tiga tiang batal + satu tiang aktif sama-sama 'AKAR-001' → ditolak.
--
-- Perbaikannya dua lapis:
--   • ganti prefiks melewati tiang batal (namanya tetap nama lama = sejarah);
--   • trigger cermin tidak pernah menamai tiang batal, supaya jalur lain yang
--     menyentuh `tiang.kode`/`tiang.penyulang` (mis. ganti nama penyulang lewat
--     ON UPDATE CASCADE) juga tidak bisa menghidupkannya.
--
-- Prasyarat: jtm-nama.sql · jtm-penyulang-pengaturan.sql · batalkan-inspeksi.sql
-- Aman dijalankan berulang.


-- ── 1. Trigger cermin: tiang batal tidak bernama ─────────────────────────────

CREATE OR REPLACE FUNCTION public.jtm_cermin_kode_pemilik()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.penyulang IS NULL OR NEW.kode IS NULL OR NEW.gardu_kode IS NOT NULL
     OR NEW.status_hidup = 'batal' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.tiang_kode_penyulang (tiang_id, penyulang, ulp, kode, utama)
  VALUES (NEW.id, NEW.penyulang, COALESCE(NEW.ulp, '-'), NEW.kode, true)
  ON CONFLICT (tiang_id, penyulang) DO UPDATE
    SET kode = EXCLUDED.kode, utama = true, updated_at = now();

  RETURN NEW;
END $$;


-- ── 2. Ganti prefiks melewati tiang batal ────────────────────────────────────
-- Sama dengan versi di `jtm-penyulang-pengaturan.sql`, kecuali satu syarat
-- `status_hidup <> 'batal'` pada UPDATE tiang.

CREATE OR REPLACE FUNCTION public.ubah_kode_singkat_penyulang(
  p_penyulang TEXT,
  p_kode_baru TEXT,
  p_oleh      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lama    TEXT;
  baru    TEXT := upper(btrim(COALESCE(p_kode_baru, '')));
  unit    TEXT;
  n_tiang INT;
  n_nama  INT;
BEGIN
  IF baru !~ '^[A-Z][A-Z0-9]{1,5}$' THEN
    RAISE EXCEPTION 'Kode singkat "%" tidak sah. Dua sampai enam huruf/angka, diawali huruf.', p_kode_baru;
  END IF;

  SELECT kode_singkat, ulp INTO lama, unit FROM public.penyulang_ref
  WHERE upper(penyulang) = upper(p_penyulang);
  IF NOT FOUND THEN RAISE EXCEPTION 'Penyulang % tidak ada di master', p_penyulang; END IF;

  IF EXISTS (SELECT 1 FROM public.penyulang_ref
             WHERE upper(kode_singkat) = baru AND upper(penyulang) <> upper(p_penyulang)) THEN
    RAISE EXCEPTION 'Kode singkat % sudah dipakai penyulang lain', baru;
  END IF;

  IF lama IS NOT DISTINCT FROM baru THEN
    RETURN jsonb_build_object('kode_lama', lama, 'kode_baru', baru,
                              'tiang', 0, 'nama', 0, 'berubah', false);
  END IF;

  UPDATE public.penyulang_ref SET kode_singkat = baru
  WHERE upper(penyulang) = upper(p_penyulang);

  -- Prefiks = segala sesuatu sebelum tanda hubung PERTAMA. Cabang seperti
  -- 'MTR-005_B1' ikut berpindah tanpa disentuh bagian belakangnya.
  --
  -- Tiang BATAL dilewati: namanya sudah dibuang saat dibatalkan dan nomornya
  -- mungkin sudah dipakai tiang lain. Kodenya dibiarkan sebagai sejarah.
  UPDATE public.tiang
  SET kode = regexp_replace(kode, '^[^-]+-', baru || '-'),
      updated_at = now()
  WHERE upper(COALESCE(penyulang, '')) = upper(p_penyulang)
    AND status_hidup <> 'batal'
    AND kode ~ '^[^-]+-';
  GET DIAGNOSTICS n_tiang = ROW_COUNT;

  -- Tiang milik penyulang LAIN yang dilewati penyulang ini juga punya nama
  -- berprefiks lama; trigger di atas cuma mengurus baris pemilik.
  UPDATE public.tiang_kode_penyulang
  SET kode = regexp_replace(kode, '^[^-]+-', baru || '-'),
      updated_at = now()
  WHERE upper(penyulang) = upper(p_penyulang)
    AND kode ~ '^[^-]+-';
  GET DIAGNOSTICS n_nama = ROW_COUNT;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('penyulang', upper(p_penyulang), COALESCE(unit, '-'), 'kode_singkat',
          to_jsonb(lama), to_jsonb(baru), 'sunting_admin', auth.uid(), p_oleh);

  RETURN jsonb_build_object('kode_lama', lama, 'kode_baru', baru,
                            'tiang', n_tiang, 'nama', n_nama, 'berubah', true);
END $$;


-- ── 3. Bersihkan nama tiang batal yang sempat hidup lagi ─────────────────────
-- Kalau sebelum berkas ini ada jalur yang menghidupkan nama tiang batal (mis.
-- ganti nama penyulang), barisnya dibuang — sama seperti yang dilakukan
-- `batalkan_tiang`. Biasanya 0 baris.

DELETE FROM public.tiang_kode_penyulang k
USING public.tiang t
WHERE t.id = k.tiang_id AND t.status_hidup = 'batal';


-- ── Uji ──────────────────────────────────────────────────────────────────────
-- 1. Tidak ada tiang batal yang masih bernama (harus 0):
--      SELECT count(*) FROM tiang_kode_penyulang k
--      JOIN tiang t ON t.id = k.tiang_id WHERE t.status_hidup = 'batal';
-- 2. Ulangi ganti prefiks AKAR-AKAR → AKAR dari layar Master Penyulang.
