-- =============================================================================
-- Pengukuran gardu: kunci radius, koreksi titik, dan realisasi yang tertahan
-- Jalankan SESUDAH `master-usulan-schema.sql`. Idempoten.
-- Rencana lengkap: `rencana-kunci-titik-gardu.md`
--
-- ── KEADAAN DATA YANG MENENTUKAN BENTUKNYA (diperiksa 22 Sep 2026) ──────────
--   2.536 gardu di master · 444 TANPA koordinat (17,5%)
--   Dari 250 pengukuran bertitik: 153 gardunya belum punya koordinat master,
--   dan dari 97 yang bisa dibandingkan, 30 MELESET LEBIH DARI 50 M.
--   Yang terjauh: CN026 14,3 km · CN046 14,2 km · CN204 11,8 km.
--
-- Artinya kunci 50 m yang dipasang polos akan menghentikan sebagian besar
-- pekerjaan. Jalur "perbarui titik" bukan pelengkap — dia jalur utama selama
-- berbulan-bulan pertama.
--
-- ── ATURAN TERTAHANNYA REALISASI ────────────────────────────────────────────
-- Diputuskan Bapak 22 Sep: titik dan kVA MENAHAN realisasi, anomali TIDAK.
--
-- Dan itu jatuh sendiri dari bentuk datanya, bukan dari daftar sebab yang
-- harus dirawat terpisah:
--
--     Sebuah pengukuran tertahan SELAMA MASIH ADA USULAN MASTER YANG MENUNGGU
--     yang lahir dari pengukuran itu.
--
-- Titik dan kVA melahirkan usulan (ada yang harus diputuskan tentang MASTER);
-- anomali tidak melahirkan apa pun — tidak ada satu nilai master pun yang perlu
-- diubah karena sebuah trafo berbeban 120%. Jadi aturannya cukup satu kalimat,
-- dan sebab baru yang kelak lahir akan ikut dengan sendirinya.
-- =============================================================================


-- ── 1. Radius per ULP ────────────────────────────────────────────────────────
-- Ikut `anomali_settings` yang sudah per-ULP dan sudah punya layar pengaturnya,
-- bukan tabel baru. Gardu di gang sempit kota berbeda dengan gardu di tepi
-- jalan Bayan, dan yang tahu bedanya orang ULP masing-masing.

ALTER TABLE public.anomali_settings
  ADD COLUMN IF NOT EXISTS radius_titik_m NUMERIC(6,1) NOT NULL DEFAULT 50;

ALTER TABLE public.anomali_settings DROP CONSTRAINT IF EXISTS anomali_radius_wajar;
ALTER TABLE public.anomali_settings ADD CONSTRAINT anomali_radius_wajar
  CHECK (radius_titik_m >= 10 AND radius_titik_m <= 2000);

COMMENT ON COLUMN public.anomali_settings.radius_titik_m IS
  'Sejauh mana petugas boleh berdiri dari titik master saat mengukur, dalam meter. Di luar ini pengukuran dihalangi sampai petugas memilih: salah gardu, atau titik masternya yang keliru.';

INSERT INTO public.anomali_settings (ulp)
VALUES ('AMPENAN'), ('CAKRANEGARA'), ('GERUNG'), ('TANJUNG'), ('ALL')
ON CONFLICT (ulp) DO NOTHING;


