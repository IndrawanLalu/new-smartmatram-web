-- Tabel yantek: simpan data WO/dispatch PLN per baris
-- Jalankan di Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.yantek (
  id              BIGSERIAL    PRIMARY KEY,
  tanggal         DATE         NOT NULL,          -- dari waktu_lapor
  no_laporan      TEXT,                           -- unik, untuk dedup
  personil_yantek TEXT,
  rating          SMALLINT,
  data            JSONB        NOT NULL,           -- row asli lengkap
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- Deduplikasi berdasarkan no_laporan
CREATE UNIQUE INDEX IF NOT EXISTS yantek_no_laporan_uq
  ON public.yantek(no_laporan)
  WHERE no_laporan IS NOT NULL;

CREATE INDEX IF NOT EXISTS yantek_tanggal_idx ON public.yantek(tanggal);
CREATE INDEX IF NOT EXISTS yantek_petugas_idx ON public.yantek(personil_yantek);

-- RLS
ALTER TABLE public.yantek ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read yantek"
  ON public.yantek FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert yantek"
  ON public.yantek FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can delete yantek"
  ON public.yantek FOR DELETE TO authenticated USING (true);

-- RPC: ringkasan per tanggal (tidak bisa GROUP BY langsung via REST API)
CREATE OR REPLACE FUNCTION public.get_yantek_date_summary()
RETURNS TABLE(tanggal DATE, row_count BIGINT)
LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT tanggal, COUNT(*)::BIGINT AS row_count
  FROM public.yantek
  GROUP BY tanggal
  ORDER BY tanggal;
$$;
