-- =============================================================================
-- JTR: aksesoris ikut KABEL, dan tiap temuan wajib berfoto
-- Jalankan SESUDAH `jtr-baik.sql`. Idempoten.
--
-- Tiga hal dalam satu skrip karena ketiganya menyentuh view yang sama, dan
-- menjalankannya terpisah berarti view-nya dibangun-bongkar tiga kali:
--
--   1. AKSESORIS PINDAH KE KABEL. Menambah underbuild berarti menambah kabel
--      DAN aksesorisnya — dua kabel berarti dua suspension, dua dead end, dua
--      large angle. Selama aksesoris jadi kolom `tiang`, sirkit kedua tidak
--      punya tempat untuk dicatat: kerusakan klem kabel bawah tertulis seolah
--      milik kabel atas, atau tidak tertulis sama sekali.
--
--   2. FOTO TEMUAN. Sampai sekarang temuan JTR tidak punya tempat menyimpan
--      foto — berbeda dari JTM, yang bahkan menolak menyimpan temuan tanpa
--      foto. Temuan tanpa bukti tidak bisa diverifikasi admin, dan tidak bisa
--      dibandingkan dengan keadaannya sesudah diperbaiki.
--
--   3. VIEW TEMUAN DILENGKAPI. `inspeksi_jtr_temuan` belum melaporkan kondisi
--      kabel (LEPAS, PUTUS, TERKELUPAS) maupun stay rusak. Keduanya sudah
--      dicatat regu di lapangan, lalu hilang begitu saja sebelum sampai ke
--      rekap. Kabel putus adalah temuan paling gawat yang bisa ditemukan
--      penyapuan JTR, dan justru itu yang tidak pernah muncul.
-- =============================================================================

-- ── 1. Aksesoris turun ke kabel ──────────────────────────────────────────────

ALTER TABLE public.tiang_konduktor
  ADD COLUMN IF NOT EXISTS aks_suspension  TEXT,   -- Baik | Rusak | Tidak Ada
  ADD COLUMN IF NOT EXISTS aks_large_angle TEXT,
  ADD COLUMN IF NOT EXISTS aks_dead_end    TEXT,
  -- Bukti kerusakan, satu foto per isian yang jawabannya sebuah temuan.
  -- Kuncinya nama field di layar (`jtr_item_ref.field`): konduktorKondisi,
  -- aksSuspension, aksLargeAngle, aksDeadEnd.
  ADD COLUMN IF NOT EXISTS foto_temuan     JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.tiang_konduktor.aks_suspension IS
  'Klem suspension KABEL INI. Tiang ber-underbuild punya satu set aksesoris per kabel, bukan satu set per tiang.';

ALTER TABLE public.tiang
  ADD COLUMN IF NOT EXISTS foto_temuan JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.tiang.foto_temuan IS
  'Bukti foto per temuan, dikunci nama field di layar: kondisi, andongan, ardeKondisi, stayKondisi, jamperanKondisi, rawanRow.';

-- Pindahkan yang sudah tercatat ke kabel utama. Tiang yang belum punya baris
-- konduktor sama sekali tidak bisa dipindahkan ke mana-mana — nilainya tetap
-- tersimpan di kolom lama sampai bagian 4 membuangnya, dan itu memang
-- kehilangan yang disengaja: aksesoris tanpa kabel tidak menerangkan apa pun.
UPDATE public.tiang_konduktor k
SET aks_suspension  = COALESCE(k.aks_suspension,  t.aks_suspension),
    aks_large_angle = COALESCE(k.aks_large_angle, t.aks_large_angle),
    aks_dead_end    = COALESCE(k.aks_dead_end,    t.aks_dead_end),
    updated_at      = now()
FROM public.tiang t
WHERE t.id = k.tiang_id
  AND k.nomor = 1
  AND (t.aks_suspension IS NOT NULL
    OR t.aks_large_angle IS NOT NULL
    OR t.aks_dead_end IS NOT NULL);


