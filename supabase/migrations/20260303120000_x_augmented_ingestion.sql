alter table if exists source_snapshots
  add column if not exists ingest_method text not null default 'official_web' check (ingest_method in ('api','official_web','rss','relay')),
  add column if not exists reliability text not null default 'degraded' check (reliability in ('reliable','degraded','blocked')),
  add column if not exists block_reason text null,
  add column if not exists priority integer not null default 50,
  add column if not exists freshness_target_minutes integer not null default 15,
  add column if not exists evidence_basis text not null default 'official_web' check (evidence_basis in ('api','official_web','rss','relay','x+official')),
  add column if not exists confirmation_state text not null default 'confirmed' check (confirmation_state in ('confirmed','unconfirmed_social'));

create or replace view latest_source_snapshots as
select distinct on (source_id)
  source_id,
  source_name,
  source_url,
  category,
  ingest_method,
  reliability,
  block_reason,
  priority,
  freshness_target_minutes,
  evidence_basis,
  confirmation_state,
  fetched_at,
  published_at,
  title,
  summary,
  raw_text,
  status_level
from source_snapshots
order by source_id, fetched_at desc;

create table if not exists social_signals (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('x')),
  handle text not null,
  post_id text not null,
  posted_at timestamptz not null,
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
