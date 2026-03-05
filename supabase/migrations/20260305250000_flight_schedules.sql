-- Flight schedule data from airport departure/arrival boards
-- Tracks scheduled vs actual times for delay and cancellation analysis
create table if not exists flight_schedules (
  id uuid primary key default gen_random_uuid(),
  airport text not null check (airport in ('DXB', 'AUH', 'DWC')),
  board_type text not null check (board_type in ('departure', 'arrival')),
  flight_number text not null,
  airline text,
  origin_iata text,
  destination_iata text,
  scheduled_time timestamptz not null,
  estimated_time timestamptz,
  actual_time timestamptz,
  status text not null default 'scheduled',
  is_delayed boolean not null default false,
  delay_minutes integer,
  is_cancelled boolean not null default false,
  cancellation_reason text,
  gate text,
  terminal text,
  source text not null default 'fr24',
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_flight_schedules_airport_board
  on flight_schedules(airport, board_type, fetched_at desc);
create index if not exists idx_flight_schedules_flight_time
  on flight_schedules(flight_number, scheduled_time desc);
create index if not exists idx_flight_schedules_status
  on flight_schedules(status, fetched_at desc);

-- Deduplicate by flight+scheduled time within the same fetch window
create unique index if not exists idx_flight_schedules_dedup
  on flight_schedules(airport, board_type, flight_number, scheduled_time);

-- Summary view for quick stats
create or replace view flight_schedule_stats as
select
  airport,
  board_type,
  count(*) as total,
  count(*) filter (where is_delayed) as delayed,
  count(*) filter (where is_cancelled) as cancelled,
  avg(delay_minutes) filter (where delay_minutes > 0) as avg_delay_minutes,
  max(fetched_at) as latest_fetch
from flight_schedules
where fetched_at > now() - interval '6 hours'
group by airport, board_type;
