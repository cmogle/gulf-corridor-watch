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
- Flightradar API ingestion is optional; if `FLIGHTRADAR_KEY` is missing, non-flight ingestion still works.
- Flight query data is read from recent cached observations first, then falls back to live API calls when needed.
- Always verify critical decisions directly from source links.
