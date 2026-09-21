-- =============================================================================
-- JTM: master penyulang bisa diurus dari web, dan prefiks yang benar-benar
--      menomori ulang tiang
-- Jalankan SESUDAH `jtm-nama-penuh.sql`. Idempoten.
--
-- ── KENAPA INI PERLU ────────────────────────────────────────────────────────
-- `penyulang_ref` menentukan penyulang mana yang bisa dirintis regu di HP
-- (`getPenyulang(ulp)`), dan sampai sekarang satu-satunya cara menambahnya
-- adalah lewat SQL Editor. Akibatnya nyata: ULP GERUNG cuma punya 3 penyulang
-- terdaftar sementara ULP lain belasan sampai puluhan, dan regu Gerung tidak
-- bisa merintis penyulang yang tidak ada di daftar — tanpa ada satu pun pesan
-- yang menerangkan kenapa.
--
-- ── ⚠ BUG YANG IKUT DIBETULKAN DI SINI ──────────────────────────────────────
-- `ubah_kode_singkat_penyulang` (dibuat di `jtm-schema.sql`) mengganti prefiks
-- di `tiang.kode` saja. Padahal sejak `jtm-nama.sql`, nama tiang hidup di DUA
-- tempat:
--
--     tiang.kode                 nama menurut penyulang PEMILIKnya
--     tiang_kode_penyulang.kode  nama di TIAP penyulang yang melewatinya
--
-- Trigger `jtm_cermin_kode_pemilik` memang menyalin `tiang.kode` ke baris
-- pemiliknya. Tapi baris untuk penyulang yang cuma MENUMPANG tidak ikut —
-- padahal baris itu memakai prefiks penyulang yang sedang diganti. Hasilnya
-- satu batang beton bernama 'MTR-014' di satu layar dan 'MATARAM-014' di layar
-- sebelah, dan tidak ada yang bisa memastikan mana yang benar.
-- =============================================================================

-- ── 1. Siapa yang memakai sebuah penyulang ───────────────────────────────────
-- Dipakai halaman Pengaturan untuk dua hal: menunjukkan berapa tiang yang akan
-- ikut berganti nama SEBELUM admin menekan tombol, dan menahan penghapusan
-- penyulang yang masih dipakai.

CREATE OR REPLACE VIEW public.penyulang_pakai AS
SELECT
  p.penyulang,
  p.ulp,
  p.kode_singkat,
  (SELECT count(*) FROM public.tiang t
    WHERE upper(COALESCE(t.penyulang, '')) = upper(p.penyulang)
      AND t.status_hidup = 'aktif')                               AS tiang_dimiliki,
  (SELECT count(*) FROM public.tiang_kode_penyulang k
    WHERE upper(k.penyulang) = upper(p.penyulang))                AS tiang_bernama,
  (SELECT count(*) FROM public.segmen s
    WHERE upper(COALESCE(s.penyulang, '')) = upper(p.penyulang))  AS segmen
FROM public.penyulang_ref p;

COMMENT ON VIEW public.penyulang_pakai IS
  'Master penyulang + berapa banyak yang akan terpengaruh kalau prefiksnya diganti. tiang_bernama menghitung SEMUA nama di penyulang itu, termasuk tiang milik penyulang lain yang cuma dilewati.';

GRANT SELECT ON public.penyulang_pakai TO authenticated;


-- ── 2. Ganti prefiks — sekarang menyentuh KEDUA tempat ───────────────────────
--
-- Versi lama mengembalikan INT (jumlah tiang saja). Yang baru mengembalikan
-- JSONB, karena satu angka tidak lagi cukup: ada DUA tabel yang dinomori ulang,
-- dan admin perlu tahu keduanya — kalau salah satunya nol padahal seharusnya
-- tidak, di situlah letak kesalahannya.
--
-- `CREATE OR REPLACE` tidak bisa mengganti tipe kembalian, jadi fungsinya
-- dibuang dulu. Tanda tangannya disebut lengkap supaya yang terbuang benar-benar
-- yang dimaksud. Tidak ada view atau trigger yang bergantung padanya —
-- `simpan_penyulang` di bagian 3 memang memanggilnya, tapi dia dibuat sesudah
-- ini di berkas yang sama.

