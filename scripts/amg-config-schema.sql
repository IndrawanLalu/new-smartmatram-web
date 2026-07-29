-- Kredensial AMG per-ULP (dipakai agen lokal saat kirim). Jalankan di Supabase.
-- RAHASIA: RLS aktif tanpa policy authenticated → hanya service_role yang bisa akses
-- (web via /api/amg-config service role + admin-gated; agen via service key).

CREATE TABLE IF NOT EXISTS amg_config (
  ulp           TEXT PRIMARY KEY,
  username      TEXT NOT NULL DEFAULT '',
  password      TEXT NOT NULL DEFAULT '',
  kode_prefixes TEXT NOT NULL DEFAULT '44150,44151',
  amg_url       TEXT,                 -- override opsional; default dari env agen
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE amg_config ENABLE ROW LEVEL SECURITY;
-- Sengaja TANPA policy → anon/authenticated tak bisa baca (kredensial). service_role bypass RLS.
