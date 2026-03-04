create table if not exists flight_baselines (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('airport','route')),
  entity_key text not null,
  hour_of_day integer not null check (hour_of_day between 0 and 23),
  avg_arrivals numeric not null default 0,
  avg_departures numeric not null default 0,
  avg_total numeric not null default 0,
  sample_days integer not null default 1,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_baselines_lookup
  on flight_baselines(entity_type, entity_key, hour_of_day);