-- ── 2. Bongkar view yang bergantung ──────────────────────────────────────────
-- Urutannya dari yang paling luar. `jtr_penyapuan` menghitung dari
-- `inspeksi_jtr_temuan`, jadi dia harus jatuh lebih dulu.

DROP VIEW IF EXISTS public.jtr_penyapuan;
DROP VIEW IF EXISTS public.jtr_rekap_temuan;
DROP VIEW IF EXISTS public.inspeksi_jtr_temuan;


-- ── 3. Buang kolom aksesoris dari tiang ──────────────────────────────────────
-- Dua tempat untuk hal yang sama akan berselisih, dan tidak ada yang bisa
-- memastikan mana yang benar. Aplikasi sudah tidak menulisnya lagi.
--
-- ⚠ FUNGSI YANG IKUT PATAH DI SINI: `jaga_jtr_ref_terpakai` (dibuat di
-- `jtr-baik.sql`) membaca ketiga kolom ini. Postgres TIDAK menolak perintah di
-- bawah karena badan fungsi plpgsql baru diperiksa saat dijalankan — jadi
-- kerusakannya tidak terlihat sampai ada yang menghapus satu pilihan, berminggu
-- kemudian, jauh dari sini. Perbaikannya ada di `jtr-stay-jenis.sql` bagian 1b,
-- dan skrip itu wajib dijalankan menyusul.

ALTER TABLE public.tiang
  DROP COLUMN IF EXISTS aks_suspension,
  DROP COLUMN IF EXISTS aks_large_angle,
  DROP COLUMN IF EXISTS aks_dead_end;


-- ── 4. Temuan, dibangun ulang ────────────────────────────────────────────────
-- Yang BERTAMBAH dibanding versi sebelumnya:
--   • kondisi kabel per kabel  — sebelumnya tidak dilaporkan sama sekali
--   • aksesoris per kabel      — sebelumnya satu baris per tiang, kabel mana
--                                pun yang rusak
--   • stay rusak               — sebelumnya tidak dilaporkan sama sekali
--   • kolom `foto_url`         — bukti tiap temuan, kosong berarti tak berfoto
--
-- Kabel diberi label sesuai `tiang_label`: AM001-A1 untuk kabel utama,
-- AM001-A1.2 untuk underbuild kedua. Tanpa itu dua temuan di tiang yang sama
-- tampil sebagai baris kembar yang tidak bisa dibedakan.

