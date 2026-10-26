-- =============================================================================
-- Pemeliharaan Jaringan — satu catatan admin, BEBERAPA kategori (26 Okt 2026)
-- Jalankan SESUDAH pemeliharaan-jaringan-input-admin.sql. Idempoten.
--
-- Keputusan user 26 Okt: satu pekerjaan tim (mis. PDKB ganti arrester + FCO +
-- jumperan + pasang tekep) dicatat SEKALI dengan foto sekali unggah, tapi jadi
-- beberapa baris — satu per kategori — di tabel dan realisasi.
--
--   1. kelompok_id — baris-baris dari satu kiriman (NULL = baris HP / lama).
--   2. input_pemeliharaan_jaringan_admin ★ — p_isi.item = [{kategori, pekerjaan}].
--      Tanpa item = satu baris dari p_isi.kategori/pekerjaan (bentuk lama).
--   3. View daftar membawa kelompok_id.
-- =============================================================================

ALTER TABLE public.pemeliharaan_jaringan ADD COLUMN IF NOT EXISTS kelompok_id UUID;
CREATE INDEX IF NOT EXISTS pemeliharaan_jaringan_kelompok_idx
  ON public.pemeliharaan_jaringan (kelompok_id) WHERE kelompok_id IS NOT NULL;
COMMENT ON COLUMN public.pemeliharaan_jaringan.kelompok_id IS
  'Baris-baris satu catatan admin berbanyak kategori (foto sama). 26 Okt 2026.';


-- ── input admin — disalin dari pemeliharaan-jaringan-input-admin.sql; ★ ──────
CREATE OR REPLACE FUNCTION public.input_pemeliharaan_jaringan_admin(p_isi JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_jenis TEXT := upper(btrim(COALESCE(p_isi->>'jenis', '')));
  v_peny  TEXT := upper(btrim(COALESCE(p_isi->>'penyulang', '')));
  v_pel   TEXT := NULLIF(btrim(COALESCE(p_isi->>'pelaksana', '')), '');
  v_fs    TEXT := COALESCE(p_isi->>'foto_sebelum_url', '');
  v_fd    TEXT := COALESCE(p_isi->>'foto_sesudah_url', '');
  v_fp    TEXT := NULLIF(btrim(COALESCE(p_isi->>'foto_proses_url', '')), '');
  v_tgl   DATE := NULLIF(p_isi->>'tgl', '')::date;
  v_oleh  TEXT := NULLIF(btrim(COALESCE(p_isi->>'oleh', '')), '');
  v_hari  DATE := (now() AT TIME ZONE 'Asia/Makassar')::date;
  v_ulp   TEXT;
  -- ★ id kiriman = kelompok_id; baris pertama juga memakainya sebagai id.
  v_id    UUID := COALESCE(NULLIF(p_isi->>'id', '')::uuid, gen_random_uuid());
  -- ★ item = [{kategori, pekerjaan}]
  v_item  JSONB := CASE
    WHEN jsonb_typeof(p_isi->'item') = 'array' AND jsonb_array_length(p_isi->'item') > 0 THEN p_isi->'item'
    ELSE jsonb_build_array(jsonb_build_object('kategori', p_isi->>'kategori', 'pekerjaan', p_isi->>'pekerjaan'))
  END;
  it      JSONB;
  n       INT := 0;
BEGIN
  IF v_jenis NOT IN ('JTM', 'JTR') THEN RAISE EXCEPTION 'Jenis jaringan harus JTM atau JTR'; END IF;
  IF v_peny = '' THEN RAISE EXCEPTION 'Penyulang wajib dipilih'; END IF;
  IF v_pel IS NULL THEN RAISE EXCEPTION 'Tim pelaksana wajib diisi'; END IF;
  IF v_tgl IS NULL THEN RAISE EXCEPTION 'Tanggal pekerjaan wajib diisi'; END IF;
  IF v_tgl > v_hari THEN RAISE EXCEPTION 'Tanggal pekerjaan tidak boleh di masa depan.'; END IF;
  IF v_fs NOT LIKE 'http%' OR v_fd NOT LIKE 'http%' THEN
    RAISE EXCEPTION 'Foto sebelum dan sesudah dua-duanya wajib.';
  END IF;
  IF v_fp IS NOT NULL AND v_fp NOT LIKE 'http%' THEN RAISE EXCEPTION 'Foto proses belum terunggah.'; END IF;

  -- ★ periksa semua item dulu: satu salah = tidak ada yang tersimpan.
  IF jsonb_array_length(v_item) > 20 THEN RAISE EXCEPTION 'Paling banyak 20 kategori sekali simpan.'; END IF;
  IF (SELECT count(DISTINCT x->>'kategori') FROM jsonb_array_elements(v_item) x) < jsonb_array_length(v_item) THEN
    RAISE EXCEPTION 'Kategori yang sama dipilih dua kali.';
  END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(v_item) LOOP
    IF btrim(COALESCE(it->>'pekerjaan', '')) = '' THEN RAISE EXCEPTION 'Pekerjaan wajib diisi'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.pemeliharaan_jaringan_ref r WHERE r.kode = it->>'kategori' AND r.aktif) THEN
      RAISE EXCEPTION 'Kategori "%" tidak ada di daftar yang aktif', it->>'kategori';
    END IF;
  END LOOP;

  SELECT upper(pr.ulp) INTO v_ulp FROM public.penyulang_ref pr WHERE upper(pr.penyulang) = v_peny LIMIT 1;
  IF v_ulp IS NULL THEN RAISE EXCEPTION 'ULP tidak diketahui untuk penyulang %', v_peny; END IF;
  PERFORM public.wajib_boleh_ulp(v_ulp);

  IF EXISTS (SELECT 1 FROM public.pemeliharaan_jaringan WHERE id = v_id OR kelompok_id = v_id) THEN
    -- Simpan ganda (klik dua kali / jawaban hilang di jalan).
    RETURN jsonb_build_object('id', v_id, 'ulp', v_ulp, 'sudah_ada', true);
  END IF;

  -- ★ satu baris per kategori; foto & isian lain sama.
  FOR it IN SELECT * FROM jsonb_array_elements(v_item) LOOP
    n := n + 1;
    INSERT INTO public.pemeliharaan_jaringan
      (id, kelompok_id, jenis, penyulang, ulp, kategori, pekerjaan, alamat, lat, lng,
       foto_sebelum_url, foto_sesudah_url, foto_proses_url,
       status, petugas_uid, petugas_nama, catatan, tgl, verified_at, verified_by,
       pelaksana, sumber, diinput_oleh)
    VALUES
      (CASE WHEN n = 1 THEN v_id ELSE gen_random_uuid() END, v_id,
       v_jenis, v_peny, v_ulp, it->>'kategori', btrim(it->>'pekerjaan'),
       NULLIF(btrim(COALESCE(p_isi->>'alamat', '')), ''),
       NULLIF(p_isi->>'lat', '')::double precision, NULLIF(p_isi->>'lng', '')::double precision,
       v_fs, v_fd, v_fp,
       -- petugas_nama = pelaksana: nama tim tampil di tabel, Excel & lampiran.
       'Diverifikasi', auth.uid(), v_pel, NULLIF(btrim(COALESCE(p_isi->>'catatan', '')), ''), v_tgl, now(), v_oleh,
       v_pel, 'web', v_oleh);
  END LOOP;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('pemeliharaan_jaringan', v_id::text, v_ulp, 'input_admin', NULL,
          jsonb_build_object('pelaksana', v_pel, 'penyulang', v_peny, 'tgl', v_tgl, 'item', v_item),
          'sunting_admin', auth.uid(), v_oleh);

  RETURN jsonb_build_object('id', v_id, 'ulp', v_ulp, 'sudah_ada', false, 'baris', n);
