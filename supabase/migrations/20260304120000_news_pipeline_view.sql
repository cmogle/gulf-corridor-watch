-- News Pipeline: add rss_item social signals as 'news' update_type in unified view
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

-- SNAPSHOTS BRANCH (unchanged)
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

-- X POSTS BRANCH (added provider filter)
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
left join latest_source_snapshots ls on ls.source_id = x.linked_source_id
where x.provider = 'x'

union all

-- NEWS ARTICLES BRANCH (new)
select
  n.id::text as id,
  n.linked_source_id as source_id,
  coalesce(m.source_name, n.linked_source_id) as source_name,
  'news'::text as update_type,
  coalesce(n.posted_at, n.fetched_at) as event_at,
  n.fetched_at,
  n.text as headline,
  coalesce(nullif(n.text_en, ''), n.text) as summary,
  n.url as original_url,
  n.validation_state,
  n.validation_score,
  'unconfirmed_social'::text as confirmation_state,
  'rss'::text as evidence_basis,
  coalesce(ls.status_level, 'unknown'::text) as status_level,
  'reliable'::text as reliability,
  coalesce(m.priority, 0) as priority
from social_signals n
left join latest_source_meta m on m.source_id = n.linked_source_id
left join latest_source_snapshots ls on ls.source_id = n.linked_source_id
where n.provider = 'rss_item';
