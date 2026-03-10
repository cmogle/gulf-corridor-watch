# GCW Scraping Implementation Shortlist (Execution-Ready)
**Date:** 2026-03-04  
**Targets:** Emirates, Etihad, Oman Air, Qatar Airways, flydubai  
**Goal:** Stabilize blocked airline ingestion with OSS-first architecture + controlled paid fallback.

## 1) Exact modules to add

## A. Fetch lane router
**New:** `lib/fetch-router.ts`
- Inputs: `sourceId`, `url`, `priority`, `lastHealth`, `costBudget`
- Outputs: `{ lane: 'direct' | 'browser' | 'managed', reason }`
- Rules:
  - default `direct`
  - escalate to `browser` after N blocked runs
  - escalate to `managed` only if browser lane also fails and budget available

## B. Source policy registry
**New:** `lib/source-policy.ts`
```ts
export type SourcePolicy = {
  sourceId: string;
  defaultLane: 'direct' | 'browser';
  blockedThreshold30m: number;
  browserFailThreshold30m: number;
  cooldownMinutes: number;
  dailyManagedBudgetUsd: number;
  maxManagedCallsPerHour: number;
};
```
- Store policy per airline source.

## C. Crawlee browser worker (TS)
**New dir:** `lib/workers/crawlee/`
- `airline-crawler.ts` (PlaywrightCrawler + session pool)
- `extractors.ts` (lane-specific extraction wrappers)
- `proxy.ts` (proxy config/session binding)
- `stealth.ts` (optional minimal anti-fingerprint toggles)

## D. Managed fallback adapter
**New:** `lib/managed-fallback.ts`
- Interface:
```ts
export type ManagedProvider = 'scrapingbee' | 'zenrows' | 'scrapfly' | 'browserless';
export async function fetchManaged(params): Promise<{html:string,status:number,provider:ManagedProvider,cost:number}>;
```
- Route by env config + per-source allowlist.

## E. Health + telemetry
**New:** `lib/source-health.ts`
- Track:
  - `attempt_count`
  - `blocked_count`
  - `captcha_signals`
  - `success_rate_30m`
  - `p50_latency_ms`
  - `lane_used`
  - `estimated_cost_usd`
- Add lightweight table in Supabase (or JSON log first, table second).

## F. Ingest integration points
**Modify:** `lib/ingest.ts`
- Replace direct fetch-only source path with router call:
  1) choose lane
  2) fetch via lane
  3) run existing extractor (`source-extractors.ts`)
  4) update health

**No change:** downstream snapshot schema + validation path remains intact.

---

## 2) Per-source routing policy (initial)

| Source ID | Default | Escalate to Browser | Escalate to Managed | Cooldown | Managed Budget |
|---|---|---|---|---|---|
| emirates_updates | browser | immediate (already hard target) | after 2 browser fails / 30m | 60m | $8/day |
| etihad_advisory | browser | immediate | after 2 browser fails / 30m | 60m | $8/day |
| oman_air | direct | after 2 blocked / 30m | after 3 browser fails / 30m | 45m | $5/day |
| qatar_airways_updates | direct | after 2 blocked / 30m | after 3 browser fails / 30m | 45m | $5/day |
| flydubai_updates | direct | after 2 blocked / 30m | after 3 browser fails / 30m | 45m | $5/day |

Notes:
- Emirates + Etihad start browser-first due to known defenses.
- Managed fallback strictly budget-gated.

---

## 3) 24-hour bakeoff plan

## Window
- Run for 24h with current cron cadence.
- Compare 3 strategies on each source:
  - S1: direct only
  - S2: direct + browser fallback
  - S3: direct + browser + managed fallback (budget-capped)

## Metrics
- freshness SLA hit rate (within source target minutes)
- successful extraction rate
- blocked/captcha rate
- latency p50/p95
- cost per successful snapshot

## Pass/fail gates
- **Promote to production policy if:**
  - success rate >= 90%
  - freshness SLA >= 85%
  - cost/snapshot within daily budget envelope

## Deliverable after 24h
`docs/SCRAPING-BAKEOFF-RESULTS-YYYY-MM-DD.md` with:
- winner strategy per source
- recommended permanent policy
- expected monthly cost band

---

## 4) PR-sized implementation sequence

1. **PR1**: `source-policy.ts` + `fetch-router.ts` + ingest wiring (no managed lane yet)
2. **PR2**: Crawlee worker for airline sources + health logging
3. **PR3**: managed fallback adapter + budget guardrails
4. **PR4**: bakeoff report + lock final per-source policies

---

## 5) Env/config checklist

Add env vars:
- `SCRAPE_ROUTER_ENABLED=true`
- `SCRAPE_BROWSER_ENABLED=true`
- `SCRAPE_MANAGED_ENABLED=false` (turn on only for bakeoff lane)
- `SCRAPE_MANAGED_PROVIDER=scrapfly` (or scrapingbee/zenrows/browserless)
- Provider keys as needed
- `SCRAPE_DAILY_BUDGET_USD=30`

---

## 6) Reuse path for Phoenix
Create shared package shape now (even local mono-module):
- `fetch-router`
- `source-policy`
- `health model`
- `managed adapter interface`

This keeps GCW as proving ground and Phoenix as scale-up consumer with minimal rewrite.

---

## 7) Immediate next step (today)
Implement **PR1** only (router + policy + ingest wiring) so Claude Code can plug into a clear contract while it works on difficult airline scraping behavior.