END $fn$;
GRANT EXECUTE ON FUNCTION public.input_pemeliharaan_jaringan_admin(JSONB) TO authenticated;


-- ── View daftar — kolom baru di belakang ─────────────────────────────────────
CREATE OR REPLACE VIEW public.pemeliharaan_jaringan_daftar AS
SELECT
  p.id,
  p.jenis,
  p.penyulang,
  p.ulp,
  p.kategori,
  r.label AS kategori_label,
  p.pekerjaan,
  p.alamat,
  p.lat,
  p.lng,
  p.foto_sebelum_url,
  p.foto_sesudah_url,
  p.status,
  p.petugas_nama,
  p.catatan,
  p.tgl,
  p.verified_at,
  p.verified_by,
  p.created_at,
  p.inspeksi_id,
  p.dikembalikan_at,
  p.dikembalikan_alasan,
  p.dikembalikan_oleh,
  i.temuan          AS tugas_temuan,
  i.deskripsi       AS tugas_deskripsi,
  i.assigned_at     AS tugas_ditugaskan,
  i.foto_sebelum_url AS tugas_foto,
  p.foto_sebelum_lain,
  p.foto_sesudah_lain,
  p.foto_proses_url,
  p.pelaksana,
  p.sumber,
  p.diinput_oleh,
  p.kelompok_id                        -- ★
FROM public.pemeliharaan_jaringan p
LEFT JOIN public.pemeliharaan_jaringan_ref r ON r.kode = p.kategori
LEFT JOIN public.inspeksi i ON i.id = p.inspeksi_id;
GRANT SELECT ON public.pemeliharaan_jaringan_daftar TO authenticated;

NOTIFY pgrst, 'reload schema';
