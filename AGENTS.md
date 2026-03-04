# AGENTS.md

Repository guide for coding agents working on Gulf Corridor Watch.

## What This App Is

- Next.js 16 dashboard for official travel/disruption monitoring.
- Core runtime flow:
  1. Ingest official sources and signals (`/api/ingest`, `/api/ingest/[sourceId]`)
  2. Persist snapshots in Supabase
  3. Serve unified feed + briefing + flight query APIs

## Core Rules

- Use `npm` (not pnpm/yarn) in this repo.
- Use `npx tsx --test` for tests. Do not use `node --experimental-strip-types --test`.
- Never hardcode secrets. Read from `.env.local`/environment variables.
- Keep ingestion and UI changes test-backed when possible (`lib/*.test.ts`).

## Commands

```bash
# install
npm install

# local app
npm run dev
npm run build
npm run lint

# tests
npx tsx --test lib/*.test.ts
npx tsx --test lib/ingest.test.ts

# snapshot maintenance (dangerous: deletes all source_snapshots rows)
npx tsx --env-file=.env.local scripts/purge-snapshots.ts
```

## Environment Baseline

Required for core app:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `INGEST_SECRET`
- `BRIEF_SECRET`

Common optional:

- `FLIGHTRADAR_KEY`
- `X_BEARER_TOKEN`
- `CHROME_RELAY_URL`
- `GPT_UPDATE_VALIDATION_ENABLED`

## Workflows

### 1) Local Startup + First Data

1. Start app: `npm run dev`
2. Trigger full ingest:
   - `curl -s "http://localhost:3000/api/ingest?key=$INGEST_SECRET"`
3. Trigger briefing refresh:
   - `curl -s "http://localhost:3000/api/brief/refresh?key=$BRIEF_SECRET"`
4. Verify:
   - `curl -s "http://localhost:3000/api/updates/feed?limit=10"`
   - `curl -s "http://localhost:3000/api/brief/current"`

### 2) Per-Source Ingestion Debugging

Use this when one provider is failing or low quality:

1. Trigger only that source:
   - `curl -s "http://localhost:3000/api/ingest/emirates_updates?key=$INGEST_SECRET"`
2. Inspect provider timeline:
   - `curl -s "http://localhost:3000/api/updates/source/emirates_updates?limit=10"`
3. Iterate extractor/quality logic in:
   - `lib/source-extractors.ts`
   - `lib/source-quality.ts`
   - `lib/ingest.ts`

### 3) Data Quality Regression Pass

Run before merge when touching ingestion/feed logic:

```bash
npx tsx --test lib/source-quality.test.ts lib/source-extractors.test.ts lib/unified-updates.test.ts lib/unified-updates-types.test.ts lib/ingest.test.ts
npm run build
```

### 4) Flight Query Path Validation

1. Hit query endpoint:
   - `curl -s "http://localhost:3000/api/flights/query?query=EK511"`
2. Check dashboard API dependencies still return:
   - `/api/signals/summary`
   - `/api/brief/current`
   - `/api/updates/feed`

### 5) Snapshot Reset + Clean Re-ingest

Use after major extractor/cleanup changes:

1. Purge old snapshots:
   - `npx tsx --env-file=.env.local scripts/purge-snapshots.ts`
2. Trigger full ingest:
   - `curl -s "http://localhost:3000/api/ingest?key=$INGEST_SECRET"`
3. Rebuild briefing:
   - `curl -s "http://localhost:3000/api/brief/refresh?key=$BRIEF_SECRET"`

## Cron + Runtime Notes

- Cron schedules are defined in `vercel.json` and are source-specific.
- Current cadence groups:
  - every 5 minutes: briefing refresh + high-priority transport/airline sources
  - every 10 minutes: mid-priority official and airline sources
  - every 15 minutes: broader official advisories
  - every 30 minutes: lower-frequency government travel advisories
- Function max durations are explicitly configured in `vercel.json`.

## Deploy Workflow (Vercel)

```bash
vercel link --yes --project gulf-corridor-watch --scope cmogles-projects
vercel --prod --yes
```

Post-deploy smoke checks:

```bash
curl -s "https://www.keepcalmandcarryon.help/api/updates/feed?limit=5"
curl -s "https://www.keepcalmandcarryon.help/api/brief/current"
```

## File Map For Fast Navigation

- `app/api/ingest/[sourceId]/route.ts`: single-source ingest endpoint
- `app/api/ingest/route.ts`: batch/manual ingest endpoint
- `lib/ingest.ts`: ingestion orchestration
- `lib/source-extractors.ts`: per-source extraction logic
- `lib/source-quality.ts`: content quality filters
- `lib/unified-updates.ts`: feed shaping + dedup/filter
- `lib/current-state-brief.ts`: briefing synthesis
- `scripts/purge-snapshots.ts`: maintenance purge utility
- `vercel.json`: cron schedules + function runtime caps
