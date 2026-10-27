-- =============================================================================
-- Inspeksi Gardu — G2: simpan kategori temuan dari web (26 Okt 2026)
-- Jalankan SESUDAH inspeksi-gardu.sql. Idempoten.
--
-- igardu_ref hanya bisa DIBACA langsung (RLS); tulisannya lewat fungsi ini
-- supaya ada penjaga (UP3 / admin) dan jejak audit.
-- Kode TETAP (tertulis di temuan); yang boleh diubah label, item padanan,
-- urutan, dan aktif. Tidak ada hapus — nonaktifkan saja.
--
-- ★ Juga: inspeksi_gardu_daftar tanpa fungsi per baris (lihat di bawah).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.simpan_igardu_ref(
  p_kode      TEXT,
  p_label     TEXT,
  p_item_kode TEXT,
  p_urutan    INT,
  p_aktif     BOOLEAN,
  p_oleh      TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_role TEXT;
  v_kode TEXT := lower(btrim(COALESCE(p_kode, '')));
  lama   public.igardu_ref;
  lain   TEXT;
BEGIN
  SELECT role INTO v_role FROM public.user_roles WHERE user_id = auth.uid();
  IF COALESCE(v_role, '') NOT IN ('UP3', 'admin') THEN
    RAISE EXCEPTION 'Hanya UP3 atau admin ULP yang boleh mengubah kategori temuan.';
  END IF;
  IF v_kode !~ '^[a-z0-9_]{2,30}$' THEN
    RAISE EXCEPTION 'Kode kategori hanya huruf kecil, angka, dan garis bawah (2–30 huruf).';
  END IF;
  IF btrim(COALESCE(p_label, '')) = '' THEN RAISE EXCEPTION 'Nama kategori wajib diisi.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hargardu_item_ref WHERE kode = p_item_kode) THEN
    RAISE EXCEPTION 'Item Pemeliharaan Gardu "%" tidak ada.', p_item_kode;
  END IF;
  SELECT label INTO lain FROM public.igardu_ref WHERE item_kode = p_item_kode AND kode <> v_kode;
  IF lain IS NOT NULL THEN
    RAISE EXCEPTION 'Item itu sudah dipakai kategori "%". Satu item pemeliharaan satu kategori.', lain;
  END IF;

  SELECT * INTO lama FROM public.igardu_ref WHERE kode = v_kode FOR UPDATE;
  IF FOUND THEN
    UPDATE public.igardu_ref
    SET label = btrim(p_label), item_kode = p_item_kode, urutan = COALESCE(p_urutan, urutan),
        aktif = COALESCE(p_aktif, aktif), updated_at = now()
    WHERE kode = v_kode;
  ELSE
    INSERT INTO public.igardu_ref (kode, label, item_kode, urutan, aktif)
    VALUES (v_kode, btrim(p_label), p_item_kode, COALESCE(p_urutan, 100), COALESCE(p_aktif, true));
  END IF;

  INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('igardu_ref', v_kode, NULL, CASE WHEN lama.kode IS NULL THEN 'tambah' ELSE 'ubah' END,
          CASE WHEN lama.kode IS NULL THEN NULL ELSE to_jsonb(lama) END,
          jsonb_build_object('label', btrim(p_label), 'item_kode', p_item_kode, 'urutan', p_urutan, 'aktif', p_aktif),
          'sunting_admin', auth.uid(), p_oleh);
END $fn$;
GRANT EXECUTE ON FUNCTION public.simpan_igardu_ref(TEXT, TEXT, TEXT, INT, BOOLEAN, TEXT) TO authenticated;

-- ★ Perbaikan G1: nama gardu lewat join biasa, bukan _igardu_master() per baris
-- (memindai 2.544 gardu dengan upper() untuk SETIAP baris daftar).
CREATE OR REPLACE VIEW public.inspeksi_gardu_daftar AS
SELECT x.id, x.gardu_kode, x.ulp, x.penyulang, x.tier, x.wo_item_id, x.tgl, x.lat, x.lng, x.akurasi, x.jarak_m,
       x.foto_gardu_url, x.ada_temuan, x.status, x.petugas_nama, x.catatan,
       x.verified_at, x.verified_by, x.dikembalikan_at, x.dikembalikan_alasan, x.dikembalikan_oleh,
       x.batal_alasan, x.created_at,
       g.nama AS gardu_nama,
       w.nama AS wo_nama, w.tgl_wo,
       (SELECT count(*) FROM public.inspeksi_gardu_temuan t WHERE t.inspeksi_id = x.id)::int AS jumlah_temuan,
       (SELECT CASE WHEN bool_or(t.prioritas = 'Urgent') THEN 'Urgent'
                    WHEN bool_or(t.prioritas = 'Rawan') THEN 'Rawan'
                    WHEN count(*) > 0 THEN 'Biasa' END
        FROM public.inspeksi_gardu_temuan t WHERE t.inspeksi_id = x.id) AS prioritas_tertinggi,
       EXISTS (SELECT 1 FROM public.master_usulan u
               WHERE u.sumber_modul = 'inspeksi_gardu' AND u.sumber_id = x.id AND u.status = 'menunggu') AS tertahan
FROM public.inspeksi_gardu x
-- Kode & ULP disalin persis dari master: join biasa (hash join sekali),
-- bukan fungsi per baris yang memindai seluruh gardu dengan upper().
LEFT JOIN public.gardu g ON g.kode = x.gardu_kode AND g.ulp = x.ulp
LEFT JOIN public.wo_igardu_item i ON i.id = x.wo_item_id
LEFT JOIN public.wo_igardu w ON w.id = i.wo_id;

NOTIFY pgrst, 'reload schema';