-- ── 2. Koreksi titik: sumbernya ikut tercatat, dan SELALU diverifikasi ───────
--
-- ⚠ DUA PERUBAHAN PERILAKU, keduanya disengaja:
--
-- a. `sumber_modul` dulu dipaku 'inspeksi_jtr'. Sekarang parameter — pengukuran
--    perlu menyebut dirinya sendiri, kalau tidak tab Persetujuan pengukuran
--    tidak bisa membedakan usulan miliknya dari milik modul lain.
--
-- b. Mengisi koordinat yang KOSONG dulu langsung berstatus 'disetujui', tanpa
--    dilihat siapa pun. Sekarang 'menunggu' juga.
--
--    Bapak 22 Sep: "ingat admin yang tetap verifikasi dan ditunjukkan titik
--    sebelum dan sesudahnya saat verifikasi di web."
--
--    Dan alasannya kuat: justru pada gardu yang MASTERNYA KOSONG, petugas yang
--    salah gardu tidak punya apa pun yang membantahnya. Tidak ada titik lama
--    untuk dibandingkan, tidak ada selisih yang mencurigakan — angkanya masuk
--    begitu saja dan tidak ada yang akan pernah tahu. Yang paling tidak
--    terlindungi justru yang paling perlu dilihat orang.
--
--    Perubahan ini BERLAKU JUGA untuk inspeksi JTR yang memakai fungsi sama.
--    Disengaja: satu tindakan yang sama tidak boleh punya dua aturan tergantung
--    layar mana yang memanggilnya.