CREATE VIEW public.inspeksi_jtr_temuan AS
WITH dasar AS (
  SELECT
    i.id AS inspeksi_id, i.gardu_kode, i.ulp, i.penyulang, i.tgl_mulai,
    t.id AS tiang_id, t.kode AS tiang_kode, t.jurusan,
    t.kondisi, t.arde_kondisi, t.andongan, t.rawan_row,
    t.stay_kondisi, t.jamperan, t.catatan_perbaikan, t.foto_temuan
  FROM public.inspeksi_jtr i
  JOIN public.inspeksi_jtr_titik x ON x.inspeksi_id = i.id
  JOIN public.tiang t ON t.id = x.tiang_id
), kabel AS (
  SELECT
    d.inspeksi_id, d.gardu_kode, d.ulp, d.penyulang, d.tgl_mulai,
    d.tiang_id, d.jurusan,
    CASE WHEN k.nomor = 1 THEN d.tiang_kode
         ELSE d.tiang_kode || '.' || k.nomor END AS tiang_kode,
    k.kondisi AS kabel_kondisi,
    k.aks_suspension, k.aks_large_angle, k.aks_dead_end,
    k.foto_temuan
  FROM dasar d
  JOIN public.tiang_konduktor k ON k.tiang_id = d.tiang_id
)
SELECT * FROM (
  -- "Arde tidak ada" BUKAN temuan: sebagian besar tiang JTR memang tidak
  -- berarde, dan itu keadaan biasa, bukan kerusakan. Menghitungnya sebagai
  -- temuan membuat rekap dipenuhi ribuan baris yang tidak menuntut tindakan
  -- apa pun — dan daftar temuan yang isinya bukan masalah akan berhenti dibaca.
  -- Yang tetap temuan adalah arde yang PUTUS: itu pernah ada lalu rusak.
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Arde putus'::text AS temuan, 'Tinggi'::text AS urgensi,
         foto_temuan->>'ardeKondisi' AS foto_url
  FROM dasar WHERE arde_kondisi = 'Putus'
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Tiang ' || lower(kondisi),
         CASE kondisi WHEN 'Miring' THEN 'Sedang' ELSE 'Tinggi' END,
         foto_temuan->>'kondisi'
  FROM dasar WHERE kondisi IS NOT NULL AND kondisi <> 'Baik'
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Andongan ' || lower(andongan), 'Sedang',
         foto_temuan->>'andongan'
  FROM dasar WHERE andongan IS NOT NULL AND andongan <> 'Baik'
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Rawan ROW: ' || lower(r), 'Sedang',
         foto_temuan->>'rawanRow'
  FROM dasar, unnest(rawan_row) AS r WHERE r IS NOT NULL AND r <> ''
  UNION ALL
  -- Stay yang RUSAK. "Tidak Ada TUI" bukan temuan — kebanyakan tiang lurus
  -- memang tidak berskur, sama halnya dengan arde.
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Stay rusak', 'Sedang',
         foto_temuan->>'stayKondisi'
  FROM dasar WHERE stay_kondisi = 'Rusak'
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Jamperan ' || lower(j->>'kondisi'), 'Sedang',
         foto_temuan->>'jamperanKondisi'
  FROM dasar, jsonb_array_elements(jamperan) AS j
  WHERE j->>'kondisi' IS NOT NULL AND j->>'kondisi' <> 'Baik'
  UNION ALL
  -- Catatan bebas tidak wajib berfoto: yang dilaporkannya belum tentu sesuatu
  -- yang bisa difoto ("perlu dirapikan saat pemeliharaan berikutnya").
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Ada catatan perbaikan', 'Sedang', NULL
  FROM dasar WHERE btrim(COALESCE(catatan_perbaikan, '')) <> ''

  -- ── Per kabel ──
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Konduktor ' || lower(kabel_kondisi),
         -- Putus memutus pelayanan; sisanya menuju ke situ.
         CASE kabel_kondisi WHEN 'Putus' THEN 'Tinggi' ELSE 'Sedang' END,
         foto_temuan->>'konduktorKondisi'
  FROM kabel WHERE kabel_kondisi IS NOT NULL AND kabel_kondisi <> 'Baik'
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Suspension rusak', 'Sedang', foto_temuan->>'aksSuspension'
  FROM kabel WHERE aks_suspension = 'Rusak'
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Large angle rusak', 'Sedang', foto_temuan->>'aksLargeAngle'
  FROM kabel WHERE aks_large_angle = 'Rusak'
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Dead end rusak', 'Sedang', foto_temuan->>'aksDeadEnd'
  FROM kabel WHERE aks_dead_end = 'Rusak'
) s;

COMMENT ON VIEW public.inspeksi_jtr_temuan IS
  'Temuan diturunkan dari keadaan yang tercatat, tidak pernah diketik. Satu baris per temuan, dengan bukti fotonya. Kabel dan aksesoris dilaporkan per kabel — AM001-A1.2 berarti kabel kedua.';

CREATE VIEW public.jtr_rekap_temuan AS
SELECT ulp, gardu_kode, jurusan, temuan, urgensi,
       count(*) AS jumlah,
       count(*) FILTER (WHERE foto_url IS NULL) AS tanpa_foto
FROM public.inspeksi_jtr_temuan
GROUP BY ulp, gardu_kode, jurusan, temuan, urgensi;


