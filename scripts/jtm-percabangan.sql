-- scripts/jtm-percabangan.sql
--
-- TIANG PERCABANGAN DITANDAI, BUKAN DITEBAK.
--
-- Sebelumnya garis bawah pada nama tiang ditentukan oleh satu pertanyaan:
-- "apakah induknya sudah punya anak pada saat tiang ini lahir?" Jawabannya
-- bergantung pada urutan regu menyusuri, bukan pada apa yang berdiri di
-- lapangan. Regu yang menyusuri cabang lebih dulu mendapat nama berbeda dari
-- regu yang menyusuri jalur utama lebih dulu — untuk tiang yang sama persis.
--
-- Percabangan itu sifat tiangnya: ada tap-off di situ, dan itu tidak berubah
-- karena siapa yang lewat duluan. Jadi ditandai sekali, lalu berlaku untuk
-- semua anaknya — yang sudah ada maupun yang belum.
--
-- Prasyarat: jtm-nama.sql (kolom `tiang.percabangan` dibuat di sana)
-- Aman dijalankan berulang.


-- ── 1. Menyalakan penanda dari kenyataan yang sudah ada ──────────────────────
-- Tiang yang sudah punya dua anak atau lebih SUDAH percabangan — tidak ada yang
-- perlu diputuskan, cuma dicatat.

UPDATE public.tiang t SET percabangan = true
WHERE NOT t.percabangan
  AND (SELECT count(*) FROM public.tiang a
        WHERE a.induk_id = t.id AND a.status_hidup = 'aktif') >= 2;


-- ── 2. Menyala sendiri saat anak kedua lahir ─────────────────────────────────
-- Dipicu sesudah tiang masuk, bukan dihitung ulang tiap kali dibaca: yang
-- membaca penanda ini adalah peta dan penamaan, dan keduanya tidak boleh
-- menanggung biaya menghitung anak tiap baris.

CREATE OR REPLACE FUNCTION public.jtm_tandai_induk_percabangan()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.induk_id IS NULL THEN RETURN NULL; END IF;

  -- Regu menyatakan tegas bahwa jalurnya pecah di induknya. Dipakai saat
  -- cabangnya disusuri LEBIH DULU — pada saat itu induknya belum punya anak
  -- lain, jadi tidak ada satu pun keterangan lain yang bisa menyimpulkannya.
  IF COALESCE(NEW.cabang_baru, false) THEN
    UPDATE public.tiang SET percabangan = true, updated_at = now()
    WHERE id = NEW.induk_id AND NOT percabangan;
    RETURN NULL;
  END IF;

  IF (SELECT count(*) FROM public.tiang a
       WHERE a.induk_id = NEW.induk_id AND a.status_hidup = 'aktif') >= 2 THEN
    UPDATE public.tiang SET percabangan = true, updated_at = now()
    WHERE id = NEW.induk_id AND NOT percabangan;
  END IF;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_jtm_tandai_induk_percabangan ON public.tiang;
CREATE TRIGGER trg_jtm_tandai_induk_percabangan
  AFTER INSERT OR UPDATE OF induk_id ON public.tiang
  FOR EACH ROW EXECUTE FUNCTION public.jtm_tandai_induk_percabangan();


-- ── 3. Menandai dari meja atau dari lapangan ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.tandai_percabangan_jtm(
  p_tiang_id UUID,
  p_nyala    BOOLEAN,
  p_oleh     TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t RECORD; n INT;
BEGIN
  SELECT * INTO t FROM public.tiang WHERE id = p_tiang_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang tidak ditemukan'; END IF;

  IF t.percabangan = p_nyala THEN
    RETURN jsonb_build_object('kode', t.kode, 'percabangan', p_nyala, 'berubah', false);
  END IF;

  -- Penanda tidak bisa dimatikan selama jalurnya memang masih pecah di situ.
  -- Mematikannya tidak akan menghapus cabangnya — cuma membuat nama tiang
  -- berikutnya berbohong tentang bentuk jaringannya.
  IF NOT p_nyala THEN
    SELECT count(*) INTO n FROM public.tiang a
    WHERE a.induk_id = p_tiang_id AND a.status_hidup = 'aktif';
    IF n >= 2 THEN
      RAISE EXCEPTION
        'Tiang % memang bercabang — % tiang menyambung ke sini. Pindahkan dulu induk salah satunya kalau itu keliru.',
        t.kode, n;
    END IF;
  END IF;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', t.kode, COALESCE(t.ulp, '-'), 'percabangan',
          to_jsonb(t.percabangan), to_jsonb(p_nyala), 'koreksi_meja', auth.uid(), p_oleh);

  UPDATE public.tiang SET percabangan = p_nyala, updated_at = now()
  WHERE id = p_tiang_id;

  RETURN jsonb_build_object('kode', t.kode, 'percabangan', p_nyala, 'berubah', true);
END $$;


-- ── 4. Daftar tiang ikut menyebutnya ─────────────────────────────────────────

DROP VIEW IF EXISTS public.tiang_jtm_daftar;

CREATE VIEW public.tiang_jtm_daftar AS
SELECT
  t.id,
  t.kode,
  COALESCE(
    (SELECT string_agg(k.kode, ' / ' ORDER BY k.utama DESC, k.penyulang)
       FROM public.tiang_kode_penyulang k WHERE k.tiang_id = t.id),
    t.kode) AS semua_kode,
  t.penyulang,
  t.ulp,
  t.lat, t.lng,
  t.jenis,
  t.konstruksi,
  t.nomor_lama,
  t.penanda,
  t.percabangan,
  t.induk_id,
  i.kode AS induk_kode,
  t.dikonfirmasi_at,
  t.dikonfirmasi_oleh,
  t.sumber,
  t.created_at,
  (SELECT count(*) FROM public.tiang a
    WHERE a.induk_id = t.id AND a.status_hidup = 'aktif')        AS jumlah_anak,
  (SELECT string_agg(s.nama, ' · ' ORDER BY s.nama)
     FROM public.segmen_tiang st
     JOIN public.segmen s ON s.id = st.segmen_id AND s.status = 'aktif'
    WHERE st.tiang_id = t.id)                                    AS segmen,
  (SELECT count(*) FROM public.segmen_tiang st WHERE st.tiang_id = t.id) AS jumlah_segmen,
  (SELECT count(*) FROM public.tiang_kode_penyulang k WHERE k.tiang_id = t.id) AS jumlah_nama,
  (SELECT max(tk.dinilai_at)
     FROM public.inspeksi_jtm_titik tk
     JOIN public.inspeksi_jtm m ON m.id = tk.inspeksi_id AND m.status <> 'Ditolak'
    WHERE tk.tiang_id = t.id)                                    AS terakhir_dinilai
FROM public.tiang t
LEFT JOIN public.tiang i ON i.id = t.induk_id
WHERE t.status_hidup = 'aktif'
  AND t.gardu_kode IS NULL
  AND t.penyulang IS NOT NULL;

COMMENT ON VIEW public.tiang_jtm_daftar IS
  'Daftar tiang JTM. `semua_kode` menyebut seluruh namanya; `percabangan` menandai tiang tempat jaringan pecah.';


GRANT SELECT  ON public.tiang_jtm_daftar            TO authenticated;
GRANT EXECUTE ON FUNCTION public.tandai_percabangan_jtm TO authenticated;
