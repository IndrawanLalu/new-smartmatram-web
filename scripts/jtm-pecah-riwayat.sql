-- =============================================================================
-- Riwayat inspeksi ikut Pecah / Gabung segmen (25 Okt 2026)
-- Jalankan SESUDAH jtm-section-pecah.sql & jtm-section-gardu.sql. Idempoten.
--
-- Masalah: inspeksi menempel di SATU segmen. Setelah Pecah, potongan baru
-- terbaca "belum pernah diinspeksi" (naik ke atas daftar WO, tidak boleh Tier
-- 2) dan tiangnya hilang dari Rekap Data — padahal tiangnya sudah diinspeksi
-- (dicek 25 Okt: AMPENAN kehilangan 20 tiang / 0,839 km di Rekap Data).
--
-- Keputusan user 25 Okt: "harus singkron semuanya".
--   • segmen_warisan — potongan Pecah mewarisi riwayat segmen asalnya; hasil
--     Gabung mewarisi segmen hilir yang digabungkan. Inspeksi yang DIBUAT
--     sebelum pecah/gabung saja yang diwarisi.
--   • inspeksi_jtm_milik — inspeksi segmen itu sendiri + warisannya. Dibaca:
--     Master Segmen (terakhir diinspeksi / umur → urutan WO), jtm_cakupan
--     (daftar segmen HP, Dasbor JTM), syarat Tier 2 (sudah dititik Tier 1).
--   • rekap_data_jtm — per TIANG: hasil inspeksi terbaru tiang itu, dihitung
--     ke segmen tempat tiang itu berada sekarang.
--
-- Yang TIDAK berubah: inspeksi, titik, jawaban, persetujuan, WO, realisasi
-- (km beku saat disetujui) — tetap di segmen tempat inspeksinya dikerjakan.
-- =============================================================================


-- ── 1. Tabel warisan ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.segmen_warisan (
  segmen_id UUID NOT NULL REFERENCES public.segmen(id) ON DELETE CASCADE,
  asal_id   UUID NOT NULL REFERENCES public.segmen(id) ON DELETE CASCADE,
  sejak     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (segmen_id, asal_id),
  CHECK (segmen_id <> asal_id)
);
COMMENT ON TABLE public.segmen_warisan IS
  'Riwayat inspeksi yang diwarisi segmen hasil Pecah (dari asalnya) / Gabung (dari hilir). Inspeksi asal yang dibuat sebelum `sejak` dihitung milik segmen ini.';
ALTER TABLE public.segmen_warisan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS segmen_warisan_baca ON public.segmen_warisan;
CREATE POLICY segmen_warisan_baca ON public.segmen_warisan FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.segmen_warisan TO authenticated;

-- Berantai: potongan dari potongan mewarisi sampai asal paling awal, dengan
-- batas waktu yang paling awal di sepanjang rantai.
CREATE OR REPLACE VIEW public.segmen_asal AS
WITH RECURSIVE r AS (
  SELECT w.segmen_id, w.asal_id, w.sejak AS sampai, 1 AS dalam, ARRAY[w.segmen_id, w.asal_id] AS jalur
  FROM public.segmen_warisan w
  UNION ALL
  SELECT r.segmen_id, w.asal_id, LEAST(r.sampai, w.sejak), r.dalam + 1, r.jalur || w.asal_id
  FROM r JOIN public.segmen_warisan w ON w.segmen_id = r.asal_id
  WHERE r.dalam < 20 AND NOT w.asal_id = ANY (r.jalur)
)
SELECT segmen_id, asal_id, max(sampai) AS sampai FROM r GROUP BY segmen_id, asal_id;
GRANT SELECT ON public.segmen_asal TO authenticated;

-- Inspeksi milik segmen: sendiri + warisan. `sendiri` = dikerjakan di segmen ini.
CREATE OR REPLACE VIEW public.inspeksi_jtm_milik AS
SELECT m.segmen_id, m.id AS inspeksi_id, m.status, m.tier, m.ulp, m.tgl_mulai, m.tgl_selesai, true AS sendiri
FROM public.inspeksi_jtm m
UNION ALL
SELECT a.segmen_id, m.id, m.status, m.tier, m.ulp, m.tgl_mulai, m.tgl_selesai, false
FROM public.segmen_asal a
JOIN public.inspeksi_jtm m ON m.segmen_id = a.asal_id AND m.created_at < a.sampai;
COMMENT ON VIEW public.inspeksi_jtm_milik IS
  'Inspeksi JTM per segmen termasuk yang diwarisi dari segmen asal (Pecah/Gabung). sendiri=false = warisan.';
GRANT SELECT ON public.inspeksi_jtm_milik TO authenticated;


