create extension if not exists pgcrypto;

create table if not exists source_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  source_name text not null,
  source_url text not null,
  category text not null,
  ingest_method text not null default 'official_web' check (ingest_method in ('api','official_web','rss','relay')),
  reliability text not null default 'degraded' check (reliability in ('reliable','degraded','blocked')),
  block_reason text null,
  priority integer not null default 50,
  freshness_target_minutes integer not null default 15,
  evidence_basis text not null default 'official_web' check (evidence_basis in ('api','official_web','rss','relay','x+official')),
  confirmation_state text not null default 'confirmed' check (confirmation_state in ('confirmed','unconfirmed_social')),
  fetched_at timestamptz not null default now(),
  published_at timestamptz null,
  title text not null,
  summary text not null,
  raw_text text not null,
  status_level text not null check (status_level in ('normal','advisory','disrupted','unknown')),
  created_at timestamptz not null default now()
);

create index if not exists idx_source_snapshots_source_time on source_snapshots(source_id, fetched_at desc);

create or replace view latest_source_snapshots as
select distinct on (source_id)
  source_id, source_name, source_url, category, ingest_method, reliability, block_reason, priority, freshness_target_minutes, evidence_basis, confirmation_state, fetched_at, published_at, title, summary, raw_text, status_level
from source_snapshots
order by source_id, fetched_at desc;

create table if not exists chat_logs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  created_at timestamptz not null default now()
);

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

create table if not exists social_signals (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('x')),
  handle text not null,
  post_id text not null,
  posted_at timestamptz not null,
  text_original text not null default '',
  language_original text null,
  text_en text null,
  translation_provider text null,
  translation_confidence numeric(4,3) null,
  translation_status text not null default 'not_needed' check (translation_status in ('not_needed','translated','failed')),
  text text not null,
  url text not null,
  keywords text[] not null default '{}',
  fetched_at timestamptz not null default now(),
  confidence numeric(4,3) not null default 0,
  linked_source_id text not null,
  created_at timestamptz not null default now(),
  unique(provider, handle, post_id)
);

create index if not exists idx_social_signals_source_posted on social_signals(linked_source_id, posted_at desc);
