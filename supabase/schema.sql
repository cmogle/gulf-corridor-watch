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
  content_hash text null,
  validation_state text not null default 'unvalidated' check (validation_state in ('validated','unvalidated','failed','skipped')),
  validation_score numeric(4,3) null,
  validation_reason text null,
  validation_model text null,
  validated_at timestamptz null,
  status_level text not null check (status_level in ('normal','advisory','disrupted','unknown')),
  created_at timestamptz not null default now()
);

create index if not exists idx_source_snapshots_source_time on source_snapshots(source_id, fetched_at desc);

create or replace view latest_source_snapshots as
select distinct on (source_id)
  source_id, source_name, source_url, category, ingest_method, reliability, block_reason, priority, freshness_target_minutes, evidence_basis, confirmation_state, fetched_at, published_at, title, summary, raw_text, status_level, content_hash, validation_state, validation_score, validation_reason, validation_model, validated_at
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
  provider text not null check (provider in ('x', 'telegram', 'rss_item')),
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
  content_hash text null,
  validation_state text not null default 'unvalidated' check (validation_state in ('validated','unvalidated','failed','skipped')),
  validation_score numeric(4,3) null,
  validation_reason text null,
  validation_model text null,
  validated_at timestamptz null,
  fetched_at timestamptz not null default now(),
  confidence numeric(4,3) not null default 0,
  linked_source_id text not null,
  created_at timestamptz not null default now(),
  unique(provider, handle, post_id)
);

create index if not exists idx_social_signals_source_posted on social_signals(linked_source_id, posted_at desc);
create index if not exists idx_source_snapshots_source_event on source_snapshots(source_id, (coalesce(published_at, fetched_at)) desc);
create index if not exists idx_social_signals_source_event on social_signals(linked_source_id, (coalesce(posted_at, fetched_at)) desc);

create table if not exists current_state_brief (
  key text primary key,
  paragraph text not null,
  input_hash text not null,
  generated_at timestamptz not null,
  refreshed_at timestamptz not null,
  model text null,
  freshness_state text not null check (freshness_state in ('fresh','mixed','stale')),
  confidence text not null check (confidence in ('high','medium','low')),
  flight_summary jsonb not null default '{}'::jsonb,
  coverage jsonb not null default '{}'::jsonb,
  sources_used jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_current_state_brief_refreshed on current_state_brief(refreshed_at desc);

drop view if exists unified_updates;

create view unified_updates as
with latest_source_meta as (
  select distinct on (source_id)
    source_id,
    source_name,
    priority
  from source_snapshots
  order by source_id, fetched_at desc
)
select
  s.id::text as id,
  s.source_id,
  s.source_name,
  'snapshot'::text as update_type,
  coalesce(s.published_at, s.fetched_at) as event_at,
  s.fetched_at,
  s.title as headline,
  s.summary,
  s.source_url as original_url,
  s.validation_state,
  s.validation_score,
  s.confirmation_state,
  s.evidence_basis,
  s.status_level,
  s.reliability,
  s.priority
from source_snapshots s
union all
select
  x.id::text as id,
  x.linked_source_id as source_id,
  coalesce(m.source_name, x.linked_source_id) as source_name,
  'x'::text as update_type,
  coalesce(x.posted_at, x.fetched_at) as event_at,
  x.fetched_at,
  ('@' || x.handle || ' on X')::text as headline,
  coalesce(nullif(x.text_en, ''), nullif(x.text_original, ''), x.text) as summary,
  x.url as original_url,
  x.validation_state,
  x.validation_score,
  'unconfirmed_social'::text as confirmation_state,
  case when cardinality(x.keywords) > 0 then 'x+official'::text else 'official_web'::text end as evidence_basis,
  coalesce(ls.status_level, 'unknown'::text) as status_level,
  'reliable'::text as reliability,
  coalesce(m.priority, 0) as priority
from social_signals x
left join latest_source_meta m on m.source_id = x.linked_source_id
left join latest_source_snapshots ls on ls.source_id = x.linked_source_id;

create table if not exists user_tracking_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null check (kind in ('flight','route')),
  flight_number text null,
  origin_iata text null,
  destination_iata text null,
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, kind, flight_number, origin_iata, destination_iata)
);

create index if not exists idx_user_tracking_items_user_created on user_tracking_items(user_id, created_at desc);

create table if not exists user_alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  item_id uuid not null references user_tracking_items(id) on delete cascade,
  channel text not null check (channel in ('email','push','sms')),
  enabled boolean not null default true,
  quiet_hours jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_alert_rules_user_item on user_alert_rules(user_id, item_id);

alter table user_tracking_items enable row level security;
alter table user_alert_rules enable row level security;

drop policy if exists user_tracking_items_select on user_tracking_items;
drop policy if exists user_tracking_items_insert on user_tracking_items;
drop policy if exists user_tracking_items_update on user_tracking_items;
drop policy if exists user_tracking_items_delete on user_tracking_items;

create policy user_tracking_items_select on user_tracking_items for select using (user_id = auth.uid());
create policy user_tracking_items_insert on user_tracking_items for insert with check (user_id = auth.uid());
create policy user_tracking_items_update on user_tracking_items for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_tracking_items_delete on user_tracking_items for delete using (user_id = auth.uid());

drop policy if exists user_alert_rules_select on user_alert_rules;
drop policy if exists user_alert_rules_insert on user_alert_rules;
drop policy if exists user_alert_rules_update on user_alert_rules;
drop policy if exists user_alert_rules_delete on user_alert_rules;

create policy user_alert_rules_select on user_alert_rules for select using (user_id = auth.uid());
create policy user_alert_rules_insert on user_alert_rules for insert with check (user_id = auth.uid());
create policy user_alert_rules_update on user_alert_rules for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_alert_rules_delete on user_alert_rules for delete using (user_id = auth.uid());

-- Trusted Feed v2 (strict publish pipeline)
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

-- Expert commentary feed
create table expert_signals (
  id uuid primary key default gen_random_uuid(),
  handle text not null,
  post_id text not null,
  posted_at timestamptz not null,
  text_original text not null default '',
  text_en text null,
  url text not null,
  category text not null,
  relevance_score numeric(4,3) not null default 0,
  relevance_method text not null default 'keyword',
  keyword_matches text[] not null default '{}',
  included_in_digest boolean not null default false,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(handle, post_id)
);

create index idx_expert_signals_posted on expert_signals(posted_at desc);
create index idx_expert_signals_category on expert_signals(category, posted_at desc);
create index idx_expert_signals_relevance on expert_signals(relevance_score desc);

create table expert_digests (
  id uuid primary key default gen_random_uuid(),
  digest_text text not null,
  signal_ids uuid[] not null default '{}',
  signal_count int not null default 0,
  generated_at timestamptz not null default now()
);

create index idx_expert_digests_generated on expert_digests(generated_at desc);
