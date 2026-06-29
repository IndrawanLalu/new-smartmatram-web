-- ══════════════════════════════════════════════════════════════════════════════
-- SMART-Mataram — Smart Predictive Maintenance (Modul ML)
-- Skema database. Jalankan manual di Supabase SQL Editor.
-- Ref: mechinelearning.prd §7
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 7.1 Output prediksi harian (dibaca UI Next.js) ────────────────────────────
create table if not exists daily_feeder_risk (
  id               uuid default gen_random_uuid() primary key,
  tgl              date not null,                 -- tanggal yang diprediksi (H+1)
  ulp              text not null,
  penyulang        text not null,
  risk_score       numeric(5,2) not null,         -- 0..100
  risk_level       text not null,                 -- 'kritis' | 'waspada' | 'aman'
  predicted_cause  text,                          -- penyebab dominan yg dikhawatirkan
  cause_confidence numeric(5,2),                  -- 0..100
  breakdown        jsonb not null default '{}',   -- {faktor: kontribusi} utk panel detail
  model_version    text not null,                 -- 'rule-v1' | 'xgb-v1' ...
  generated_at     timestamptz default now(),
  unique (tgl, penyulang)
);
create index if not exists dfr_tgl_idx        on daily_feeder_risk (tgl);
create index if not exists dfr_ulp_level_idx  on daily_feeder_risk (ulp, risk_level);

-- ── 7.2 Histori gangguan terkonsolidasi (sumber pelatihan) ────────────────────
-- Penyulang & penyebab OTORITATIF dari Google Sheets gangguanPenyulang.
-- padam_apkt = enrichment (ens, pelanggan, weather, cause) via ref_gangguan/soft-match.
-- dedup_key menjaga idempotensi sync (kebal jam_padam NULL).
create table if not exists ml_outage_events (
  id                   uuid default gen_random_uuid() primary key,
  dedup_key            text not null unique,       -- "{penyulang}|{tgl}|{jam|''}"
  ulp                  text,
  penyulang            text not null,              -- otoritatif (Sheets) bila ada
  penyulang_confidence text not null default 'high', -- 'high' | 'low' (padam_apkt blm rekonsiliasi)
  tgl_gangguan         date not null,
  jam_padam            time,
  durasi_jam           numeric(10,4),
  penyebab             text,                       -- dari Sheets; null/'tidak diketahui' = target Model B
  predicted_cause      text,                       -- isian Model B utk yg unknown
  cause_confidence     numeric(5,2),
  ens                  numeric(12,4),              -- enrichment padam_apkt
  jml_pelanggan_padam  integer,                    -- enrichment padam_apkt
  weather_cat          text,                       -- enrichment padam_apkt (kategori)
  source               text,                       -- 'sheets' | 'padam_apkt' | 'merged'
  raw                  jsonb,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);
create index if not exists moe_penyulang_tgl_idx on ml_outage_events (penyulang, tgl_gangguan);
create index if not exists moe_ulp_idx           on ml_outage_events (ulp);
create index if not exists moe_tgl_idx           on ml_outage_events (tgl_gangguan);

-- ── 7.3 Geo & metadata penyulang (seed manual 4 ULP) ──────────────────────────
create table if not exists penyulang_ref (
  penyulang text primary key,
  ulp       text,
  kecamatan text,
  lat       double precision,
  lng       double precision
);

-- ── 7.4 Cache cuaca harian (kuantitatif, Open-Meteo) ──────────────────────────
-- Di-key per loc_key (koordinat dibulatkan), bukan per penyulang → hindari
-- duplikasi & dedup panggilan API. penyulang → loc_key via penyulang_ref (src/geo.py).
create table if not exists weather_daily (
  id            uuid default gen_random_uuid() primary key,
  loc_key       text not null,                     -- "{lat:.3f},{lng:.3f}"
  tgl           date not null,
  wind_max_kmh  numeric(6,2),
  wind_gust_kmh numeric(6,2),
  precip_mm     numeric(6,2),
  weather_code  integer,                           -- WMO code (Open-Meteo)
  thunder       boolean,                           -- weather_code in (95,96,99)
  kind          text default 'archive',            -- 'archive' | 'forecast'
  updated_at    timestamptz default now(),
  unique (loc_key, tgl)
);
create index if not exists wd_tgl_idx on weather_daily (tgl);

-- ── 7.5 Audit batch run ───────────────────────────────────────────────────────
create table if not exists ml_run_log (
  id          uuid default gen_random_uuid() primary key,
  job         text,                                -- 'sync_gangguan' | 'pipeline' | ...
  run_date    date not null default current_date,
  status      text not null,                       -- 'ok' | 'error'
  rows_scored integer,
  duration_ms integer,
  message     text,
  created_at  timestamptz default now()
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Engine memakai SUPABASE_SERVICE_ROLE_KEY → bypass RLS untuk write.
-- UI (authenticated) hanya perlu SELECT.
alter table daily_feeder_risk  enable row level security;
alter table ml_outage_events   enable row level security;
alter table penyulang_ref      enable row level security;
alter table weather_daily      enable row level security;
alter table ml_run_log         enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'daily_feeder_risk' and policyname = 'dfr select') then
    create policy "dfr select"  on daily_feeder_risk for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ml_outage_events' and policyname = 'moe select') then
    create policy "moe select"  on ml_outage_events  for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'penyulang_ref' and policyname = 'pref select') then
    create policy "pref select" on penyulang_ref     for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'weather_daily' and policyname = 'wd select') then
    create policy "wd select"   on weather_daily     for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ml_run_log' and policyname = 'mrl select') then
    create policy "mrl select"  on ml_run_log        for select to authenticated using (true);
  end if;
end $$;
