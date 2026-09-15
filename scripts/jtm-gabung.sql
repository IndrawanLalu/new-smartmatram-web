-- scripts/jtm-gabung.sql
--
-- SATU SEGMEN DISAPU SEKALI, MESKI DIKERJAKAN BEBERAPA KALI MASUK.
--
-- Sebelum `jtm-lanjut.sql`, tiap kali regu masuk lagi ke segmen yang sudah
-- dinyatakan selesai, lahir penyapuan baru. Satu segmen PERUMNAS jadi punya
-- tiga: 10 tiang, 1 tiang, dan 0 tiang. Di layar persetujuan itu terbaca
-- sebagai tiga kunjungan berbeda, padahal satu pekerjaan yang sama.
--
-- Penyebabnya sudah diperbaiki. Yang tersisa: merapikan yang terlanjur pecah.
--
-- Prasyarat: jtm-lanjut.sql
-- Aman dijalankan berulang.


-- ── 1. Menyatukan penyapuan satu segmen ──────────────────────────────────────
-- Yang DIVERIFIKASI tidak pernah ikut: dia catatan sejarah, dan menambah isinya
-- belakangan membuat keputusan admin menilai sesuatu yang berbeda dari yang
-- akhirnya tersimpan.

CREATE OR REPLACE FUNCTION public.gabung_penyapuan_jtm(
  p_tujuan UUID,
  p_oleh   TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m        RECORD;
  r        RECORD;
  n_sumber INT := 0;
  n_pindah INT := 0;
  n_buang  INT := 0;
BEGIN
  SELECT * INTO m FROM public.inspeksi_jtm WHERE id = p_tujuan;
  IF NOT FOUND THEN RAISE EXCEPTION 'Penyapuan tidak ditemukan'; END IF;
  IF m.status = 'Diverifikasi' THEN
    RAISE EXCEPTION 'Penyapuan ini sudah diverifikasi dan tidak bisa diubah lagi';
  END IF;

  FOR r IN
    SELECT id FROM public.inspeksi_jtm
    WHERE segmen_id = m.segmen_id AND tier = m.tier
      AND id <> p_tujuan
      AND status <> 'Diverifikasi'
  LOOP
    n_sumber := n_sumber + 1;

    -- Tiang yang dinilai di KEDUA penyapuan: yang lebih baru menang. Penilaian
    -- terakhirlah yang mewakili keadaan tiang sekarang — dan membiarkan
    -- keduanya hidup berarti satu tiang punya dua jawaban di satu penyapuan,
    -- yang ditolak indeks uniknya.
    DELETE FROM public.inspeksi_jtm_titik lama
    USING public.inspeksi_jtm_titik baru
    WHERE lama.inspeksi_id = p_tujuan
      AND baru.inspeksi_id = r.id
      AND baru.tiang_id = lama.tiang_id
      AND baru.dinilai_at > lama.dinilai_at;

    UPDATE public.inspeksi_jtm_titik tk
    SET inspeksi_id = p_tujuan
    WHERE tk.inspeksi_id = r.id
      AND NOT EXISTS (
        SELECT 1 FROM public.inspeksi_jtm_titik x
        WHERE x.inspeksi_id = p_tujuan AND x.tiang_id = tk.tiang_id
      );
    GET DIAGNOSTICS n_pindah = ROW_COUNT;

    DELETE FROM public.inspeksi_jtm WHERE id = r.id;
    n_buang := n_buang + 1;
  END LOOP;

  IF n_sumber = 0 THEN
    RAISE EXCEPTION 'Tidak ada penyapuan lain di segmen ini yang bisa digabung';
  END IF;

  UPDATE public.inspeksi_jtm
  SET status = CASE WHEN status = 'Diverifikasi' THEN status ELSE 'Dalam Proses' END,
      tgl_selesai = NULL,
      petugas_nama = COALESCE(p_oleh, petugas_nama),
      updated_at = now()
  WHERE id = p_tujuan;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('inspeksi_jtm', p_tujuan::text, m.ulp, 'gabung',
          to_jsonb(n_buang), to_jsonb(n_pindah), 'gabung_penyapuan', auth.uid(), p_oleh);

  RETURN jsonb_build_object(
    'penyapuan_dibuang', n_buang,
    'titik_dipindah',    n_pindah,
    'tiang_dinilai',     (SELECT count(*) FROM public.inspeksi_jtm_titik WHERE inspeksi_id = p_tujuan)
  );
END $$;

COMMENT ON FUNCTION public.gabung_penyapuan_jtm IS
  'Menyatukan seluruh penyapuan belum-terverifikasi satu segmen ke satu penyapuan. Tiang yang dinilai dua kali diambil yang terbaru.';


-- ── 2. Membuang penyapuan yang tidak berisi apa-apa ──────────────────────────
-- Penyapuan tanpa satu pun tiang dinilai bukan pekerjaan — dia bekas layar yang
-- pernah dibuka. Membiarkannya berarti daftar persetujuan berisi baris yang
-- tidak bisa disetujui maupun ditolak.

CREATE OR REPLACE FUNCTION public.buang_penyapuan_kosong_jtm(
  p_id   UUID,
  p_oleh TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m RECORD; n INT;
BEGIN
  SELECT * INTO m FROM public.inspeksi_jtm WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Penyapuan tidak ditemukan'; END IF;
  IF m.status = 'Diverifikasi' THEN
    RAISE EXCEPTION 'Penyapuan yang sudah diverifikasi tidak bisa dibuang';
  END IF;

  SELECT count(*) INTO n FROM public.inspeksi_jtm_titik WHERE inspeksi_id = p_id;
  IF n > 0 THEN
    RAISE EXCEPTION 'Penyapuan ini berisi % tiang yang sudah dinilai — gabungkan, jangan dibuang.', n;
  END IF;

  DELETE FROM public.inspeksi_jtm WHERE id = p_id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('inspeksi_jtm', p_id::text, m.ulp, 'status',
          to_jsonb(m.status), to_jsonb('dibuang'::text), 'buang_kosong', auth.uid(), p_oleh);

  RETURN jsonb_build_object('dibuang', true);
END $$;


GRANT EXECUTE ON FUNCTION public.gabung_penyapuan_jtm        TO authenticated;
GRANT EXECUTE ON FUNCTION public.buang_penyapuan_kosong_jtm  TO authenticated;
