-- =============================================================================
-- Pemeliharaan Gardu: koreksi titik gardu dari lapangan — SAMA DENGAN PENGUKURAN
-- (12 Okt 2026). Jalankan manual di Supabase SQL Editor. Idempoten.
--
-- Keadaan data yang memicunya (diperiksa 12 Okt 2026): dari 80 pemeliharaan,
-- 76 bisa dibandingkan dengan titik master — 11 meleset > 50 m, 5 di antaranya
-- > 200 m (CN295 66 km, MM012 3,8 km, GS207 2,9 km), dan 4 gardu belum
-- bertitik. Pemeliharaan mencatat GPS regu, tetapi tidak pernah dibandingkan.
--
-- Aturannya diambil utuh dari Pengukuran (pengukuran-kunci-titik.sql):
--   • HP membandingkan posisi regu dengan titik master + radius per ULP
--     (anomali_settings.radius_titik_m). Di luar radius / master kosong →
--     regu memilih "salah gardu" atau "titik masternya salah" + foto papan nama.
--   • Usulannya lewat koreksi_titik_gardu: master LANGSUNG berubah, usulan
--     'menunggu', admin menyetujui atau menolak (menolak = titik dikembalikan).
--   • Selama usulan titik itu menunggu, pekerjaannya TERTAHAN: belum dihitung
--     realisasi WO (sama dengan pengukuran_tertahan).
--
-- Bagian 6 memunculkan kembali titik dari pemeliharaan yang SUDAH TERLANJUR
-- masuk (permintaan user): usulan 'menunggu' yang BELUM diterapkan — master
-- tidak dipindah sebelum admin melihat fotonya, dan realisasinya tidak ditahan.
-- =============================================================================