-- ── 2. Pecah & Gabung mencatat warisan ───────────────────────────────────────
-- Isi fungsi disalin dari jtm-section-pecah.sql (sudah termasuk WHERE true);
-- yang ditambah ★ warisan.
CREATE OR REPLACE FUNCTION public.pecah_segmen(
  p_segmen UUID,
  p_potong UUID[],
  p_nama   JSONB   DEFAULT '{}'::jsonb,
  p_oleh   TEXT    DEFAULT NULL,
  p_uji    BOOLEAN DEFAULT true
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s       RECORD;
  rb      RECORD;
  potong  UUID[];
  galat   TEXT[] := ARRAY[]::TEXT[];
  hasil   JSONB;
  v_bagian JSONB;
  usul    JSONB;
  dipakai TEXT;
  baru    UUID;
  dibuat  JSONB := '[]'::jsonb;
  ta RECORD; tb RECORD;
BEGIN
  SELECT * INTO s FROM public.segmen WHERE id = p_segmen;
  IF NOT FOUND THEN RAISE EXCEPTION 'Segmen tidak ditemukan'; END IF;
  IF s.status <> 'aktif' THEN RAISE EXCEPTION 'Segmen % tidak aktif', s.nama; END IF;

  -- Titik potong unik, urutan pertama dipertahankan.
  SELECT COALESCE(array_agg(x ORDER BY i), ARRAY[]::UUID[]) INTO potong
  FROM (SELECT x, min(i) i FROM unnest(COALESCE(p_potong, ARRAY[]::UUID[])) WITH ORDINALITY u(x, i) GROUP BY x) d;

  PERFORM public._segmen_simpul(ARRAY[p_segmen]);

  -- Penilaian titik potong.
  SELECT galat || COALESCE(array_agg(m ORDER BY m), ARRAY[]::TEXT[]) INTO galat FROM (
    SELECT CASE
      WHEN g.id IS NULL THEN format('Tiang %s bukan anggota segmen ini.', COALESCE((SELECT kode FROM public.tiang WHERE id = p.x), '?'))
      WHEN g.induk IS NULL THEN format('Tiang %s pangkal segmen — tidak bisa jadi titik potong.', g.kode)
      WHEN NOT EXISTS (SELECT 1 FROM _sg_simpul c WHERE c.induk = g.id) THEN format('Tiang %s ujung segmen — tidak ada yang dipotong di sana.', g.kode)
    END AS m
    FROM unnest(potong) p(x) LEFT JOIN _sg_simpul g ON g.id = p.x
  ) z WHERE m IS NOT NULL;

  -- Bagian tiap tiang: 0 = potongan pangkal (segmen lama), i = mulai di potong[i].
  WITH RECURSIVE w AS (
    SELECT g.id, 0 AS bagian FROM _sg_simpul g WHERE g.induk IS NULL
    UNION ALL
    SELECT c.id, COALESCE(array_position(potong, c.id), w.bagian)
    FROM _sg_simpul c JOIN w ON c.induk = w.id
  )
  UPDATE _sg_simpul g SET bagian = w.bagian FROM w WHERE w.id = g.id;

  -- Anggota tiap potongan: tiang potong ikut sebagai ujung potongan induknya.
  DROP TABLE IF EXISTS _sg_anggota;
  CREATE TEMP TABLE _sg_anggota ON COMMIT DROP AS
  SELECT g.bagian, g.id FROM _sg_simpul g WHERE g.bagian IS NOT NULL
  UNION
  SELECT i.bagian, g.id FROM _sg_simpul g JOIN _sg_simpul i ON i.id = g.induk
  WHERE g.id = ANY (potong) AND i.bagian IS NOT NULL;

  -- Ringkasan potongan.
  DROP TABLE IF EXISTS _sg_bagian;
  CREATE TEMP TABLE _sg_bagian ON COMMIT DROP AS
  SELECT a.bagian,
         ak.id AS akar_id, ak.kode AS akar_kode, ak.lat AS akar_lat, ak.lng AS akar_lng,
         ak.penanda AS akar_penanda, ak.nama_alat AS akar_alat,
         uj.id AS ujung_id, uj.kode AS ujung_kode, uj.penanda AS ujung_penanda, uj.nama_alat AS ujung_alat,
         (SELECT count(*) FROM _sg_anggota x WHERE x.bagian = a.bagian) AS jumlah_tiang,
         (SELECT COALESCE(sum(public.jarak_meter(i.lat, i.lng, g.lat, g.lng)), 0) / 1000.0
            FROM _sg_anggota x JOIN _sg_simpul g ON g.id = x.id
            JOIN _sg_anggota xi ON xi.bagian = x.bagian AND xi.id = g.induk
            JOIN _sg_simpul i ON i.id = g.induk
           WHERE x.bagian = a.bagian AND g.lat IS NOT NULL AND i.lat IS NOT NULL) AS panjang_km,
         (SELECT COALESCE(array_agg(DISTINCT g.section_nama ORDER BY g.section_nama), ARRAY[]::TEXT[])
            FROM _sg_anggota x JOIN _sg_simpul g ON g.id = x.id
           WHERE x.bagian = a.bagian AND g.section_id IS NOT NULL AND NOT g.hulu_section) AS section,
         (SELECT COALESCE(jsonb_agg(jsonb_build_array(i.lat, i.lng, g.lat, g.lng)), '[]'::jsonb)
            FROM _sg_anggota x JOIN _sg_simpul g ON g.id = x.id
            JOIN _sg_anggota xi ON xi.bagian = x.bagian AND xi.id = g.induk
            JOIN _sg_simpul i ON i.id = g.induk
           WHERE x.bagian = a.bagian AND g.lat IS NOT NULL AND i.lat IS NOT NULL) AS garis
  FROM (SELECT DISTINCT bagian FROM _sg_anggota) a
  -- Akar: pangkal segmen (bagian 0, yang paling dangkal) atau tiang potongnya.
  LEFT JOIN LATERAL (
    SELECT g.* FROM _sg_simpul g
    WHERE CASE WHEN a.bagian = 0 THEN g.bagian = 0 AND g.induk IS NULL ELSE g.id = potong[a.bagian] END
    ORDER BY g.dalam NULLS LAST LIMIT 1) ak ON true
  -- Ujung: tiang terdalam potongan itu.
  LEFT JOIN LATERAL (
    SELECT g.* FROM _sg_anggota x JOIN _sg_simpul g ON g.id = x.id
    WHERE x.bagian = a.bagian AND g.id <> ak.id
    ORDER BY g.dalam DESC NULLS LAST, g.kode LIMIT 1) uj ON true;

  -- Nama tiap potongan: ketikan admin, kalau kosong usulan.
  ALTER TABLE _sg_bagian ADD COLUMN nama_usul TEXT, ADD COLUMN nama TEXT;
  UPDATE _sg_bagian SET nama_usul = CASE WHEN bagian = 0 THEN s.nama ELSE
    public._segmen_label_tiang(akar_penanda, akar_alat, akar_kode) || ' - ' ||
    COALESCE(public._segmen_label_tiang(ujung_penanda, ujung_alat, ujung_kode), 'UJUNG') END
  WHERE true;   -- WHERE wajib: Supabase menolak UPDATE tanpa WHERE (safeupdate)
  UPDATE _sg_bagian SET nama = COALESCE(
    NULLIF(public.rapikan_nama_segmen(p_nama ->> CASE WHEN bagian = 0 THEN 'asal' ELSE akar_id::text END), ''),
    public.rapikan_nama_segmen(nama_usul))
  WHERE true;   -- WHERE wajib: Supabase menolak UPDATE tanpa WHERE (safeupdate)

  -- Penjaga.
  SELECT galat || COALESCE(array_agg(m ORDER BY m), ARRAY[]::TEXT[]) INTO galat FROM (
    SELECT format('Potongan "%s" melewati keypoint (%s) — tambahkan titik potong di keypoint-nya.',
                  b.nama, array_to_string(b.section, ', ')) AS m
    FROM _sg_bagian b WHERE cardinality(b.section) > 1
    UNION ALL
    SELECT format('Nama "%s" dipakai lebih dari satu potongan.', b.nama)
    FROM _sg_bagian b GROUP BY b.nama HAVING count(*) > 1
    UNION ALL
    SELECT format('Nama "%s" sudah dipakai segmen lain di penyulang %s.', b.nama, s.penyulang)
    FROM _sg_bagian b
    WHERE EXISTS (SELECT 1 FROM public.segmen o
                  WHERE o.status = 'aktif' AND o.id <> s.id AND upper(o.penyulang) = upper(s.penyulang)
                    AND upper(o.ulp) = upper(s.ulp) AND upper(o.nama) = upper(b.nama))
  ) z;

  dipakai := public._segmen_sedang_dipakai(p_segmen);
  IF dipakai IS NOT NULL THEN galat := galat || dipakai; END IF;
  IF cardinality(potong) = 0 THEN galat := galat || 'Belum ada titik potong — klik tiang di peta.'::TEXT; END IF;

  -- Keypoint di tengah segmen (punya hulu & hilir di segmen): usulan titik potong.
  SELECT COALESCE(jsonb_agg(g.id ORDER BY g.dalam), '[]'::jsonb) INTO usul
  FROM _sg_simpul g
  WHERE g.keypoint AND g.induk IS NOT NULL AND EXISTS (SELECT 1 FROM _sg_simpul c WHERE c.induk = g.id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'no', b.bagian, 'asal', b.bagian = 0, 'akar_id', b.akar_id, 'akar_kode', b.akar_kode,
           'jumlah_tiang', b.jumlah_tiang, 'panjang_km', round(b.panjang_km::numeric, 3),
           'section', to_jsonb(b.section), 'nama_usul', b.nama_usul, 'nama', b.nama,
           'garis', b.garis, 'titik', jsonb_build_object('lat', b.akar_lat, 'lng', b.akar_lng))
         ORDER BY b.bagian = 0 DESC, (SELECT g.dalam FROM _sg_simpul g WHERE g.id = b.akar_id), b.bagian), '[]'::jsonb)
  INTO v_bagian FROM _sg_bagian b;

  hasil := jsonb_build_object(
    'segmen', jsonb_build_object('id', s.id, 'nama', s.nama, 'penyulang', s.penyulang, 'ulp', s.ulp),
    'bagian', v_bagian, 'usul_potong', usul, 'galat', to_jsonb(galat));

  IF p_uji THEN RETURN hasil; END IF;

  -- ── Terapkan ──
  PERFORM public.penyulang_wajib_boleh(s.ulp);
  PERFORM 1 FROM public.segmen WHERE id = p_segmen FOR UPDATE;
  IF cardinality(galat) > 0 THEN RAISE EXCEPTION '%', galat[1]; END IF;

  -- Nama potongan pangkal dulu (bisa saja nama lamanya diberikan ke potongan lain).
  SELECT * INTO rb FROM _sg_bagian WHERE bagian = 0;
  SELECT * INTO tb FROM public._segmen_titik_tiang(rb.ujung_penanda, rb.ujung_alat, rb.ujung_kode);
  UPDATE public.segmen
     SET nama = rb.nama, nama_bebas = true,
         titik_akhir_jenis = COALESCE(tb.jenis, titik_akhir_jenis),
         titik_akhir_nama = COALESCE(tb.nama, titik_akhir_nama),
         titik_akhir_tiang_id = COALESCE(rb.ujung_id, titik_akhir_tiang_id)
   WHERE id = s.id;

  FOR rb IN SELECT * FROM _sg_bagian WHERE bagian > 0 ORDER BY bagian LOOP
    SELECT * INTO ta FROM public._segmen_titik_tiang(rb.akar_penanda, rb.akar_alat, rb.akar_kode);
    SELECT * INTO tb FROM public._segmen_titik_tiang(rb.ujung_penanda, rb.ujung_alat, rb.ujung_kode);
    INSERT INTO public.segmen (penyulang, ulp, nama, nama_bebas, sumber, status,
                               titik_awal_jenis, titik_awal_nama, titik_awal_tiang_id,
                               titik_akhir_jenis, titik_akhir_nama, titik_akhir_tiang_id,
                               penghantar_jenis, penghantar_ukuran, dikonfirmasi_at, dikonfirmasi_oleh,
                               catatan)
    VALUES (s.penyulang, s.ulp, rb.nama, true, s.sumber, 'aktif',
            ta.jenis, ta.nama, rb.akar_id,
            COALESCE(tb.jenis, 'UJUNG'), COALESCE(tb.nama, ''), rb.ujung_id,
            s.penghantar_jenis, s.penghantar_ukuran, s.dikonfirmasi_at, s.dikonfirmasi_oleh,
            '[dipecah dari ' || s.nama || ']')
    RETURNING id INTO baru;
    INSERT INTO public.segmen_warisan (segmen_id, asal_id) VALUES (baru, s.id) ON CONFLICT DO NOTHING;   -- ★ warisan

    INSERT INTO public.segmen_tiang (segmen_id, tiang_id, posisi, sumber)
    SELECT baru, st.tiang_id, st.posisi, st.sumber
    FROM public.segmen_tiang st JOIN _sg_anggota x ON x.id = st.tiang_id AND x.bagian = rb.bagian
    WHERE st.segmen_id = s.id;

    dibuat := dibuat || jsonb_build_object('id', baru, 'nama', rb.nama);
  END LOOP;

  -- Tiang yang pindah seluruhnya keluar dari segmen lama (tiang potong tetap
  -- di sana sebagai ujungnya). Tiang segmen yang tidak aktif tidak disentuh.
  DELETE FROM public.segmen_tiang st
  WHERE st.segmen_id = s.id
    AND EXISTS (SELECT 1 FROM _sg_anggota x WHERE x.id = st.tiang_id)
    AND NOT EXISTS (SELECT 1 FROM _sg_anggota x WHERE x.id = st.tiang_id AND x.bagian = 0);

  -- Segmen anak yang pangkalnya kini di potongan baru ikut menunjuk ke sana
  -- (induk_segmen_id disusun pemicu dari tiang pangkalnya).
  UPDATE public.segmen c SET titik_awal_tiang_id = c.titik_awal_tiang_id
  WHERE c.induk_segmen_id = s.id AND c.status = 'aktif';

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('segmen', s.nama, COALESCE(s.ulp, '-'), 'pecah',
          jsonb_build_object('nama', s.nama),
          jsonb_build_object('asal', (SELECT nama FROM _sg_bagian WHERE bagian = 0), 'baru', dibuat),
          'sunting_admin', auth.uid(), p_oleh);

  RETURN hasil || jsonb_build_object('segmen_baru', dibuat);