-- ── 5. Daftar penyapuan, dibangun ulang tanpa perubahan bentuk ───────────────
-- Isinya sama dengan di `jtr-penyapuan.sql`; dia cuma ikut jatuh karena
-- bergantung pada view temuan.

CREATE VIEW public.jtr_penyapuan AS
SELECT
  i.id, i.gardu_kode, i.ulp, i.penyulang, i.tgl_mulai, i.tgl_selesai, i.status,
  i.inspektor_nama, i.petugas_2, i.catatan,
  i.verified_at, i.verified_by, i.verified_note,
  g.nama  AS gardu_nama,
  g.alamat AS gardu_alamat,
  k.tiang_aktif,
  k.sudah_diperiksa,
  k.tiang_baru,
  (SELECT count(*) FROM public.inspeksi_jtr_temuan tm WHERE tm.inspeksi_id = i.id) AS jumlah_temuan,
  COALESCE((
    SELECT round(sum(gg.panjang_rute_km)::numeric, 3)
    FROM public.gardu_jtr_panjang gg
    WHERE upper(gg.gardu_kode) = upper(i.gardu_kode) AND upper(gg.ulp) = upper(i.ulp)
  ), 0) AS panjang_km
FROM public.inspeksi_jtr i
LEFT JOIN public.gardu g
  ON upper(g.kode) = upper(i.gardu_kode) AND upper(g.ulp) = upper(i.ulp)
LEFT JOIN public.inspeksi_jtr_kelengkapan k ON k.inspeksi_id = i.id;


-- ── 6. RPC koreksi: aksesoris keluar, foto masuk ─────────────────────────────

