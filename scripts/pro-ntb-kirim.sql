-- ═══════════════════════════════════════════════════════════════════════════
-- PRO NTB — kirim ke spreadsheet lewat Apps Script (8 Nov 2026), tahap 2.
-- Skrip spreadsheet: scripts/apps-script-pro-ntb.gs.
--
--   pro_ntb_sheet_kunci : URL aplikasi web + kunci rahasia per ULP.
--                         RAHASIA — hanya server (service role) yang membaca.
--   pro_ntb_kirim_log   : jejak tiap kiriman (coba / sungguhan).
-- Aman dijalankan ulang.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.pro_ntb_sheet_kunci (
  ulp         TEXT PRIMARY KEY,
  script_url  TEXT,
  rahasia     TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);
ALTER TABLE public.pro_ntb_sheet_kunci ENABLE ROW LEVEL SECURITY;
-- Tanpa kebijakan: tidak terbaca dari peramban/HP.

CREATE TABLE IF NOT EXISTS public.pro_ntb_kirim_log (
  id          BIGSERIAL PRIMARY KEY,
  ulp         TEXT NOT NULL,
  coba        BOOLEAN NOT NULL,
  dari        DATE,
  sampai      DATE,
  jumlah      INT NOT NULL DEFAULT 0,
  hasil       JSONB,
  galat       TEXT,
  oleh        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_pro_ntb_kirim_log_ulp ON public.pro_ntb_kirim_log (ulp, created_at DESC);
ALTER TABLE public.pro_ntb_kirim_log ENABLE ROW LEVEL SECURITY;