CREATE OR REPLACE FUNCTION public.koreksi_titik_gardu(
  p_kode      TEXT,
  p_ulp       TEXT,
  p_lat       DOUBLE PRECISION,
  p_lng       DOUBLE PRECISION,
  p_akurasi   NUMERIC DEFAULT NULL,
  p_nama      TEXT DEFAULT NULL,
  p_catatan   TEXT DEFAULT NULL,
  p_sumber_modul TEXT DEFAULT 'inspeksi_jtr',
  p_sumber_id    UUID DEFAULT NULL,
  p_foto      TEXT[] DEFAULT '{}'
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  g          RECORD;
  lama       JSONB;
  selisih    NUMERIC;
  id_usulan  UUID;
BEGIN
  SELECT kode, ulp, lat, lng INTO g
  FROM public.gardu
  WHERE upper(kode) = upper(p_kode) AND upper(ulp) = upper(p_ulp);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gardu % di ULP % tidak ada di master', p_kode, p_ulp;
  END IF;

  IF g.lat IS NULL OR g.lng IS NULL THEN
    lama := NULL;
    selisih := NULL;
  ELSE
    lama := jsonb_build_object('lat', g.lat, 'lng', g.lng);
    selisih := round(public.jarak_meter(
      g.lat::double precision, g.lng::double precision, p_lat, p_lng)::numeric, 1);
  END IF;

  -- Master berubah SEKARANG. Petugas berdiri di sana, dan seluruh jaringan
  -- digambar dari titik itu — menahannya justru menghambat pekerjaan. Yang
  -- menjaganya: penolakan admin mengembalikan nilai lamanya.
  UPDATE public.gardu
  SET lat = p_lat, lng = p_lng
  WHERE upper(kode) = upper(p_kode) AND upper(ulp) = upper(p_ulp);

  INSERT INTO public.master_usulan (
    entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru,
    bukti_lat, bukti_lng, bukti_akurasi, bukti_selisih, bukti_foto, catatan,
    sumber_modul, sumber_id, pengusul_uid, pengusul_nama,
    diterapkan_langsung, diterapkan_at, status
  ) VALUES (
    'gardu', upper(p_kode), upper(p_ulp), 'koordinat',
    lama, jsonb_build_object('lat', p_lat, 'lng', p_lng),
    p_lat, p_lng, p_akurasi, selisih, COALESCE(p_foto, '{}'), p_catatan,
    COALESCE(p_sumber_modul, 'inspeksi_jtr'), p_sumber_id, auth.uid(), p_nama,
    true, now(),
    'menunggu'
  )
  RETURNING id INTO id_usulan;

  INSERT INTO public.master_audit (
    entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru,
    aksi, usulan_id, oleh_uid, oleh_nama
  ) VALUES (
    'gardu', upper(p_kode), upper(p_ulp), 'koordinat',
    lama, jsonb_build_object('lat', p_lat, 'lng', p_lng),
    CASE WHEN lama IS NULL THEN 'isi_kosong' ELSE 'koreksi_lapangan' END,
    id_usulan, auth.uid(), p_nama
  );

  RETURN id_usulan;
END $fn$;


-- ── 3. Usulan kVA dari pengukuran ────────────────────────────────────────────
-- BERBEDA dari koordinat: master TIDAK berubah sampai disetujui. Salah kVA
-- menggerakkan orang dan barang — ia dipakai menghitung persen beban, memicu
-- WO penggantian trafo, dan dikirim ke AMG. Lebih baik menunggu.

CREATE OR REPLACE FUNCTION public.usul_kva_gardu(
  p_kode       TEXT,
  p_ulp        TEXT,
  p_kva        NUMERIC,
  p_nama       TEXT DEFAULT NULL,
  p_catatan    TEXT DEFAULT NULL,
  p_sumber_id  UUID DEFAULT NULL,
  p_foto       TEXT[] DEFAULT '{}'
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  g         RECORD;
  id_usulan UUID;
BEGIN
  IF p_kva IS NULL OR p_kva <= 0 THEN
    RAISE EXCEPTION 'kVA tidak wajar: %', p_kva;
  END IF;

  SELECT kode, ulp, daya INTO g FROM public.gardu
  WHERE upper(kode) = upper(p_kode) AND upper(ulp) = upper(p_ulp);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gardu % di ULP % tidak ada di master', p_kode, p_ulp;
  END IF;

  -- Sama saja? Tidak ada yang perlu diusulkan. `daya` bertipe teks di master,
  -- jadi dibandingkan sebagai ANGKA — "160" dan "160.0" adalah kVA yang sama,
  -- dan perbandingan teks akan menganggapnya berbeda lalu melahirkan usulan
  -- yang tidak mengubah apa pun.
  IF g.daya IS NOT NULL
     AND btrim(g.daya::text) ~ '^[0-9]+(\.[0-9]+)?$'
     AND g.daya::numeric = p_kva THEN
    RETURN NULL;
  END IF;

  -- Usulan yang SAMA dan masih menunggu tidak digandakan. Petugas yang
  -- mengukur ulang gardu yang sama bulan berikutnya akan mengirim angka yang
  -- sama lagi, dan dua baris usulan identik cuma membuat admin memutuskan
  -- dua kali untuk satu hal.
  SELECT id INTO id_usulan FROM public.master_usulan
  WHERE entitas = 'gardu' AND upper(entitas_kode) = upper(p_kode)
    AND upper(ulp) = upper(p_ulp) AND field = 'daya' AND status = 'menunggu'
    AND (nilai_baru ->> 'nilai')::numeric = p_kva
  LIMIT 1;
  IF FOUND THEN RETURN id_usulan; END IF;

  INSERT INTO public.master_usulan (
    entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru,
    bukti_foto, catatan, sumber_modul, sumber_id,
    pengusul_uid, pengusul_nama, diterapkan_langsung, status
  ) VALUES (
    'gardu', upper(p_kode), upper(p_ulp), 'daya',
    CASE WHEN g.daya IS NULL THEN NULL ELSE jsonb_build_object('nilai', g.daya) END,
    jsonb_build_object('nilai', p_kva),
    COALESCE(p_foto, '{}'), p_catatan, 'pengukuran', p_sumber_id,
    auth.uid(), p_nama, false, 'menunggu'
  )
  RETURNING id INTO id_usulan;

  RETURN id_usulan;
END $fn$;


-- ── 4. Pengukuran yang tertahan ──────────────────────────────────────────────
-- Satu kalimat, bukan daftar sebab: tertahan selama ada usulan yang menunggu.

CREATE OR REPLACE VIEW public.pengukuran_tertahan AS
SELECT
  -- ⚠ DITERUSKAN SEBAGAI TEKS, bukan UUID. `pengukuran_gardu.id` bertipe TEXT
  -- (warisan migrasi Firestore — isinya berbentuk UUID tapi kolomnya teks),
  -- sedangkan `master_usulan.sumber_id` bertipe UUID. Tanpa cast ini,
  -- penyambungannya gagal dengan "operator does not exist: uuid = text".
  u.sumber_id::text                                 AS pengukuran_id,
  bool_or(u.field = 'koordinat')                    AS titik_diperbarui,
  bool_or(u.field = 'daya')                         AS beda_kva,
  count(*)                                          AS usulan_menunggu,
  min(u.diusulkan_at)                               AS sejak
FROM public.master_usulan u
WHERE u.sumber_modul = 'pengukuran'
  AND u.sumber_id IS NOT NULL
  AND u.status = 'menunggu'
GROUP BY u.sumber_id;

COMMENT ON VIEW public.pengukuran_tertahan IS
  'Pengukuran yang belum boleh dihitung sebagai realisasi karena masih ada usulan master yang menunggu keputusan. Anomali hasil ukur TIDAK ada di sini — dia tidak melahirkan usulan, dan memang tidak menahan realisasi.';


-- ── 5. Realisasi WO menghormati yang tertahan ────────────────────────────────
-- Barisnya TETAP terlihat — yang berubah cuma `terealisasi`. Menyembunyikannya
-- akan membuat WO berbunyi "belum diukur" padahal petugas sudah ke sana, dan
-- gardu itu akan dikirimi orang untuk kedua kalinya.

CREATE OR REPLACE VIEW public.wo_pengukuran_realisasi AS
SELECT
  i.id,
  i.wo_id,
  i.kode_gardu,
  i.ulp,
  i.nama,
  i.alamat,
  i.penyulang,
  i.kva_master,
  i.alasan,
  i.tgl_ukur_terakhir,
  i.umur_bulan,
  i.urutan,

  w.bulan,
  w.tahun,
  w.tgl_wo,

  p.id                  AS pengukuran_id,
  p.tanggal_pengukuran  AS tgl_realisasi,
  p.petugas_nama,
  p.persen_beban,
  p.beban_kva,
  p.kva_trafo           AS kva_pengukuran,

  -- ⚠ ARTINYA BERUBAH: sudah diukur TAPI belum tertahan.
  -- Seluruh layar yang sudah memakai kolom ini ikut benar tanpa disentuh.
  (p.id IS NOT NULL AND t.pengukuran_id IS NULL) AS terealisasi,

  -- ── Baru ──
  (t.pengukuran_id IS NOT NULL)          AS tertahan,
  COALESCE(t.titik_diperbarui, false)    AS tertahan_titik,
  COALESCE(t.beda_kva, false)            AS tertahan_kva
FROM public.wo_pengukuran_item i
JOIN public.wo_pengukuran w ON w.id = i.wo_id
LEFT JOIN LATERAL (
  SELECT pg.id, pg.tanggal_pengukuran, pg.petugas_nama,
         pg.persen_beban, pg.beban_kva, pg.kva_trafo
  FROM public.pengukuran_gardu pg
  WHERE upper(pg.no_gardu)     = upper(i.kode_gardu)
    AND upper(pg.petugas_unit) = upper(i.ulp)
    AND pg.tanggal_pengukuran >= to_char(w.tgl_wo, 'YYYY-MM-DD')
    AND pg.tanggal_pengukuran <  to_char(w.tgl_wo + INTERVAL '1 month', 'YYYY-MM-DD')
    AND pg.hasil_penyeimbangan_id IS NULL
  ORDER BY pg.tanggal_pengukuran
  LIMIT 1
) p ON TRUE
LEFT JOIN public.pengukuran_tertahan t ON t.pengukuran_id = p.id;

COMMENT ON VIEW public.wo_pengukuran_realisasi IS
  'Baris WO Pengukuran + realisasinya. terealisasi = sudah diukur DAN tidak sedang tertahan usulan master. Yang tertahan tetap terlihat (tertahan = true) supaya gardunya tidak dikirimi orang untuk kedua kalinya.';


-- ── 6. Daftar untuk tab Persetujuan ──────────────────────────────────────────
-- Usulan + pengukuran yang melahirkannya + titik LAMA dan BARU berdampingan.
--
-- Titik lama ikut dibawa karena itulah yang diminta: "ditunjukkan titik sebelum
-- dan sesudahnya saat verifikasi di web". Angka lintang-bujur tidak memberi
-- tahu apa pun tentang apakah perpindahan 14 km masuk akal — peta memberi tahu,
-- dan peta perlu kedua titiknya.

CREATE OR REPLACE VIEW public.pengukuran_persetujuan AS
SELECT
  u.id                        AS usulan_id,
  u.entitas_kode              AS kode_gardu,
  u.ulp,
  u.field,
  u.nilai_lama,
  u.nilai_baru,
  u.bukti_lat,
  u.bukti_lng,
  u.bukti_akurasi,
  u.bukti_selisih,
  u.bukti_foto,
  u.catatan,
  u.pengusul_nama,
  u.diusulkan_at,
  u.diterapkan_langsung,
  u.sumber_id                 AS pengukuran_id,

  g.nama                      AS nama_gardu,
  g.alamat,
  g.feeder                    AS penyulang,
  g.daya                      AS kva_master,
  -- Titik master SEKARANG. Untuk koordinat yang sudah diterapkan langsung,
  -- inilah "sesudah"-nya; `nilai_lama` yang jadi "sebelum".
  g.lat                       AS lat_master,
  g.lng                       AS lng_master,

  pg.tanggal_pengukuran,
  pg.jam_pengukuran,
  pg.kva_trafo                AS kva_ukur,
  pg.persen_beban,
  pg.beban_kva,
  pg.suhu_trafo,
  pg.total_arus_r, pg.total_arus_s, pg.total_arus_t,
  pg.petugas_nama,
  pg.foto_arus, pg.foto_tegangan
FROM public.master_usulan u
LEFT JOIN public.gardu g
  ON upper(g.kode) = upper(u.entitas_kode) AND upper(g.ulp) = upper(u.ulp)
-- Cast dengan alasan yang sama seperti di `pengukuran_tertahan`.
LEFT JOIN public.pengukuran_gardu pg ON pg.id = u.sumber_id::text
WHERE u.sumber_modul = 'pengukuran'
  AND u.status = 'menunggu';

COMMENT ON VIEW public.pengukuran_persetujuan IS
  'Usulan master yang lahir dari pengukuran dan masih menunggu keputusan, lengkap dengan titik lama, titik master sekarang, bukti foto, dan hasil ukurnya. Anomali tidak ada di sini — dia dihitung di layar dari ambang per ULP, dan tidak menahan realisasi.';


-- ── 7. Hak akses ─────────────────────────────────────────────────────────────

GRANT SELECT  ON public.pengukuran_tertahan     TO authenticated;
GRANT SELECT  ON public.pengukuran_persetujuan  TO authenticated;
GRANT EXECUTE ON FUNCTION public.koreksi_titik_gardu TO authenticated;
GRANT EXECUTE ON FUNCTION public.usul_kva_gardu      TO authenticated;


-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Radius per ULP:
--      SELECT ulp, radius_titik_m FROM anomali_settings ORDER BY ulp;
--
-- b. Yang menunggu keputusan sekarang:
--      SELECT kode_gardu, ulp, field, bukti_selisih, bukti_akurasi, pengusul_nama
--      FROM pengukuran_persetujuan ORDER BY diusulkan_at DESC;
--
-- c. Pengukuran yang tertahan, dan sebabnya:
--      SELECT * FROM pengukuran_tertahan;
--
-- d. Pengaruhnya pada capaian WO — `terealisasi` sekarang mengecualikan yang
--    tertahan, dan `tertahan` menyebut berapa:
--      SELECT bulan, tahun, ulp,
--             count(*) FILTER (WHERE terealisasi) AS realisasi,
--             count(*) FILTER (WHERE tertahan)    AS tertahan
--      FROM wo_pengukuran_realisasi GROUP BY 1,2,3 ORDER BY 2 DESC, 1 DESC, 3;
-- =============================================================================
