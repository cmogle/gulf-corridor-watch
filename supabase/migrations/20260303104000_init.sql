create extension if not exists pgcrypto;
create table if not exists source_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  source_name text not null,
  source_url text not null,
  category text not null,
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
  source_id, source_name, source_url, category, fetched_at, published_at, title, summary, raw_text, status_level
from source_snapshots
order by source_id, fetched_at desc;
create table if not exists chat_logs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  created_at timestamptz not null default now()
);
