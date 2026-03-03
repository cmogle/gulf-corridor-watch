# Gulf Corridor Watch (MVP)

Fast MVP dashboard for official-source travel/disruption monitoring + GPT-4o-mini Q&A.

## Features
- Official/operational source cards with latest title/summary and fetched timestamp
- Status flagging: `normal | advisory | disrupted | unknown`
- India transit/visa quick-links panel
- Directory panel for official contacts, social channels, and UAE wellbeing resources
- Ingestion endpoint: `/api/ingest?key=...`
- AI query page: `/ask` (answers grounded in latest source snapshots)
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
- Flightradar24 DXB/AUH airport pages (HTML, operational)
- India MEA advisories (HTML)
- India Bureau of Immigration (HTML)

## Notes
- HTML connectors are MVP-grade and may need selector tuning as source sites change.
- Flightradar24 is included as an operational flight-visibility source (not a government source).
- Always verify critical decisions directly from source links.
