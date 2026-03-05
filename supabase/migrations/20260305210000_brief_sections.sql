-- Add structured sections column to current_state_brief

ALTER TABLE current_state_brief
  ADD COLUMN IF NOT EXISTS sections jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN current_state_brief.sections IS 'Structured intelligence brief sections: security, flights, guidance, source_coverage';
