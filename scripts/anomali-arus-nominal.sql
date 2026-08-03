-- =============================================================================
-- Kriteria anomali baru: pembebanan arus terhadap ARUS NOMINAL trafo
-- Jalankan manual di Supabase SQL Editor. Idempoten.
--
-- Berbeda dari `max_beban_trafo_pct` yang berbasis kVA (arus × tegangan):
-- kriteria ini murni membandingkan ARUS terukur dengan arus nominal trafo,
--     I_nominal = kVA × 1000 / (√3 × 400)
-- Keduanya bisa berbeda jauh saat tegangan turun — beban kVA terlihat wajar
-- padahal arusnya sudah melewati kemampuan trafo. Rumus I_nominal ini sama
-- persis dengan yang dipakai saat mengirim ke AMG (calcINominal di
-- app/api/kirim-amg/route.ts), supaya angkanya tidak berbeda antar tempat.
--
-- Disimpan sebagai RENTANG (min–max), bukan satu ambang, supaya bisa dipakai
-- untuk "70–100%" maupun ">100%" (max dibiarkan NULL = tanpa batas atas).
-- =============================================================================

ALTER TABLE anomali_settings
  ADD COLUMN IF NOT EXISTS min_arus_nominal_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS max_arus_nominal_pct NUMERIC;

-- NULL keduanya = kriteria nonaktif, sama seperti kriteria lain.
-- Tidak ada backfill: pengaturan yang sudah ada tetap berperilaku persis sama.
