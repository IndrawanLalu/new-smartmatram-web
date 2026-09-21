-- =============================================================================
-- Membatalkan data yang keliru — JTM, JTR, dan Pemeliharaan Gardu
-- Jalankan SESUDAH `jtm-penyulang-unik.sql`. Idempoten.
--
-- ── "BATALKAN", BUKAN "HAPUS" ───────────────────────────────────────────────
-- Barisnya tidak pernah dibuang. Sikap ini sudah dipegang kode ini sejak
-- `jtr-koreksi.sql`, dan tiga alasannya masih berlaku:
--
--   1. Angka bulan lalu ikut berubah surut. Panjang jaringan, cakupan
--      inspeksi, dan rekap temuan semuanya dihitung dari baris yang ada
--      SEKARANG. Menghapus satu tiang hari ini membuat laporan yang sudah
--      dikirim bulan lalu tidak bisa direproduksi.
--   2. Tiang punya anak. `induk_id` membentuk pohon; memutusnya di tengah
--      membuat panjang seluruh cabang di bawahnya langsung salah.
--   3. Inspeksi adalah bukti kerja orang. Regu yang pekerjaannya bisa lenyap
--      tanpa bekas akan berhenti percaya pada sistemnya.
--
-- ── BEDANYA DENGAN "DITOLAK" ────────────────────────────────────────────────
--   Ditolak     salah kerja → ULANGI. Gardunya kembali jadi pekerjaan.
--   Dibatalkan  salah gardu / uji coba → JANGAN diulang. Hilang dari hitungan.
--
-- Keduanya perlu. Menolak inspeksi uji coba akan menyuruh regu mengerjakan
-- ulang sesuatu yang memang tidak pernah diminta.
--
-- ── TIANG TIDAK IKUT DIBATALKAN ─────────────────────────────────────────────
-- Disepakati 21 Sep 2026. Tiangnya nyata berdiri di lapangan; yang keliru cuma
-- catatan bahwa ia diperiksa pada kesempatan itu. Membatalkan keduanya
-- sekaligus akan membuang pekerjaan menitik yang sebenarnya benar.
-- =============================================================================

-- ── 1. Membatalkan tiang: nama per penyulang ikut dibuang ────────────────────
--
-- `batalkan_tiang` sudah ada sejak `jtr-koreksi.sql` dan sudah dipakai aplikasi
-- HP untuk tiang JTR. Yang ditambahkan: mengurus `tiang_kode_penyulang`.
--
-- Tiang JTM punya nama di TIAP penyulang yang melewatinya. Membatalkan tiangnya
-- tanpa menyentuh baris-baris itu meninggalkan nama yang menunjuk tiang yang
-- sudah dinyatakan tidak pernah ada — dan nomor itu terkunci selamanya, karena
-- indeks unik `tiang_kode_penyulang_unik` masih memegangnya. Tiang berikutnya
-- di tempat yang sama akan melompati nomor itu tanpa ada yang tahu kenapa.
--
-- Namanya DIBUANG, bukan disimpan: `batal` berarti tidak pernah ada, jadi
-- namanya juga tidak pernah ada. Sejarahnya tinggal di `master_audit`.

CREATE OR REPLACE FUNCTION public.batalkan_tiang(
  p_id     UUID,
  p_nama   TEXT DEFAULT NULL,
  p_alasan TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t     RECORD;
  jml   INT;
  nama_dibuang TEXT[];
BEGIN
  SELECT * INTO t FROM public.tiang WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang tidak ditemukan'; END IF;

  IF t.status_hidup = 'batal' THEN
    RAISE EXCEPTION 'Tiang % sudah dibatalkan sebelumnya', t.kode;
  END IF;

  -- Alasan diwajibkan. Pembatalan tanpa alasan tidak memberi satu pun petunjuk
  -- kepada orang yang membacanya enam bulan lagi — dan yang tidak diterangkan
  -- akan dikira kesalahan sistem, bukan keputusan orang.
  IF btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan pembatalan wajib diisi';
  END IF;

  SELECT count(*) INTO jml
  FROM public.tiang WHERE induk_id = p_id AND status_hidup = 'aktif';

  IF jml > 0 THEN
    RAISE EXCEPTION
      'Tiang % masih menyuplai % tiang. Pindahkan dulu sambungannya ke tiang lain.',
      t.kode, jml;
  END IF;

  -- Dikumpulkan SEBELUM dibuang, supaya jejaknya menyebut nama apa saja yang
  -- hilang. Tanpa ini audit cuma bisa bilang "ada nama yang dibuang".
  SELECT array_agg(penyulang || '=' || kode ORDER BY penyulang)
    INTO nama_dibuang
  FROM public.tiang_kode_penyulang WHERE tiang_id = p_id;

  DELETE FROM public.tiang_kode_penyulang WHERE tiang_id = p_id;

  UPDATE public.tiang
  SET status_hidup = 'batal',
      aktif_sampai = CURRENT_DATE,
      catatan = p_alasan,
      updated_at = now()
  WHERE id = p_id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', t.kode, COALESCE(t.ulp, '-'), 'status_hidup',
          to_jsonb(t.status_hidup),
          jsonb_build_object('status', 'batal', 'alasan', p_alasan,
                             'nama_dibuang', COALESCE(nama_dibuang, '{}')),
          'batal_salah_input', auth.uid(), p_nama);
