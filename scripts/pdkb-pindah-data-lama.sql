-- =============================================================================
-- Pindahkan pekerjaan PDKB lama dari Pemeliharaan Jaringan ke halaman PDKB
-- (24 Nov 2026). Jalankan SESUDAH pdkb.sql. Aman dijalankan ulang.
-- =============================================================================
-- Arahan user: catatan Pemeliharaan Jaringan yang pelaksananya PDKB pindah ke
-- halaman PDKB. Yang dipindah: catatan yang belum dibatalkan dengan
--   pelaksana diawali "PDKB" (Catat pekerjaan tim lain → PDKB / PDKB · nama tim)
--   ATAU petugas_nama memuat "PDKB".
--
-- Caranya (TIDAK menghapus, teknisaplikasi.md butir 12):
--   1. Salin ke pdkb_pekerjaan dengan id SAMA (jalan ulang = tidak dobel).
--   2. Catatan asalnya → Dibatalkan dengan keterangan "dipindah ke halaman
--      PDKB": keluar dari daftar & realisasi Pemeliharaan Jaringan.
--      ⚠ Realisasi Pemeliharaan Jaringan bulan-bulan itu BERKURANG sebanyak
--      catatan yang dipindah (memang begitu keputusannya: PDKB terpisah).
--   3. Catatan yang menutup tugas HARJAR: tugasnya ikut pindah ke PDKB
--      (eksekutor → PDKB) dan tetap Selesai, tertaut ke catatan PDKB-nya.
--
-- Tugas di `inspeksi` yang SUDAH ditugaskan ke PDKB tidak perlu dipindah —
-- tab Temuan Ditugaskan membacanya langsung (pdkb_tugas).
-- =============================================================================


-- ── 0. LIHAT DULU (hanya baca) — jalankan ini sendiri sebelum bagian 1 ───────
-- SELECT p.id, p.tgl, p.ulp, p.jenis, p.penyulang, p.pekerjaan, p.pelaksana, p.petugas_nama, p.status, p.inspeksi_id
-- FROM public.pemeliharaan_jaringan p
-- WHERE p.status <> 'Dibatalkan'
--   AND (p.pelaksana ILIKE 'PDKB%' OR p.petugas_nama ILIKE '%PDKB%')
-- ORDER BY p.tgl;
--
-- Tugas lama yang sudah ke PDKB (muncul langsung di halaman PDKB):
-- SELECT status, count(*) FROM public.pdkb_tugas GROUP BY 1;


-- ── 1. Pindahkan ─────────────────────────────────────────────────────────────
DO $pindah$
DECLARE
  r      RECORD;
  n      INT := 0;
  n_tgs  INT := 0;
BEGIN
  FOR r IN
    SELECT p.*, to_jsonb(p) AS j
    FROM public.pemeliharaan_jaringan p
    WHERE p.status <> 'Dibatalkan'
      AND (p.pelaksana ILIKE 'PDKB%' OR p.petugas_nama ILIKE '%PDKB%')
    FOR UPDATE
  LOOP
    INSERT INTO public.pdkb_pekerjaan
      (id, ulp, jenis, penyulang, gardu_kode, kategori, pekerjaan, alamat, lat, lng, tgl, pelaksana,
       foto_sebelum_url, foto_sesudah_url, foto_proses_url, catatan, inspeksi_id, diinput_oleh, created_at)
    VALUES
      (r.id, upper(r.ulp),
       CASE WHEN upper(r.jenis) IN ('JTM', 'JTR', 'GARDU') THEN upper(r.jenis) ELSE 'JTM' END,
       r.penyulang, NULLIF(r.j->>'gardu_kode', ''), r.kategori, r.pekerjaan, r.alamat, r.lat, r.lng, r.tgl,
       COALESCE(NULLIF(btrim(r.pelaksana), ''), NULLIF(btrim(r.petugas_nama), ''), 'PDKB'),
       r.foto_sebelum_url, r.foto_sesudah_url, NULLIF(r.j->>'foto_proses_url', ''),
       concat_ws(' · ', NULLIF(btrim(r.catatan), ''), 'dipindah dari Pemeliharaan Jaringan'),
       r.inspeksi_id::text,
       COALESCE(NULLIF(r.j->>'diinput_oleh', ''), r.petugas_nama),
       COALESCE((r.j->>'created_at')::timestamptz, now()))
    ON CONFLICT (id) DO NOTHING;

    UPDATE public.pemeliharaan_jaringan
    SET status = 'Dibatalkan',
        catatan = btrim(COALESCE(catatan || ' | ', '') || 'dipindah ke halaman PDKB (24 Nov 2026)'),
        updated_at = now()
    WHERE id = r.id;
    n := n + 1;

    IF r.inspeksi_id IS NOT NULL THEN
      UPDATE public.inspeksi SET eksekutor = 'PDKB', updated_at = now()
      WHERE id = r.inspeksi_id AND upper(COALESCE(eksekutor, '')) <> 'PDKB';
      IF FOUND THEN n_tgs := n_tgs + 1; END IF;
    END IF;
  END LOOP;
  RAISE NOTICE '% catatan dipindah ke PDKB, % tugas ikut pindah eksekutor.', n, n_tgs;
END $pindah$;


-- ── Periksa (hanya baca) ──────────────────────────────────────────────────────
-- Harus 0 (tidak ada lagi catatan PDKB aktif di Pemeliharaan Jaringan):
--   SELECT count(*) FROM public.pemeliharaan_jaringan
--   WHERE status <> 'Dibatalkan' AND (pelaksana ILIKE 'PDKB%' OR petugas_nama ILIKE '%PDKB%');
-- Jumlah di halaman PDKB:
--   SELECT count(*) FROM public.pdkb_pekerjaan WHERE catatan LIKE '%dipindah dari Pemeliharaan Jaringan%';
