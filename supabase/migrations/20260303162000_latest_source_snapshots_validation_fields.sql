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
  status_level,
  content_hash,
  validation_state,
  validation_score,
  validation_reason,
  validation_model,
  validated_at
from source_snapshots
order by source_id, fetched_at desc;
