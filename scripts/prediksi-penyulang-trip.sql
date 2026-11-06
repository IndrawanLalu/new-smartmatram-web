-- ═══════════════════════════════════════════════════════════════════════════
-- Prediksi Lokasi Gangguan — penyulang yang trip (7 Nov 2026)
--
-- Masalah: penyulang masuk Gardu Hubung (MVTIC TIGA GILI, SKTM GOMONG) tidak
-- punya tiang; jaringannya tercatat di outletnya (OL. KERANDANGAN, …), dan
-- yang trip biasanya PMT outlet di GH. Nama di laporan dispatcher juga bisa
-- beda dari nama di data JTM.
--
-- Penentu jaringan (lib/prediksiGangguan/penyulangTrip.ts), berurutan:
--   1. koreksi per gangguan dari web            → prediksi_koreksi_trip
--   2. nama yang disamakan (nama laporan → JTM) → prediksi_alias_penyulang
--   3. nama penyulang langsung ada di data JTM
--   4. penyulang masuk GH: keypoint = OL → jaringan OL itu; keypoint = alat →
--      dicari di OL yang pernah dilaporkan untuk penyulang itu (terisi sendiri).
--
-- Kalibrasi sumber OL keluaran GH dipisah per "trafo · GH" (kabel masuk GH
-- belum dititik) — cukup lewat isi kolom lokasi_gangguan_temuan.trafo.
-- Dibaca/ditulis server (kunci service role) saja. Aman dijalankan ulang.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.prediksi_koreksi_trip (
  kunci      TEXT PRIMARY KEY,           -- kunci peristiwa: S|<dedup_key> / W|<id>
  penyulang  TEXT NOT NULL,              -- nama penyulang di data JTM
  keypoint   TEXT,                       -- alat yang trip; NULL = dari pangkal penyulang
  oleh       TEXT,
  diubah_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.prediksi_koreksi_trip IS
  'Koreksi web: jaringan penyulang yang trip untuk satu gangguan (prediksi-penyulang-trip.sql).';

CREATE TABLE IF NOT EXISTS public.prediksi_alias_penyulang (
  nama       TEXT PRIMARY KEY,           -- nama di laporan, huruf besar
  penyulang  TEXT NOT NULL,              -- nama penyulang di data JTM
  oleh       TEXT,
  diubah_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.prediksi_alias_penyulang IS
  'Nama penyulang di laporan dispatcher/sheet → nama di data JTM, sementara namanya belum disamakan.';

ALTER TABLE public.prediksi_koreksi_trip ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediksi_alias_penyulang ENABLE ROW LEVEL SECURITY;
-- Tanpa kebijakan: hanya server (service role) yang membaca & menulis.
