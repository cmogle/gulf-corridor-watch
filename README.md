# Gulf Corridor Watch (MVP)

Fast MVP dashboard for official-source travel/disruption monitoring + GPT-4o-mini Q&A.

## Features
- Official/operational source cards with latest title/summary and fetched timestamp
- Status flagging: `normal | advisory | disrupted | unknown`
- India transit/visa quick-links panel
- Directory panel for official contacts, social channels, and UAE wellbeing resources
- Ingestion endpoint: `/api/ingest?key=...`
- AI query page: `/ask` (answers grounded in latest source snapshots)
- Live Flight Pulse for DXB/AUH backed by Flightradar API polling
- Flight query endpoint: `/api/flights/query` (flight number + route lookups)
- Official X signal ingest (supplementary early warning) + embedded latest updates per official handle
- Signals summary endpoint: `/api/signals/summary`
- Arabic X posts are translated to English at ingest-time while preserving original text
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
FLIGHTRADAR_KEY=...
# optional override (defaults to https://fr24api.flightradar24.com/api)
FLIGHTRADAR_BASE_URL=...
X_BEARER_TOKEN=...
# optional override (defaults to https://api.x.com/2)
X_API_BASE_URL=...
# optional Chrome relay fallback for anti-bot/JS-heavy pages
CHROME_RELAY_URL=...
CHROME_RELAY_SECRET=...
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
- X translation uses `OPENAI_API_KEY`; if unavailable, original text is stored and marked as translation failed.
- Flight query data is read from recent cached observations first, then falls back to live API calls when needed.
- Always verify critical decisions directly from source links.

## Signals summary API
- `GET /api/signals/summary?lang=en&include_original=true`
- `lang` defaults to `en` and uses translated English when available.
- `include_original=true` includes `text_original` for audit/verification UI.
