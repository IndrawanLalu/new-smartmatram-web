-- =============================================================================
-- Fase 1.1c — Koreksi data tiang yang sudah tersimpan
-- Jalankan SESUDAH `jtr-penamaan.sql` dan `master-usulan-schema.sql`. Idempoten.
-- Boleh dijalankan sebelum atau sesudah `jtr-atribut-tiang.sql` — keduanya tidak
-- lagi mendefinisikan fungsi yang sama.
--
-- Salah isi di lapangan itu wajar: tinggi tiang tertulis 9 padahal 11, ukuran
-- kabel 50 padahal 70. Yang tidak wajar adalah tidak ada cara membetulkannya,
-- karena akibatnya petugas berhenti melapor apa adanya dan mulai menebak yang
-- "aman".
--
-- Dua hal yang dijaga:
--
--   1. NAMA TIANG TIDAK IKUT BERUBAH, walau titiknya digeser. Nama itu
--      identitas, bukan keterangan — begitu ikut berubah, temuan yang menunjuk
--      tiang itu jadi menunjuk ke nama yang sudah tidak ada, dan nomor yang
--      sudah tertulis di tiang jadi salah.
--
--   2. SETIAP PERUBAHAN MENINGGALKAN JEJAK, satu baris audit per field yang
--      benar-benar berubah. Perubahan dan jejaknya ditulis dalam satu fungsi
--      supaya tidak pernah terpisah.
-- =============================================================================

-- ── 1. Koreksi atribut & titik tiang ─────────────────────────────────────────
-- Fungsi `koreksi_tiang()` TIDAK didefinisikan di sini lagi.
--
-- Versi lengkapnya — yang juga menerima atribut lapangan (aksesoris, arde,
-- stay, rawan ROW, jamperan) — ada di `jtr-atribut-tiang.sql`. Dua definisi
-- dengan jumlah parameter berbeda akan hidup berdampingan sebagai dua overload,
-- dan PostgREST bisa memanggil yang salah. Satu fungsi, satu tempat.

-- ── 2. Batalkan tiang yang salah dimasukkan ──────────────────────────────────
-- SENGAJA dibedakan dari 'dibongkar'. Dibongkar berarti tiangnya memang pernah
-- berdiri lalu dicabut — itu sejarah yang benar, dan rekap periode lalu yang
-- menghitungnya tetap sah. Salah input berarti tiangnya TIDAK PERNAH ADA;
-- menyimpannya sebagai 'dibongkar' sama dengan mengarang riwayat.
--
-- Barisnya tidak dihapus supaya tetap terlihat bahwa pernah ada kekeliruan di
-- situ, dan siapa yang membuat serta siapa yang membatalkan.

ALTER TABLE public.tiang DROP CONSTRAINT IF EXISTS tiang_status_hidup_valid;
ALTER TABLE public.tiang ADD CONSTRAINT tiang_status_hidup_valid
  CHECK (status_hidup IN ('usulan', 'aktif', 'diganti', 'dibongkar', 'batal'));

COMMENT ON COLUMN public.tiang.status_hidup IS
  'usulan | aktif | diganti | dibongkar | batal. "dibongkar" = pernah ada lalu dicabut (sejarah benar). "batal" = salah input, tidak pernah ada.';

CREATE OR REPLACE FUNCTION public.batalkan_tiang(
  p_id     UUID,
  p_nama   TEXT DEFAULT NULL,
  p_alasan TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t   RECORD;
  jml INT;
BEGIN
  SELECT * INTO t FROM public.tiang WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang tidak ditemukan'; END IF;

  SELECT count(*) INTO jml
  FROM public.tiang WHERE induk_id = p_id AND status_hidup = 'aktif';

  IF jml > 0 THEN
    RAISE EXCEPTION
      'Tiang % masih menyuplai % tiang. Pindahkan dulu sambungannya ke tiang lain.',
      t.kode, jml;
  END IF;

  UPDATE public.tiang
  SET status_hidup = 'batal', aktif_sampai = CURRENT_DATE, catatan = COALESCE(p_alasan, catatan)
  WHERE id = p_id;

  INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', t.kode, t.ulp, 'status_hidup',
          to_jsonb(t.status_hidup), to_jsonb('batal'::text),
          'batal_salah_input', auth.uid(), p_nama);
END $$;

-- ── 3. Pindahkan sambungan ke induk lain ─────────────────────────────────────
-- Trigger pencegah lingkaran yang sudah ada tetap berlaku; di sini yang
-- ditambahkan cuma jejaknya.

CREATE OR REPLACE FUNCTION public.pindah_induk_tiang(
  p_id       UUID,
  p_induk_id UUID,
  p_nama     TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t     RECORD;
  lama  TEXT;
  baru  TEXT;
BEGIN
  SELECT * INTO t FROM public.tiang WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang tidak ditemukan'; END IF;

  SELECT kode INTO lama FROM public.tiang WHERE id = t.induk_id;
  SELECT kode INTO baru FROM public.tiang WHERE id = p_induk_id;

  UPDATE public.tiang SET induk_id = p_induk_id, updated_at = now() WHERE id = p_id;

  INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', t.kode, t.ulp, 'induk',
          to_jsonb(COALESCE(lama, '(gardu)')), to_jsonb(COALESCE(baru, '(gardu)')),
          'koreksi_lapangan', auth.uid(), p_nama);
END $$;

-- ── 4. (dihapus) Kabel per jurusan ───────────────────────────────────────────
-- Dulu di sini ada `set_kabel_jurusan()`, yang berangkat dari anggapan keliru
-- bahwa satu ukuran kabel berlaku sepanjang jurusan. Ternyata tiap tiang punya
-- konduktornya sendiri dan ukurannya mengecil menuju ujung jalur, jadi fungsinya
-- digantikan `set_konduktor_tiang()` di `jtr-atribut-tiang.sql`.
--
-- Definisinya dibuang dari berkas ini, bukan sekadar tidak dipakai: selama masih
-- tertulis, menjalankan ulang skrip ini akan menghidupkannya kembali.
--
-- Ikut dihapus dari database kalau kebetulan sudah terlanjur ada, supaya
-- urutan menjalankan skrip tidak menentukan hasil akhirnya.
DROP FUNCTION IF EXISTS public.set_kabel_jurusan(TEXT, TEXT, TEXT, TEXT, TEXT, INT);

GRANT EXECUTE ON FUNCTION public.batalkan_tiang       TO authenticated;
GRANT EXECUTE ON FUNCTION public.pindah_induk_tiang   TO authenticated;

-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Riwayat koreksi satu tiang:
--      SELECT pada, field, nilai_lama, nilai_baru, oleh_nama
--      FROM master_audit WHERE entitas='tiang' AND entitas_kode='AM001-A2'
--      ORDER BY pada DESC;
--
-- b. Tiang yang dibatalkan karena salah input:
--      SELECT kode, catatan FROM tiang WHERE status_hidup='batal';
--
-- c. Panjang rute vs penghantar:
--      SELECT * FROM gardu_jtr_panjang ORDER BY panjang_rute_km DESC;
-- =============================================================================
