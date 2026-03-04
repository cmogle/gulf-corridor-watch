# Gulf Corridor Watch (MVP)

Fast MVP dashboard for official-source travel/disruption monitoring + GPT-4o-mini Q&A.

## Features
- Unified live official updates ticker (official web/RSS + official X) ranked by recency
- Provider drill-down side panel with chronological history and direct original links
- Status flagging: `normal | advisory | disrupted | unknown`
- India transit/visa quick-links panel
- Directory panel for official contacts, social channels, and UAE wellbeing resources
- Ingestion endpoint: `/api/ingest?key=...`
- AI query page: `/ask` (answers grounded in latest source snapshots)
- Live Flight Pulse for DXB/AUH backed by Flightradar API polling
- Flight query endpoint: `/api/flights/query` (flight number + route lookups)
- Official X signal ingest (supplementary early warning) + embedded latest updates per official handle
- GPT-generated Current State Briefing (single top-of-page paragraph) refreshed every 5 minutes
- Signals summary endpoint: `/api/signals/summary`
- Briefing read endpoint: `/api/brief/current`
- Briefing refresh endpoint: `/api/brief/refresh?key=...`
- Unified updates feed endpoint: `/api/updates/feed`
- Provider updates history endpoint: `/api/updates/source/:sourceId`
- Arabic X posts are translated to English at ingest-time while preserving original text
- Local device flight/route tracking (no login required)
- Supabase OAuth scaffolding for optional sync/alerts/history
- Designed for Supabase + Vercel cron

## Stack
- Next.js (App Router)
- Supabase Postgres
- OpenAI `gpt-4o-mini`
- Vercel cron

## Setup

1) Install deps
```bash
npm install
```

2) Create Supabase tables/views
- Run `supabase/schema.sql` in Supabase SQL editor

3) Env vars (`.env.local`)
```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
INGEST_SECRET=...
BRIEF_SECRET=...
FLIGHTRADAR_KEY=...
# optional override (defaults to https://fr24api.flightradar24.com/api)
FLIGHTRADAR_BASE_URL=...
X_BEARER_TOKEN=...
# optional override (defaults to https://api.x.com/2)
X_API_BASE_URL=...
# optional polling throttle for X ingest (minutes)
# defaults: 120 in development, 15 in production
X_MIN_POLL_MINUTES=...
# optional Chrome relay fallback for anti-bot/JS-heavy pages
CHROME_RELAY_URL=...
CHROME_RELAY_SECRET=...
# optional GPT validation settings for updates ticker
GPT_UPDATE_VALIDATION_ENABLED=true
GPT_UPDATE_VALIDATION_MODEL=gpt-4o-mini
GPT_UPDATE_VALIDATION_TIMEOUT_MS=8000
GPT_UPDATE_VALIDATION_MAX_PER_INGEST=20
# optional model/timeout override for top banner briefing generation
CURRENT_STATE_BRIEF_MODEL=gpt-4o-mini
CURRENT_STATE_BRIEF_TIMEOUT_MS=8000
# optional generation mode for briefing paragraph:
# "extractive" (default, deterministic/no hallucination risk) or "llm" (model-generated)
CURRENT_STATE_BRIEF_GENERATION_MODE=extractive
# optional GPT context gating controls
GPT_CONTEXT_MAX_SOURCE_AGE_MINUTES=180
GPT_CONTEXT_MIN_FRESHNESS_MINUTES=30
GPT_CONTEXT_FRESHNESS_MULTIPLIER=3
GPT_CONTEXT_MAX_SOURCES=12
GPT_CONTEXT_MAX_SOCIAL_AGE_MINUTES=240
GPT_CONTEXT_MAX_SOCIAL=8
# feed backend mode: "v1" (legacy) or "v2" (strict trusted publish pipeline)
FEED_BACKEND=v1
```

4) Start locally
```bash
npm run dev
```

5) Initial ingestion
- Open `http://localhost:3000/api/ingest?key=YOUR_INGEST_SECRET`

6) Deploy to Vercel
- Add same env vars in Vercel project settings
- Set `ingest_secret` in Vercel Environment Variables for cron query substitution

