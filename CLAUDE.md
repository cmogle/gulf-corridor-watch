# Gulf Corridor Watch

Real-time crisis monitoring and travel information dashboard for UAE residents and travelers. Aggregates government, airline, and transport updates during disruptions.

**Production:** keepcalmandcarryon.help (fallback: mideast-watch-mvp.vercel.app)

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4
- **Backend:** Next.js API routes (serverless on Vercel)
- **Database:** Supabase PostgreSQL
- **AI:** OpenAI gpt-4o-mini (briefing, validation, Q&A, translation)
- **Data:** RSS feeds, HTML scraping, Flightradar24 API, OpenSky, X/Twitter API, Jina Reader
- **Package Manager:** npm

## Commands

```bash
npm run dev                              # Dev server on :3000
npm run build                            # TypeScript + Next.js build
npm run lint                             # ESLint
npx tsx --test lib/*.test.ts             # Run all tests
npx tsx --test lib/<file>.test.ts        # Run single test file
```

**Important:** Always use `npx tsx --test` for tests, NOT `node --experimental-strip-types --test` (cannot resolve extensionless imports).

## Project Structure

- `app/` — Next.js pages, components, API routes
- `app/api/ingest/` — Cron-triggered data ingestion pipeline
- `app/api/brief/` — AI briefing generation/refresh
- `app/components/` — React components (dashboard widgets)
- `lib/` — Core business logic (~6k LOC)
  - `sources.ts` — Source registry (23 official sources)
  - `ingest.ts` — Multi-source ingestion orchestrator
  - `source-extractors.ts` — Per-source HTML/RSS parsing
  - `source-quality.ts` — Data quality filtering
  - `unified-updates.ts` — Feed aggregation, dedup, filtering
  - `current-state-brief.ts` — AI briefing generation
- `supabase/` — Schema, migrations
- `docs/plans/` — Feature design documents

## Conventions

- **Source IDs:** snake_case (`us_state_dept_travel`, `emirates_updates`)
- **Files:** kebab-case (`source-quality.ts`, `updates-feed.tsx`)
- **Types:** PascalCase (`SourceDef`, `Snapshot`, `ValidationMetadata`)
- **DB columns/tables:** snake_case
- **Tests:** `.test.ts` files colocated with source in `lib/`
- **Test runner:** Node.js built-in `test()` module via tsx

## Architecture

1. **Ingestion pipeline** (`lib/ingest.ts`): Fetches 23+ sources in parallel via RSS, HTML scrape, or API. Per-source extractors parse content. Quality filters reject degraded data.
2. **Data quality layers**: Raw cleanup at ingest, usability filtering at display, deduplication by source+hash.
3. **Unified feed**: PostgreSQL view (`unified_updates`) combines snapshots + X signals, sorted by event time.
4. **LLM integration**: Content validation scoring, extractive/generative briefings, context gating for token budgets.
5. **Supabase clients**: `lib/supabase.ts` (server, admin), `lib/supabase-browser.ts` (client, RLS).

## Key Environment Variables

Required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `INGEST_SECRET`, `BRIEF_SECRET`

Optional: `FLIGHTRADAR_KEY`, `X_BEARER_TOKEN`, `CHROME_RELAY_URL`, `GPT_UPDATE_VALIDATION_ENABLED`