-- ── 1. Kirim dari HP: membawa usulan titik ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.kirim_pemeliharaan_gardu(p_isi jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id    UUID := (p_isi->>'id')::uuid;
  v_kode  TEXT := upper(btrim(p_isi->>'gardu_kode'));
  v_ulp   TEXT := upper(btrim(p_isi->>'ulp'));
  v_nama  TEXT := NULLIF(btrim(p_isi->>'petugas_nama'), '');
  v_role  TEXT;
  v_unit  TEXT;
  m       RECORD;
  dobel   RECORD;
  wita    DATE := (now() AT TIME ZONE 'Asia/Makassar')::date;
  awal    TIMESTAMPTZ;
  k       TEXT;
  v       TEXT;
  slot_ada TEXT[] := '{}';
  kor     JSONB := p_isi->'koreksi';
BEGIN
  IF v_id IS NULL OR v_kode IS NULL OR v_ulp IS NULL THEN
    RAISE EXCEPTION 'Kiriman tidak lengkap: id, gardu, dan ULP wajib ada.';
  END IF;

  -- Hak kirim: UP3 semua ULP; selain itu hanya ULP sendiri.
  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi, kemudian kirim ulang — isian tetap tersimpan di HP.';
  END IF;
  IF v_role <> 'UP3' AND upper(COALESCE(v_unit, '')) <> v_ulp THEN
    RAISE EXCEPTION 'Akun ini untuk ULP %, bukan %.', COALESCE(v_unit, '-'), v_ulp;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.gardu WHERE upper(kode) = v_kode AND upper(ulp) = v_ulp) THEN
    RAISE EXCEPTION 'Gardu % di ULP % tidak ada di master.', v_kode, v_ulp;
  END IF;

  -- Dua regu mengirim gardu yang sama bersamaan tidak boleh lolos berdua.
  PERFORM pg_advisory_xact_lock(hashtext('kirim-hargardu|' || v_kode || '|' || v_ulp));

  -- Gardu yang sudah dikirim HP lain bulan ini ditolak — satu gardu satu
  -- pemeliharaan per bulan. Yang ditolak admin (Ditolak) tidak menghalangi.
  awal := make_date(extract(year FROM wita)::int, extract(month FROM wita)::int, 1)::timestamp AT TIME ZONE 'Asia/Makassar';
  SELECT petugas_nama, tgl_selesai INTO dobel
  FROM public.pemeliharaan_gardu
  WHERE upper(gardu_kode) = v_kode AND upper(ulp) = v_ulp
    AND id <> v_id
    AND status IN ('Selesai', 'Diverifikasi')
    AND tgl_selesai >= awal
  ORDER BY tgl_selesai DESC
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Gardu % sudah dikirim % pada % — tidak dikirim dua kali. Buang draf ini atau hubungi admin.',
      v_kode, COALESCE(dobel.petugas_nama, 'regu lain'),
      to_char(dobel.tgl_selesai AT TIME ZONE 'Asia/Makassar', 'DD-MM-YYYY');
  END IF;

  SELECT * INTO m FROM public.pemeliharaan_gardu WHERE id = v_id FOR UPDATE;
  IF FOUND THEN
    IF upper(m.gardu_kode) <> v_kode OR upper(m.ulp) <> v_ulp THEN
      RAISE EXCEPTION 'Id pekerjaan ini milik gardu %, bukan %.', m.gardu_kode, v_kode;
    END IF;
    IF m.status NOT IN ('Dijadwalkan', 'Dalam Proses', 'Ditolak') THEN
      RAISE EXCEPTION 'Pemeliharaan % sudah dikirim (status %) — koreksinya lewat admin "Kembalikan ke petugas".',
        v_kode, m.status;
    END IF;
  ELSE
    INSERT INTO public.pemeliharaan_gardu (id, gardu_kode, ulp, status, sumber, petugas_uid)
    SELECT v_id, g.kode, g.ulp, 'Dalam Proses', 'lapangan', auth.uid()
    FROM public.gardu g
    WHERE upper(g.kode) = v_kode AND upper(g.ulp) = v_ulp
    LIMIT 1;
  END IF;

  -- Kepala. Nama regu = tim login (dikunci di HP), disalin juga ke regu_1
  -- supaya layar web yang membaca kolom itu tetap menyebut orang yang benar.
  UPDATE public.pemeliharaan_gardu SET
    penyulang         = COALESCE(NULLIF(p_isi->>'penyulang', ''), penyulang),
    sumber            = CASE WHEN EXISTS (
                          SELECT 1 FROM public.wo_hargardu_item i
                          JOIN public.wo_hargardu w ON w.id = i.wo_id
                          WHERE upper(i.gardu_kode) = v_kode AND upper(i.ulp) = v_ulp
                            AND w.tahun = extract(year FROM wita) AND w.bulan = extract(month FROM wita))
                        THEN 'jadwal' ELSE sumber END,
    tgl_padam         = NULLIF(p_isi->>'tgl_padam', '')::timestamptz,
    petugas_nama      = COALESCE(v_nama, petugas_nama),
    regu_1            = CASE WHEN v_nama IS NULL THEN regu_1 ELSE string_to_array(v_nama, ' & ') END,
    regu_2            = CASE WHEN v_nama IS NULL THEN regu_2 ELSE '{}' END,
    lat               = COALESCE(NULLIF(p_isi->>'lat', '')::numeric, lat),
    lng               = COALESCE(NULLIF(p_isi->>'lng', '')::numeric, lng),
    akurasi           = COALESCE(NULLIF(p_isi->>'akurasi', '')::numeric, akurasi),
    reting_fuse       = COALESCE(p_isi->'reting_fuse', '{}'::jsonb),
    catatan_perbaikan = NULLIF(btrim(p_isi->>'catatan_perbaikan'), ''),
    pr_keterangan     = NULLIF(btrim(p_isi->>'pr_keterangan'), ''),
    -- Tanggal kerja = saat regu menekan Simpan di HP, bukan saat sinyal
    -- akhirnya ada. Tidak boleh di masa depan (jam HP yang salah).
    tgl_selesai       = LEAST(COALESCE(NULLIF(p_isi->>'tgl_selesai', '')::timestamptz, now()), now()),
    updated_at        = now()
  WHERE id = v_id;

  -- Jawaban pemeriksaan (penjaga daftar kosong ada di dalam fungsinya).
  PERFORM public.simpan_periksa_pemeliharaan(v_id, COALESCE(p_isi->'periksa', '[]'::jsonb), v_nama);

  -- Pengukuran sebelum & sesudah. Sesudah boleh kosong → yang lama dibuang.
  INSERT INTO public.pemeliharaan_gardu_ukur (
    pemeliharaan_id, tahap, putaran_phasa,
    arus_r, arus_s, arus_t, arus_n,
    teg_rn, teg_sn, teg_tn, teg_rs, teg_st, teg_tr,
    pertanahan_arrester, pertanahan_trafo, pertanahan_netral, perjurusan)
  SELECT v_id, t.tahap, NULLIF(t.u->>'putaran_phasa', ''),
    NULLIF(t.u->>'arus_r', '')::numeric, NULLIF(t.u->>'arus_s', '')::numeric,
    NULLIF(t.u->>'arus_t', '')::numeric, NULLIF(t.u->>'arus_n', '')::numeric,
    NULLIF(t.u->>'teg_rn', '')::numeric, NULLIF(t.u->>'teg_sn', '')::numeric,
    NULLIF(t.u->>'teg_tn', '')::numeric, NULLIF(t.u->>'teg_rs', '')::numeric,
    NULLIF(t.u->>'teg_st', '')::numeric, NULLIF(t.u->>'teg_tr', '')::numeric,
    NULLIF(t.u->>'pertanahan_arrester', '')::numeric,
    NULLIF(t.u->>'pertanahan_trafo', '')::numeric,
    NULLIF(t.u->>'pertanahan_netral', '')::numeric,
    COALESCE(t.u->'perjurusan', '{}'::jsonb)
  FROM (VALUES ('sebelum', p_isi->'ukur'->'sebelum'), ('sesudah', p_isi->'ukur'->'sesudah')) AS t(tahap, u)
  WHERE jsonb_typeof(t.u) = 'object'
  ON CONFLICT (pemeliharaan_id, tahap) DO UPDATE SET
    putaran_phasa = EXCLUDED.putaran_phasa,
    arus_r = EXCLUDED.arus_r, arus_s = EXCLUDED.arus_s, arus_t = EXCLUDED.arus_t, arus_n = EXCLUDED.arus_n,
    teg_rn = EXCLUDED.teg_rn, teg_sn = EXCLUDED.teg_sn, teg_tn = EXCLUDED.teg_tn,
    teg_rs = EXCLUDED.teg_rs, teg_st = EXCLUDED.teg_st, teg_tr = EXCLUDED.teg_tr,
    pertanahan_arrester = EXCLUDED.pertanahan_arrester,
    pertanahan_trafo    = EXCLUDED.pertanahan_trafo,
    pertanahan_netral   = EXCLUDED.pertanahan_netral,
    perjurusan = EXCLUDED.perjurusan,
    updated_at = now();

  IF jsonb_typeof(p_isi->'ukur'->'sesudah') IS DISTINCT FROM 'object' THEN
    DELETE FROM public.pemeliharaan_gardu_ukur WHERE pemeliharaan_id = v_id AND tahap = 'sesudah';
  END IF;

  -- Foto: hanya yang SUDAH terunggah. URI lokal berarti unggahannya gagal
  -- di HP — lebih baik ditolak di sini daripada tersimpan tautan mati.
  FOR k, v IN SELECT key, value #>> '{}' FROM jsonb_each(COALESCE(p_isi->'foto', '{}'::jsonb)) LOOP
    CONTINUE WHEN v IS NULL OR btrim(v) = '';
    IF v NOT LIKE 'http%' THEN
      RAISE EXCEPTION 'Foto % belum terunggah. Kirim ulang saat sinyal lebih baik.', k;
    END IF;
    INSERT INTO public.pemeliharaan_gardu_foto (pemeliharaan_id, slot, url)
    VALUES (v_id, k, v)
    ON CONFLICT (pemeliharaan_id, slot) DO UPDATE SET url = EXCLUDED.url, diambil_at = now();
    slot_ada := slot_ada || k;
  END LOOP;
  DELETE FROM public.pemeliharaan_gardu_foto f WHERE f.pemeliharaan_id = v_id AND NOT (f.slot = ANY (slot_ada));

  -- Spesifikasi → master (setelah foto: usulan kVA menempelkan foto nama plat).
  PERFORM * FROM public.usulkan_spek_gardu(v_id, COALESCE(p_isi->'spek', '{}'::jsonb), v_nama);

  -- Usulan titik gardu (hargardu-koreksi-titik.sql, 12 Okt 2026) — persis
  -- Pengukuran: regu menyatakan titik master salah/kosong dan memotret papan
  -- nama gardunya. Master langsung berubah, admin memverifikasi belakangan,
  -- dan pekerjaan ini belum terhitung realisasi sampai usulannya diputuskan
  -- (view pemeliharaan_tertahan).
  IF jsonb_typeof(kor) = 'object' AND NULLIF(kor->>'lat', '') IS NOT NULL THEN
    IF jsonb_typeof(kor->'foto') IS DISTINCT FROM 'array' OR jsonb_array_length(kor->'foto') = 0 THEN
      RAISE EXCEPTION 'Usulan titik % wajib berfoto papan nama gardu.', v_kode;
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(kor->'foto') f WHERE f NOT LIKE 'http%') THEN
      RAISE EXCEPTION 'Foto papan nama untuk usulan titik % belum terunggah. Kirim ulang saat sinyal lebih baik.', v_kode;
    END IF;
    -- Satu usulan per pekerjaan. Kiriman ulang sesudah dikembalikan tidak
    -- menumpuk: usulan lamanya sudah gugur (dan titiknya dikembalikan) saat
    -- pekerjaannya ditolak.
    IF NOT EXISTS (SELECT 1 FROM public.master_usulan u
                   WHERE u.sumber_modul = 'pemeliharaan_gardu' AND u.sumber_id = v_id
                     AND u.field = 'koordinat' AND u.status = 'menunggu') THEN
      PERFORM public.koreksi_titik_gardu(
        v_kode, v_ulp,
        (kor->>'lat')::double precision, (kor->>'lng')::double precision,
        NULLIF(kor->>'akurasi', '')::numeric,
        v_nama,
        NULLIF(btrim(kor->>'catatan'), ''),
        'pemeliharaan_gardu',
        v_id,
        ARRAY(SELECT jsonb_array_elements_text(kor->'foto'))
      );
    END IF;
  END IF;

  -- Menolak yang belum lengkap dan menyebut apa yang kurang. Karena satu
  -- transaksi, penolakan di sini membatalkan SELURUH kiriman di atas.
  PERFORM public.selesaikan_pemeliharaan(v_id, v_nama);

  RETURN v_id;
