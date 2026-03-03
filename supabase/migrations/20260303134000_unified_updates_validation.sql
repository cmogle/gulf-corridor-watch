alter table if exists source_snapshots
  add column if not exists content_hash text,
  add column if not exists validation_state text not null default 'unvalidated' check (validation_state in ('validated','unvalidated','failed','skipped')),
  add column if not exists validation_score numeric(4,3) null,
  add column if not exists validation_reason text null,
  add column if not exists validation_model text null,
  add column if not exists validated_at timestamptz null;

alter table if exists social_signals
  add column if not exists content_hash text,
  add column if not exists validation_state text not null default 'unvalidated' check (validation_state in ('validated','unvalidated','failed','skipped')),
  add column if not exists validation_score numeric(4,3) null,
  add column if not exists validation_reason text null,
  add column if not exists validation_model text null,
  add column if not exists validated_at timestamptz null;

create index if not exists idx_source_snapshots_source_event on source_snapshots(source_id, (coalesce(published_at, fetched_at)) desc);
create index if not exists idx_social_signals_source_event on social_signals(linked_source_id, (coalesce(posted_at, fetched_at)) desc);

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