DROP FUNCTION IF EXISTS public.ubah_kode_singkat_penyulang(TEXT, TEXT, TEXT);

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
  -- Nama milik penyulang ini diganti lebih dulu. Trigger `jtm_cermin_kode_pemilik`
  -- akan menyalinnya ke `tiang_kode_penyulang` baris pemilik.
  UPDATE public.tiang
  SET kode = regexp_replace(kode, '^[^-]+-', baru || '-'),
      updated_at = now()
  WHERE upper(COALESCE(penyulang, '')) = upper(p_penyulang)
    AND kode ~ '^[^-]+-';
  GET DIAGNOSTICS n_tiang = ROW_COUNT;

  -- INI YANG DULU TERLEWAT. Tiang milik penyulang LAIN yang dilewati penyulang
  -- ini juga punya nama berprefiks lama, dan trigger di atas tidak pernah
  -- menyentuhnya — dia cuma mengurus baris pemilik. Tanpa baris ini, satu
  -- batang beton bernama 'MTR-014' di satu layar dan 'MATARAM-014' di sebelah.
  --
  -- Aman dijalankan sesudah trigger: baris yang sudah berprefiks baru
  -- menghasilkan teks yang sama persis.
  UPDATE public.tiang_kode_penyulang
  SET kode = regexp_replace(kode, '^[^-]+-', baru || '-'),
      updated_at = now()
  WHERE upper(penyulang) = upper(p_penyulang)
    AND kode ~ '^[^-]+-';
  GET DIAGNOSTICS n_nama = ROW_COUNT;

  -- SATU baris audit untuk satu tindakan. Menulis satu baris per tiang tidak
  -- menambah apa pun yang bisa ditelusuri: perubahannya mekanis, dan yang
  -- perlu dijawab belakangan cuma "siapa mengganti prefiksnya, kapan".
  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('penyulang', upper(p_penyulang), COALESCE(unit, '-'), 'kode_singkat',
          to_jsonb(lama), to_jsonb(baru), 'sunting_admin', auth.uid(), p_oleh);

  RETURN jsonb_build_object('kode_lama', lama, 'kode_baru', baru,
                            'tiang', n_tiang, 'nama', n_nama, 'berubah', true);
END $$;


-- ── 3. Tambah / ubah penyulang ───────────────────────────────────────────────
-- Lewat fungsi, bukan dengan membuka tabelnya: yang perlu dijaga bukan sekadar
-- bentuk datanya, melainkan akibatnya pada tiang yang sudah bernama.
--
-- NAMA PENYULANG TIDAK BISA DIGANTI di sini, dan itu disengaja. Nama itu kunci
-- yang dipakai `tiang.penyulang`, `segmen.penyulang`, `tiang_kode_penyulang`,
-- dan tabel-tabel ML sekaligus — tidak satu pun berupa foreign key, jadi
-- menggantinya akan memutus semuanya diam-diam. Yang salah ketik dan belum
-- dipakai: hapus, lalu buat ulang.

