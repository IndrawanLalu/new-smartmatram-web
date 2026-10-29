-- =============================================================================
-- WO tunggakan dibawa ke bulan berikutnya (29 Okt 2026). Idempoten.
-- Jalankan SESUDAH rekap-pengukuran-rincian.sql.
--
-- Keputusan user 29 Okt:
--   1. WO yang belum selesai DIBAWA ke bulan berikutnya; web dan HP memberi
--      keterangan WO itu dari bulan apa.
--   2. Realisasi dihitung di BULAN DIKERJAKAN, bukan bulan WO dan bukan bulan
--      diverifikasi. Angka bulan lalu tidak berubah karena tunggakan;
--      pekerjaan September yang diverifikasi Oktober tetap realisasi September.
--   3. Gardu tunggakan yang terbit lagi di WO bulan ini tampil di keduanya
--      (dengan keterangan); satu pekerjaan dihitung SEKALI.
--
-- Isi:
--   1. wo_pengukuran_realisasi + kolom susulan_* = pengukuran SESUDAH bulan WO
--      untuk gardu yang belum diukur di bulan WO-nya. Kolom lama tidak berubah.
--   2. wo_hargardu_realisasi   + kolom susulan_* (sama, untuk pemeliharaan).
--   3. _rekap_kinerja_inti (salinan utuh rekap-pengukuran-rincian.sql, ★★★★ =
--      baru): Perabasan, Pemeliharaan Gardu, Pengukuran, Inspeksi Gardu kini
--      menghitung realisasi di bulan dikerjakan (JTM/JTR sudah begitu).
--      ⚠ Definisi terbaru _rekap_kinerja_inti kini di SINI.
-- =============================================================================

-- ── 1. WO Pengukuran ─────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.wo_pengukuran_realisasi AS
SELECT i.id,
    i.wo_id,
    i.kode_gardu,
    i.ulp,
    i.nama,
    i.alamat,
    i.penyulang,
    i.kva_master,
    i.lat,
    i.lng,
    i.alasan,
    i.tgl_ukur_terakhir,
    i.umur_bulan,
    i.urutan,
    w.bulan,
    w.tahun,
    w.tgl_wo,
    p.id AS pengukuran_id,
    p.tanggal_pengukuran AS tgl_realisasi,
    p.petugas_nama,
    p.persen_beban,
    p.beban_kva,
    p.kva_trafo AS kva_pengukuran,
    p.id IS NOT NULL AND t.pengukuran_id IS NULL AND (NOT a.berlaku OR u.ada) AS terealisasi,
    t.pengukuran_id IS NOT NULL AS tertahan,
    COALESCE(t.titik_diperbarui, false) AS tertahan_titik,
    COALESCE(t.beda_kva, false) AS tertahan_kva,
    a.berlaku AS wajib_tegangan_ujung,
    COALESCE(u.ada, false) AS tegangan_ujung_ada,
    p.id IS NOT NULL AND t.pengukuran_id IS NULL AND a.berlaku AND NOT COALESCE(u.ada, false) AS menunggu_tegangan_ujung,
    -- ★★★★ Susulan: diukur SESUDAH bulan WO (hanya bila belum diukur di bulan WO).
    s.id AS susulan_id,
    s.tanggal_pengukuran AS tgl_susulan,
    s.petugas_nama AS susulan_petugas,
    s.id IS NOT NULL AND ts.pengukuran_id IS NULL AND (NOT s.tu_berlaku OR us.ada) AS susulan_terealisasi,
    ts.pengukuran_id IS NOT NULL AS susulan_tertahan,
    s.id IS NOT NULL AND ts.pengukuran_id IS NULL AND s.tu_berlaku AND NOT COALESCE(us.ada, false) AS susulan_menunggu_tu
   FROM wo_pengukuran_item i
     JOIN wo_pengukuran w ON w.id = i.wo_id
     CROSS JOIN LATERAL (SELECT public.tegangan_ujung_berlaku(i.ulp, w.tgl_wo::date) AS berlaku) a
     LEFT JOIN LATERAL ( SELECT pg.id,
            pg.tanggal_pengukuran,
            pg.petugas_nama,
            pg.persen_beban,
            pg.beban_kva,
            pg.kva_trafo
           FROM pengukuran_gardu pg
          WHERE upper(pg.no_gardu) = upper(i.kode_gardu) AND upper(pg.petugas_unit) = upper(i.ulp) AND pg.tanggal_pengukuran >= to_char(w.tgl_wo::timestamp with time zone, 'YYYY-MM-DD'::text) AND pg.tanggal_pengukuran < to_char(w.tgl_wo + '1 mon'::interval, 'YYYY-MM-DD'::text) AND pg.hasil_penyeimbangan_id IS NULL AND pg.dikembalikan_at IS NULL
          ORDER BY pg.tanggal_pengukuran
         LIMIT 1) p ON true
     LEFT JOIN LATERAL (SELECT EXISTS (
            SELECT 1 FROM public.pengukuran_tegangan_ujung x
            WHERE x.pengukuran_id = p.id AND x.status = 'Terkirim' AND x.verified_at IS NOT NULL) AS ada) u ON true
     LEFT JOIN pengukuran_tertahan t ON t.pengukuran_id = p.id
     LEFT JOIN LATERAL ( SELECT pg.id,
            pg.tanggal_pengukuran,
            pg.petugas_nama,
            public.tegangan_ujung_berlaku(i.ulp, left(pg.tanggal_pengukuran, 10)::date) AS tu_berlaku
           FROM pengukuran_gardu pg
          WHERE p.id IS NULL AND upper(pg.no_gardu) = upper(i.kode_gardu) AND upper(pg.petugas_unit) = upper(i.ulp) AND pg.tanggal_pengukuran >= to_char(w.tgl_wo + '1 mon'::interval, 'YYYY-MM-DD'::text) AND pg.hasil_penyeimbangan_id IS NULL AND pg.dikembalikan_at IS NULL
          ORDER BY pg.tanggal_pengukuran
         LIMIT 1) s ON true
     LEFT JOIN LATERAL (SELECT EXISTS (
            SELECT 1 FROM public.pengukuran_tegangan_ujung x
            WHERE x.pengukuran_id = s.id AND x.status = 'Terkirim' AND x.verified_at IS NOT NULL) AS ada) us ON true
     LEFT JOIN pengukuran_tertahan ts ON ts.pengukuran_id = s.id;

