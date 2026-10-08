-- =============================================================================
-- Perbaikan sekali jalan (8 Okt 2026): SEGMENT LEMBAR - 1.2 GR041 - GR042
-- GUNUNG MALANG (ULP GERUNG)
-- =============================================================================
-- Inspeksi Tier 1 oleh Idham Khollidi (fc8046ff…, mulai 2 Okt) dibatalkan admin
-- dari web 7 Okt dengan alasan "salah". Segmennya segmen IMPOR, dan tombol
-- Batalkan di web saat itu hanya membatalkan catatan inspeksinya — 33 tiang
-- yang dititik regu di inspeksi itu tetap aktif, muncul lagi saat regu memilih
-- segmen ini, dan "Ulangi inspeksi" di HP tidak bisa dipakai karena
-- inspeksinya sudah dibatalkan.
--
-- Skrip ini membatalkan 33 tiang itu PERSIS seperti `_ulangi_inspeksi_inti`
-- (jtm-batal-hp.sql): tiang yang hanya milik segmen ini, dibuat sesudah
-- inspeksi dimulai, dan tidak dinilai inspeksi lain yang masih hidup.
-- Tiang yang juga milik segmen lain TIDAK disentuh. Segmennya tetap aktif.
-- Catatan inspeksinya tidak diubah (sudah Dibatalkan).
--
-- Jalankan BAGIAN 1 dulu, periksa daftarnya (harus 33 baris), baru BAGIAN 2.
-- Aman dijalankan ulang: sesudah bagian 2, bagian 1 menghasilkan 0 baris.
-- =============================================================================


-- ── BAGIAN 1 — pratinjau (hanya baca) ────────────────────────────────────────
SELECT tg.kode, tg.created_at AT TIME ZONE 'Asia/Makassar' AS dibuat_wita, tg.status_hidup
FROM unnest(public._jtm_milik('19ce376d-5935-4860-986a-69723b60f89d')) x
JOIN public.tiang tg ON tg.id = x
JOIN public.inspeksi_jtm m ON m.id = 'fc8046ff-6e1c-4e97-8037-a441c1cd496c'
WHERE tg.created_at >= m.tgl_mulai
  AND NOT EXISTS (SELECT 1 FROM public.inspeksi_jtm_titik k JOIN public.inspeksi_jtm o ON o.id = k.inspeksi_id
                   WHERE k.tiang_id = x AND o.id <> m.id AND o.status <> 'Dibatalkan')
ORDER BY tg.created_at;


-- ── BAGIAN 2 — batalkan ──────────────────────────────────────────────────────
DO $$
DECLARE
  v_ins    CONSTANT UUID := 'fc8046ff-6e1c-4e97-8037-a441c1cd496c';
  v_alasan CONSTANT TEXT := 'salah — tiang dari inspeksi yang dibatalkan, dibersihkan agar segmen bisa diinspeksi ulang';
  m    RECORD;
  baru UUID[];
  t    RECORD;
  hal  TEXT;
BEGIN
  SELECT * INTO m FROM public.inspeksi_jtm WHERE id = v_ins FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inspeksi tidak ditemukan'; END IF;
  IF m.status <> 'Dibatalkan' THEN RAISE EXCEPTION 'Inspeksi ini tidak berstatus Dibatalkan (%), skrip dihentikan', m.status; END IF;

  SELECT COALESCE(array_agg(x), '{}') INTO baru
    FROM unnest(public._jtm_milik(m.segmen_id)) x
    JOIN public.tiang tg ON tg.id = x
   WHERE tg.created_at >= m.tgl_mulai
     AND NOT EXISTS (SELECT 1 FROM public.inspeksi_jtm_titik k JOIN public.inspeksi_jtm o ON o.id = k.inspeksi_id
                      WHERE k.tiang_id = x AND o.id <> m.id AND o.status <> 'Dibatalkan');

  IF cardinality(baru) = 0 THEN RAISE NOTICE 'Tidak ada tiang yang perlu dibatalkan (sudah bersih).'; RETURN; END IF;

  hal := public._jtm_cek_sambungan(baru, '{}'::uuid[]);
  IF hal IS NOT NULL THEN RAISE EXCEPTION '%', hal; END IF;

  FOR t IN SELECT * FROM public.tiang WHERE id = ANY(baru) LOOP
    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', t.kode, COALESCE(t.ulp, '-'), 'status_hidup', to_jsonb(t.status_hidup),
            jsonb_build_object('status', 'batal', 'alasan', v_alasan, 'inspeksi', m.id,
              'nama_dibuang', COALESCE((SELECT array_agg(penyulang || '=' || kode) FROM public.tiang_kode_penyulang
                                         WHERE tiang_id = t.id), '{}')),
            'ulangi_inspeksi_jtm', NULL, 'perbaikan data 8 Okt 2026');
  END LOOP;
  DELETE FROM public.tiang_kode_penyulang WHERE tiang_id = ANY(baru);
  UPDATE public.tiang_jtr_tumpang SET status = 'lepas', catatan = 'inspeksinya dibatalkan: ' || v_alasan, updated_at = now()
   WHERE tiang_id = ANY(baru) AND status = 'aktif';
  -- Dari ujung ke pangkal: pemicu `tiang_cegah_anak_menggantung` (versi lama,
  -- per baris) menolak induk yang anaknya masih aktif, jadi satu UPDATE untuk
  -- seluruh rantai gagal ("masih menyuplai 1 tiang aktif"). Tiap putaran
  -- membatalkan tiang yang sudah tidak punya anak aktif.
  LOOP
    UPDATE public.tiang tg SET status_hidup = 'batal', aktif_sampai = CURRENT_DATE, catatan = v_alasan, updated_at = now()
     WHERE tg.id = ANY(baru) AND tg.status_hidup = 'aktif'
       AND NOT EXISTS (SELECT 1 FROM public.tiang c WHERE c.induk_id = tg.id AND c.status_hidup = 'aktif');
    EXIT WHEN NOT FOUND;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.tiang WHERE id = ANY(baru) AND status_hidup = 'aktif') THEN
    RAISE EXCEPTION 'Masih ada tiang yang tidak bisa dibatalkan (anaknya di luar daftar) — tidak ada yang diubah.';
  END IF;
  DELETE FROM public.segmen_tiang WHERE segmen_id = m.segmen_id AND tiang_id = ANY(baru);

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('inspeksi_jtm', m.id::text, m.ulp, 'tiang', to_jsonb(cardinality(baru)),
          jsonb_build_object('tiang_dibatalkan', cardinality(baru), 'alasan', v_alasan),
          'ulangi_inspeksi_jtm', NULL, 'perbaikan data 8 Okt 2026');

  RAISE NOTICE '% tiang dibatalkan; segmen tetap aktif dan siap diinspeksi ulang.', cardinality(baru);
END $$;
