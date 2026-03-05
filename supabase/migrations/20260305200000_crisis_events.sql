-- Crisis event tracking for multi-day events with cumulative statistics

CREATE TABLE crisis_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('military', 'weather', 'political', 'infrastructure')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  affected_airports text[] DEFAULT '{}',
  affected_regions text[] DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE crisis_event_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES crisis_events(id) ON DELETE CASCADE,
  stat_key text NOT NULL,
  stat_value numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'count',
  last_source text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, stat_key)
);

CREATE INDEX idx_crisis_events_active ON crisis_events(is_active, started_at DESC);
CREATE INDEX idx_crisis_event_stats_event ON crisis_event_stats(event_id);