END $$;


-- ── 2. Status "Dibatalkan" di tiga tabel ─────────────────────────────────────
-- Cakupan dan rekap tidak perlu disentuh: ketiganya sudah menyaring ke
-- 'Diverifikasi' atau 'Selesai', jadi 'Dibatalkan' otomatis tidak terhitung.
-- Satu-satunya yang menghitung TANPA menyaring status adalah
-- `inspeksi_jtr_temuan` — dibereskan di bagian 4.

ALTER TABLE public.inspeksi_jtr DROP CONSTRAINT IF EXISTS inspeksi_jtr_status_valid;
ALTER TABLE public.inspeksi_jtr ADD CONSTRAINT inspeksi_jtr_status_valid
  CHECK (status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai', 'Diverifikasi',
                    'Ditolak', 'Dibatalkan'));

ALTER TABLE public.inspeksi_jtm DROP CONSTRAINT IF EXISTS inspeksi_jtm_status_valid;
ALTER TABLE public.inspeksi_jtm ADD CONSTRAINT inspeksi_jtm_status_valid
  CHECK (status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai', 'Diverifikasi',
                    'Ditolak', 'Dibatalkan'));

ALTER TABLE public.pemeliharaan_gardu DROP CONSTRAINT IF EXISTS pemeliharaan_status_valid;
ALTER TABLE public.pemeliharaan_gardu ADD CONSTRAINT pemeliharaan_status_valid
  CHECK (status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai', 'Diverifikasi',
                    'Ditolak', 'Dibatalkan'));


-- ── 3. Tiga fungsi pembatalan ────────────────────────────────────────────────
--
-- ⚠ MEMBATALKAN YANG SUDAH 'Diverifikasi' — yang bisa dan tidak bisa dipulihkan.
--
-- Persetujuan menggerakkan penanda di MASTER, dan tidak semuanya bisa ditarik
-- balik dengan pasti:
--
--   Pemeliharaan gardu  BISA. `gardu.master_terverifikasi_dari` menyimpan id
--                       pemeliharaan yang mengonfirmasinya, jadi bisa dicabut
--                       tepat sasaran.
--   Inspeksi JTM        TIDAK. `tiang.dikonfirmasi_at` tidak menyimpan dari
--                       inspeksi mana asalnya. Mencabutnya berarti menebak —
--                       bisa jadi tiang itu memang pernah dikonfirmasi lewat
--                       inspeksi lain yang sah.
--   Inspeksi JTR        Tidak ada yang bergerak saat disetujui, jadi tidak ada
--                       yang perlu dicabut.
--
-- Yang tidak bisa dipulihkan DISEBUTKAN di jejak audit, bukan didiamkan.

