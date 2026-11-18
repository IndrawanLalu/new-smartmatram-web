-- =============================================================================
-- Inspeksi JTM menunggu persetujuan ikut koreksi peta (18 Nov 2026). Idempoten.
-- Jalankan manual di Supabase SQL Editor, SESUDAH wo-km-ikut-titik.sql.
--
-- Alur admin (keputusan user 18 Nov): regu mengirim → admin mengoreksi
-- jaringan di peta (ganti nama, pecah segmen, ganti induk, gabung, …) → baru
-- menyetujui di tabel Inspeksi JTM. Dulu inspeksi menempel di SATU segmen:
-- segmen dipecah jadi 3, di tabel tetap satu baris atas nama potongan pangkal,
-- dan km yang dibekukan saat disetujui hanya km potongan pangkal itu
-- (contoh 16a22eb2: 409 tiang dinilai, km yang terhitung 185 tiang).
--
-- Kini setiap kali tiang berpindah segmen (segmen_tiang berubah), inspeksi
-- berstatus SELESAI (menunggu persetujuan) yang menilai tiang itu disusun
-- ulang di akhir transaksi:
--   • titik dikelompokkan menurut segmen tiangnya SEKARANG;
--   • satu segmen = satu baris inspeksi (petugas, tanggal, tier, catatan, WO
--     disalin); jawaban & foto ikut karena menempel di titik;
--   • baris asli tetap dipakai untuk segmen asalnya (atau kelompok terbesar
--     bila segmen asalnya tidak punya titik lagi).
-- Diverifikasi (km sudah beku) dan Ditolak (sedang di HP regu) TIDAK disentuh.
--
-- KMS item WO = jumlah km semua segmen inspeksinya (dulu satu item = satu
-- inspeksi), supaya potongan yang tetap tersambung ke item WO asal terhitung.
-- =============================================================================


-- ── 1. Segmen tempat tiang berada sekarang ───────────────────────────────────
-- Tiang di beberapa segmen aktif (titik potong, menumpang): segmen inspeksinya
-- sendiri dulu, lalu penyulang yang sama. NULL = tiang tanpa segmen aktif.
CREATE OR REPLACE FUNCTION public._jtm_segmen_tiang_kini(p_tiang UUID, p_segmen UUID, p_penyulang TEXT)
RETURNS UUID LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT st.segmen_id
  FROM public.segmen_tiang st
  JOIN public.segmen s ON s.id = st.segmen_id
  WHERE st.tiang_id = p_tiang AND s.status = 'aktif'
  ORDER BY (st.segmen_id = p_segmen) DESC,
           (upper(s.penyulang) = upper(COALESCE(p_penyulang, ''))) DESC,
           s.id
  LIMIT 1
$fn$;
REVOKE ALL ON FUNCTION public._jtm_segmen_tiang_kini(UUID, UUID, TEXT) FROM PUBLIC, anon;