## Sources (initial set)
- US State Dept travel advisories (RSS)
- White House statements/releases (RSS)
- US Department of Defense releases (RSS)
- US CENTCOM news (RSS)
- UAE MOFA (HTML)
- Dubai official news (HTML)
- Emirates travel updates (HTML)
- Etihad travel updates (HTML)
- Oman Air travel updates (HTML)
- RTA Dubai news (HTML)
- Flightradar API DXB/AUH airport boards (operational)
- India MEA advisories (HTML)
- India Bureau of Immigration (HTML)

## Notes
- HTML connectors are MVP-grade and may need selector tuning as source sites change.
- If `CHROME_RELAY_URL` is set, blocked HTML sources can fall back to relay rendering.
- Flightradar API ingestion is optional; if `FLIGHTRADAR_KEY` is missing, non-flight ingestion still works.
- X ingest is optional; if `X_BEARER_TOKEN` is missing, official source/flight ingest still works.
- X ingest is throttled by `X_MIN_POLL_MINUTES` (or `X_POLL_INTERVAL_MINUTES`) to control API spend.
- X translation uses `OPENAI_API_KEY`; if unavailable, original text is stored and marked as translation failed.
- Flight query data is read from recent cached observations first, then falls back to live API calls when needed.
- LLM request telemetry is emitted to logs as JSON records with `type="llm.telemetry"` (latency, token usage, gating/fallback metadata).
- Always verify critical decisions directly from source links.

## Signals summary API
- `GET /api/signals/summary?lang=en&include_original=true`
- `lang` defaults to `en` and uses translated English when available.
- `include_original=true` includes `text_original` for audit/verification UI.

## Current state briefing APIs
- `GET /api/brief/current`
  - returns the latest persisted paragraph (or transient fallback when first-run data is not persisted yet)
  - includes freshness, confidence, flight summary, and coverage metadata
  - paragraph copy is source-text synthesis first (not source/feed count reporting)
  - official X is included in the paragraph only when corroborated by official advisory/disruption context
  - default generation mode is deterministic extractive synthesis to minimize hallucination risk
- `GET /api/brief/refresh?key=<INGEST_SECRET or BRIEF_SECRET>`
  - internal cron-triggered rebuild of the briefing
  - hash-based regeneration skips LLM calls when source inputs are unchanged

## Unified updates APIs
- `GET /api/updates/feed?limit=80`
  - unified rolling updates across official snapshots and official X updates
  - sorted by `event_at desc`, then GPT validation state, then source priority
- `GET /api/updates/source/:sourceId?limit=25&before=<iso>`
  - provider-specific reverse-chronological timeline
  - supports cursor pagination via `before`

### Trusted Feed v2 APIs (when `FEED_BACKEND=v2`)
- `GET /api/updates/feed?limit=80`
  - returns only `quality_state=published` events from `source_events_v2`
  - adds `run_id`, `evidence_excerpt`, `quality_state`, `quality_reason`, `published_at`
- `GET /api/updates/source/:sourceId?limit=25&before=<iso>&include_failures=true`
  - defaults to published-only history; add `include_failures=true` for rejected diagnostics
  - includes `source_health` block in response
- `GET /api/sources/health`
  - per-source health summary: latest run/success/publish, failure streak, reason
- `GET /api/metrics/baseline?key=<INGEST_SECRET>`
  - records v1 and v2 baseline metrics into `feed_baseline_metrics`

### Trusted Feed v2 maintenance scripts
- `DRY_RUN=1 npx tsx --env-file=.env.local scripts/reclassify-trusted-feed-v2.ts`
  - previews legacy `quality_state='published'` rows that now fail strict relevance/recency
- `npx tsx --env-file=.env.local scripts/reclassify-trusted-feed-v2.ts`
  - demotes those rows to rejected and refreshes `source_health_v2.last_publish_at`

## Tracking APIs (auth-gated sync phase)
- `GET /api/tracking`
- `POST /api/tracking`
- `DELETE /api/tracking/:id`
- `POST /api/tracking/import-local`

These endpoints require `Authorization: Bearer <supabase_access_token>`.