-- ── 2. WO Pemeliharaan Gardu ─────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.wo_hargardu_realisasi AS
 SELECT i.id,
    i.wo_id,
    i.gardu_kode,
    i.ulp,
    i.nama,
    i.alamat,
    i.penyulang,
    i.lat,
    i.lng,
    i.alasan,
    i.tgl_pelihara_terakhir,
    i.umur_bulan,
    i.urutan,
    w.bulan,
    w.tahun,
    w.tgl_wo,
    p.id AS pemeliharaan_id,
    p.status AS status_pemeliharaan,
    p.tgl_selesai AS tgl_realisasi,
    p.petugas_nama,
    (p.status = ANY (ARRAY['Selesai'::text, 'Diverifikasi'::text])) IS TRUE AND t.pemeliharaan_id IS NULL AS terealisasi,
    (p.status = 'Diverifikasi'::text) IS TRUE AS disetujui,
    t.pemeliharaan_id IS NOT NULL AS tertahan_titik,
    -- ★★★★ Susulan: dikerjakan SESUDAH bulan WO (hanya bila tidak ada di bulan WO).
    s.id AS susulan_id,
    s.status AS susulan_status,
    s.tgl_selesai AS tgl_susulan,
    s.petugas_nama AS susulan_petugas,
    (s.status = ANY (ARRAY['Selesai'::text, 'Diverifikasi'::text])) IS TRUE AND ts.pemeliharaan_id IS NULL AS susulan_terealisasi,
    (s.status = 'Diverifikasi'::text) IS TRUE AS susulan_disetujui
   FROM wo_hargardu_item i
     JOIN wo_hargardu w ON w.id = i.wo_id
     LEFT JOIN LATERAL ( SELECT pg.id,
            pg.status,
            pg.tgl_selesai,
            pg.petugas_nama
           FROM pemeliharaan_gardu pg
          WHERE pg.gardu_kode = i.gardu_kode AND pg.ulp = i.ulp AND (pg.status = ANY (ARRAY['Dalam Proses'::text, 'Selesai'::text, 'Diverifikasi'::text])) AND COALESCE(pg.tgl_selesai, pg.created_at) >= (w.tgl_wo::timestamp without time zone AT TIME ZONE 'Asia/Makassar'::text) AND COALESCE(pg.tgl_selesai, pg.created_at) < ((w.tgl_wo + '1 mon'::interval) AT TIME ZONE 'Asia/Makassar'::text)
          ORDER BY (
                CASE pg.status
                    WHEN 'Diverifikasi'::text THEN 0
                    WHEN 'Selesai'::text THEN 1
                    ELSE 2
                END), (COALESCE(pg.tgl_selesai, pg.created_at))
         LIMIT 1) p ON true
     LEFT JOIN pemeliharaan_tertahan t ON t.pemeliharaan_id = p.id
     LEFT JOIN LATERAL ( SELECT pg.id,
            pg.status,
            pg.tgl_selesai,
            pg.petugas_nama
           FROM pemeliharaan_gardu pg
          WHERE p.id IS NULL AND pg.gardu_kode = i.gardu_kode AND pg.ulp = i.ulp AND (pg.status = ANY (ARRAY['Dalam Proses'::text, 'Selesai'::text, 'Diverifikasi'::text])) AND COALESCE(pg.tgl_selesai, pg.created_at) >= ((w.tgl_wo + '1 mon'::interval) AT TIME ZONE 'Asia/Makassar'::text)
          ORDER BY (
                CASE pg.status
                    WHEN 'Diverifikasi'::text THEN 0
                    WHEN 'Selesai'::text THEN 1
                    ELSE 2
                END), (COALESCE(pg.tgl_selesai, pg.created_at))
         LIMIT 1) s ON true
     LEFT JOIN pemeliharaan_tertahan ts ON ts.pemeliharaan_id = s.id;

