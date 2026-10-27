-- =============================================================================
-- Pecah segmen per ARAH di percabangan (27 Okt 2026)
-- Jalankan SESUDAH jtm-pecah-riwayat.sql. Idempoten.
--
-- Masalah: titik potong di tiang percabangan (3–4 arah, mis. FCO BTW-036
-- penyulang BATU DAWA) membawa SEMUA arah di bawahnya ke potongan baru — admin
-- tidak bisa memilih "hanya ke arah BTW-036L001".
--
-- Tambahan `p_arah UUID[]`: tiang ANAK di percabangan. Potongan arah itu
-- berpangkal di tiang percabangannya (gawang percabangan → anak ikut) dan hanya
-- membawa anak itu beserta hilirnya; arah lain tetap di segmen asal. Tiang
-- percabangan tetap di segmen asal juga — seperti tiang potong biasa yang jadi
-- ujung potongan sebelumnya sekaligus pangkal potongan sesudahnya.
--
-- Pratinjau kini juga mengembalikan `percabangan` (tiang ber-anak ≥2 + tiap
-- arahnya & jumlah tiangnya) dan per potongan `kunci` (kunci nama ketikan /
-- tombol batal: 'asal', id tiang potong, atau id tiang arah) + `arah_kode`.
--
-- Sisa isi (warisan riwayat, penjaga satu section, nama unik, sedang dipakai)
-- SAMA dengan jtm-pecah-riwayat.sql — salin dari SINI bila mengubahnya lagi.
-- =============================================================================

