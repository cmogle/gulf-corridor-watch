-- Expert commentary feed tables
create table if not exists expert_signals (
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
create index if not exists idx_expert_signals_posted on expert_signals(posted_at desc);
create index if not exists idx_expert_signals_category on expert_signals(category, posted_at desc);
create index if not exists idx_expert_signals_relevance on expert_signals(relevance_score desc);
create table if not exists expert_digests (
  id uuid primary key default gen_random_uuid(),
  digest_text text not null,
  signal_ids uuid[] not null default '{}',
  signal_count int not null default 0,
  generated_at timestamptz not null default now()
);
create index if not exists idx_expert_digests_generated on expert_digests(generated_at desc);
