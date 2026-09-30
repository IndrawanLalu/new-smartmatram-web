-- =============================================================================
-- GO LIVE 1 Oktober 2026 — hapus data UJI COBA
-- Jalankan manual di Supabase SQL Editor. SATU TRANSAKSI: kalau satu langkah
-- gagal atau pemeriksaan akhir tidak cocok, SEMUANYA dibatalkan.
--
-- Keputusan user 30 Sep 2026:
--   HAPUS   • Inspeksi JTM & JTR beserta titik/jawaban/foto
--           • SEMUA WO yang terbit: Inspeksi JTM/JTR, Perabasan, Pemeliharaan
--             Gardu (+ rencana), Pengukuran, WO bulanan lama (Juli), WO tempel
--             (Oktober), surat WO, arsip & pembatalan WO
--           • Hasil kerja uji: Pemeliharaan Gardu, Pemeliharaan Jaringan,
--             Optimasi Trafo, realisasi Perabasan, 1 tugas temuan dari JTM
--           • Master hasil uji: tiang & segmen dari rintis lapangan, tiang JTR
--             lapangan, segmen tempelan WO, 10 segmen contoh (AMPENAN, MATARAM,
--             MENINTING, GUNUNG SARI — memakai nama contoh GI AMPENAN/REC.
--             BRIMOB/LBS PASAR)
--   TETAP   • Pengukuran gardu & tegangan ujung (TIDAK BOLEH DISENTUH)
--           • Laporan temuan lama (`inspeksi`), `inspeksi_pohon`, `laporan`,
--             penyeimbangan gardu — data asli sejak Maret/April
--           • Master: gardu (termasuk koreksi titik gardu dari lapangan dan
--             AM053 hasil optimasi — "biarkan"), penyulang, 251 tiang impor
--             GUNUNG SARI, segmen impor BUWUN MAS & SEKOTONG, roles, pengaturan
--           • master_usulan & master_audit (sejarah; 9 usulan titik gardu dari
--             petugas masih menunggu persetujuan)
--
-- Foto di storage dihapus TERPISAH sesudah ini (lihat laporan Claude) — SQL
-- tidak bisa menghapus berkas storage.
-- =============================================================================

BEGIN;

-- ── 0. Angka yang TIDAK BOLEH berubah ────────────────────────────────────────

CREATE TEMP TABLE _jaga ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM public.pengukuran_gardu)          AS pengukuran,
  (SELECT count(*) FROM public.pengukuran_tegangan_ujung) AS ujung,
  (SELECT count(*) FROM public.penyeimbangan_gardu)       AS penyeimbangan,
  (SELECT count(*) FROM public.inspeksi_pohon)            AS pohon,
  (SELECT count(*) FROM public.laporan)                   AS laporan,
  (SELECT count(*) FROM public.inspeksi WHERE sumber_tiang_id IS NULL) AS temuan_asli,
  (SELECT count(*) FROM public.gardu)                     AS gardu,
  (SELECT md5(string_agg(kode || '|' || COALESCE(lat::text, '') || '|' || COALESCE(lng::text, ''), ',' ORDER BY kode, ulp))
     FROM public.gardu)                                   AS titik_gardu,
  (SELECT count(*) FROM public.master_usulan)             AS usulan;


-- ── 1. Sasaran master uji ────────────────────────────────────────────────────

CREATE TEMP TABLE _tiang ON COMMIT DROP AS
SELECT id FROM public.tiang WHERE sumber = 'lapangan';

CREATE TEMP TABLE _segmen ON COMMIT DROP AS
SELECT id FROM public.segmen
WHERE sumber IN ('lapangan', 'tempelan')
   OR (sumber IN ('impor', 'manual')
       AND upper(penyulang) IN ('AMPENAN', 'MATARAM', 'MENINTING', 'GUNUNG SARI'));


-- ── 2. Inspeksi JTM & JTR ────────────────────────────────────────────────────

-- Tugas temuan yang lahir dari temuan JTM (satu baris, uji).
DELETE FROM public.inspeksi WHERE sumber_tiang_id IS NOT NULL;

DELETE FROM public.inspeksi_jtm_foto;
DELETE FROM public.inspeksi_jtm_periksa;
DELETE FROM public.inspeksi_jtm_titik;
DELETE FROM public.inspeksi_jtm;

