  -- ══════════════════════════════════════════════════════════════════════════════
  -- SMART-Mataram — Sprint 2: weather_daily di-key per lokasi (loc_key)
  -- Aman dijalankan: tabel weather_daily masih kosong (baru dari Sprint 1).
  -- Jalankan di Supabase SQL Editor.
  -- ══════════════════════════════════════════════════════════════════════════════

  drop table if exists weather_daily cascade;

  create table weather_daily (
    id            uuid default gen_random_uuid() primary key,
    loc_key       text not null,                 -- "{lat:.3f},{lng:.3f}" (lihat src/geo.py)
    tgl           date not null,
    wind_max_kmh  numeric(6,2),
    wind_gust_kmh numeric(6,2),
    precip_mm     numeric(6,2),
    weather_code  integer,                       -- WMO code (Open-Meteo)
    thunder       boolean,                       -- weather_code in (95,96,99)
    kind          text default 'archive',        -- 'archive' | 'forecast'
    updated_at    timestamptz default now(),
    unique (loc_key, tgl)
  );
  create index if not exists wd_tgl_idx on weather_daily (tgl);

  alter table weather_daily enable row level security;
  do $$
  begin
    if not exists (select 1 from pg_policies where tablename = 'weather_daily' and policyname = 'wd select') then
      create policy "wd select" on weather_daily for select to authenticated using (true);
    end if;
  end $$;