-- Tanda tangan berubah (p_arah) — versi lama dibuang supaya RPC tidak ambigu.
DROP FUNCTION IF EXISTS public.pecah_segmen(UUID, UUID[], JSONB, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.pecah_segmen(
  p_segmen UUID,
  p_potong UUID[],
  p_nama   JSONB   DEFAULT '{}'::jsonb,
  p_oleh   TEXT    DEFAULT NULL,
  p_uji    BOOLEAN DEFAULT true,
  p_arah   UUID[]  DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s       RECORD;
  rb      RECORD;
  potong  UUID[];
  arah    UUID[];
  n_potong INT;
  cabang  JSONB;
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

  -- Arah: tiang ANAK di percabangan. Potongannya berpangkal di induknya
  -- (tiang percabangan ikut sebagai pangkal) dan hanya membawa arah itu.
  SELECT COALESCE(array_agg(x ORDER BY i), ARRAY[]::UUID[]) INTO arah
  FROM (SELECT x, min(i) i FROM unnest(COALESCE(p_arah, ARRAY[]::UUID[])) WITH ORDINALITY u(x, i) GROUP BY x) d;
  n_potong := cardinality(potong);

  PERFORM public._segmen_simpul(ARRAY[p_segmen]);

  -- Penilaian titik potong.
  SELECT galat || COALESCE(array_agg(m ORDER BY m), ARRAY[]::TEXT[]) INTO galat FROM (
    SELECT CASE
      WHEN g.id IS NULL THEN format('Tiang %s bukan anggota segmen ini.', COALESCE((SELECT kode FROM public.tiang WHERE id = p.x), '?'))
      WHEN g.induk IS NULL THEN format('Tiang %s pangkal segmen — tidak bisa jadi titik potong.', g.kode)
      WHEN NOT EXISTS (SELECT 1 FROM _sg_simpul c WHERE c.induk = g.id) THEN format('Tiang %s ujung segmen — tidak ada yang dipotong di sana.', g.kode)
    END AS m
    FROM unnest(potong) p(x) LEFT JOIN _sg_simpul g ON g.id = p.x
    UNION ALL
    SELECT CASE
      WHEN g.id IS NULL THEN format('Arah %s bukan anggota segmen ini.', COALESCE((SELECT kode FROM public.tiang WHERE id = a.x), '?'))
      WHEN g.induk IS NULL THEN format('Tiang %s pangkal segmen — tidak bisa jadi arah potong.', g.kode)
      WHEN a.x = ANY (potong) THEN format('Tiang %s dipilih dua kali (titik potong dan arah).', g.kode)
    END
    FROM unnest(arah) a(x) LEFT JOIN _sg_simpul g ON g.id = a.x
  ) z WHERE m IS NOT NULL;

  -- Bagian tiap tiang: 0 = potongan pangkal (segmen lama), i = mulai di potong[i].
  WITH RECURSIVE w AS (
    SELECT g.id, 0 AS bagian FROM _sg_simpul g WHERE g.induk IS NULL
    UNION ALL
    SELECT c.id, COALESCE(array_position(potong, c.id), n_potong + array_position(arah, c.id), w.bagian)
    FROM _sg_simpul c JOIN w ON c.induk = w.id
  )
  UPDATE _sg_simpul g SET bagian = w.bagian FROM w WHERE w.id = g.id;

  -- Anggota tiap potongan: tiang potong ikut sebagai ujung potongan induknya.
  DROP TABLE IF EXISTS _sg_anggota;
  CREATE TEMP TABLE _sg_anggota ON COMMIT DROP AS
  SELECT g.bagian, g.id FROM _sg_simpul g WHERE g.bagian IS NOT NULL
  UNION
  SELECT i.bagian, g.id FROM _sg_simpul g JOIN _sg_simpul i ON i.id = g.induk
  WHERE g.id = ANY (potong) AND i.bagian IS NOT NULL
  -- Arah: tiang percabangannya ikut sebagai pangkal potongan arah itu.
  UNION
  SELECT n_potong + a.i, g.induk FROM unnest(arah) WITH ORDINALITY a(x, i)
  JOIN _sg_simpul g ON g.id = a.x
  WHERE g.induk IS NOT NULL AND g.bagian IS NOT NULL;

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
    WHERE CASE WHEN a.bagian = 0 THEN g.bagian = 0 AND g.induk IS NULL
               WHEN a.bagian <= n_potong THEN g.id = potong[a.bagian]
               ELSE g.id = (SELECT x.induk FROM _sg_simpul x WHERE x.id = arah[a.bagian - n_potong]) END
    ORDER BY g.dalam NULLS LAST LIMIT 1) ak ON true
  -- Ujung: tiang terdalam potongan itu.
  LEFT JOIN LATERAL (
    SELECT g.* FROM _sg_anggota x JOIN _sg_simpul g ON g.id = x.id
    WHERE x.bagian = a.bagian AND g.id <> ak.id
    ORDER BY g.dalam DESC NULLS LAST, g.kode LIMIT 1) uj ON true;

  -- Nama tiap potongan: ketikan admin, kalau kosong usulan.
  -- Kunci potongan (nama ketikan admin & tombol batal): 'asal', tiang potong,
  -- atau tiang arah — dua arah dari satu percabangan berbagi pangkal yang sama.
  ALTER TABLE _sg_bagian ADD COLUMN nama_usul TEXT, ADD COLUMN nama TEXT, ADD COLUMN kunci TEXT, ADD COLUMN arah_kode TEXT;
  -- b.bagian bermerek: _sg_simpul juga punya kolom `bagian`.
  UPDATE _sg_bagian b SET kunci = CASE WHEN b.bagian = 0 THEN 'asal'
                                       WHEN b.bagian <= n_potong THEN potong[b.bagian]::text
                                       ELSE arah[b.bagian - n_potong]::text END,
         arah_kode = CASE WHEN b.bagian > n_potong THEN (SELECT g.kode FROM _sg_simpul g WHERE g.id = arah[b.bagian - n_potong]) END
  WHERE true;   -- WHERE wajib: Supabase menolak UPDATE tanpa WHERE (safeupdate)
  UPDATE _sg_bagian SET nama_usul = CASE WHEN bagian = 0 THEN s.nama ELSE
    public._segmen_label_tiang(akar_penanda, akar_alat, akar_kode) || ' - ' ||
    COALESCE(public._segmen_label_tiang(ujung_penanda, ujung_alat, ujung_kode), 'UJUNG') END
  WHERE true;   -- WHERE wajib: Supabase menolak UPDATE tanpa WHERE (safeupdate)
  UPDATE _sg_bagian SET nama = COALESCE(
    NULLIF(public.rapikan_nama_segmen(p_nama ->> kunci), ''),
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
  IF n_potong = 0 AND cardinality(arah) = 0 THEN galat := galat || 'Belum ada titik potong — klik tiang di peta.'::TEXT; END IF;

  -- Percabangan di dalam segmen: tiang ber-anak ≥2 + tiap arahnya (jumlah
  -- tiang sampai ujung) — panel menawarkan "potong ke arah mana".
  WITH RECURSIVE pc AS (
    SELECT g.induk AS simpang, g.id AS arah_id, g.id FROM _sg_simpul g
    WHERE g.induk IN (SELECT c.induk FROM _sg_simpul c WHERE c.induk IS NOT NULL GROUP BY c.induk HAVING count(*) > 1)
    UNION ALL
    SELECT pc.simpang, pc.arah_id, c.id FROM _sg_simpul c JOIN pc ON c.induk = pc.id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', s2.simpang, 'kode', t.kode, 'arah', s2.arah) ORDER BY t.dalam), '[]'::jsonb)
  INTO cabang
  FROM (SELECT simpang, jsonb_agg(jsonb_build_object('id', arah_id, 'kode', kode, 'jumlah_tiang', n) ORDER BY n DESC, kode) AS arah
        FROM (SELECT pc.simpang, pc.arah_id, a.kode, count(*) AS n
              FROM pc JOIN _sg_simpul a ON a.id = pc.arah_id GROUP BY pc.simpang, pc.arah_id, a.kode) y
        GROUP BY simpang) s2
  JOIN _sg_simpul t ON t.id = s2.simpang;

  -- Keypoint di tengah segmen (punya hulu & hilir di segmen): usulan titik potong.
  SELECT COALESCE(jsonb_agg(g.id ORDER BY g.dalam), '[]'::jsonb) INTO usul
  FROM _sg_simpul g
  WHERE g.keypoint AND g.induk IS NOT NULL AND EXISTS (SELECT 1 FROM _sg_simpul c WHERE c.induk = g.id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'no', b.bagian, 'asal', b.bagian = 0, 'akar_id', b.akar_id, 'akar_kode', b.akar_kode,
           'kunci', b.kunci, 'arah_kode', b.arah_kode,
           'jumlah_tiang', b.jumlah_tiang, 'panjang_km', round(b.panjang_km::numeric, 3),
           'section', to_jsonb(b.section), 'nama_usul', b.nama_usul, 'nama', b.nama,
           'garis', b.garis, 'titik', jsonb_build_object('lat', b.akar_lat, 'lng', b.akar_lng))
         ORDER BY b.bagian = 0 DESC, (SELECT g.dalam FROM _sg_simpul g WHERE g.id = b.akar_id), b.bagian), '[]'::jsonb)
  INTO v_bagian FROM _sg_bagian b;

  hasil := jsonb_build_object(
    'segmen', jsonb_build_object('id', s.id, 'nama', s.nama, 'penyulang', s.penyulang, 'ulp', s.ulp),
    'bagian', v_bagian, 'usul_potong', usul, 'percabangan', cabang, 'galat', to_jsonb(galat));

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

GRANT EXECUTE ON FUNCTION public.pecah_segmen(UUID, UUID[], JSONB, TEXT, BOOLEAN, UUID[]) TO authenticated;
