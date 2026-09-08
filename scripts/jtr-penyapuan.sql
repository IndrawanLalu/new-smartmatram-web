-- =============================================================================
-- Fase 1.4 — Penyapuan gardu: menandai satu gardu selesai ditelusuri
-- Jalankan SESUDAH `jtr-atribut-tiang.sql`. Idempoten.
--
-- Selama penyapuan tidak pernah tercatat, `jtr_cakupan` selamanya 0% dan ukuran
-- keberhasilan program tidak punya angka. Ini yang menutup lubang itu.
--
-- ── MEMBERESKAN SISA MODEL LAMA ─────────────────────────────────────────────
-- `jtr-inspeksi-schema.sql` ditulis sebelum kita memindahkan atribut lapangan
-- dari jurusan ke tiang. Akibatnya ada dua peninggalan yang harus dibereskan
-- sebelum penyapuan bisa dipakai:
--
--   1. Penjaga kelengkapan menghitung kabel lewat `tiang_sirkit`, tabel yang
--      sudah tidak diisi lagi. Hasilnya SELALU nol — penjaganya mati tanpa ada
--      yang tahu. Penjaga yang diam-diam tidak bekerja lebih berbahaya daripada
--      tidak ada penjaga sama sekali, karena orang telanjur percaya.
--
--   2. `inspeksi_jtr_titik` punya belasan kolom kondisi yang sekarang sudah
--      tersimpan di `tiang`. Dua tempat untuk hal yang sama akan berselisih,
--      dan tidak ada yang bisa memastikan mana yang benar. Kolomnya dibuang
--      (tabelnya masih kosong, jadi tidak ada yang hilang).
--
-- Sesudah ini pembagiannya tegas:
--   `tiang`            = keadaan aset SEKARANG
--   `inspeksi_jtr`     = kapan gardu ini ditelusuri, oleh siapa, dan sudah
--                        disetujui atau belum
--   `inspeksi_jtr_titik` = tiang mana saja yang benar-benar dilihat pada
--                        penyapuan itu
-- =============================================================================

-- ── 1. Buang peninggalan model lama ──────────────────────────────────────────

-- Kondisi konduktor kini tersimpan di `tiang_konduktor`, per tiang. Tabel ini
-- menunjuk `jtr_sirkit` yang sudah tidak dipakai.
-- Urutannya penting: view yang bergantung dibuang lebih dulu, kalau tidak
-- Postgres menolak menghapus tabelnya.
--
-- `jtr_penyapuan` ada di urutan paling atas karena dia dibuat oleh skrip INI
-- juga, di bagian 5. Pada jalan pertama dia belum ada; pada jalan kedua dia
-- sudah ada dan bergantung pada `inspeksi_jtr_temuan` — itulah yang membuat
-- skrip ini gagal saat dijalankan ulang, dan itu tidak pernah ketahuan karena
-- saya hanya mengujinya di basis data kosong.
DROP VIEW IF EXISTS public.jtr_penyapuan;
DROP VIEW IF EXISTS public.jtr_rekap_temuan;
DROP VIEW IF EXISTS public.inspeksi_jtr_temuan;
DROP VIEW IF EXISTS public.inspeksi_jtr_kelengkapan;
DROP TABLE IF EXISTS public.inspeksi_jtr_konduktor;

ALTER TABLE public.inspeksi_jtr_titik
  DROP COLUMN IF EXISTS tiang_jenis,
  DROP COLUMN IF EXISTS tiang_ukuran_m,
  DROP COLUMN IF EXISTS tiang_kondisi,
  DROP COLUMN IF EXISTS aks_suspension,
  DROP COLUMN IF EXISTS aks_large_angle,
  DROP COLUMN IF EXISTS aks_dead_end,
  DROP COLUMN IF EXISTS jamperan,
  DROP COLUMN IF EXISTS andongan,
  DROP COLUMN IF EXISTS tarikan_sr,
  DROP COLUMN IF EXISTS arde_kondisi,
  DROP COLUMN IF EXISTS arde_nilai_ohm,
  DROP COLUMN IF EXISTS stay_jenis,
  DROP COLUMN IF EXISTS stay_kondisi,
  DROP COLUMN IF EXISTS rawan_row;

COMMENT ON TABLE public.inspeksi_jtr_titik IS
  'Tiang mana saja yang benar-benar dilihat pada satu penyapuan. Kondisinya sendiri tersimpan di `tiang` — di sini hanya catatan bahwa tiang itu diperiksa.';

