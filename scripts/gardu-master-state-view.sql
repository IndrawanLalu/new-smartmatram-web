-- =============================================================================
-- View: gardu_master_state
-- Master gardu sebagai PENENTU BARIS, kondisi beban menyusul dari pengukuran.
-- Jalankan manual di Supabase SQL Editor.
--
-- Bedanya dengan `gardu_latest_state`:
--   gardu_latest_state  → barisnya dari PENGUKURAN. Gardu yang belum pernah
--                         diukur tidak muncul sama sekali.
--   gardu_master_state  → barisnya dari MASTER. Semua gardu terdaftar muncul,
--                         yang belum diukur kolom bebannya NULL.
--
-- Itu yang membuat tab Data Gardu bisa menjawab "mana yang belum pernah diukur"
-- — pertanyaan yang mustahil dijawab kalau barisnya sendiri berasal dari
-- pengukuran.
--
-- `daya` master TIDAK menimpa `kva_trafo` pengukuran. Tiap pengukuran memegang
-- kVA-nya sendiri sebagai potret saat itu; master hanya menyatakan kondisi
-- SEKARANG dan jadi acuan/saran untuk pengukuran berikutnya.
-- =============================================================================

-- ── PERBAIKAN kunci dari skrip sebelumnya ────────────────────────────────────
-- Dua koreksi sekaligus, keduanya ketahuan setelah membaca ekspor AMG asli
-- (2.526 gardu, keempat ULP):
--
-- 1. Indeks lama dibuat pada `upper(kode)`. `upsert(onConflict: ...)` hanya
--    mengenali indeks unik pada KOLOM persis — indeks ekspresi ditolak.
--
-- 2. Lebih penting: **kode gardu TIDAK unik lintas ULP**. Ekspor AMG memuat
--    enam kode yang muncul di dua ULP berbeda — GR160, KE022, KE105, KE108
--    (Cakra vs Gerung), LA132 (Ampenan vs Cakra), GS239 (Cakra vs Ampenan).
--    Dengan kunci `kode` saja, tiap pasang saling menimpa dan satu gardu hilang.
--
-- Kuncinya jadi (kode, ulp). Ini juga pasangan yang alami untuk menyambung ke
-- `pengukuran_gardu`, yang membawa `no_gardu` polos + `petugas_unit`.
DROP INDEX IF EXISTS gardu_kode_key;
DROP INDEX IF EXISTS gardu_kode_unik;
CREATE UNIQUE INDEX IF NOT EXISTS gardu_kode_ulp_unik ON gardu (kode, ulp);

-- ── Seluruh isi ekspor AMG disimpan apa adanya ───────────────────────────────
-- Ekspor AMG membawa 27 kolom: konstruksi trafo, hubungan belitan, jenis dan
-- penampang kabel masuk/keluar, nomor seri, tahun pembuatan, tanggal operasi,
-- grd khusus, dan seterusnya. Semuanya disimpan supaya bisa ditampilkan nanti.
--
-- Satu kolom JSONB, bukan 18 kolom baru: bentuk ekspor AMG di luar kendali kita
-- dan bisa berubah. Dengan JSONB, kolom yang ditambah atau dihapus di sisi AMG
-- tidak menuntut migrasi skema — datanya tetap masuk utuh. Field yang nanti
-- terbukti sering disaring bisa dinaikkan jadi kolom sungguhan belakangan,
-- saat sudah jelas yang mana.
ALTER TABLE gardu ADD COLUMN IF NOT EXISTS data_amg JSONB;

COMMENT ON COLUMN gardu.data_amg IS
  'Baris mentah ekspor master AMG, apa adanya. Kolom pokok (daya, alamat, feeder, merk, lat, lng) sudah dinaikkan jadi kolom sendiri.';

-- Indeks GIN supaya penyaringan isi JSONB tetap cepat saat datanya dipakai
-- untuk tampilan nanti.
CREATE INDEX IF NOT EXISTS gardu_data_amg_idx ON gardu USING GIN (data_amg);

CREATE OR REPLACE VIEW public.gardu_master_state AS
SELECT
  -- ── Identitas dari master ──
  g.kode,
  g.kode_amg,
  g.nama,
  g.alamat,
  g.feeder            AS penyulang,
  g.ulp,
  g.daya              AS kva_master,
  g.merk,
  g.status,
  g.lat,
  g.lng,

  -- ── Kondisi terakhir dari pengukuran/penyeimbangan (boleh NULL) ──
  e.source_id,
  e.event_type,
  e.event_date,
  e.kva_trafo         AS kva_pengukuran,
  e.persen_beban,
  e.beban_kva,
  e.suhu_trafo,
  e.total_arus_r,
  e.total_arus_s,
  e.total_arus_t,
  e.total_arus_n,
  e.total_teg_rn,
  e.total_teg_sn,
  e.total_teg_tn,
  e.perjurusan,
  e.jenis_pemeliharaan,
  e.wo_sent_at,
  e.petugas_nama,

  -- ── Penanda turunan ──
  (e.source_id IS NULL)                                    AS belum_diukur,
  -- kVA yang dipakai saat mengukur berbeda dengan master = perlu ditinjau:
  -- entah trafonya diganti tapi master belum diperbarui, atau petugas salah
  -- ketik. Dua-duanya perlu dilihat orang.
  (e.kva_trafo IS NOT NULL AND g.daya IS NOT NULL
     AND abs(e.kva_trafo - g.daya) > 0.01)                  AS kva_beda
FROM public.gardu g
-- Disambung lewat kode DAN ulp: kode gardu tidak unik lintas ULP, jadi
-- menyambung dengan kode saja akan menempelkan pengukuran Cakra ke gardu Gerung
-- pada enam kode yang kebetulan sama.
LEFT JOIN public.gardu_latest_state e
  ON upper(e.no_gardu) = upper(g.kode)
 AND upper(e.petugas_unit) = upper(g.ulp);

COMMENT ON VIEW public.gardu_master_state IS
  'Master gardu + kondisi terakhir dari pengukuran. Barisnya dari master, jadi gardu yang belum pernah diukur tetap tampil.';

-- Periksa hasilnya:
--   SELECT ulp,
--          count(*)                              AS total,
--          count(*) FILTER (WHERE belum_diukur)  AS belum_diukur,
--          count(*) FILTER (WHERE kva_beda)      AS kva_beda
--   FROM gardu_master_state GROUP BY ulp ORDER BY 2 DESC;
