-- Precomputed answers for common chat intents.
-- Generated during brief refresh cycle; served instantly at chat time.
CREATE TABLE IF NOT EXISTS precomputed_answers (
  intent TEXT PRIMARY KEY,
  answer TEXT NOT NULL,
  context_hash TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  tokens_used INTEGER,
  model TEXT
);

CREATE INDEX IF NOT EXISTS idx_precomputed_answers_hash ON precomputed_answers (context_hash);