CREATE OR REPLACE FUNCTION public.koreksi_tiang(
  p_id      UUID,
  p_jenis   TEXT DEFAULT NULL,
  p_tinggi  NUMERIC DEFAULT NULL,
  p_kondisi TEXT DEFAULT NULL,
  p_lat     DOUBLE PRECISION DEFAULT NULL,
  p_lng     DOUBLE PRECISION DEFAULT NULL,
  p_nama    TEXT DEFAULT NULL,
  p_catatan TEXT DEFAULT NULL,
  p_atribut JSONB DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t    RECORD;
  diff JSONB := '{}'::jsonb;
BEGIN
  SELECT * INTO t FROM public.tiang WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang tidak ditemukan'; END IF;
  IF t.status_hidup <> 'aktif' THEN
    RAISE EXCEPTION 'Tiang % sudah tidak aktif (%)', t.kode, t.status_hidup;
  END IF;

  IF p_jenis IS NOT NULL AND p_jenis IS DISTINCT FROM t.jenis THEN
    INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', t.kode, t.ulp, 'jenis', to_jsonb(t.jenis), to_jsonb(p_jenis), 'koreksi_lapangan', auth.uid(), p_nama);
  END IF;
  IF p_tinggi IS NOT NULL AND p_tinggi IS DISTINCT FROM t.tinggi THEN
    INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', t.kode, t.ulp, 'tinggi', to_jsonb(t.tinggi), to_jsonb(p_tinggi), 'koreksi_lapangan', auth.uid(), p_nama);
  END IF;
  IF p_kondisi IS NOT NULL AND p_kondisi IS DISTINCT FROM t.kondisi THEN
    INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', t.kode, t.ulp, 'kondisi', to_jsonb(t.kondisi), to_jsonb(p_kondisi), 'koreksi_lapangan', auth.uid(), p_nama);
  END IF;
  IF p_lat IS NOT NULL AND p_lng IS NOT NULL
     AND (p_lat IS DISTINCT FROM t.lat::double precision OR p_lng IS DISTINCT FROM t.lng::double precision) THEN
    INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', t.kode, t.ulp, 'koordinat',
            jsonb_build_object('lat', t.lat, 'lng', t.lng),
            jsonb_build_object('lat', p_lat, 'lng', p_lng), 'koreksi_lapangan', auth.uid(), p_nama);
  END IF;

  IF p_atribut IS NOT NULL THEN
    -- Kumpulkan hanya yang benar-benar berbeda.
    IF p_atribut ? 'andongan'        AND (p_atribut->>'andongan')        IS DISTINCT FROM t.andongan        THEN diff := diff || jsonb_build_object('andongan',        jsonb_build_array(t.andongan,        p_atribut->>'andongan'));        END IF;
    IF p_atribut ? 'arde_kondisi'    AND (p_atribut->>'arde_kondisi')    IS DISTINCT FROM t.arde_kondisi    THEN diff := diff || jsonb_build_object('arde_kondisi',    jsonb_build_array(t.arde_kondisi,    p_atribut->>'arde_kondisi'));    END IF;
    IF p_atribut ? 'stay_kondisi'    AND (p_atribut->>'stay_kondisi')    IS DISTINCT FROM t.stay_kondisi    THEN diff := diff || jsonb_build_object('stay_kondisi',    jsonb_build_array(t.stay_kondisi,    p_atribut->>'stay_kondisi'));    END IF;
    IF p_atribut ? 'underbuild_tm'   AND (p_atribut->>'underbuild_tm')::boolean IS DISTINCT FROM t.underbuild_tm THEN diff := diff || jsonb_build_object('underbuild_tm', jsonb_build_array(t.underbuild_tm, (p_atribut->>'underbuild_tm')::boolean)); END IF;
    IF p_atribut ? 'catatan_perbaikan' AND (p_atribut->>'catatan_perbaikan') IS DISTINCT FROM t.catatan_perbaikan THEN diff := diff || jsonb_build_object('catatan_perbaikan', jsonb_build_array(t.catatan_perbaikan, p_atribut->>'catatan_perbaikan')); END IF;

    UPDATE public.tiang SET
      andongan        = COALESCE(p_atribut->>'andongan',        andongan),
      tarikan_sr      = COALESCE((p_atribut->>'tarikan_sr')::int,        tarikan_sr),
      arde_kondisi    = COALESCE(p_atribut->>'arde_kondisi',    arde_kondisi),
      arde_nilai_ohm  = COALESCE((p_atribut->>'arde_nilai_ohm')::numeric, arde_nilai_ohm),
      stay_jenis      = COALESCE(p_atribut->>'stay_jenis',      stay_jenis),
      stay_kondisi    = COALESCE(p_atribut->>'stay_kondisi',    stay_kondisi),
      rawan_row       = COALESCE(
                          (SELECT array_agg(x) FROM jsonb_array_elements_text(p_atribut->'rawan_row') AS x),
                          rawan_row),
      jamperan        = COALESCE(p_atribut->'jamperan', jamperan),
      underbuild_tm   = COALESCE((p_atribut->>'underbuild_tm')::boolean, underbuild_tm),
      catatan_perbaikan = COALESCE(p_atribut->>'catatan_perbaikan', catatan_perbaikan),
      -- Foto DIGABUNG, tidak ditimpa: koreksi yang cuma menyentuh andongan
      -- tidak boleh menghapus bukti temuan arde yang sudah difoto sebelumnya.
      foto_temuan     = foto_temuan || COALESCE(p_atribut->'foto_temuan', '{}'::jsonb)
    WHERE id = p_id;

    IF diff <> '{}'::jsonb THEN
      INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
      VALUES ('tiang', t.kode, t.ulp, 'atribut', NULL, diff, 'koreksi_lapangan', auth.uid(), p_nama);
    END IF;
  END IF;

  UPDATE public.tiang
  SET jenis   = COALESCE(p_jenis, jenis),
      tinggi  = COALESCE(p_tinggi, tinggi),
      kondisi = COALESCE(p_kondisi, kondisi),
      lat     = COALESCE(p_lat, lat),
      lng     = COALESCE(p_lng, lng),
      dikonfirmasi_at   = now(),
      dikonfirmasi_oleh = COALESCE(p_nama, dikonfirmasi_oleh),
      updated_at = now()
  WHERE id = p_id;
