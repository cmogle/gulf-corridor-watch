create table if not exists source_fetch_runs (
  run_id uuid primary key default gen_random_uuid(),
  source_id text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  http_status integer null,
  fetch_status text not null check (fetch_status in ('success','failed')),
  error_code text null,
  error_detail text null,
  artifact_url text null,
  duration_ms integer null,
  created_at timestamptz not null default now()
);

create index if not exists idx_source_fetch_runs_source_started on source_fetch_runs(source_id, started_at desc);

create table if not exists source_documents (
  document_id uuid primary key default gen_random_uuid(),
  run_id uuid not null references source_fetch_runs(run_id) on delete cascade,
  source_id text not null,
  content_type text not null check (content_type in ('html','rss','text')),
  raw_text text not null,
  normalized_text text not null,
  fetched_at timestamptz not null,
  source_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_source_documents_source_fetched on source_documents(source_id, fetched_at desc);
create index if not exists idx_source_documents_run on source_documents(run_id);

create table if not exists source_events_v2 (
  event_id uuid primary key default gen_random_uuid(),
  source_id text not null,
  run_id uuid not null references source_fetch_runs(run_id) on delete cascade,
  update_type text not null default 'published_event' check (update_type in ('published_event')),
  event_time timestamptz not null,
  headline text not null,
  summary text not null,
  original_url text not null,
  evidence_excerpt text not null,
  event_hash text not null,
  quality_state text not null check (quality_state in ('published','rejected')),
  quality_reason text null,
  parse_confidence numeric(4,3) not null default 0,
  published_at timestamptz null,
  status_level text not null default 'unknown' check (status_level in ('normal','advisory','disrupted','unknown')),
  created_at timestamptz not null default now()
);

create index if not exists idx_source_events_v2_source_time on source_events_v2(source_id, event_time desc);
create index if not exists idx_source_events_v2_quality_time on source_events_v2(quality_state, event_time desc);
create unique index if not exists idx_source_events_v2_published_dedupe
  on source_events_v2(source_id, event_hash)
  where quality_state = 'published';

create table if not exists source_health_v2 (
  source_id text primary key,
  latest_run_at timestamptz null,
  latest_success_at timestamptz null,
  last_publish_at timestamptz null,
  consecutive_failures integer not null default 0,
  health_state text not null default 'unknown' check (health_state in ('healthy','degraded','failing','unknown')),
  health_reason text null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_source_health_v2_state_updated on source_health_v2(health_state, updated_at desc);

create table if not exists feed_baseline_metrics (
  id uuid primary key default gen_random_uuid(),
  backend text not null check (backend in ('v1','v2')),
  captured_at timestamptz not null default now(),
  sources_total integer not null default 0,
  sources_healthy integer not null default 0,
  sources_degraded integer not null default 0,
  feed_item_count integer not null default 0,
  published_count integer not null default 0,
  notes jsonb not null default '{}'::jsonb
);

create index if not exists idx_feed_baseline_metrics_backend_captured on feed_baseline_metrics(backend, captured_at desc);

drop view if exists trusted_feed_published_v2;

create view trusted_feed_published_v2 as
select
  e.event_id::text as id,
  e.source_id,
  coalesce(ls.source_name, e.source_id) as source_name,
  e.update_type,
  e.event_time as event_at,
  coalesce(e.published_at, e.created_at) as fetched_at,
  e.headline,
  e.summary,
  e.original_url,
  e.run_id::text as run_id,
  e.evidence_excerpt,
  e.quality_state,
  e.quality_reason,
  e.published_at,
  e.status_level
from source_events_v2 e
left join latest_source_snapshots ls on ls.source_id = e.source_id
where e.quality_state = 'published';
