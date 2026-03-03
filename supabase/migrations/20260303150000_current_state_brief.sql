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
