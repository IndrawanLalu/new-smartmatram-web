-- =============================================================================
-- Tabel setelan MVOD — ambang SLA yang bisa diatur lewat UI
-- Jalankan manual di Supabase SQL Editor. Idempoten.
--
-- MVOD = (total durasi padam ÷ jumlah kali padam) ÷ SLA
-- Angka SLA-nya (bawaan 60 menit) adalah kebijakan, bukan konstanta teknis,
-- jadi ia harus bisa diubah tanpa menyentuh kode.
--
-- Polanya sama persis dengan `yantek_sla`: satu baris per ULP, ditambah baris
-- sentinel ber-`ulp = 'ALL'` sebagai setelan menyeluruh. Pembacaannya: baris
-- ULP menang; kalau tidak ada, jatuh ke 'ALL'.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.mvod_settings (
  ulp        text PRIMARY KEY,
  sla_menit  integer NOT NULL DEFAULT 60 CHECK (sla_menit > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.mvod_settings IS 'Ambang SLA untuk perhitungan MVOD. Baris ulp=''ALL'' berlaku menyeluruh.';
COMMENT ON COLUMN public.mvod_settings.sla_menit IS 'Pembagi MVOD dalam menit. Bawaan 60.';

-- Baris menyeluruh, dibuat sekali. `ON CONFLICT DO NOTHING` supaya menjalankan
-- ulang skrip ini tidak mengembalikan nilai yang sudah disetel operator.
INSERT INTO public.mvod_settings (ulp, sla_menit)
VALUES ('ALL', 60)
ON CONFLICT (ulp) DO NOTHING;

ALTER TABLE public.mvod_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mvod_settings_read"  ON public.mvod_settings;
DROP POLICY IF EXISTS "mvod_settings_write" ON public.mvod_settings;

CREATE POLICY "mvod_settings_read"
  ON public.mvod_settings FOR SELECT TO authenticated USING (true);

-- Sama seperti `anomali_settings` dan `yantek_sla`: yang boleh menyunting
-- dibatasi di UI (tombol setelan hanya muncul untuk yang lolos
-- `canManageSettings`). Penjagaan di UI bukan penjagaan sesungguhnya — siapa
-- pun yang sudah login secara teknis bisa memanggil PostgREST langsung.
-- Dicatat di sini supaya tidak terlupakan, sama seperti pada tabel setelan lain.
CREATE POLICY "mvod_settings_write"
  ON public.mvod_settings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Periksa:
--   SELECT * FROM mvod_settings;
