-- =============================================================================
-- JTM: nama penyulang dan prefiksnya tidak boleh kembar — di SELURUH database
-- Jalankan SESUDAH `jtm-penyulang-pengaturan.sql`. Idempoten.
--
-- ── KENAPA HARUS LINTAS ULP, BUKAN PER ULP ──────────────────────────────────
-- Nama tiang JTM tidak membawa keterangan unit: yang tertulis cuma
-- 'MTR-014'. Kalau dua penyulang di dua ULP sama-sama berprefiks MTR, maka
-- 'MTR-014' menunjuk dua batang beton yang berjauhan — dan itu baru ketahuan
-- saat ada regu yang dikirim ke tempat yang salah.
--
-- Hal yang sama berlaku untuk NAMA penyulang, karena nama itulah yang dipakai
-- `tiang.penyulang`, `segmen.penyulang`, dan tabel-tabel ML sebagai kunci —
-- tidak satu pun disertai kolom ULP.
--
-- ── YANG SUDAH ADA DAN YANG BELUM ───────────────────────────────────────────
--   SUDAH   `penyulang_kode_singkat_unik` — unik lintas ULP, tanpa memandang
--           besar-kecil huruf. Dibuat di `jtm-schema.sql`.
--   SUDAH   `penyulang_ref.penyulang` primary key — unik, TAPI peka
--           besar-kecil huruf: 'Mataram' dan 'MATARAM' bisa hidup berdampingan
--           sebagai dua penyulang berbeda.
--   BELUM   Penormalan saat menulis. `simpan_penyulang` memang menulis huruf
--           besar, tapi INSERT langsung lewat SQL Editor tidak melewatinya.
--
-- Berkas ini menutup dua yang terakhir.
-- =============================================================================

-- ── 1. Normalkan sebelum tersimpan ───────────────────────────────────────────
-- Penjaga di pintu masuk, bukan pembersihan berkala. Data yang dibersihkan
-- belakangan berarti ada rentang waktu — kadang berbulan — ketika angka dan
-- daftar di layar dihitung dari data yang belum rapi, dan tidak ada yang tahu
-- hasil mana yang terpengaruh.

CREATE OR REPLACE FUNCTION public.jaga_penyulang_ref()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.penyulang := upper(btrim(COALESCE(NEW.penyulang, '')));
  IF NEW.penyulang = '' THEN
    RAISE EXCEPTION 'Nama penyulang tidak boleh kosong';
  END IF;

  -- Spasi ganda di tengah nama tidak terlihat di layar tapi membuat
  -- 'BATU  DAWA' dan 'BATU DAWA' jadi dua penyulang berbeda — dan yang kedua
  -- tidak akan pernah cocok dengan tiang yang sudah tercatat di yang pertama.
  NEW.penyulang := regexp_replace(NEW.penyulang, '\s+', ' ', 'g');

  NEW.ulp := NULLIF(upper(btrim(COALESCE(NEW.ulp, ''))), '');
  NEW.kode_singkat := NULLIF(upper(btrim(COALESCE(NEW.kode_singkat, ''))), '');

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_jaga_penyulang_ref ON public.penyulang_ref;
CREATE TRIGGER trg_jaga_penyulang_ref
  BEFORE INSERT OR UPDATE ON public.penyulang_ref
  FOR EACH ROW EXECUTE FUNCTION public.jaga_penyulang_ref();


-- ── 2. Rapikan yang sudah telanjur masuk ─────────────────────────────────────
-- Dijalankan SEBELUM indeks unik dibuat: indeks akan menolak terbentuk kalau
-- masih ada kembar, dan pesannya tidak menyebutkan yang mana.
--
-- Cukup menyentuh barisnya — triggernya sendiri yang menormalkan. `WHERE`-nya
-- membatasi ke baris yang memang perlu, supaya tidak ada sentuhan tanpa guna.

UPDATE public.penyulang_ref
SET penyulang = penyulang
WHERE penyulang IS DISTINCT FROM regexp_replace(upper(btrim(penyulang)), '\s+', ' ', 'g')
   OR ulp IS DISTINCT FROM NULLIF(upper(btrim(COALESCE(ulp, ''))), '')
   OR kode_singkat IS DISTINCT FROM NULLIF(upper(btrim(COALESCE(kode_singkat, ''))), '');


-- ── 3. Unik tanpa memandang besar-kecil huruf ────────────────────────────────
-- Primary key `penyulang` sudah menjamin keunikan persis. Yang ditambahkan di
-- sini adalah keunikan yang mengabaikan besar-kecil huruf — supaya 'Mataram'
-- tidak bisa berdiri di sebelah 'MATARAM'.
--
-- Berdiri sendiri, tidak bergantung pada trigger di bagian 1: penjaga yang
-- cuma berupa trigger bisa dilewati oleh `ALTER TABLE ... DISABLE TRIGGER`,
-- sedangkan indeks unik tidak bisa dilewati siapa pun.

CREATE UNIQUE INDEX IF NOT EXISTS penyulang_ref_nama_unik
  ON public.penyulang_ref (upper(penyulang));

-- Yang ini sudah ada sejak `jtm-schema.sql`; disebut ulang supaya berkas ini
-- bisa dibaca sebagai keterangan lengkap tentang apa yang dijamin unik.
CREATE UNIQUE INDEX IF NOT EXISTS penyulang_kode_singkat_unik
  ON public.penyulang_ref (upper(kode_singkat)) WHERE kode_singkat IS NOT NULL;

COMMENT ON COLUMN public.penyulang_ref.penyulang IS
  'Nama penyulang, huruf besar, spasi tunggal. UNIK DI SELURUH DATABASE, bukan per ULP — dialah kunci yang dipakai tiang.penyulang, segmen.penyulang, dan tabel ML, dan tidak satu pun dari ketiganya menyertakan ULP.';


-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Keduanya HARUS kosong:
--      SELECT upper(penyulang), count(*) FROM penyulang_ref
--      GROUP BY 1 HAVING count(*) > 1;
--
--      SELECT upper(kode_singkat), count(*) FROM penyulang_ref
--      WHERE kode_singkat IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
--
-- b. Uji penjaganya hidup — ketiganya HARUS gagal:
--      INSERT INTO penyulang_ref (penyulang, ulp) VALUES ('  mataram ', 'AMPENAN');
--      INSERT INTO penyulang_ref (penyulang, ulp) VALUES ('', 'AMPENAN');
--      UPDATE penyulang_ref SET kode_singkat = (SELECT kode_singkat FROM penyulang_ref
--        WHERE kode_singkat IS NOT NULL LIMIT 1)
--      WHERE penyulang = (SELECT penyulang FROM penyulang_ref
--        WHERE kode_singkat IS NULL LIMIT 1);
--
-- c. Penyulang yang belum berprefiks — dibuat sistem saat tiang pertama
--    dinamai, jadi tidak menghambat, tapi enak dilihat kalau sudah rapi:
--      SELECT ulp, count(*) FROM penyulang_ref
--      WHERE kode_singkat IS NULL GROUP BY ulp ORDER BY ulp;
-- =============================================================================
