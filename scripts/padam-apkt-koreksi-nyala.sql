-- =============================================================================
-- padam_apkt: koreksi waktu nyala
-- Jalankan manual di Supabase SQL Editor. Idempoten.
--
-- MASALAHNYA
-- Waktu nyala yang tercatat di APKT kadang keliru — regu sudah menormalkan
-- lebih awal tapi penutupan laporannya terlambat, sehingga durasi padam
-- tercatat lebih panjang dari kenyataan. Angka itu mengalir ke Jam × Pelanggan,
-- ENS, dan MVOD, jadi satu penutupan yang telat menaikkan angka kinerja satu
-- penyulang untuk sebulan penuh.
--
-- YANG DISIMPAN: HANYA WAKTU NYALA KOREKSINYA
-- `lama_padam_jam`, `jam_x_pelanggan_padam`, dan `ens` versi koreksi TIDAK
-- disimpan — ketiganya diturunkan di aplikasi dari selisih padam→nyala koreksi.
-- Diperiksa atas 154 baris, ketiga hubungan itu berlaku persis tanpa kecuali:
--
--   lama_padam_jam        = (tgl/jam nyala − tgl/jam padam), dalam jam   154/154
--   jam_x_pelanggan_padam = lama_padam_jam × jml_pelanggan_padam         154/154
--   ens ÷ lama_padam_jam  = beban kejadian itu (kW), beragam per baris
--                           → ENS sebanding lurus dengan durasi
--
-- Menyimpan nilai turunan berarti menyimpan hal yang sama di dua tempat, dan
-- keduanya pasti berbeda cepat atau lambat. Kolom aslinya tidak pernah ditimpa:
-- seluruh gunanya justru bisa membandingkan sebelum ↔ sesudah koreksi.
-- =============================================================================

ALTER TABLE padam_apkt
  ADD COLUMN IF NOT EXISTS tgl_nyala_koreksi date,
  ADD COLUMN IF NOT EXISTS jam_nyala_koreksi time,
  ADD COLUMN IF NOT EXISTS koreksi_alasan    text,
  ADD COLUMN IF NOT EXISTS koreksi_oleh      text,
  ADD COLUMN IF NOT EXISTS koreksi_at        timestamptz;

COMMENT ON COLUMN padam_apkt.tgl_nyala_koreksi IS
  'Tanggal nyala hasil koreksi. NULL = belum dikoreksi, pakai tgl_nyala.';
COMMENT ON COLUMN padam_apkt.jam_nyala_koreksi IS
  'Jam nyala hasil koreksi. Selalu berpasangan dengan tgl_nyala_koreksi.';
COMMENT ON COLUMN padam_apkt.koreksi_alasan IS
  'Justifikasi koreksi — data padam adalah dasar kinerja, perubahannya harus punya alasan tertulis.';
COMMENT ON COLUMN padam_apkt.koreksi_oleh IS
  'Email pengguna yang mengoreksi. Diisi server dari sesi, bukan dari klien.';

-- Baris yang sudah dikoreksi selalu ditanya bersama-sama (rekap & MVOD memisah
-- yang terkoreksi dari yang belum), dan jumlahnya kecil dibanding tabelnya.
CREATE INDEX IF NOT EXISTS padam_apkt_koreksi_idx
  ON padam_apkt (tgl_nyala_koreksi)
  WHERE tgl_nyala_koreksi IS NOT NULL;