CREATE OR REPLACE FUNCTION public.simpan_penyulang(
  p_penyulang    TEXT,
  p_ulp          TEXT,
  p_kode_singkat TEXT DEFAULT NULL,
  p_oleh         TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  nama  TEXT := upper(btrim(COALESCE(p_penyulang, '')));
  unit  TEXT := upper(btrim(COALESCE(p_ulp, '')));
  kode  TEXT := NULLIF(upper(btrim(COALESCE(p_kode_singkat, ''))), '');
  lama  RECORD;
  dipakai INT;
  hasil JSONB := '{}'::jsonb;
BEGIN
  IF nama = '' THEN RAISE EXCEPTION 'Nama penyulang tidak boleh kosong'; END IF;
  IF unit = '' THEN RAISE EXCEPTION 'ULP penyulang % belum diisi', nama; END IF;

  SELECT penyulang, ulp, kode_singkat INTO lama
  FROM public.penyulang_ref WHERE upper(penyulang) = nama;

  IF NOT FOUND THEN
    INSERT INTO public.penyulang_ref (penyulang, ulp) VALUES (nama, unit);
    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('penyulang', nama, unit, 'baru', NULL, to_jsonb(unit),
            'sunting_admin', auth.uid(), p_oleh);
    hasil := jsonb_build_object('baru', true);
  ELSE
    -- Memindahkan penyulang ke ULP lain sementara tiangnya sudah tercatat akan
    -- membuat tiang dan penyulangnya berbeda unit — dan penyapuan, rekap, serta
    -- hak akses per unit semuanya membacanya dari tempat yang berbeda-beda.
    IF upper(COALESCE(lama.ulp, '')) IS DISTINCT FROM unit THEN
      SELECT count(*) INTO dipakai FROM public.tiang
      WHERE upper(COALESCE(penyulang, '')) = nama AND status_hidup = 'aktif';
      IF dipakai > 0 THEN
        RAISE EXCEPTION
          'Penyulang % sudah punya % tiang di ULP %. Memindahkannya ke % akan membuat tiang dan penyulangnya beda unit.',
          nama, dipakai, lama.ulp, unit;
      END IF;

      UPDATE public.penyulang_ref SET ulp = unit WHERE upper(penyulang) = nama;
      INSERT INTO public.master_audit
        (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
      VALUES ('penyulang', nama, unit, 'ulp', to_jsonb(lama.ulp), to_jsonb(unit),
              'sunting_admin', auth.uid(), p_oleh);
      hasil := hasil || jsonb_build_object('ulp_pindah', true);
    END IF;
  END IF;

  -- Prefiks diurus fungsinya sendiri — dialah yang tahu cara menomori ulang.
  IF kode IS NOT NULL THEN
    hasil := hasil || jsonb_build_object(
      'prefiks', public.ubah_kode_singkat_penyulang(nama, kode, p_oleh));
  END IF;

  RETURN hasil;
END $$;


-- ── 4. Hapus penyulang ───────────────────────────────────────────────────────
-- Ditolak selama masih ada yang menunjuknya. Penyulang yang sudah punya tiang
-- tidak boleh hilang dari master: nama tiangnya akan tetap ada sementara
-- penyulangnya tidak, dan tidak ada satu pun layar yang bisa menerangkan
-- tiang itu milik siapa.

CREATE OR REPLACE FUNCTION public.hapus_penyulang(
  p_penyulang TEXT,
  p_oleh      TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  nama TEXT := upper(btrim(COALESCE(p_penyulang, '')));
  p    RECORD;
BEGIN
  SELECT * INTO p FROM public.penyulang_pakai WHERE upper(penyulang) = nama;
  IF NOT FOUND THEN RAISE EXCEPTION 'Penyulang % tidak ada di master', nama; END IF;

  IF p.tiang_dimiliki > 0 OR p.tiang_bernama > 0 OR p.segmen > 0 THEN
    RAISE EXCEPTION
      'Penyulang % masih dipakai: % tiang, % nama tiang, % segmen. Hapus hanya penyulang yang belum pernah dititik.',
      nama, p.tiang_dimiliki, p.tiang_bernama, p.segmen;
  END IF;

  DELETE FROM public.penyulang_ref WHERE upper(penyulang) = nama;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('penyulang', nama, COALESCE(p.ulp, '-'), 'hapus',
          to_jsonb(p.ulp), NULL, 'sunting_admin', auth.uid(), p_oleh);
END $$;


-- ── 5. Hak akses ─────────────────────────────────────────────────────────────
-- Tabelnya tetap hanya bisa DIBACA langsung. Semua perubahan lewat fungsi di
-- atas, supaya tidak ada jalan masuk yang melewatkan penomoran ulang maupun
-- jejak auditnya.

GRANT EXECUTE ON FUNCTION public.ubah_kode_singkat_penyulang TO authenticated;
GRANT EXECUTE ON FUNCTION public.simpan_penyulang            TO authenticated;
GRANT EXECUTE ON FUNCTION public.hapus_penyulang             TO authenticated;


-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Master penyulang per ULP, dan berapa yang belum berprefiks:
--      SELECT ulp, count(*) AS penyulang,
--             count(*) FILTER (WHERE kode_singkat IS NULL) AS belum_berprefiks
--      FROM penyulang_ref GROUP BY ulp ORDER BY ulp;
--
-- b. Penyulang yang sudah dipakai — inilah yang penomoran ulangnya berat:
--      SELECT penyulang, ulp, kode_singkat, tiang_dimiliki, tiang_bernama, segmen
--      FROM penyulang_pakai WHERE tiang_bernama > 0 ORDER BY tiang_bernama DESC;
--
-- c. Uji ganti prefiks (kembalikan lagi sesudahnya kalau cuma mencoba):
--      SELECT ubah_kode_singkat_penyulang('MATARAM', 'MTR', 'uji');
--
-- d. Dua tempat nama harus SEPAKAT — daftar ini wajib kosong:
--      SELECT t.kode AS kode_tiang, k.kode AS kode_penyulang, k.penyulang
--      FROM tiang t
--      JOIN tiang_kode_penyulang k
--        ON k.tiang_id = t.id AND upper(k.penyulang) = upper(t.penyulang)
--      WHERE t.kode <> k.kode;
-- =============================================================================