-- ── 3. Rekap Kinerja ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._rekap_kinerja_inti(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS TABLE (kunci TEXT, wo_terbit NUMERIC, realisasi NUMERIC, belum_disetujui NUMERIC, luar_wo NUMERIC)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  u      TEXT := NULLIF(NULLIF(upper(btrim(COALESCE(p_ulp, ''))), ''), 'SEMUA');
  d_awal DATE := make_date(p_tahun, CASE WHEN p_bulan = 0 THEN 1 ELSE p_bulan END, 1);
  d_akhr DATE;
  t_awal TIMESTAMPTZ;
  t_akhr TIMESTAMPTZ;
  jadi   NUMERIC;
  sistem NUMERIC;
  tempel NUMERIC;
  centang NUMERIC;   -- ★ realisasi tempelan JTM Tier 2 (dicentang di web)
  anomali NUMERIC;
BEGIN
  d_akhr := CASE WHEN p_bulan = 0 THEN make_date(p_tahun + 1, 1, 1)
                 ELSE (d_awal + INTERVAL '1 month')::date END;
  t_awal := d_awal::timestamp AT TIME ZONE 'Asia/Makassar';
  t_akhr := d_akhr::timestamp AT TIME ZONE 'Asia/Makassar';

  -- ★★★★ Realisasi & Belum disetujui = bulan SELESAI DIRABAS (tgl_selesai),
  --      dari WO bulan mana pun (tunggakan ikut). WO terbit tetap bulan WO.
  RETURN QUERY
  SELECT 'perabasan'::text, round(COALESCE(sum(c.target_km), 0), 3),
    (SELECT round(COALESCE(sum(i.panjang_km), 0), 3)
       FROM public.wo_perabasan_item i JOIN public.wo_perabasan w ON w.id = i.wo_id
      WHERE i.status = 'Diverifikasi'
        AND i.tgl_selesai >= d_awal AND i.tgl_selesai < d_akhr
        AND w.status <> 'Dibatalkan'
        AND (u IS NULL OR upper(w.ulp) = u)),
    (SELECT round(COALESCE(sum(i.panjang_km), 0), 3)
       FROM public.wo_perabasan_item i JOIN public.wo_perabasan w ON w.id = i.wo_id
      WHERE i.status = 'Selesai'
        AND i.tgl_selesai >= d_awal AND i.tgl_selesai < d_akhr
        AND w.status <> 'Dibatalkan'
        AND (u IS NULL OR upper(w.ulp) = u)),
    (SELECT count(*)::numeric FROM public.perabasan_luar_wo l
      WHERE l.status IN ('Selesai', 'Diverifikasi')
        AND l.tgl >= d_awal AND l.tgl < d_akhr
        AND (u IS NULL OR upper(l.ulp_regu) = u))
  FROM public.wo_perabasan_capaian c
  WHERE c.tgl_wo::date >= d_awal AND c.tgl_wo::date < d_akhr
    AND c.status <> 'Dibatalkan'   -- ★ WO yang dibatalkan tidak dihitung terbit
    AND (u IS NULL OR upper(c.ulp) = u);

  RETURN QUERY
  SELECT 'harjtm'::text, public._wo_manual_total(u, p_tahun, p_bulan, 'harjtm', false, false),
    count(*)::numeric, count(*) FILTER (WHERE j.status = 'Selesai')::numeric,
    count(*) FILTER (WHERE j.inspeksi_id IS NOT NULL)::numeric
  FROM public.pemeliharaan_jaringan j
  WHERE j.status NOT IN ('Dibatalkan', 'Dikembalikan')
    AND j.tgl::date >= d_awal AND j.tgl::date < d_akhr
    AND (u IS NULL OR upper(j.ulp) = u);

  -- ★★★★ Realisasi = pemeliharaan WO yang dikerjakan di bulan ini: gardu WO
  --      bulan ini + tunggakan WO bulan lalu yang selesai susulan bulan ini.
  --      Satu pemeliharaan dihitung sekali (gardu di dua WO).
  SELECT count(DISTINCT x.id) INTO jadi FROM (
    SELECT r.pemeliharaan_id AS id FROM public.wo_hargardu_realisasi r
     WHERE r.terealisasi AND r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan)
       AND (u IS NULL OR upper(r.ulp) = u)
    UNION ALL
    SELECT r.susulan_id FROM public.wo_hargardu_realisasi r
     WHERE r.susulan_terealisasi
       AND r.tgl_susulan >= t_awal AND r.tgl_susulan < t_akhr
       AND (u IS NULL OR upper(r.ulp) = u)) x;

  RETURN QUERY
  SELECT 'hargardu'::text,
    (SELECT count(*)::numeric FROM public.wo_hargardu_realisasi r
      WHERE r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan) AND (u IS NULL OR upper(r.ulp) = u)),
    jadi,
    (SELECT count(DISTINCT x.id)::numeric FROM (
       SELECT r.pemeliharaan_id AS id FROM public.wo_hargardu_realisasi r
        WHERE r.terealisasi AND NOT r.disetujui AND r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan)
          AND (u IS NULL OR upper(r.ulp) = u)
       UNION ALL
       SELECT r.susulan_id FROM public.wo_hargardu_realisasi r
        WHERE r.susulan_terealisasi AND NOT r.susulan_disetujui
          AND r.tgl_susulan >= t_awal AND r.tgl_susulan < t_akhr
          AND (u IS NULL OR upper(r.ulp) = u)) x),
    GREATEST(0, (SELECT count(*) FROM public.pemeliharaan_gardu g
                  WHERE g.status IN ('Selesai', 'Diverifikasi')
                    AND g.created_at >= t_awal AND g.created_at < t_akhr
                    AND (u IS NULL OR upper(g.ulp) = u)) - jadi)::numeric;

  -- ★ WO Penyeimbangan = tempelan + WO dari anomali pengukuran (Bulan WO).
  -- Gardu yang ada di keduanya pada bulan yang sama dihitung sekali; gardu
  -- yang di-WO dua kali dari anomali dalam sebulan juga sekali.
  tempel := public._wo_manual_total(u, p_tahun, p_bulan, 'penyeimbangan', false, false);
  SELECT count(DISTINCT (pg.wo_bulan, upper(pg.petugas_unit), upper(pg.no_gardu))) INTO anomali
    FROM public.pengukuran_gardu pg
   WHERE pg.jenis_pemeliharaan = 'PEMERATAAN BEBAN'
     AND pg.hasil_penyeimbangan_id IS NULL
     AND pg.wo_bulan >= d_awal AND pg.wo_bulan < d_akhr
     AND (u IS NULL OR upper(pg.petugas_unit) = u)
     AND NOT public._gardu_di_tempelan('penyeimbangan', upper(pg.petugas_unit), pg.wo_bulan, pg.no_gardu);

  RETURN QUERY
  SELECT 'penyeimbangan'::text,
    CASE WHEN tempel IS NULL AND anomali = 0 THEN NULL ELSE COALESCE(tempel, 0) + anomali END,
    count(*)::numeric, NULL::numeric, NULL::numeric
  FROM public.penyeimbangan_gardu p
  -- ★ Realisasi = pekerjaan yang SUDAH DISETOR (status Selesai, termasuk yang
  --   menunggu persetujuan). 'Dikerjakan' = baru diambil regu, belum ada
  --   pekerjaan — dulu ikut terhitung begitu tombol "Ambil tugas" ditekan.
  -- ★ Bulannya = tanggal pekerjaan (tgl_penyeimbangan), bukan saat diambil:
  --   diambil 30 Sep, dikerjakan 2 Okt = realisasi Oktober.
  WHERE p.status = 'Selesai'
    AND p.tgl_penyeimbangan >= d_awal AND p.tgl_penyeimbangan < d_akhr
    AND (u IS NULL OR upper(p.ulp) = u);

  RETURN QUERY
  SELECT 'optimasi'::text,
    (SELECT count(*)::numeric FROM public.pengukuran_gardu pg
      WHERE pg.jenis_pemeliharaan = 'OPTIMASI TRAFO'
        AND pg.wo_bulan >= d_awal AND pg.wo_bulan < d_akhr   -- ★ Bulan WO
        AND (u IS NULL OR upper(pg.petugas_unit) = u)
        AND NOT EXISTS (SELECT 1 FROM public.optimasi_wo_batal b WHERE b.pengukuran_id::text = pg.id::text)),
    count(*)::numeric,
    count(*) FILTER (WHERE o.status = 'Selesai')::numeric,
    NULL::numeric
  FROM public.optimasi_trafo o
  WHERE o.status NOT IN ('Dibatalkan', 'Dikembalikan')
    AND o.tgl_operasi::date >= d_awal AND o.tgl_operasi::date < d_akhr
    AND (u IS NULL OR upper(o.ulp) = u);

  -- ★★★ Belum disetujui = tertahan usulan titik/kVA + tegangan ujung yang
  --      SUDAH dikirim regu tapi belum disetujui (27 Okt 2026). Dulu gardu yang
  --      menunggu persetujuan tegangan ujung tidak muncul di kolom mana pun.
  --      Aturan Realisasi TIDAK berubah.
  -- ★★★★ Realisasi & Belum disetujui = gardu WO bulan ini + tunggakan WO bulan
  --      lalu yang diukur susulan bulan ini. Satu pengukuran dihitung sekali.
  RETURN QUERY
  WITH r AS (
    SELECT * FROM public.wo_pengukuran_realisasi r
    WHERE r.tgl_wo < d_akhr AND (u IS NULL OR upper(r.ulp) = u)
  ), kerja AS (
    SELECT r.pengukuran_id AS id, r.terealisasi AS sah,
           r.tertahan OR (r.menunggu_tegangan_ujung AND EXISTS (
             SELECT 1 FROM public.pengukuran_tegangan_ujung x
             WHERE x.pengukuran_id = r.pengukuran_id AND x.status = 'Terkirim')) AS tahan
    FROM r WHERE r.pengukuran_id IS NOT NULL AND r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan)
    UNION
    SELECT r.susulan_id, r.susulan_terealisasi,
           r.susulan_tertahan OR (r.susulan_menunggu_tu AND EXISTS (
             SELECT 1 FROM public.pengukuran_tegangan_ujung x
             WHERE x.pengukuran_id = r.susulan_id AND x.status = 'Terkirim'))
    FROM r WHERE r.susulan_id IS NOT NULL
      AND r.tgl_susulan >= to_char(d_awal, 'YYYY-MM-DD') AND r.tgl_susulan < to_char(d_akhr, 'YYYY-MM-DD')
  )
  SELECT 'pengukuran'::text,
    (SELECT count(*) FROM r WHERE r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan))::numeric,
    (SELECT count(DISTINCT k.id) FILTER (WHERE k.sah) FROM kerja k)::numeric,
    (SELECT count(DISTINCT k.id) FILTER (WHERE k.tahan) FROM kerja k)::numeric,
    NULL::numeric;

  -- ★ Inspeksi JTM Tier 1: WO sistem (termasuk tempelan yang cocok master)
  -- DITAMBAH tempelan yang segmennya belum di master. NULL kalau dua-duanya tidak ada.
  SELECT round(sum(i.panjang_km), 3) INTO sistem
    FROM public.wo_inspeksi_item i JOIN public.wo_inspeksi w ON w.id = i.wo_id
   WHERE w.jenis = 'JTM' AND i.status <> 'Dibatalkan'
     AND w.tier = '1'   -- ★ WO Tier 2 punya barisnya sendiri
     AND w.tgl_wo >= d_awal AND w.tgl_wo < d_akhr
     AND (u IS NULL OR upper(i.ulp) = u);
  tempel := public._wo_manual_total(u, p_tahun, p_bulan, 'jtm', true, false);

  RETURN QUERY
  SELECT 'jtm'::text,
    CASE WHEN sistem IS NULL AND tempel IS NULL THEN 0::numeric ELSE COALESCE(sistem, 0) + COALESCE(tempel, 0) END,
    round(COALESCE(sum(COALESCE(kd.km, sp.panjang_pakai_km)) FILTER (WHERE m.status IN ('Selesai', 'Diverifikasi')), 0), 3),
    round(COALESCE(sum(COALESCE(kd.km, sp.panjang_pakai_km)) FILTER (WHERE m.status = 'Selesai'), 0), 3),
    round(COALESCE(sum(COALESCE(kd.km, sp.panjang_pakai_km)) FILTER (
      WHERE m.status IN ('Selesai', 'Diverifikasi') AND m.wo_item_id IS NULL), 0), 3)
  FROM public.inspeksi_jtm m
  LEFT JOIN public.segmen_panjang sp ON sp.segmen_id = m.segmen_id
  LEFT JOIN public.inspeksi_jtm_km kd ON kd.inspeksi_id = m.id   -- ★ km dibekukan saat disetujui
  -- ★ Bulan realisasi = bulan DIKIRIM (tgl_selesai), bukan bulan dimulai
  -- (keputusan user 2 Okt 2026). Yang belum dikirim memang tidak dihitung.
  WHERE COALESCE(m.tgl_selesai, m.created_at) >= t_awal
    AND COALESCE(m.tgl_selesai, m.created_at) < t_akhr
    AND m.tier = '1'
    AND (u IS NULL OR upper(m.ulp) = u);

  -- ★ Inspeksi JTM Tier 2 (rencana-wo-jtm-tier2.md): dua jalur WO.
  --   WO        = WO susun Tier 2 (segmen master, dikerjakan di HP)
  --             + tempelan Tier 2 (wo_manual, dicentang di web).
  --   Realisasi = inspeksi HP Tier 2 (tersambung WO maupun di luar WO)
  --             + centang tempelan. Hitungan ganda (tempelan dicentang DAN
  --             segmennya diinspeksi di HP) dibiarkan — web merinci keduanya.
  --   NULL di WO = belum ada WO apa pun (keadaan "belum ber-WO" di web).
  SELECT round(sum(i.panjang_km), 3) INTO sistem
    FROM public.wo_inspeksi_item i JOIN public.wo_inspeksi w ON w.id = i.wo_id
   WHERE w.jenis = 'JTM' AND w.tier = '2' AND i.status <> 'Dibatalkan'
     AND w.tgl_wo >= d_awal AND w.tgl_wo < d_akhr
     AND (u IS NULL OR upper(i.ulp) = u);
  tempel  := public._wo_manual_total(u, p_tahun, p_bulan, 'jtm2', true, false);
  centang := public._wo_manual_total(u, p_tahun, p_bulan, 'jtm2', true, true);

  RETURN QUERY
  SELECT 'jtm2'::text,
    CASE WHEN sistem IS NULL AND tempel IS NULL THEN NULL::numeric ELSE COALESCE(sistem, 0) + COALESCE(tempel, 0) END,
    round(COALESCE(sum(COALESCE(kd.km, sp.panjang_pakai_km)) FILTER (WHERE m.status IN ('Selesai', 'Diverifikasi')), 0)
          + COALESCE(centang, 0), 3),
    round(COALESCE(sum(COALESCE(kd.km, sp.panjang_pakai_km)) FILTER (WHERE m.status = 'Selesai'), 0), 3),
    round(COALESCE(sum(COALESCE(kd.km, sp.panjang_pakai_km)) FILTER (
      WHERE m.status IN ('Selesai', 'Diverifikasi') AND m.wo_item_id IS NULL), 0), 3)
  FROM public.inspeksi_jtm m
  LEFT JOIN public.segmen_panjang sp ON sp.segmen_id = m.segmen_id
  LEFT JOIN public.inspeksi_jtm_km kd ON kd.inspeksi_id = m.id   -- ★ km dibekukan saat disetujui
  -- Bulan realisasi = bulan DIKIRIM, sama dengan Tier 1.
  WHERE COALESCE(m.tgl_selesai, m.created_at) >= t_awal
    AND COALESCE(m.tgl_selesai, m.created_at) < t_akhr
    AND m.tier = '2'
    AND (u IS NULL OR upper(m.ulp) = u);

  RETURN QUERY
  SELECT 'jtr'::text,
    (SELECT round(COALESCE(sum(i.panjang_km), 0), 3)
       FROM public.wo_inspeksi_item i
       JOIN public.wo_inspeksi w ON w.id = i.wo_id
      WHERE w.jenis = 'JTR' AND i.status <> 'Dibatalkan'
        AND w.tgl_wo >= d_awal AND w.tgl_wo < d_akhr
        AND (u IS NULL OR upper(i.ulp) = u)),
    round(COALESCE(sum(pj.km) FILTER (WHERE r.status IN ('Selesai', 'Diverifikasi')), 0), 3),
    round(COALESCE(sum(pj.km) FILTER (WHERE r.status = 'Selesai'), 0), 3),
    round(COALESCE(sum(pj.km) FILTER (
      WHERE r.status IN ('Selesai', 'Diverifikasi') AND r.wo_item_id IS NULL), 0), 3)
  FROM public.inspeksi_jtr r
  LEFT JOIN LATERAL (
    SELECT sum(g.panjang_km) AS km FROM public.gardu_jtr_penghantar g
    WHERE g.gardu_kode = r.gardu_kode AND g.ulp = r.ulp
  ) pj ON true
  WHERE r.created_at >= t_awal AND r.created_at < t_akhr
    AND (u IS NULL OR upper(r.ulp) = u);

  -- ★★ Inspeksi Gardu Tier 1 & 2 (G4, 27 Okt 2026) — tempelan Excel (dicentang
  --    di web) + WO Inspeksi Gardu dari aplikasi. Bulan+ULP yang SUDAH punya
  --    tempelan tetap memakai tempelan saja; WO aplikasi di bulan itu tidak
  --    ikut dihitung (tidak ganda). Realisasi = gardu WO yang kunjungannya
  --    sudah dikirim (Selesai/Diverifikasi, tidak tertahan usulan titik) —
  --    sama dengan wo_igardu_capaian. Belum disetujui = terkirim tapi belum
  --    Diverifikasi. Di luar WO = kunjungan terkirim tanpa item WO.
  -- ★★★★ Realisasi & Belum disetujui = bulan KUNJUNGAN yang terkirim, dari WO
  --      bulan mana pun (tunggakan ikut). WO terbit tetap bulan WO.
  RETURN QUERY
  WITH wo_app AS (
    SELECT i.id, i.tier, w.tgl_wo
    FROM public.wo_igardu_item i
    JOIN public.wo_igardu w ON w.id = i.wo_id
    WHERE i.status <> 'Dibatalkan' AND w.status <> 'Dibatalkan'
      AND w.tgl_wo < d_akhr
      AND (u IS NULL OR upper(w.ulp) = u)
      AND NOT EXISTS (SELECT 1 FROM public.wo_manual m
                       WHERE m.jenis = 'igardu' || i.tier
                         AND m.tahun = extract(year FROM w.tgl_wo)::int
                         AND m.bulan = extract(month FROM w.tgl_wo)::int
                         AND m.ulp = upper(w.ulp))
  ), item AS (
    SELECT a.tier FROM wo_app a WHERE a.tgl_wo >= d_awal
  ), kirim AS (
    SELECT a.tier,
           EXISTS (SELECT 1 FROM public.inspeksi_gardu g
                    WHERE g.wo_item_id = a.id AND g.status = 'Diverifikasi') AS disetujui
    FROM wo_app a
    JOIN LATERAL (
      SELECT g.tgl FROM public.inspeksi_gardu g
      WHERE g.wo_item_id = a.id AND g.status IN ('Selesai', 'Diverifikasi')
        AND NOT EXISTS (SELECT 1 FROM public.master_usulan mu
                         WHERE mu.sumber_modul = 'inspeksi_gardu' AND mu.sumber_id = g.id
                           AND mu.status = 'menunggu')
      ORDER BY g.tgl LIMIT 1
    ) g ON true
    WHERE g.tgl >= t_awal AND g.tgl < t_akhr
  ), luar AS (
    SELECT x.tier, count(*)::numeric AS n
    FROM public.inspeksi_gardu x
    WHERE x.wo_item_id IS NULL AND x.status IN ('Selesai', 'Diverifikasi')
      AND x.tgl >= t_awal AND x.tgl < t_akhr
      AND (u IS NULL OR upper(x.ulp) = u)
    GROUP BY x.tier
  )
  SELECT 'igardu' || t.tier,
    -- NULL = belum ada WO sama sekali (tampil "—"), seperti sebelumnya.
    CASE WHEN tm.wo IS NULL AND NOT EXISTS (SELECT 1 FROM item WHERE item.tier = t.tier) THEN NULL
         ELSE COALESCE(tm.wo, 0) + (SELECT count(*) FROM item WHERE item.tier = t.tier) END,
    COALESCE(tm.jadi, 0) + (SELECT count(*) FROM kirim WHERE kirim.tier = t.tier),
    (SELECT count(*) FILTER (WHERE NOT kirim.disetujui) FROM kirim WHERE kirim.tier = t.tier)::numeric,
    COALESCE((SELECT luar.n FROM luar WHERE luar.tier = t.tier), 0)
  FROM (VALUES ('1'), ('2')) t(tier)
  CROSS JOIN LATERAL (
    SELECT public._wo_manual_total(u, p_tahun, p_bulan, 'igardu' || t.tier, false, false) AS wo,
           public._wo_manual_total(u, p_tahun, p_bulan, 'igardu' || t.tier, false, true)  AS jadi
  ) tm;
END $$;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT * FROM rekap_kinerja('SEMUA', 2026, 10);   -- Oktober harus sama dengan sebelum dijalankan
--   SELECT ulp, tahun, bulan, count(*) FROM wo_pengukuran_realisasi
--    WHERE pengukuran_id IS NULL AND susulan_id IS NULL GROUP BY 1,2,3 ORDER BY 1,2,3;