DELETE FROM public.inspeksi_jtr_titik;
DELETE FROM public.inspeksi_jtr;


-- ── 3. Hasil kerja uji lain ──────────────────────────────────────────────────

-- Gardu yang "terverifikasi" oleh pemeliharaan uji kembali belum terverifikasi.
UPDATE public.gardu
SET master_terverifikasi_dari = NULL, master_terverifikasi_at = NULL
WHERE master_terverifikasi_dari IN (SELECT id FROM public.pemeliharaan_gardu);

DELETE FROM public.pemeliharaan_gardu_foto;
DELETE FROM public.pemeliharaan_gardu_periksa;
DELETE FROM public.pemeliharaan_gardu_ukur;
DELETE FROM public.pemeliharaan_gardu;

DELETE FROM public.pemeliharaan_jaringan;

-- Optimasi: baris pengukuran yang ditunjuknya TETAP (pengukuran tidak disentuh).
DELETE FROM public.optimasi_wo_batal;
DELETE FROM public.optimasi_trafo;

DELETE FROM public.perabasan_realisasi;
DELETE FROM public.perabasan_luar_wo;


-- ── 4. Semua WO yang terbit ──────────────────────────────────────────────────

DELETE FROM public.wo_perabasan_item;
DELETE FROM public.wo_perabasan;

DELETE FROM public.wo_inspeksi_item;
DELETE FROM public.wo_inspeksi;

DELETE FROM public.wo_hargardu_item;
DELETE FROM public.wo_hargardu;
DELETE FROM public.rencana_hargardu;

DELETE FROM public.wo_pengukuran_item;
DELETE FROM public.wo_pengukuran;

DELETE FROM public.wo_manual_item;
DELETE FROM public.wo_manual;
DELETE FROM public.wo_surat;
DELETE FROM public.wo_batal_arsip;

DELETE FROM public.wo_item;
DELETE FROM public.wo_batch;


-- ── 5. Master tiang & segmen hasil uji ───────────────────────────────────────

-- Rujukan dari data yang TETAP ke tiang uji dilepas dulu.
UPDATE public.tiang SET induk_id = NULL
WHERE induk_id IN (SELECT id FROM _tiang) AND id NOT IN (SELECT id FROM _tiang);
UPDATE public.tiang SET induk_jtr_id = NULL
WHERE induk_jtr_id IN (SELECT id FROM _tiang) AND id NOT IN (SELECT id FROM _tiang);
UPDATE public.tiang SET beda_dari_tiang_id = NULL, beda_dari_jarak_m = NULL
WHERE beda_dari_tiang_id IN (SELECT id FROM _tiang) AND id NOT IN (SELECT id FROM _tiang);
UPDATE public.tiang SET diganti_oleh_id = NULL
WHERE diganti_oleh_id IN (SELECT id FROM _tiang) AND id NOT IN (SELECT id FROM _tiang);

UPDATE public.segmen SET titik_awal_tiang_id = NULL
WHERE titik_awal_tiang_id IN (SELECT id FROM _tiang) AND id NOT IN (SELECT id FROM _segmen);
UPDATE public.segmen SET titik_akhir_tiang_id = NULL
WHERE titik_akhir_tiang_id IN (SELECT id FROM _tiang) AND id NOT IN (SELECT id FROM _segmen);

DELETE FROM public.segmen_tiang
WHERE tiang_id IN (SELECT id FROM _tiang) OR segmen_id IN (SELECT id FROM _segmen);

DELETE FROM public.tiang_konduktor
WHERE tiang_id IN (SELECT id FROM _tiang) OR induk_tiang_id IN (SELECT id FROM _tiang);
DELETE FROM public.tiang_jtr_tumpang
WHERE tiang_id IN (SELECT id FROM _tiang) OR induk_id IN (SELECT id FROM _tiang);
DELETE FROM public.tiang_kode_penyulang WHERE tiang_id IN (SELECT id FROM _tiang);

DELETE FROM public.segmen WHERE id IN (SELECT id FROM _segmen);
DELETE FROM public.tiang  WHERE id IN (SELECT id FROM _tiang);