END $$;

CREATE OR REPLACE FUNCTION public.gabung_segmen_section(
  p_a    UUID,
  p_b    UUID,
  p_nama TEXT    DEFAULT NULL,
  p_oleh TEXT    DEFAULT NULL,
  p_uji  BOOLEAN DEFAULT true
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a RECORD; b RECORD; hulu RECORD; hilir RECORD;
  galat   TEXT[] := ARRAY[]::TEXT[];
  sect    TEXT[];
  v_nama  TEXT;
  dipakai TEXT;
  hasil   JSONB;
  jml     INT; km NUMERIC;
BEGIN
  IF p_a = p_b THEN RAISE EXCEPTION 'Pilih dua segmen yang berbeda'; END IF;
  SELECT * INTO a FROM public.segmen WHERE id = p_a;
  SELECT * INTO b FROM public.segmen WHERE id = p_b;
  IF a.id IS NULL OR b.id IS NULL THEN RAISE EXCEPTION 'Segmen tidak ditemukan'; END IF;
  IF a.status <> 'aktif' OR b.status <> 'aktif' THEN RAISE EXCEPTION 'Kedua segmen harus aktif'; END IF;
  IF upper(a.penyulang) <> upper(b.penyulang) OR upper(a.ulp) <> upper(b.ulp) THEN
    RAISE EXCEPTION 'Segmen beda penyulang tidak bisa digabung (% / %)', a.penyulang, b.penyulang;
  END IF;

  PERFORM public._segmen_simpul(ARRAY[p_a, p_b]);

  -- Bersebelahan: berbagi tiang, atau pangkal yang satu bergantung pada tiang yang lain.
  IF NOT EXISTS (SELECT 1 FROM _sg_simpul WHERE di_a AND di_b)
     AND NOT EXISTS (SELECT 1 FROM _sg_simpul g JOIN _sg_simpul i ON i.id = g.induk_langsung
                     WHERE (g.di_a AND NOT g.di_b AND i.di_b) OR (g.di_b AND NOT g.di_a AND i.di_a)) THEN
    galat := galat || format('%s dan %s tidak bersambung.', a.nama, b.nama);
  END IF;

  SELECT COALESCE(array_agg(DISTINCT section_nama ORDER BY section_nama), ARRAY[]::TEXT[]) INTO sect
  FROM _sg_simpul WHERE section_id IS NOT NULL AND NOT hulu_section;
  IF cardinality(sect) > 1 THEN
    galat := galat || format('Hasil gabungan melewati keypoint (%s) — segmen hanya boleh di satu section.', array_to_string(sect, ', '));
  END IF;

  -- Hulu = segmen yang memuat tiang paling dangkal.
  IF (SELECT di_a FROM _sg_simpul WHERE dalam IS NOT NULL ORDER BY dalam, di_a DESC LIMIT 1) THEN
    hulu := a; hilir := b;
  ELSE
    hulu := b; hilir := a;
  END IF;

  v_nama := COALESCE(NULLIF(public.rapikan_nama_segmen(p_nama), ''), hulu.nama);
  IF EXISTS (SELECT 1 FROM public.segmen o
             WHERE o.status = 'aktif' AND o.id NOT IN (p_a, p_b) AND upper(o.penyulang) = upper(a.penyulang)
               AND upper(o.ulp) = upper(a.ulp) AND upper(o.nama) = v_nama) THEN
    galat := galat || format('Nama "%s" sudah dipakai segmen lain di penyulang %s.', v_nama, a.penyulang);
  END IF;
  dipakai := COALESCE(public._segmen_sedang_dipakai(p_a), public._segmen_sedang_dipakai(p_b));
  IF dipakai IS NOT NULL THEN galat := galat || dipakai; END IF;

  SELECT count(*) INTO jml FROM _sg_simpul;
  SELECT COALESCE(sum(public.jarak_meter(i.lat, i.lng, g.lat, g.lng)), 0) / 1000.0 INTO km
  FROM _sg_simpul g JOIN _sg_simpul i ON i.id = g.induk WHERE g.lat IS NOT NULL AND i.lat IS NOT NULL;

  hasil := jsonb_build_object(
    'hulu', jsonb_build_object('id', hulu.id, 'nama', hulu.nama),
    'hilir', jsonb_build_object('id', hilir.id, 'nama', hilir.nama),
    'nama', v_nama, 'jumlah_tiang', jml, 'panjang_km', round(km, 3),
    'section', to_jsonb(sect), 'galat', to_jsonb(galat));
  IF p_uji THEN RETURN hasil; END IF;

  PERFORM public.penyulang_wajib_boleh(a.ulp);
  PERFORM 1 FROM public.segmen WHERE id IN (p_a, p_b) FOR UPDATE;
  IF cardinality(galat) > 0 THEN RAISE EXCEPTION '%', galat[1]; END IF;

  PERFORM public.gabung_segmen(hilir.id, hulu.id, p_oleh);
  INSERT INTO public.segmen_warisan (segmen_id, asal_id) VALUES (hulu.id, hilir.id) ON CONFLICT DO NOTHING;   -- ★ warisan
  UPDATE public.segmen
     SET nama = v_nama, nama_bebas = true,
         titik_akhir_jenis = hilir.titik_akhir_jenis, titik_akhir_nama = hilir.titik_akhir_nama,
         titik_akhir_tiang_id = hilir.titik_akhir_tiang_id
   WHERE id = hulu.id;

  RETURN hasil;
END $$;


-- ── 3. Pecah yang sudah terjadi sebelum ini ─────────────────────────────────
-- Potongan "[dipecah dari …]" yang lahir dari SATU kali Pecah dibuat pada
-- saat yang sama (penyulang sama, created_at sama). Asalnya = segmen
-- penyulang itu yang lebih dulu ada dan memuat tiang pangkal salah satu
-- potongan (tiang potong ikut di kedua sisi).
WITH pot AS (
  SELECT s.id, s.penyulang, s.created_at, s.titik_awal_tiang_id
  FROM public.segmen s
  WHERE s.catatan LIKE '[dipecah dari %'
)
INSERT INTO public.segmen_warisan (segmen_id, asal_id, sejak)
SELECT p.id, a.id, p.created_at
FROM pot p
CROSS JOIN LATERAL (
  SELECT x.id FROM public.segmen x
  JOIN public.segmen_tiang st ON st.segmen_id = x.id
  JOIN pot q ON q.titik_awal_tiang_id = st.tiang_id
            AND upper(q.penyulang) = upper(p.penyulang) AND q.created_at = p.created_at
  WHERE upper(x.penyulang) = upper(p.penyulang) AND x.created_at < p.created_at
  ORDER BY x.created_at LIMIT 1
) a
ON CONFLICT DO NOTHING;


-- ── 4. Master Segmen: terakhir diinspeksi ────────────────────────────────────
-- Salinan master-segmen.sql; yang berubah ★.
CREATE OR REPLACE VIEW public.master_segmen AS
SELECT
  sp.segmen_id,
  sp.nama,
  sp.penyulang,
  sp.ulp,
  sp.status,
  sp.sumber,
  sp.jumlah_tiang,
  sp.jumlah_gawang,
  sp.panjang_km,
  sp.panjang_manual_km,
  sp.panjang_pakai_km,
  sp.panjang_dari,
  sp.tiang_bersama,
  s.catatan,
  s.created_at,

  ins.terakhir AS terakhir_inspeksi,
  CASE WHEN ins.terakhir IS NULL THEN NULL
       ELSE floor(EXTRACT(EPOCH FROM (now() - ins.terakhir)) / 2592000)::INT
  END AS umur_inspeksi_bulan,
  ins.sedang_berjalan AS inspeksi_berjalan
FROM public.segmen_panjang sp
JOIN public.segmen s ON s.id = sp.segmen_id
LEFT JOIN LATERAL (
  -- ★ Terakhir diinspeksi ikut riwayat warisan (segmen hasil pecah/gabung);
  --   "sedang berjalan" hanya inspeksi segmen ini sendiri.
  SELECT
    max(COALESCE(m.tgl_selesai, m.tgl_mulai))
      FILTER (WHERE m.status = 'Diverifikasi')                       AS terakhir,
    count(*) FILTER (WHERE m.status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai') AND m.sendiri) > 0
                                                                     AS sedang_berjalan
  FROM public.inspeksi_jtm_milik m
  WHERE m.segmen_id = sp.segmen_id
) ins ON true;


-- ── 5. Cakupan (daftar segmen HP, Dasbor JTM) ────────────────────────────────
-- Salinan jtm-cakupan-cepat.sql; yang berubah ★.
CREATE OR REPLACE VIEW public.jtm_cakupan AS
WITH per_segmen AS (
  SELECT
    s.id AS segmen_id, s.nama, s.penyulang, s.ulp,
    count(st.tiang_id)                                        AS tiang,
    count(*) FILTER (WHERE k.ada)                             AS tiang_dinilai
  FROM public.segmen s
  LEFT JOIN public.segmen_tiang st ON st.segmen_id = s.id
  LEFT JOIN LATERAL (
    SELECT true AS ada
    FROM public.inspeksi_jtm_titik tk
    JOIN public.inspeksi_jtm m          ON m.id = tk.inspeksi_id AND m.status = 'Diverifikasi'
    JOIN public.inspeksi_jtm_periksa p  ON p.titik_id = tk.id
                                       AND (p.nilai IS NOT NULL OR p.nilai_angka IS NOT NULL)
    JOIN public.jtm_item_ref i          ON i.kode = p.item_kode
    JOIN public.tiang t                 ON t.id = tk.tiang_id
    WHERE tk.tiang_id = st.tiang_id
    LIMIT 1
  ) k ON true
  WHERE s.status = 'aktif'
    AND s.sumber IS DISTINCT FROM 'tempelan'   -- segmen tempelan WO bukan segmen inspeksi JTM
  GROUP BY s.id, s.nama, s.penyulang, s.ulp
)
SELECT
  p.*,
  round(100.0 * p.tiang_dinilai / NULLIF(p.tiang, 0), 1) AS persen_dinilai,
  (SELECT max(COALESCE(m.tgl_selesai, m.tgl_mulai))
     FROM public.inspeksi_jtm_milik m   -- ★ ikut riwayat warisan
    WHERE m.segmen_id = p.segmen_id AND m.status = 'Diverifikasi') AS terakhir_disapu,
  (SELECT max(COALESCE(m.tgl_selesai, m.tgl_mulai))
     FROM public.inspeksi_jtm_milik m   -- ★ ikut riwayat warisan
    WHERE m.segmen_id = p.segmen_id AND m.status = 'Diverifikasi') AS terakhir_inspeksi
FROM per_segmen p;


-- ── 6. Syarat Tier 2 (sudah dititik Tier 1) ─────────────────────────────────
-- Salinan jtm-tier2-malam.sql; yang berubah ★.
CREATE OR REPLACE FUNCTION public.jtm_sudah_dititik(p_segmen UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.inspeksi_jtm_milik   -- ★ ikut riwayat warisan
                 WHERE segmen_id = p_segmen AND tier = '1' AND status = 'Diverifikasi')
$fn$;

CREATE OR REPLACE FUNCTION public.jtm_segmen_dititik(p_ulp TEXT DEFAULT NULL)
RETURNS TABLE (segmen_id UUID)
LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT DISTINCT m.segmen_id FROM public.inspeksi_jtm_milik m   -- ★ ikut riwayat warisan
  WHERE m.tier = '1' AND m.status = 'Diverifikasi'
    AND (NULLIF(btrim(COALESCE(p_ulp, '')), '') IS NULL OR upper(m.ulp) = upper(p_ulp))
$fn$;


-- ── 7. Rekap Data JTM per tiang ──────────────────────────────────────────────
-- Salinan jtm-rekap-data-saring.sql (tanda tangan sama); yang berubah ★★.
CREATE OR REPLACE FUNCTION public.rekap_data_jtm(
  p_ulp       TEXT DEFAULT NULL,
  p_penyulang TEXT DEFAULT NULL,   -- ★
  p_segmen_id UUID DEFAULT NULL    -- ★
)
RETURNS TABLE (
  penyulang  TEXT,
  ulp        TEXT,
  segmen_id  UUID,
  segmen     TEXT,
  kms        NUMERIC,
  tiang      INT,
  ukuran     JSONB,
  jenis      JSONB,
  jenis_tiang JSONB,
  peralatan  JSONB,
  gardu      INT,
  gardu_kva  NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH m AS (
  SELECT i.id, i.segmen_id, upper(i.penyulang) AS p, upper(i.ulp) AS u,
         COALESCE(i.tgl_selesai::timestamptz, i.verified_at, i.tgl_mulai::timestamptz) AS w
  FROM inspeksi_jtm i
  WHERE i.status IN ('Selesai', 'Diverifikasi')
    AND i.segmen_id IS NOT NULL
    AND (p_ulp IS NULL OR upper(i.ulp) = upper(p_ulp))
    AND (p_penyulang IS NULL OR upper(i.penyulang) = upper(p_penyulang))   -- ★
    -- ★★ Saringan segmen: inspeksi yang menilai tiang segmen itu SEKARANG
    --    (setelah pecah/gabung tiangnya bisa dinilai inspeksi segmen asal).
    AND (p_segmen_id IS NULL OR EXISTS (
          SELECT 1 FROM inspeksi_jtm_titik t2
          JOIN segmen_tiang s2 ON s2.tiang_id = t2.tiang_id AND s2.segmen_id = p_segmen_id
          WHERE t2.inspeksi_id = i.id))
), tk AS (
  -- ★★ Per TIANG (25 Okt 2026): tiap tiang segmen memakai titik dari inspeksi
  --    terbaru penyulang itu yang menilainya — inspeksi segmen mana pun. Dulu
  --    hanya inspeksi milik segmen itu sendiri, jadi tiang yang pindah karena
  --    Pecah/Gabung segmen hilang dari rekap padahal sudah diinspeksi.
  SELECT DISTINCT ON (sx.segmen_id, t.tiang_id)
         sx.segmen_id, m.p, m.u, t.tiang_id, t.id AS titik_id
  FROM inspeksi_jtm_titik t
  JOIN m ON m.id = t.inspeksi_id
  -- Hanya tiang yang masih aktif DAN (kini) anggota segmen penyulang itu:
  -- tiang yang sudah dibatalkan tetap tercatat di inspeksi lamanya.
  JOIN tiang ta ON ta.id = t.tiang_id AND ta.status_hidup = 'aktif'
  JOIN segmen_tiang sx ON sx.tiang_id = t.tiang_id
  JOIN segmen sgx ON sgx.id = sx.segmen_id AND upper(sgx.penyulang) = m.p
   AND (p_segmen_id IS NULL OR sx.segmen_id = p_segmen_id)
  ORDER BY sx.segmen_id, t.tiang_id, m.w DESC NULLS LAST
), nilai AS (
  -- Kabel penyulang ini dulu, lalu isian tanpa kabel (tiang satu sirkit),
  -- baru kabel penyulang lain.
  SELECT DISTINCT ON (tk.segmen_id, tk.tiang_id, pr.item_kode)
         tk.segmen_id, tk.tiang_id, pr.item_kode, pr.nilai
  FROM tk
  JOIN inspeksi_jtm_periksa pr
    ON pr.titik_id = tk.titik_id AND pr.bagian = '-' AND pr.nilai IS NOT NULL
   AND pr.item_kode IN ('ukuran_konduktor', 'jenis_konduktor', 'jenis_tiang')
  LEFT JOIN segmen ss ON ss.id = pr.sirkit_segmen_id
  ORDER BY tk.segmen_id, tk.tiang_id, pr.item_kode,
           CASE WHEN upper(ss.penyulang) = tk.p THEN 0 WHEN ss.id IS NULL THEN 1 ELSE 2 END,
           pr.updated_at DESC
), dasar0 AS (
  SELECT tk.segmen_id, tk.p, tk.u, tk.tiang_id,
         g.panjang_m, n.ukuran, n.jenis,
         -- Tiang milik penyulang lain yang cuma ditumpangi kabel penyulang ini:
         -- badannya tidak diisi di inspeksi ini (sudah di inspeksi pemiliknya),
         -- jadi masuk kolom sendiri, bukan "belum diisi" (10 Okt 2026).
         CASE WHEN upper(COALESCE(t.penyulang, '')) <> tk.p THEN 'menumpang' ELSE n.jenis_tiang END AS jenis_tiang,
         t.penanda,
         upper(NULLIF(btrim(t.gardu_di_tiang), '')) AS gardu_kode
  FROM tk
  JOIN tiang t ON t.id = tk.tiang_id
  LEFT JOIN (
    SELECT g.tiang_id, si.segmen_id, g.panjang_m
    FROM tiang_gawang_jtm g
    JOIN segmen_tiang si ON si.tiang_id = g.induk_id
  ) g ON g.tiang_id = tk.tiang_id AND g.segmen_id = tk.segmen_id
  LEFT JOIN (
    SELECT segmen_id, tiang_id,
           max(nilai) FILTER (WHERE item_kode = 'ukuran_konduktor') AS ukuran,
           max(nilai) FILTER (WHERE item_kode = 'jenis_konduktor')  AS jenis,
           max(nilai) FILTER (WHERE item_kode = 'jenis_tiang')      AS jenis_tiang
    FROM nilai GROUP BY segmen_id, tiang_id
  ) n ON n.segmen_id = tk.segmen_id AND n.tiang_id = tk.tiang_id
), milik AS MATERIALIZED (
  -- Dibaca SEKALI (beberapa baris saja), bukan per tiang.
  SELECT v.tiang_id, upper(v.penyulang) AS p, v.hitung FROM jtm_pemilik_penanda v
), dasar AS (
  -- Peralatan & gardu di tiang bersama dihitung di SATU penyulang
  -- (jtm_pemilik_penanda — scripts/jtm-peralatan-tiang-bersama.sql).
  SELECT d.segmen_id, d.p, d.u, d.tiang_id, d.panjang_m, d.ukuran, d.jenis, d.jenis_tiang,
         CASE WHEN COALESCE(v.hitung, true) THEN d.penanda END AS penanda,
         CASE WHEN COALESCE(v.hitung, true) THEN d.gardu_kode END AS gardu_kode
  FROM dasar0 d
  LEFT JOIN milik v ON v.tiang_id = d.tiang_id AND v.p = d.p
), semua AS (
  -- Tingkat segmen, lalu tingkat penyulang (segmen_id NULL) — satu tiang
  -- sekali per penyulang; yang punya gawang didahulukan.
  SELECT * FROM dasar
  UNION ALL
  SELECT * FROM (
    SELECT DISTINCT ON (d.p, d.u, d.tiang_id)
           NULL::uuid, d.p, d.u, d.tiang_id, d.panjang_m, d.ukuran, d.jenis, d.jenis_tiang, d.penanda, d.gardu_kode
    FROM dasar d
    ORDER BY d.p, d.u, d.tiang_id, d.panjang_m DESC NULLS LAST
  ) x
  UNION ALL
  -- Baris JUMLAH (penyulang & ulp = ''): tiap batang fisik SEKALI. Tiang yang
  -- ditumpangi tercatat di pemilik DAN penumpangnya; di sini dihitung sebagai
  -- milik sendiri bila pemiliknya ikut terinspeksi. kms baris ini TIDAK
  -- dipakai — kms adalah kilometer sirkit, jumlahnya dari baris penyulang.
  SELECT * FROM (
    SELECT DISTINCT ON (d.tiang_id)
           NULL::uuid, '', '', d.tiang_id, d.panjang_m, d.ukuran, d.jenis, d.jenis_tiang, d.penanda, d.gardu_kode
    FROM dasar0 d  -- gardu belum dipilah per penyulang: tiap gardu fisik ikut sekali
    ORDER BY d.tiang_id, (d.jenis_tiang = 'menumpang') NULLS FIRST, d.panjang_m DESC NULLS LAST
  ) y
), pokok AS (
  SELECT s.segmen_id, s.p, s.u,
         round((COALESCE(sum(s.panjang_m), 0) / 1000)::numeric, 3) AS kms,
         count(*)::int AS tiang,
         count(DISTINCT s.gardu_kode)::int AS gardu
  FROM semua s
  GROUP BY s.segmen_id, s.p, s.u
), kva AS (
  SELECT x.segmen_id, x.p, x.u, sum(g.daya)::numeric AS gardu_kva
  FROM (SELECT DISTINCT segmen_id, p, u, gardu_kode FROM semua WHERE gardu_kode IS NOT NULL) x
  JOIN (SELECT DISTINCT ON (upper(kode)) upper(kode) AS kode, daya FROM gardu ORDER BY upper(kode), daya DESC NULLS LAST) g
    ON g.kode = x.gardu_kode
  GROUP BY x.segmen_id, x.p, x.u
), km_per AS (
  SELECT segmen_id, p, u, 'ukuran' AS dim, COALESCE(ukuran, '-') AS k, sum(panjang_m) AS v
  FROM semua WHERE panjang_m IS NOT NULL GROUP BY 1, 2, 3, 5
  UNION ALL
  SELECT segmen_id, p, u, 'jenis', COALESCE(jenis, '-'), sum(panjang_m)
  FROM semua WHERE panjang_m IS NOT NULL GROUP BY 1, 2, 3, 5
), n_per AS (
  SELECT segmen_id, p, u, 'jenis_tiang' AS dim, COALESCE(jenis_tiang, '-') AS k, count(*) AS v
  FROM semua GROUP BY 1, 2, 3, 5
  UNION ALL
  SELECT segmen_id, p, u, 'peralatan', lower(penanda), count(*)
  FROM semua WHERE penanda IS NOT NULL AND lower(penanda) <> 'gardu' GROUP BY 1, 2, 3, 5
), obj AS (
  SELECT segmen_id, p, u, dim, jsonb_object_agg(k, round((v / 1000)::numeric, 3)) AS isi
  FROM km_per GROUP BY 1, 2, 3, 4
  UNION ALL
  SELECT segmen_id, p, u, dim, jsonb_object_agg(k, v)
  FROM n_per GROUP BY 1, 2, 3, 4
)
SELECT
  COALESCE(pr.penyulang, k.p) AS penyulang,
  k.u                         AS ulp,
  k.segmen_id,
  sg.nama                     AS segmen,
  k.kms,
  k.tiang,
  COALESCE((SELECT o.isi FROM obj o WHERE o.segmen_id IS NOT DISTINCT FROM k.segmen_id AND o.p = k.p AND o.u = k.u AND o.dim = 'ukuran'), '{}'),
  COALESCE((SELECT o.isi FROM obj o WHERE o.segmen_id IS NOT DISTINCT FROM k.segmen_id AND o.p = k.p AND o.u = k.u AND o.dim = 'jenis'), '{}'),
  COALESCE((SELECT o.isi FROM obj o WHERE o.segmen_id IS NOT DISTINCT FROM k.segmen_id AND o.p = k.p AND o.u = k.u AND o.dim = 'jenis_tiang'), '{}'),
  COALESCE((SELECT o.isi FROM obj o WHERE o.segmen_id IS NOT DISTINCT FROM k.segmen_id AND o.p = k.p AND o.u = k.u AND o.dim = 'peralatan'), '{}'),
  k.gardu,
  COALESCE(kv.gardu_kva, 0)
FROM pokok k
LEFT JOIN kva kv ON kv.segmen_id IS NOT DISTINCT FROM k.segmen_id AND kv.p = k.p AND kv.u = k.u
LEFT JOIN segmen sg ON sg.id = k.segmen_id
LEFT JOIN LATERAL (
  SELECT r.penyulang FROM penyulang_ref r WHERE upper(r.penyulang) = k.p LIMIT 1
) pr ON true
ORDER BY k.u, k.p, k.segmen_id IS NOT NULL, sg.nama
$$;

REVOKE ALL ON FUNCTION public.rekap_data_jtm(TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rekap_data_jtm(TEXT, TEXT, UUID) TO authenticated;

COMMENT ON FUNCTION public.rekap_data_jtm(TEXT, TEXT, UUID) IS
  'Rekap Data JTM per penyulang (segmen_id NULL) & per segmen — HANYA tiang dari inspeksi Selesai/Diverifikasi. Saringan opsional p_penyulang / p_segmen_id (peta).';

NOTIFY pgrst, 'reload schema';

-- ── Periksa ──
--   SELECT * FROM segmen_warisan;
--   SELECT segmen, kms, tiang FROM rekap_data_jtm('AMPENAN') WHERE penyulang = 'AMPENAN';
--   SELECT nama, terakhir_inspeksi FROM master_segmen WHERE penyulang = 'AMPENAN';