END $$;


-- ── 7. RPC konduktor: aksesoris dan foto ikut disimpan ───────────────────────

CREATE OR REPLACE FUNCTION public.simpan_konduktor_tiang(
  p_tiang_id UUID,
  p_daftar   JSONB,
  p_nama     TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t       RECORD;
  h       RECORD;
  k       JSONB;
  lama    RECORD;
  hulu    UUID;
  no_kabel INT;
  dipakai INT[] := '{}';
  diff    JSONB := '{}'::jsonb;
BEGIN
  SELECT kode, ulp, gardu_kode INTO t FROM public.tiang WHERE id = p_tiang_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang tidak ditemukan'; END IF;

  FOR k IN SELECT * FROM jsonb_array_elements(COALESCE(p_daftar, '[]'::jsonb)) LOOP
    no_kabel := (k->>'nomor')::int;
    hulu  := NULLIF(k->>'hulu_id', '')::uuid;
    dipakai := dipakai || no_kabel;

    IF hulu IS NOT NULL THEN
      IF hulu = p_tiang_id THEN
        RAISE EXCEPTION 'Tiang % tidak bisa jadi asal kabel bagi dirinya sendiri', t.kode;
      END IF;
      SELECT kode, ulp, gardu_kode INTO h FROM public.tiang
      WHERE id = hulu AND status_hidup = 'aktif';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Tiang asal kabel ke-% tidak ditemukan atau sudah tidak aktif', no_kabel;
      END IF;
      IF upper(h.gardu_kode) IS DISTINCT FROM upper(t.gardu_kode)
         OR upper(h.ulp) IS DISTINCT FROM upper(t.ulp) THEN
        RAISE EXCEPTION 'Tiang asal % bukan milik gardu yang sama', h.kode;
      END IF;
      -- Cegah dua tiang saling menunjuk: bentangnya akan terhitung dua kali.
      IF EXISTS (
        SELECT 1 FROM public.tiang_konduktor x
        WHERE x.tiang_id = hulu AND x.induk_tiang_id = p_tiang_id
      ) THEN
        RAISE EXCEPTION 'Tiang % sudah menunjuk % sebagai asal kabelnya', h.kode, t.kode;
      END IF;
    END IF;

    SELECT * INTO lama FROM public.tiang_konduktor
    WHERE tiang_id = p_tiang_id AND nomor = no_kabel;

    IF FOUND THEN
      IF lama.jenis IS DISTINCT FROM (k->>'jenis')
         OR lama.ukuran IS DISTINCT FROM (k->>'ukuran') THEN
        diff := diff || jsonb_build_object(
          'kabel_' || no_kabel,
          jsonb_build_array(
            concat_ws(' ', lama.jenis, lama.ukuran),
            concat_ws(' ', k->>'jenis', k->>'ukuran')));
      END IF;
      IF lama.induk_tiang_id IS DISTINCT FROM hulu THEN
        diff := diff || jsonb_build_object(
          'asal_kabel_' || no_kabel,
          jsonb_build_array(
            (SELECT kode FROM public.tiang WHERE id = lama.induk_tiang_id),
            (SELECT kode FROM public.tiang WHERE id = hulu)));
      END IF;
    END IF;

    INSERT INTO public.tiang_konduktor
      (tiang_id, nomor, jenis, ukuran, kondisi, induk_tiang_id,
       aks_suspension, aks_large_angle, aks_dead_end, foto_temuan)
    VALUES (p_tiang_id, no_kabel, k->>'jenis', k->>'ukuran', k->>'kondisi', hulu,
            k->>'aks_suspension', k->>'aks_large_angle', k->>'aks_dead_end',
            COALESCE(k->'foto_temuan', '{}'::jsonb))
    ON CONFLICT (tiang_id, nomor) DO UPDATE
      SET jenis           = EXCLUDED.jenis,
          ukuran          = EXCLUDED.ukuran,
          kondisi         = EXCLUDED.kondisi,
          induk_tiang_id  = EXCLUDED.induk_tiang_id,
          aks_suspension  = EXCLUDED.aks_suspension,
          aks_large_angle = EXCLUDED.aks_large_angle,
          aks_dead_end    = EXCLUDED.aks_dead_end,
          -- Digabung, bukan ditimpa — alasan yang sama dengan `koreksi_tiang`.
          foto_temuan     = public.tiang_konduktor.foto_temuan || EXCLUDED.foto_temuan,
          updated_at      = now();
  END LOOP;

  DELETE FROM public.tiang_konduktor
  WHERE tiang_id = p_tiang_id AND NOT (nomor = ANY (dipakai));

  IF diff <> '{}'::jsonb THEN
    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', t.kode, t.ulp, 'konduktor', NULL, diff,
            'koreksi_lapangan', auth.uid(), p_nama);
  END IF;
