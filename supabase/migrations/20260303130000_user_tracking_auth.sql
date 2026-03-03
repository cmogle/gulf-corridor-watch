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
