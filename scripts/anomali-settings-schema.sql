-- Jalankan di Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.anomali_settings (
  ulp                  TEXT PRIMARY KEY,           -- nama ULP atau 'ALL' untuk global
  max_beban_trafo_pct  NUMERIC(5,1) NULL,          -- beban trafo > X% (NULL = nonaktif)
  max_arus_jurusan_a   NUMERIC(6,1) NULL,          -- arus per jurusan > X A (NULL = nonaktif)
  max_unbalance_pct    NUMERIC(5,1) NULL,          -- unbalance antar fasa > X% (NULL = nonaktif)
  max_suhu_trafo_c     NUMERIC(5,1) NULL,          -- suhu trafo > X°C (NULL = nonaktif)
  updated_at           TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- RLS: semua user bisa baca, hanya authenticated bisa upsert
ALTER TABLE public.anomali_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anomali_settings_select" ON public.anomali_settings
  FOR SELECT USING (true);

CREATE POLICY "anomali_settings_upsert" ON public.anomali_settings
  FOR ALL USING (auth.role() = 'authenticated');

-- Seed default rows per ULP (semua NULL = nonaktif)
INSERT INTO public.anomali_settings (ulp)
VALUES ('AMPENAN'), ('CAKRANEGARA'), ('GERUNG'), ('TANJUNG')
ON CONFLICT (ulp) DO NOTHING;