END $$;


-- ── 8. Katalog isian menyesuaikan ────────────────────────────────────────────
-- Ketiga aksesoris pindah ke halaman Konduktor, karena di situlah sekarang
-- tempatnya diisi: satu set per kabel. Urutannya menyusul jenis/ukuran/kondisi.
--
-- Hanya kelompok dan urutan yang diubah — `nilai_bawaan` dibiarkan apa adanya,
-- supaya setelan yang sudah disunting admin tidak ikut tersapu.

UPDATE public.jtr_item_ref SET kelompok = 'Konduktor & aksesoris', urutan = 40
  WHERE field = 'aksSuspension';
UPDATE public.jtr_item_ref SET kelompok = 'Konduktor & aksesoris', urutan = 50
  WHERE field = 'aksLargeAngle';
UPDATE public.jtr_item_ref SET kelompok = 'Konduktor & aksesoris', urutan = 60
  WHERE field = 'aksDeadEnd';
UPDATE public.jtr_item_ref SET kelompok = 'Konduktor & aksesoris'
  WHERE field IN ('konduktorJenis', 'konduktorUkuran', 'konduktorKondisi');
UPDATE public.jtr_item_ref SET kelompok = 'Jamperan'
  WHERE field IN ('jamperanJenis', 'jamperanKondisi');


-- ── 9. Hak akses ─────────────────────────────────────────────────────────────

GRANT SELECT ON public.inspeksi_jtr_temuan TO authenticated;
GRANT SELECT ON public.jtr_rekap_temuan    TO authenticated;
GRANT SELECT ON public.jtr_penyapuan       TO authenticated;
GRANT EXECUTE ON FUNCTION public.koreksi_tiang           TO authenticated;
GRANT EXECUTE ON FUNCTION public.simpan_konduktor_tiang  TO authenticated;


-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Aksesoris sudah pindah ke kabel:
--      SELECT nomor, count(*) FILTER (WHERE aks_suspension IS NOT NULL)
--      FROM tiang_konduktor GROUP BY nomor ORDER BY nomor;
--
-- b. Jenis temuan yang sekarang dilaporkan — 'Konduktor …', 'Suspension rusak',
--    'Large angle rusak', 'Dead end rusak', dan 'Stay rusak' seharusnya sudah
--    ikut muncul:
--      SELECT temuan, urgensi, count(*) FROM inspeksi_jtr_temuan
--      GROUP BY temuan, urgensi ORDER BY 3 DESC;
--
-- c. Temuan yang belum berfoto — daftar kerja verifikasi admin:
--      SELECT tiang_kode, temuan, tgl_mulai FROM inspeksi_jtr_temuan
--      WHERE foto_url IS NULL AND temuan <> 'Ada catatan perbaikan'
--      ORDER BY tgl_mulai DESC;
--
-- d. Temuan pada kabel underbuild saja (label berakhiran .2 / .3):
--      SELECT tiang_kode, temuan FROM inspeksi_jtr_temuan
--      WHERE tiang_kode ~ '\.[0-9]+$';
-- =============================================================================