-- Nama tumpangan di tiang impor untuk penyulang yang segmennya sudah tidak
-- melewatinya lagi (lahir dari uji menumpang).
DELETE FROM public.tiang_kode_penyulang k
WHERE NOT k.utama
  AND NOT EXISTS (
    SELECT 1 FROM public.segmen_tiang st
    JOIN public.segmen s ON s.id = st.segmen_id
    WHERE st.tiang_id = k.tiang_id AND upper(s.penyulang) = upper(k.penyulang));

-- Tiang impor tidak boleh terlihat "sudah dikonfirmasi lapangan" dari uji.
UPDATE public.tiang SET dikonfirmasi_at = NULL, dikonfirmasi_oleh = NULL
WHERE sumber = 'impor' AND dikonfirmasi_at IS NOT NULL;


-- ── 6. Pemeriksaan akhir — tidak cocok = SEMUANYA dibatalkan ─────────────────

DO $$
DECLARE
  j RECORD;
  sisa INT;
BEGIN
  SELECT * INTO j FROM _jaga;

  IF (SELECT count(*) FROM public.pengukuran_gardu) <> j.pengukuran THEN
    RAISE EXCEPTION 'BATAL: jumlah pengukuran gardu berubah';
  END IF;
  IF (SELECT count(*) FROM public.pengukuran_tegangan_ujung) <> j.ujung THEN
    RAISE EXCEPTION 'BATAL: jumlah tegangan ujung berubah';
  END IF;
  IF (SELECT count(*) FROM public.penyeimbangan_gardu) <> j.penyeimbangan THEN
    RAISE EXCEPTION 'BATAL: jumlah penyeimbangan berubah';
  END IF;
  IF (SELECT count(*) FROM public.inspeksi_pohon) <> j.pohon
     OR (SELECT count(*) FROM public.laporan) <> j.laporan
     OR (SELECT count(*) FROM public.inspeksi WHERE sumber_tiang_id IS NULL) <> j.temuan_asli THEN
    RAISE EXCEPTION 'BATAL: laporan temuan / pohon lama berubah';
  END IF;
  IF (SELECT count(*) FROM public.gardu) <> j.gardu
     OR (SELECT md5(string_agg(kode || '|' || COALESCE(lat::text, '') || '|' || COALESCE(lng::text, ''), ',' ORDER BY kode, ulp))
           FROM public.gardu) <> j.titik_gardu THEN
    RAISE EXCEPTION 'BATAL: master gardu / koordinat gardu berubah';
  END IF;
  IF (SELECT count(*) FROM public.master_usulan) <> j.usulan THEN
    RAISE EXCEPTION 'BATAL: usulan koreksi master berubah';
  END IF;

  SELECT count(*) INTO sisa FROM (
    SELECT 1 FROM public.inspeksi_jtm UNION ALL SELECT 1 FROM public.inspeksi_jtr
    UNION ALL SELECT 1 FROM public.wo_inspeksi UNION ALL SELECT 1 FROM public.wo_perabasan
    UNION ALL SELECT 1 FROM public.wo_hargardu UNION ALL SELECT 1 FROM public.wo_pengukuran
    UNION ALL SELECT 1 FROM public.wo_manual UNION ALL SELECT 1 FROM public.wo_batch
    UNION ALL SELECT 1 FROM public.tiang WHERE sumber = 'lapangan'
    UNION ALL SELECT 1 FROM public.segmen WHERE sumber IN ('lapangan', 'tempelan')) x;
  IF sisa > 0 THEN
    RAISE EXCEPTION 'BATAL: masih ada % baris uji tersisa', sisa;
  END IF;

  RAISE NOTICE 'OK — data uji terhapus, data yang dijaga utuh.';
END $$;

COMMIT;


-- =============================================================================
-- Sesudah COMMIT — periksa (harus sesuai angka di laporan Claude):
--   SELECT
--     (SELECT count(*) FROM tiang)            AS tiang,        -- 251 (impor GUNUNG SARI)
--     (SELECT count(*) FROM segmen)           AS segmen,       -- 49  (BUWUN MAS 48 + SEKOTONG 1)
--     (SELECT count(*) FROM pengukuran_gardu) AS pengukuran,   -- tidak berubah
--     (SELECT count(*) FROM pengukuran_tegangan_ujung) AS ujung;
-- =============================================================================
