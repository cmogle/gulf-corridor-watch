create table if not exists flight_observations (
  id uuid primary key default gen_random_uuid(),
  airport text not null check (airport in ('DXB','AUH')),
  flight_number text not null,
  callsign text null,
  icao24 text null,
  flight_id text null,
  airline text null,
  origin_iata text null,
  origin_name text null,
  destination_iata text null,
  destination_name text null,
  scheduled_time timestamptz null,
  estimated_time timestamptz null,
  actual_time timestamptz null,
  status text not null default 'unknown',
  is_delayed boolean not null default false,
  delay_minutes integer null,
  source_url text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_flight_observations_airport_time on flight_observations(airport, fetched_at desc);
create index if not exists idx_flight_observations_flight_time on flight_observations(flight_number, fetched_at desc);
create index if not exists idx_flight_observations_route_time on flight_observations(origin_iata, destination_iata, fetched_at desc);

create or replace view latest_flight_fetch as
select airport, max(fetched_at) as fetched_at
from flight_observations
group by airport;

create table if not exists flight_query_logs (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  resolved_filters jsonb not null default '{}'::jsonb,
  result_count integer not null default 0,
  created_at timestamptz not null default now()
);