-- ── 2. KMS item WO = jumlah km segmen-segmen inspeksinya ─────────────────────
-- Per segmen: inspeksi terakhir dikirim; disetujui → km beku, selainnya km
-- segmen saat ini. Segmen yang belum dititik (panjang bukan hitungan) dilewati,
-- sama dengan aturan lama.
CREATE OR REPLACE FUNCTION public._jtm_km_wo_item(p_item UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_km NUMERIC;
BEGIN
  IF p_item IS NULL THEN RETURN; END IF;
  SELECT sum(x.km) INTO v_km
  FROM (
    SELECT DISTINCT ON (m.segmen_id)
           CASE WHEN m.status = 'Diverifikasi' THEN COALESCE(kd.km, sp.panjang_pakai_km)
                ELSE sp.panjang_pakai_km END AS km
    FROM public.inspeksi_jtm m
    JOIN public.segmen_panjang sp ON sp.segmen_id = m.segmen_id AND sp.panjang_dari = 'hitungan'
    LEFT JOIN public.inspeksi_jtm_km kd ON kd.inspeksi_id = m.id
    WHERE m.wo_item_id = p_item AND m.status IN ('Selesai', 'Diverifikasi')
    ORDER BY m.segmen_id, m.tgl_selesai DESC NULLS LAST
  ) x;
  PERFORM public._wo_inspeksi_km_ikut(p_item, v_km);   -- NULL/0 = belum dititik → tetap
END $fn$;
REVOKE ALL ON FUNCTION public._jtm_km_wo_item(UUID) FROM PUBLIC, anon, authenticated;

-- Pemicu lama (wo-km-ikut-titik.sql) memakai km satu inspeksi saja.
CREATE OR REPLACE FUNCTION public.jtm_km_ke_wo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.wo_item_id IS NULL OR NEW.status NOT IN ('Selesai', 'Diverifikasi') THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.wo_item_id IS NOT DISTINCT FROM NEW.wo_item_id THEN RETURN NULL; END IF;
  PERFORM public._jtm_km_wo_item(NEW.wo_item_id);   -- jtm-inspeksi-ikut-peta.sql
  RETURN NULL;
END $fn$;


-- ── 3. Susun ulang satu inspeksi menurut peta ────────────────────────────────
-- Mengembalikan jumlah baris inspeksi baru. 0 = sudah sesuai peta / bukan
-- inspeksi yang menunggu persetujuan.
CREATE OR REPLACE FUNCTION public._jtm_inspeksi_ikut_peta(p_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  m      public.inspeksi_jtm;
  v_induk UUID;
  v_baru UUID;
  g      RECORD;
  n      INT := 0;
BEGIN
  SELECT * INTO m FROM public.inspeksi_jtm WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR m.status <> 'Selesai' THEN RETURN 0; END IF;

  -- Segmen tiap titik sekarang; tiang tanpa segmen aktif tetap di segmen asal.
  CREATE TEMP TABLE IF NOT EXISTS pg_temp._jtm_ikut (titik_id UUID, segmen_id UUID);
  TRUNCATE pg_temp._jtm_ikut;
  INSERT INTO pg_temp._jtm_ikut
  SELECT tk.id, COALESCE(public._jtm_segmen_tiang_kini(tk.tiang_id, m.segmen_id, m.penyulang), m.segmen_id)
  FROM public.inspeksi_jtm_titik tk
  WHERE tk.inspeksi_id = m.id;

  -- Baris asli tinggal di segmen asalnya bila masih punya titik, kalau tidak
  -- di kelompok terbesar.
  SELECT k.segmen_id INTO v_induk
  FROM (SELECT segmen_id, count(*) AS c FROM pg_temp._jtm_ikut GROUP BY 1) k
  ORDER BY (k.segmen_id = m.segmen_id) DESC, k.c DESC, k.segmen_id
  LIMIT 1;
  IF v_induk IS NULL OR NOT EXISTS (SELECT 1 FROM pg_temp._jtm_ikut WHERE segmen_id <> v_induk) THEN
    IF v_induk IS NOT NULL AND v_induk <> m.segmen_id THEN
      UPDATE public.inspeksi_jtm SET segmen_id = v_induk,
             penyulang = COALESCE((SELECT s.penyulang FROM public.segmen s WHERE s.id = v_induk), penyulang),
             updated_at = now()
       WHERE id = m.id;
      PERFORM public._jtm_km_wo_item(m.wo_item_id);
    END IF;
    RETURN 0;
  END IF;

  FOR g IN SELECT DISTINCT k.segmen_id, s.penyulang
           FROM pg_temp._jtm_ikut k JOIN public.segmen s ON s.id = k.segmen_id
           WHERE k.segmen_id <> v_induk ORDER BY k.segmen_id LOOP
    -- Salinan utuh baris asli (semua kolom, juga yang ditambah skrip lain).
    INSERT INTO public.inspeksi_jtm
    SELECT (jsonb_populate_record(NULL::public.inspeksi_jtm,
              to_jsonb(m) || jsonb_build_object(
                'id', gen_random_uuid(), 'segmen_id', g.segmen_id,
                'penyulang', COALESCE(g.penyulang, m.penyulang), 'updated_at', now()))).*
    RETURNING id INTO v_baru;

    UPDATE public.inspeksi_jtm_titik tk SET inspeksi_id = v_baru
    FROM pg_temp._jtm_ikut k
    WHERE k.titik_id = tk.id AND k.segmen_id = g.segmen_id;
    n := n + 1;
  END LOOP;

  IF v_induk <> m.segmen_id THEN
    UPDATE public.inspeksi_jtm SET segmen_id = v_induk,
           penyulang = COALESCE((SELECT s.penyulang FROM public.segmen s WHERE s.id = v_induk), penyulang),
           updated_at = now()
     WHERE id = m.id;
  END IF;
  PERFORM public._jtm_km_wo_item(m.wo_item_id);
  RETURN n;
END $fn$;
REVOKE ALL ON FUNCTION public._jtm_inspeksi_ikut_peta(UUID) FROM PUBLIC, anon, authenticated;


-- ── 4. Pemicu: tiang berpindah segmen ────────────────────────────────────────
-- Ditunda sampai akhir transaksi: Pecah/Gabung menghapus lalu menyisipkan
-- segmen_tiang, jadi di tengah jalan tiangnya sempat tanpa segmen. Gagal
-- menyusun ulang TIDAK membatalkan koreksi peta admin — cukup peringatan.
CREATE OR REPLACE FUNCTION public._jtm_inspeksi_ikut_segmen_tiang()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tiang UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.tiang_id ELSE NEW.tiang_id END;
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT m.id
    FROM public.inspeksi_jtm_titik tk
    JOIN public.inspeksi_jtm m ON m.id = tk.inspeksi_id
    WHERE tk.tiang_id = v_tiang AND m.status = 'Selesai'
      -- Tiang ini sudah di segmen inspeksinya → tidak ada yang perlu disusun
      -- (titik potong yang dipikul dua segmen, atau sudah disusun tiang lain).
      AND public._jtm_segmen_tiang_kini(v_tiang, m.segmen_id, m.penyulang) IS DISTINCT FROM m.segmen_id
  LOOP
    BEGIN
      PERFORM public._jtm_inspeksi_ikut_peta(r.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Inspeksi JTM % tidak bisa disusun ulang mengikuti peta: %', r.id, SQLERRM;
    END;
  END LOOP;
  RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS trg_jtm_inspeksi_ikut_peta ON public.segmen_tiang;
CREATE CONSTRAINT TRIGGER trg_jtm_inspeksi_ikut_peta
  AFTER INSERT OR UPDATE OR DELETE ON public.segmen_tiang
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public._jtm_inspeksi_ikut_segmen_tiang();


-- ── 5. Sekali jalan: inspeksi menunggu persetujuan yang sudah tidak sesuai peta
-- (termasuk 813b5235 GH GOMONG - LBSM. MASJID RAYA, 54 tiang / segmen 12).
-- Hasilnya di tab Messages / Notices.
DO $do$
DECLARE r RECORD; n INT;
BEGIN
  FOR r IN SELECT m.id, s.nama FROM public.inspeksi_jtm m JOIN public.segmen s ON s.id = m.segmen_id
           WHERE m.status = 'Selesai' ORDER BY s.nama LOOP
    BEGIN
      n := public._jtm_inspeksi_ikut_peta(r.id);
      IF n > 0 THEN RAISE NOTICE '% (%) → ditambah % baris mengikuti peta', r.nama, r.id, n; END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'GAGAL % (%): %', r.nama, r.id, SQLERRM;
    END;
  END LOOP;
END $do$;

-- Periksa: baris inspeksi menunggu persetujuan sekarang (nama = nama di peta)
-- SELECT r.id, r.segmen_nama, r.tier, r.tiang_dinilai, r.tiang_segmen, r.petugas_nama
-- FROM inspeksi_jtm_ringkas r WHERE r.status = 'Selesai' ORDER BY r.petugas_nama, r.segmen_nama;
