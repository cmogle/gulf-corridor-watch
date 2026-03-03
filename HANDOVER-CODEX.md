# Codex Handover — Gulf Corridor Watch

## Current State (as of 2026-03-03 11:04 GMT+4)

### Live Assets
- GitHub repo: `https://github.com/cmogle/gulf-corridor-watch`
- Vercel project: `gulf-corridor-watch` (team: `cmogles-projects`)
- Custom domain: `https://www.keepcalmandcarryon.help`
- Fallback Vercel domain: `https://mideast-watch-mvp.vercel.app`
- Supabase project ref: `lrehazmueusvkksxzvps`

### Verified Working
- App deployed and reachable on custom domain
- `/api/ingest?key=...` returns `ok:true` and ingests 11 source snapshots
- Dashboard shows live source cards (no longer stuck on "No data yet")
- Dynamic rendering fix applied: `export const dynamic = "force-dynamic"` in `app/page.tsx`

## Implemented Scope

### Product
- Project name: **Gulf Corridor Watch (MVP)**
- Main dashboard of official/operational sources
- India transit/visa quick-links panel
- Official contacts + social/wellbeing resources panel
- GPT-4o-mini chat endpoint/page (`/api/chat`, `/ask`)

### Data/Infra
- Supabase schema + view in `supabase/schema.sql`
- Migration added in `supabase/migrations/20260303104000_init.sql`
- Ingestion pipeline in `lib/ingest.ts`
- Source registry in `lib/sources.ts`
- Directory metadata in `lib/resource-directory.ts`

## User-Priority Next Enhancement (MANDATORY)
Integrate **Flightradar API** for real-time DXB/AUH data and route/flight lookups.

### Required Outcomes
1. Poll real-time airport traffic for:
   - DXB
   - AUH
2. Support user queries like:
   - "What’s the status of EK511?"
   - "What flights from DXB to DEL are delayed right now?"
3. Use GPT-4o-mini to answer in natural language, grounded in Flightradar API responses.

## Suggested Implementation Plan

### 1) Data Model (Supabase)
Add tables:
- `flight_observations`
  - `id`, `airport`, `flight_number`, `icao24`, `callsign`, `origin`, `destination`, `scheduled_time`, `estimated_time`, `status`, `raw_payload`, `fetched_at`
- `flight_query_logs`
  - `id`, `query`, `resolved_filters`, `result_count`, `created_at`

### 2) API Integration
- Add `lib/flightradar.ts` wrapper
- Env var: `FLIGHTRADAR_KEY` (already present in Vercel env for this project)
- Build resilient methods:
  - `getAirportBoards("DXB"|"AUH")`
  - `findFlightByNumber("EK511")`
  - `findRouteFlights("DXB","DEL")`
- Handle rate limits + retries + stale fallback

### 3) Ingestion
- Extend `/api/ingest` to optionally include flight ingestion:
  - Query DXB/AUH boards
  - Upsert into `flight_observations`
- Keep snapshots and flights independent so non-flight sources still ingest when Flightradar is degraded.

### 4) Query Experience
- Add `/api/flights/query` endpoint
- If query looks like flight/route intent:
  - parse intent (flight number vs route)
  - fetch from latest observations (or direct API fallback)
  - return concise structured response
- Plug into `/ask` so flight questions use flight tool-path first, then LLM narrative/citations.

### 5) UX Additions
- New dashboard section: **Live Flight Pulse (DXB/AUH)**
  - delayed/cancelled counters
  - top affected routes
  - freshest fetch timestamp
- Add quick search widget for flight number / route

## Known Gotchas
- Vercel has multiple similarly named projects in this account; always ensure local link points to `gulf-corridor-watch`.
- `INGEST_SECRET` mismatch previously caused unauthorized on custom domain; this is now aligned.
- Some HTML source parsers are MVP-level and may need selector tuning over time.

## Commands Used / Useful
```bash
# Ensure correct Vercel project linked
vercel link --yes --project gulf-corridor-watch --scope cmogles-projects

# Deploy
vercel --prod --yes

# Supabase linked project
supabase link --project-ref lrehazmueusvkksxzvps

# Push migrations
supabase db push --linked --yes
```

## Handover Intent
Conor wants immediate development focus on Flightradar API enhancement (DXB/AUH realtime + user flight queries) while preserving current MVP reliability and low-friction family/team usage.