-- ── 2. Kelengkapan penyapuan ─────────────────────────────────────────────────
-- Sekarang hanya menghitung TIANG. Kabel tidak lagi jadi syarat terpisah karena
-- kondisinya melekat pada tiangnya; memeriksa tiang berarti sudah memeriksa
-- kabel yang lewat di situ.

DROP VIEW IF EXISTS public.inspeksi_jtr_kelengkapan;
CREATE VIEW public.inspeksi_jtr_kelengkapan AS
SELECT
  i.id AS inspeksi_id,
  i.gardu_kode,
  i.ulp,
  (SELECT count(*) FROM public.tiang t
     WHERE upper(t.gardu_kode) = upper(i.gardu_kode)
       AND upper(t.ulp) = upper(i.ulp)
       AND t.status_hidup = 'aktif')                           AS tiang_aktif,
  (SELECT count(*) FROM public.inspeksi_jtr_titik x
     WHERE x.inspeksi_id = i.id AND x.tiang_id IS NOT NULL)    AS sudah_diperiksa,
  (SELECT count(*) FROM public.inspeksi_jtr_titik x
     WHERE x.inspeksi_id = i.id AND x.hasil_periksa = 'baru')  AS tiang_baru
FROM public.inspeksi_jtr i;

CREATE OR REPLACE FUNCTION public.inspeksi_jtr_cegah_selesai_separuh()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  k RECORD;
BEGIN
  IF NEW.status <> 'Selesai' OR OLD.status = 'Selesai' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO k FROM public.inspeksi_jtr_kelengkapan WHERE inspeksi_id = NEW.id;

  IF k.tiang_aktif = 0 THEN
    RAISE EXCEPTION
      'Gardu % belum punya satu tiang pun. Titik jaringannya dulu sebelum menyatakan selesai.',
      NEW.gardu_kode;
  END IF;

  IF k.sudah_diperiksa < k.tiang_aktif THEN
    RAISE EXCEPTION
      'Penyapuan belum tuntas: % dari % tiang aktif belum dinilai.',
      k.tiang_aktif - k.sudah_diperiksa, k.tiang_aktif;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_inspeksi_jtr_cegah_selesai ON public.inspeksi_jtr;
CREATE TRIGGER trg_inspeksi_jtr_cegah_selesai
  BEFORE UPDATE OF status ON public.inspeksi_jtr
  FOR EACH ROW EXECUTE FUNCTION public.inspeksi_jtr_cegah_selesai_separuh();

-- ── 3. Temuan per penyapuan ──────────────────────────────────────────────────
-- Dibangun ulang di atas `tiang`, bukan di atas kolom kondisi yang sudah
-- dibuang. Tetap per-penyapuan supaya bisa dijawab "apa yang ditemukan pada
-- penelusuran tanggal sekian", bukan sekadar keadaan hari ini.

CREATE OR REPLACE VIEW public.inspeksi_jtr_temuan AS
WITH dasar AS (
  SELECT
    i.id AS inspeksi_id, i.gardu_kode, i.ulp, i.penyulang, i.tgl_mulai,
    t.id AS tiang_id, t.kode AS tiang_kode, t.jurusan,
    t.kondisi, t.arde_kondisi, t.andongan, t.rawan_row,
    t.aks_suspension, t.aks_large_angle, t.aks_dead_end,
    t.jamperan, t.catatan_perbaikan
  FROM public.inspeksi_jtr i
  JOIN public.inspeksi_jtr_titik x ON x.inspeksi_id = i.id
  JOIN public.tiang t ON t.id = x.tiang_id
)
SELECT * FROM (
  -- "Arde tidak ada" BUKAN temuan: sebagian besar tiang JTR memang tidak
  -- berarde, dan itu keadaan biasa, bukan kerusakan. Menghitungnya sebagai
  -- temuan membuat rekap dipenuhi ribuan baris yang tidak menuntut tindakan
  -- apa pun — dan daftar temuan yang isinya bukan masalah akan berhenti dibaca.
  -- Yang tetap temuan adalah arde yang PUTUS: itu pernah ada lalu rusak.
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Arde putus'::text AS temuan, 'Tinggi'::text AS urgensi
  FROM dasar WHERE arde_kondisi = 'Putus'
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Tiang ' || lower(kondisi),
         CASE kondisi WHEN 'Miring' THEN 'Sedang' ELSE 'Tinggi' END
  FROM dasar WHERE kondisi IS NOT NULL AND kondisi <> 'Baik'
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Andongan ' || lower(andongan), 'Sedang'
  FROM dasar WHERE andongan IS NOT NULL AND andongan <> 'Baik'
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Rawan ROW: ' || lower(r), 'Sedang'
  FROM dasar, unnest(rawan_row) AS r WHERE r IS NOT NULL AND r <> ''
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Aksesoris rusak', 'Sedang'
  FROM dasar
  WHERE 'Rusak' IN (COALESCE(aks_suspension,''), COALESCE(aks_large_angle,''), COALESCE(aks_dead_end,''))
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Jamperan ' || lower(j->>'kondisi'), 'Sedang'
  FROM dasar, jsonb_array_elements(jamperan) AS j
  WHERE j->>'kondisi' IS NOT NULL AND j->>'kondisi' <> 'Baik'
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Ada catatan perbaikan', 'Sedang'
  FROM dasar WHERE btrim(COALESCE(catatan_perbaikan, '')) <> ''
) s;

