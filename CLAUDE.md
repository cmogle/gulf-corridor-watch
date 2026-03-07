# FlyDubai DXB→BEG Route Monitor

Single-purpose flight route monitor showing real-time schedule status and a live map for airborne FlyDubai flights from Dubai (DXB) to Belgrade (BEG).

**Production:** keepcalmandcarryon.help (Vercel auto-deploys from main)

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4
- **Backend:** Next.js API routes (serverless on Vercel)
- **Database:** Supabase PostgreSQL
- **Data:** Flightradar24 API (schedule boards + live positions)
- **Map:** Leaflet.js (dynamic import, dark CARTO tiles)
- **Package Manager:** npm

## Commands

```bash
npm run dev                              # Dev server on :3000
npm run build                            # TypeScript + Next.js build
npm run lint                             # ESLint
```

**Note:** No test files exist — the codebase was rebuilt from scratch.

## Project Structure

- `app/page.tsx` — Server component, SSR initial data load
- `app/components/route-monitor.tsx` — Client component, 60s polling, main UI
- `app/components/flight-card.tsx` — Single flight status card
- `app/components/flight-map.tsx` — Leaflet map with DXB→BEG route + aircraft marker
- `app/api/flights/route.ts` — JSON API: schedules (24h back, 48h forward) + live positions (last 10min)
- `app/api/cron/route-monitor/route.ts` — Cron every 5min: fetches FR24, upserts to Supabase
- `lib/flightradar.ts` — FR24 live positions API (`ingestAirports`)
- `lib/flight-schedules.ts` — FR24 departure board API (`fetchAirportBoard`)
- `lib/supabase.ts` — Server/admin Supabase client (`getSupabaseAdmin`)
- `lib/supabase-browser.ts` — Browser Supabase client
- `lib/cron-auth.ts` — Cron auth (`isCronAuthorized`) — CRON_SECRET header or ?key= param
- `supabase/` — Schema, migrations
- `docs/plans/` — Feature design documents

## Conventions

- **Files:** kebab-case (`flight-card.tsx`, `route-monitor.tsx`)
- **Types:** PascalCase
- **DB columns/tables:** snake_case

## Architecture

1. **Cron** (`/api/cron/route-monitor`, every 5min): Fetches DXB departure board from FR24, filters to FZ→BEG flights, upserts to `flight_schedules`. Also fetches live positions, filters to FZ→BEG, inserts to `flight_observations`.
2. **API** (`/api/flights`): Queries Supabase for schedules + recent live positions, returns JSON.
3. **Page**: SSR initial load via `getSupabaseAdmin`, then client polls `/api/flights` every 60s.
4. **Map**: Only shown when a live position with airborne status exists. Leaflet loaded dynamically to avoid SSR issues.

## Key Environment Variables

Required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INGEST_SECRET`

Optional: `FLIGHTRADAR_KEY` (required for real data), `CRON_SECRET` (Vercel cron auth)