CREATE OR REPLACE FUNCTION public.batalkan_inspeksi_jtr(
  p_id     UUID,
  p_alasan TEXT,
  p_nama   TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i RECORD;
BEGIN
  SELECT * INTO i FROM public.inspeksi_jtr WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inspeksi tidak ditemukan'; END IF;
  IF i.status = 'Dibatalkan' THEN
    RAISE EXCEPTION 'Inspeksi gardu % sudah dibatalkan sebelumnya', i.gardu_kode;
  END IF;
  IF btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan pembatalan wajib diisi';
  END IF;

  -- Tiang yang sudah dinilai SENGAJA tidak disentuh. Yang dibatalkan catatan
  -- pemeriksaannya, bukan tiangnya.
  UPDATE public.inspeksi_jtr
  SET status = 'Dibatalkan',
      verified_at = now(),
      verified_by = auth.uid(),
      verified_note = p_alasan,
      updated_at = now()
  WHERE id = p_id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('gardu', upper(i.gardu_kode), upper(i.ulp), 'inspeksi_jtr',
          to_jsonb(i.status),
          jsonb_build_object('status', 'Dibatalkan', 'alasan', p_alasan),
          'inspeksi_dibatalkan', auth.uid(), p_nama);
END $$;


CREATE OR REPLACE FUNCTION public.batalkan_inspeksi_jtm(
  p_id     UUID,
  p_alasan TEXT,
  p_nama   TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m   RECORD;
  seg TEXT;
BEGIN
  SELECT * INTO m FROM public.inspeksi_jtm WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inspeksi tidak ditemukan'; END IF;
  IF m.status = 'Dibatalkan' THEN
    RAISE EXCEPTION 'Inspeksi ini sudah dibatalkan sebelumnya';
  END IF;
  IF btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan pembatalan wajib diisi';
  END IF;

  SELECT nama INTO seg FROM public.segmen WHERE id = m.segmen_id;

  UPDATE public.inspeksi_jtm
  SET status = 'Dibatalkan',
      verified_at = now(),
      verified_by = p_nama,
      verified_note = p_alasan,
      updated_at = now()
  WHERE id = p_id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('segmen', COALESCE(seg, m.segmen_id::text), COALESCE(m.ulp, '-'), 'inspeksi_jtm',
          to_jsonb(m.status),
          jsonb_build_object(
            'status', 'Dibatalkan',
            'alasan', p_alasan,
            -- Disebut apa adanya supaya siapa pun yang membaca jejak ini tahu
            -- ada satu hal yang TIDAK ikut kembali.
            'catatan', CASE WHEN m.status = 'Diverifikasi'
                       THEN 'Penanda dikonfirmasi_at pada tiang TIDAK dicabut — tidak ada petunjuk inspeksi mana yang menaruhnya.'
                       ELSE NULL END),
          'inspeksi_dibatalkan', auth.uid(), p_nama);
END $$;


CREATE OR REPLACE FUNCTION public.batalkan_pemeliharaan(
  p_id     UUID,
  p_alasan TEXT,
  p_nama   TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m       RECORD;
  -- INT, bukan BOOLEAN: `GET DIAGNOSTICS ... ROW_COUNT` selalu mengembalikan
  -- angka, dan plpgsql menolak menaruhnya di boolean.
  dicabut INT := 0;
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

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('gardu', upper(m.gardu_kode), upper(m.ulp), 'pemeliharaan',
          to_jsonb(m.status),
          jsonb_build_object('status', 'Dibatalkan', 'alasan', p_alasan,
                             'verifikasi_master_dicabut', dicabut > 0),
          'pemeliharaan_dibatalkan', auth.uid(), p_nama);
END $$;


-- ── 4. Temuan JTR tidak lagi menghitung inspeksi yang dibatalkan ─────────────
-- Satu-satunya view yang membaca `inspeksi_jtr` tanpa menyaring status. Tanpa
-- baris tambahan di bawah, temuan dari inspeksi uji coba tetap muncul di rekap
-- sesudah inspeksinya dibatalkan — dan itu persis kebingungan yang mau
-- dihilangkan pembatalan.
--
-- `CREATE OR REPLACE`, bukan DROP: susunan kolomnya tidak berubah, jadi
-- `jtr_rekap_temuan` dan `jtr_penyapuan` yang bergantung padanya tidak perlu
-- ikut dibongkar.
--
-- 'Ditolak' SENGAJA masih ikut terhitung — itu perilaku yang sudah ada sejak
-- awal, dan artinya berbeda: pekerjaannya akan diulang, temuannya belum tentu
-- salah. Kalau nanti mau ikut disaring, itu keputusan tersendiri.

CREATE OR REPLACE VIEW public.inspeksi_jtr_temuan AS
WITH dasar AS (
  SELECT
    i.id AS inspeksi_id, i.gardu_kode, i.ulp, i.penyulang, i.tgl_mulai,
    t.id AS tiang_id, t.kode AS tiang_kode, t.jurusan,
    t.kondisi, t.arde_kondisi, t.andongan, t.rawan_row,
    t.stay_kondisi, t.jamperan, t.catatan_perbaikan, t.foto_temuan
  FROM public.inspeksi_jtr i
  JOIN public.inspeksi_jtr_titik x ON x.inspeksi_id = i.id
  JOIN public.tiang t ON t.id = x.tiang_id
  WHERE i.status <> 'Dibatalkan'
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
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Tiang ' || lower(kondisi) AS temuan,
         CASE WHEN kondisi = 'Miring' THEN 'Sedang' ELSE 'Tinggi' END::text AS urgensi,
         foto_temuan->>'kondisi' AS foto_url
  FROM dasar
  WHERE kondisi IS NOT NULL AND NOT public.jtr_normal('kondisi_tiang', kondisi)
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Arde ' || lower(arde_kondisi), 'Tinggi', foto_temuan->>'ardeKondisi'
  FROM dasar
  WHERE arde_kondisi IS NOT NULL AND NOT public.jtr_normal('kondisi_arde', arde_kondisi)
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Andongan ' || lower(andongan), 'Sedang', foto_temuan->>'andongan'
  FROM dasar
  WHERE andongan IS NOT NULL AND NOT public.jtr_normal('kondisi_andongan', andongan)
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Stay ' || lower(stay_kondisi), 'Sedang', foto_temuan->>'stayKondisi'
  FROM dasar
  WHERE stay_kondisi IS NOT NULL AND NOT public.jtr_normal('kondisi_stay', stay_kondisi)
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Rawan ROW: ' || lower(r), 'Sedang', foto_temuan->>'rawanRow'
  FROM dasar, unnest(rawan_row) AS r
  WHERE r IS NOT NULL AND r <> '' AND NOT public.jtr_normal('rawan_row', r)
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Jamperan ' || lower(j->>'kondisi'), 'Sedang', foto_temuan->>'jamperanKondisi'
  FROM dasar, jsonb_array_elements(jamperan) AS j
  WHERE j->>'kondisi' IS NOT NULL
    AND NOT public.jtr_normal('kondisi_jamperan', j->>'kondisi')
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Ada catatan perbaikan', 'Sedang', NULL
  FROM dasar WHERE btrim(COALESCE(catatan_perbaikan, '')) <> ''
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Konduktor ' || lower(kabel_kondisi),
         CASE WHEN kabel_kondisi = 'Putus' THEN 'Tinggi' ELSE 'Sedang' END,
         foto_temuan->>'konduktorKondisi'
  FROM kabel
  WHERE kabel_kondisi IS NOT NULL AND NOT public.jtr_normal('kondisi_kabel', kabel_kondisi)
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Suspension ' || lower(aks_suspension), 'Sedang', foto_temuan->>'aksSuspension'
  FROM kabel
  WHERE aks_suspension IS NOT NULL
    AND NOT public.jtr_normal('kondisi_aksesoris', aks_suspension)
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Large angle ' || lower(aks_large_angle), 'Sedang', foto_temuan->>'aksLargeAngle'
  FROM kabel
  WHERE aks_large_angle IS NOT NULL
    AND NOT public.jtr_normal('kondisi_aksesoris', aks_large_angle)
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Dead end ' || lower(aks_dead_end), 'Sedang', foto_temuan->>'aksDeadEnd'
  FROM kabel
  WHERE aks_dead_end IS NOT NULL
    AND NOT public.jtr_normal('kondisi_aksesoris', aks_dead_end)
) s;


-- ── 5. Hak akses ─────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.batalkan_tiang          TO authenticated;
GRANT EXECUTE ON FUNCTION public.batalkan_inspeksi_jtr   TO authenticated;
GRANT EXECUTE ON FUNCTION public.batalkan_inspeksi_jtm   TO authenticated;
GRANT EXECUTE ON FUNCTION public.batalkan_pemeliharaan   TO authenticated;


-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Semuanya HARUS gagal — alasan wajib diisi:
--      SELECT batalkan_inspeksi_jtr('<id>', '');
--      SELECT batalkan_pemeliharaan('<id>', '   ');
--
-- b. Yang dibatalkan hilang dari hitungan — ketiganya HARUS 0:
--      SELECT count(*) FROM inspeksi_jtr_temuan tm
--      JOIN inspeksi_jtr i ON i.id = tm.inspeksi_id WHERE i.status = 'Dibatalkan';
--
--      SELECT count(*) FROM tiang_kondisi_terakhir k
--      JOIN inspeksi_jtm m ON m.id = k.inspeksi_id WHERE m.status = 'Dibatalkan';
--
--      SELECT count(*) FROM tiang_kode_penyulang k
--      JOIN tiang t ON t.id = k.tiang_id WHERE t.status_hidup = 'batal';
--
-- c. Jejaknya bisa dibaca:
--      SELECT pada, entitas, entitas_kode, aksi, nilai_baru, oleh_nama
--      FROM master_audit WHERE aksi LIKE '%dibatalkan%' OR aksi = 'batal_salah_input'
--      ORDER BY pada DESC LIMIT 20;
-- =============================================================================