CREATE OR REPLACE VIEW public.jtr_rekap_temuan AS
SELECT ulp, gardu_kode, jurusan, temuan, urgensi, count(*) AS jumlah
FROM public.inspeksi_jtr_temuan
GROUP BY ulp, gardu_kode, jurusan, temuan, urgensi;

-- ── 4. Selesaikan penyapuan dalam satu tarikan ───────────────────────────────
-- Satu fungsi, bukan tiga panggilan dari HP: kalau baris kepala terbuat lalu
-- sambungannya putus sebelum daftar tiangnya masuk, penyapuan itu menggantung
-- setengah jadi dan tidak bisa diselesaikan maupun diulang tanpa membingungkan.
--
-- Tiang yang dititik pada rentang penyapuan ditandai 'baru'; sisanya 'cocok'.
-- Itulah yang membedakan "gardu ini baru dipetakan" dari "gardu ini ditelusuri
-- ulang dan ternyata sesuai".

CREATE OR REPLACE FUNCTION public.selesaikan_penyapuan(
  p_gardu     TEXT,
  p_ulp       TEXT,
  p_penyulang TEXT DEFAULT NULL,
  p_nama      TEXT DEFAULT NULL,
  p_petugas_2 TEXT DEFAULT NULL,
  p_catatan   TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  id_sapu UUID;
  mulai   TIMESTAMPTZ;
BEGIN
  -- Penyapuan yang masih terbuka dipakai lagi, BEGITU JUGA yang sudah selesai
  -- HARI INI: menekan tombol dua kali tidak boleh melahirkan dua catatan.
  --
  -- Yang selesai di hari LAIN sengaja tidak diambil — menelusuri ulang gardu
  -- bulan depan memang penyapuan yang berbeda, dan riwayatnya harus terpisah
  -- supaya "kapan terakhir gardu ini dilihat" tetap bisa dijawab.
  SELECT id, created_at INTO id_sapu, mulai
  FROM public.inspeksi_jtr
  WHERE upper(gardu_kode) = upper(p_gardu)
    AND upper(ulp) = upper(p_ulp)
    AND (status IN ('Dijadwalkan', 'Dalam Proses')
         OR (status = 'Selesai' AND tgl_selesai = CURRENT_DATE))
  ORDER BY created_at DESC
  LIMIT 1;

  IF id_sapu IS NULL THEN
    INSERT INTO public.inspeksi_jtr (
      gardu_kode, ulp, penyulang, tgl_mulai, status,
      inspektor_uid, inspektor_nama, petugas_2, catatan
    ) VALUES (
      upper(p_gardu), upper(p_ulp), p_penyulang, CURRENT_DATE, 'Dalam Proses',
      auth.uid(), p_nama, p_petugas_2, p_catatan
    )
    RETURNING id, created_at INTO id_sapu, mulai;
  END IF;

  INSERT INTO public.inspeksi_jtr_titik (inspeksi_id, tiang_id, hasil_periksa, lat, lng)
  SELECT
    id_sapu,
    t.id,
    CASE WHEN t.created_at >= mulai - INTERVAL '1 day' THEN 'baru' ELSE 'cocok' END,
    t.lat,
    t.lng
  FROM public.tiang t
  WHERE upper(t.gardu_kode) = upper(p_gardu)
    AND upper(t.ulp) = upper(p_ulp)
    AND t.status_hidup = 'aktif'
  -- Syarat WHERE-nya harus disebut ulang: indeks uniknya parsial
  -- (`WHERE tiang_id IS NOT NULL`), dan ON CONFLICT tidak mengenali indeks
  -- parsial kalau predikatnya tidak dicantumkan.
  ON CONFLICT (inspeksi_id, tiang_id) WHERE tiang_id IS NOT NULL DO NOTHING;

  UPDATE public.inspeksi_jtr
  SET status = 'Selesai',
      tgl_selesai = CURRENT_DATE,
      inspektor_nama = COALESCE(p_nama, inspektor_nama),
      petugas_2 = COALESCE(p_petugas_2, petugas_2),
      catatan = COALESCE(p_catatan, catatan),
      updated_at = now()
  WHERE id = id_sapu;

  RETURN id_sapu;
END $$;

COMMENT ON FUNCTION public.selesaikan_penyapuan IS
  'Tandai satu gardu selesai ditelusuri. Membuat kepala penyapuan bila belum ada, mendaftar semua tiang aktifnya, lalu menutupnya — satu transaksi.';

-- ── 5. Daftar penyapuan untuk web ────────────────────────────────────────────

CREATE OR REPLACE VIEW public.jtr_penyapuan AS
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

GRANT SELECT ON public.jtr_penyapuan            TO authenticated;
GRANT SELECT ON public.inspeksi_jtr_kelengkapan TO authenticated;
GRANT SELECT ON public.inspeksi_jtr_temuan      TO authenticated;
GRANT SELECT ON public.jtr_rekap_temuan         TO authenticated;
GRANT EXECUTE ON FUNCTION public.selesaikan_penyapuan TO authenticated;

-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Penyapuan yang sudah tercatat:
--      SELECT gardu_kode, tgl_selesai, status, tiang_aktif, tiang_baru, jumlah_temuan,
--             panjang_km, inspektor_nama
--      FROM jtr_penyapuan ORDER BY tgl_selesai DESC;
--
-- b. Cakupan (sekarang akhirnya bergerak dari 0%):
--      SELECT * FROM jtr_cakupan;
--
-- c. Temuan pada satu penyapuan:
--      SELECT tiang_kode, temuan, urgensi FROM inspeksi_jtr_temuan
--      WHERE inspeksi_id = '<id>';
-- =============================================================================

-- ── 6. Keputusan admin atas satu inspeksi gardu ──────────────────────────────
-- Satuan persetujuannya SATU GARDU, bukan satu tiang. Admin menyatakan bahwa
-- pekerjaan di gardu itu benar dan sesuai — di situlah titik penentunya.
--
-- Status 'Ditolak' ditambahkan: tanpa itu, inspeksi yang keliru cuma bisa
-- didiamkan, dan petugas tidak pernah tahu bahwa hasilnya perlu diulang.

ALTER TABLE public.inspeksi_jtr DROP CONSTRAINT IF EXISTS inspeksi_jtr_status_valid;
ALTER TABLE public.inspeksi_jtr ADD CONSTRAINT inspeksi_jtr_status_valid
  CHECK (status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai', 'Diverifikasi', 'Ditolak'));

CREATE OR REPLACE FUNCTION public.putuskan_inspeksi_jtr(
  p_id      UUID,
  p_setuju  BOOLEAN,
  p_nama    TEXT DEFAULT NULL,
  p_catatan TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i RECORD;
BEGIN
  SELECT * INTO i FROM public.inspeksi_jtr WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inspeksi tidak ditemukan'; END IF;

  IF i.status NOT IN ('Selesai', 'Ditolak') THEN
    RAISE EXCEPTION
      'Inspeksi % masih berstatus %. Hanya yang sudah dinyatakan selesai petugas yang bisa diputuskan.',
      i.gardu_kode, i.status;
  END IF;

  -- Menolak WAJIB beralasan. Penolakan tanpa alasan tidak memberi petugas satu
  -- pun petunjuk tentang apa yang harus diperbaiki, jadi hasilnya cuma
  -- pekerjaan yang diulang dengan cara yang sama.
  IF NOT p_setuju AND btrim(COALESCE(p_catatan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan penolakan wajib diisi';
  END IF;

  UPDATE public.inspeksi_jtr
  SET status = CASE WHEN p_setuju THEN 'Diverifikasi' ELSE 'Ditolak' END,
      verified_at = now(),
      verified_by = auth.uid(),
      verified_note = p_catatan,
      updated_at = now()
  WHERE id = p_id;

  -- Jejaknya ditulis ke audit master yang sama dengan koreksi lainnya, supaya
  -- riwayat satu gardu bisa dibaca di satu tempat.
  INSERT INTO public.master_audit (
    entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama
  ) VALUES (
    'gardu', upper(i.gardu_kode), upper(i.ulp), 'inspeksi_jtr',
    to_jsonb(i.status),
    to_jsonb(CASE WHEN p_setuju THEN 'Diverifikasi' ELSE 'Ditolak' END),
    CASE WHEN p_setuju THEN 'inspeksi_disetujui' ELSE 'inspeksi_ditolak' END,
    auth.uid(), p_nama
  );
END $$;

GRANT EXECUTE ON FUNCTION public.putuskan_inspeksi_jtr TO authenticated;