END $function$;


-- ── 2. Tolak pekerjaan: usulan gugur DAN titik dikembalikan ─────────────────

CREATE OR REPLACE FUNCTION public.putuskan_pemeliharaan(p_id uuid, p_setuju boolean, p_nama text DEFAULT NULL::text, p_catatan text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE m RECORD; u RECORD;
BEGIN
  SELECT * INTO m FROM public.pemeliharaan_gardu WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pemeliharaan tidak ditemukan'; END IF;
  IF m.status NOT IN ('Selesai', 'Ditolak') THEN
    RAISE EXCEPTION 'Pemeliharaan % masih berstatus %. Hanya yang sudah dinyatakan selesai petugas yang bisa diputuskan.',
      m.gardu_kode, m.status;
  END IF;

  -- Penolakan WAJIB beralasan. Ditolak tanpa alasan berarti regu mengulang
  -- seluruh pekerjaan sambil menebak apa yang salah.
  IF NOT p_setuju AND (p_catatan IS NULL OR btrim(p_catatan) = '') THEN
    RAISE EXCEPTION 'Penolakan harus disertai alasan';
  END IF;

  UPDATE public.pemeliharaan_gardu
  SET status = CASE WHEN p_setuju THEN 'Diverifikasi' ELSE 'Ditolak' END,
      verified_at = now(),
      verified_by = p_nama,
      verified_note = p_catatan,
      updated_at = now()
  WHERE id = p_id;

  IF p_setuju THEN
    -- Master gardu ini akhirnya pernah dikonfirmasi orang yang berdiri di
    -- bawahnya. Inilah yang menggerakkan angka kelengkapan master.
    UPDATE public.gardu
    SET master_terverifikasi_at = now(),
        master_terverifikasi_dari = p_id,
        updated_at = now()
    WHERE upper(kode) = upper(m.gardu_kode) AND upper(ulp) = upper(m.ulp);

    -- Usulan koreksi master TIDAK ikut disetujui di sini. kVA yang berubah
    -- pantas dilihat sendiri — disetujui satu per satu di layar yang sama,
    -- bukan terbawa diam-diam oleh persetujuan pekerjaannya.

  ELSE
    -- Pekerjaannya ditolak, jadi usulan koreksi yang lahir darinya ikut gugur.
    -- Membiarkannya menggantung berarti master bisa berubah karena pekerjaan
    -- yang sudah dinyatakan tidak sah.
    --
    -- Lewat putuskan_usulan, bukan UPDATE status saja (12 Okt 2026): usulan
    -- titik sudah diterapkan langsung ke master, jadi menggugurkannya harus
    -- MENGEMBALIKAN titik lamanya — dan tercatat di jejak audit.
    FOR u IN SELECT x.id FROM public.master_usulan x
             WHERE x.sumber_modul = 'pemeliharaan_gardu' AND x.sumber_id = p_id AND x.status = 'menunggu' LOOP
      PERFORM public.putuskan_usulan(u.id, false, p_nama,
        'Pekerjaan pemeliharaannya ditolak: ' || COALESCE(p_catatan, ''));
    END LOOP;
  END IF;
END $function$;


-- ── 3. Batalkan pekerjaan: sama ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.batalkan_pemeliharaan(p_id uuid, p_alasan text, p_nama text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m       RECORD;
  -- INT, bukan BOOLEAN: `GET DIAGNOSTICS ... ROW_COUNT` selalu mengembalikan
  -- angka, dan plpgsql menolak menaruhnya di boolean.
  dicabut INT := 0;
  u       RECORD;
BEGIN
  SELECT * INTO m FROM public.pemeliharaan_gardu WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pemeliharaan tidak ditemukan'; END IF;
  IF m.status = 'Dibatalkan' THEN
    RAISE EXCEPTION 'Pemeliharaan gardu % sudah dibatalkan sebelumnya', m.gardu_kode;
  END IF;
  IF btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan pembatalan wajib diisi';
  END IF;

  -- Penanda master dicabut TEPAT SASARAN: hanya kalau gardu itu memang
  -- dikonfirmasi oleh pemeliharaan INI. Kalau sudah ada pemeliharaan lain yang
  -- lebih baru, penandanya milik yang itu dan tidak boleh ikut hilang.
  UPDATE public.gardu
  SET master_terverifikasi_at = NULL,
      master_terverifikasi_dari = NULL,
      updated_at = now()
  WHERE master_terverifikasi_dari = p_id;
  GET DIAGNOSTICS dicabut = ROW_COUNT;

  UPDATE public.pemeliharaan_gardu
  SET status = 'Dibatalkan',
      verified_at = now(),
      verified_by = p_nama,
      verified_note = p_alasan,
      updated_at = now()
  WHERE id = p_id;

  -- Pekerjaan yang dibatalkan (salah gardu, uji coba) tidak boleh meninggalkan
  -- koreksi master: titik yang terlanjur dipindah dikembalikan (12 Okt 2026).
  FOR u IN SELECT x.id FROM public.master_usulan x
           WHERE x.sumber_modul = 'pemeliharaan_gardu' AND x.sumber_id = p_id AND x.status = 'menunggu' LOOP
    PERFORM public.putuskan_usulan(u.id, false, p_nama, 'Pemeliharaannya dibatalkan: ' || p_alasan);
  END LOOP;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('gardu', upper(m.gardu_kode), upper(m.ulp), 'pemeliharaan',
          to_jsonb(m.status),
          jsonb_build_object('status', 'Dibatalkan', 'alasan', p_alasan,
                             'verifikasi_master_dicabut', dicabut > 0),
          'pemeliharaan_dibatalkan', auth.uid(), p_nama);
END $function$;


-- ── 4. Pekerjaan yang tertahan karena usulan titiknya menunggu ──────────────
-- Hanya usulan yang SUDAH diterapkan (dari HP). Usulan bagian 6 belum
-- menyentuh master dan lahir dari pekerjaan yang sudah dihitung — menahannya
-- berarti realisasi bulan lalu tiba-tiba turun.

CREATE OR REPLACE VIEW public.pemeliharaan_tertahan AS
SELECT u.sumber_id AS pemeliharaan_id,
       min(u.diusulkan_at) AS sejak
FROM public.master_usulan u
WHERE u.sumber_modul = 'pemeliharaan_gardu'
  AND u.field = 'koordinat'
  AND u.status = 'menunggu'
  AND u.diterapkan_langsung
  AND u.sumber_id IS NOT NULL
GROUP BY u.sumber_id;

COMMENT ON VIEW public.pemeliharaan_tertahan IS
  'Pemeliharaan gardu yang belum dihitung realisasi karena usulan titik gardunya menunggu persetujuan admin (sama dengan pengukuran_tertahan).';

GRANT SELECT ON public.pemeliharaan_tertahan TO authenticated;


-- ── 5. Realisasi WO Pemeliharaan: tertahan selama titik menunggu ────────────
-- Kolom baru `tertahan_titik` ditambahkan di BELAKANG (CREATE OR REPLACE VIEW
-- hanya boleh menambah kolom di ujung).

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
    t.pemeliharaan_id IS NOT NULL AS tertahan_titik
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
     LEFT JOIN pemeliharaan_tertahan t ON t.pemeliharaan_id = p.id;


-- ── 6. Munculkan kembali titik dari pemeliharaan yang sudah terlanjur masuk ──
-- Pemeliharaan terakhir per gardu yang bertitik GPS, bila titik masternya
-- kosong atau meleset lebih dari radius ULP. Bukti = foto nama plat dan foto
-- keseluruhan gardu dari pemeliharaan itu.
--
-- Dilewati bila gardu itu sudah punya usulan titik yang menunggu (mis. dari
-- Pengukuran), atau pemeliharaan itu pernah melahirkan usulan titik — skrip
-- aman dijalankan ulang.

WITH akhir AS (
  SELECT DISTINCT ON (upper(p.gardu_kode), upper(p.ulp))
         p.id, p.gardu_kode, p.ulp, p.lat, p.lng, p.akurasi, p.petugas_nama
  FROM public.pemeliharaan_gardu p
  WHERE p.status IN ('Selesai', 'Diverifikasi')
    AND p.lat IS NOT NULL AND p.lng IS NOT NULL
  ORDER BY upper(p.gardu_kode), upper(p.ulp), p.tgl_selesai DESC NULLS LAST
),
calon AS (
  SELECT a.*, g.lat AS glat, g.lng AS glng,
         CASE WHEN g.lat IS NULL OR g.lng IS NULL THEN NULL
              ELSE round(public.jarak_meter(g.lat::double precision, g.lng::double precision,
                                            a.lat::double precision, a.lng::double precision)::numeric, 1)
         END AS selisih,
         COALESCE(
           (SELECT s.radius_titik_m FROM public.anomali_settings s WHERE upper(s.ulp) = upper(a.ulp)),
           (SELECT s.radius_titik_m FROM public.anomali_settings s WHERE s.ulp = 'ALL'),
           50) AS radius
  FROM akhir a
  JOIN public.gardu g ON upper(g.kode) = upper(a.gardu_kode) AND upper(g.ulp) = upper(a.ulp)
)
INSERT INTO public.master_usulan (
  entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru,
  bukti_lat, bukti_lng, bukti_akurasi, bukti_selisih, bukti_foto, catatan,
  sumber_modul, sumber_id, pengusul_nama,
  diterapkan_langsung, status
)
SELECT 'gardu', upper(c.gardu_kode), upper(c.ulp), 'koordinat',
       CASE WHEN c.glat IS NULL OR c.glng IS NULL THEN NULL
            ELSE jsonb_build_object('lat', c.glat, 'lng', c.glng) END,
       jsonb_build_object('lat', c.lat, 'lng', c.lng),
       c.lat, c.lng, c.akurasi, c.selisih,
       ARRAY(SELECT f.url FROM public.pemeliharaan_gardu_foto f
             WHERE f.pemeliharaan_id = c.id AND f.slot IN ('nama_plat', 'keseluruhan')
             ORDER BY f.slot DESC),
       'Titik GPS regu saat pemeliharaan, dimunculkan ulang 12 Okt 2026. Regu tidak menyatakan titik master salah — pastikan dari foto gardunya.',
       'pemeliharaan_gardu', c.id, c.petugas_nama,
       false, 'menunggu'
FROM calon c
WHERE (c.selisih IS NULL OR c.selisih > c.radius)
  AND NOT EXISTS (
    SELECT 1 FROM public.master_usulan u
    WHERE u.entitas = 'gardu' AND u.field = 'koordinat'
      AND upper(u.entitas_kode) = upper(c.gardu_kode) AND upper(u.ulp) = upper(c.ulp)
      AND (u.status = 'menunggu' OR (u.sumber_modul = 'pemeliharaan_gardu' AND u.sumber_id = c.id))
  );
