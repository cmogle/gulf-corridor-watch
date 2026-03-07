# FlyDubai DXB→BEG Route Monitor

**Date:** 2026-03-07
**Status:** Approved
**Replaces:** Full Gulf Corridor Watch crisis dashboard

## Purpose

Single-purpose route monitor for friends trying to fly FlyDubai from DXB to Belgrade (BEG) in the next 48 hours. Shows flight-by-flight status (on-time, delayed, cancelled, airborne, landed) with a live map when a flight is in the air.

Replaces the existing multi-source crisis dashboard entirely. Same Vercel/Supabase/FR24 infrastructure, stripped down to one focused tool.

## Architecture

### What stays
- `lib/flightradar.ts` — FR24 API client (live positions + schedule boards)
- `lib/flight-schedules.ts` — schedule board fetching with delay/cancel detection
- `lib/supabase.ts` / `lib/supabase-browser.ts` — Supabase clients
- `flight_schedules` + `flight_observations` database tables
- Vercel deployment, Supabase DB, env vars

### What gets deleted
- All 23-source ingestion pipeline (sources, extractors, quality filters)
- AI briefing/chat/Q&A system
- Unified feed, X signals, context gating, token budgets
- All existing UI components
- Most API routes

### New pieces
- **Cron endpoint** (`/api/cron/route-monitor`) — every 5 minutes
- **Page** (`/`) — SSR timeline + client auto-refresh
- **API route** (`/api/flights`) — JSON endpoint for client refresh
- **Map component** — Leaflet.js, shown only when flight is airborne

### Data flow

```
Vercel Cron (5min) → /api/cron/route-monitor
    → FR24 schedule board (DXB departures)
    → Filter: airline=FZ, destination=BEG
    → Upsert flight_schedules
    → FR24 live positions (UAE bounding box)
    → Filter: FZ flights with dest=BEG
    → Upsert flight_observations

Browser → / (SSR)
    → Query flight_schedules + flight_observations
    → Render timeline + map (if airborne)
    → Client auto-refresh via /api/flights (60s polling)
```

## UI Design

Single page, mobile-first, dark theme, high-contrast.

### Header
- Route badge: "FlyDubai DXB → BEG"
- Last updated timestamp + auto-refresh indicator
- Route status summary: e.g. "2 flights in next 48hrs — 1 on time, 1 delayed"

### Flight Timeline (main content)
Each flight rendered as a card, ordered by scheduled departure:

- **Flight number** (e.g. FZ 1801)
- **Scheduled departure** (e.g. "Sat 8 Mar, 14:30 GST")
- **Status pill**: On Time (green) / Delayed (amber + minutes) / Cancelled (red) / Departed (blue) / Airborne (blue pulsing) / Landed (green)
- **Gate/Terminal** if available
- **Estimated time** if different from scheduled

Past flights shown dimmed at bottom as history (proof the route is operating).

### Map (conditional)
When a flight is airborne:
- Leaflet.js + OpenStreetMap tiles (free, no key)
- Great circle line DXB→BEG
- Aircraft icon at current lat/lon from flight_observations
- Progress percentage
- Hidden when no flight is airborne

### Footer
- Data source: "Flightradar24"
- "Data refreshes every 5 minutes. Times in Gulf Standard Time (GST)."

## Data Model

### Existing tables (reused as-is)

**flight_schedules** — departure board data:
- airport, board_type, flight_number, airline
- origin_iata, destination_iata
- scheduled_time, estimated_time, actual_time
- status, is_delayed, delay_minutes, is_cancelled
- gate, terminal, fetched_at

**flight_observations** — live positions:
- airport, flight_number, callsign, flight_id
- airline, origin_iata, destination_iata
- status (on_ground/approach/departure/cruise/airborne)
- is_delayed, delay_minutes, fetched_at

### Queries
- Schedules: `WHERE airline LIKE 'FZ%' AND destination_iata = 'BEG' AND scheduled_time > now() - 24h AND scheduled_time < now() + 48h`
- Live positions: `WHERE flight_number LIKE 'FZ%' AND destination_iata = 'BEG' AND fetched_at > now() - 10min`

## Error Handling

- **FR24 API down:** Stale-data warning banner, serve from DB cache, show "Last updated X min ago"
- **No flights found:** "No FlyDubai flights to Belgrade found in next 48 hours" message
- **Rate limit / 403:** Fallback to OpenSky for live positions (no schedule board fallback)
- **Time window:** 48h forward + 24h back for history

## Refresh Strategy

- **Server-side cron:** Every 5 minutes via Vercel cron
- **Client-side:** 60-second polling of `/api/flights` for latest data
- **Total API calls (48h):** ~576 schedule board requests + ~576 live position requests

## Technical Decisions

- **Leaflet over Mapbox/Google Maps:** Free, no API key, sufficient for single-marker use case
- **Dark theme:** Airport/night readability, matches urgency context
- **No auth:** Public page, no login needed
- **No AI:** Pure data display, no LLM calls needed for this use case
- **GST timezone:** Users are physically in Dubai
