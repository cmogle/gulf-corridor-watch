# Per-source extraction pipeline

## Problem

Half the HTML sources produce garbage summaries. The extraction layer grabs page navigation, cookie banners, and site chrome instead of article content. Quality filters catch the worst cases (empty, 404, name-echo) but "name + 200 chars of nav chrome" passes through as reliable.

## Decision: Approach A — dynamic route with hybrid extraction

One Next.js dynamic route `/api/ingest/[sourceId]` dispatches to per-source logic. Each source is independently scheduled via Vercel cron. Extraction uses a DOM cleanup pass before the existing extractors run, with a cheap LLM fallback when structured extraction still fails quality checks.

## Architecture

### Route layer

```
GET /api/ingest/[sourceId]?key=INGEST_SECRET
```

- Validates key, looks up sourceId in OFFICIAL_SOURCES (404 if unknown)
- Calls `ingestSingleSource(source)` — the core unit of work
- Returns `{ ok, source_id, reliability, summary_preview }`
- Each source gets its own Vercel cron entry at its configured frequency
- Old `/api/ingest` endpoint stays as a batch trigger (loops all sources sequentially)

### Hybrid extraction pipeline

Per-source, in order:

1. **Fetch** — RSS: parse XML, score items. HTML: Jina (SPA sources) -> direct fetch -> chrome relay fallback. No change from today.

2. **DOM cleanup** (new, `lib/dom-cleanup.ts`) — Strip `<nav>`, `<header>`, `<footer>`, `<aside>`, `<script>`, `<style>`, `<noscript>` tags and contents. Strip elements with boilerplate roles/classes: cookie, banner, menu, sidebar, breadcrumb, skip-to-content. Result is the `<main>`/`<article>` content or cleaned `<body>`.

3. **Structured extraction** (improved) — Existing per-source extractors run on cleaned DOM instead of raw HTML. With nav chrome gone, the `<p>` and `<h2>` fallbacks produce real content.

4. **Quality gate** (tightened) — Existing `isUnusableSourceText()` plus two new checks: summary < 50 chars = low-confidence; summary words > 90% overlap with source name words = low-confidence.

5. **LLM fallback** (new, `lib/llm-extract.ts`) — Only fires when quality gate fails. Sends cleaned text to GPT-4o-mini with prompt: "Extract the key news or travel updates from this page content. Return a 1-3 sentence summary of actionable information. If no meaningful content, respond EMPTY." Budget-capped at 5 LLM extraction calls per ingest cycle. EMPTY response -> `reliability: degraded`.

6. **Persist** — Upsert to source_snapshots. Unchanged.

### Per-source scheduling

| Frequency | Sources |
|-----------|---------|
| Every 5 min | emirates_updates, etihad_advisory, flydubai_updates, gcaa_uae, rta_dubai |
| Every 10 min | uae_mofa, white_house_statements, us_dod_releases, us_centcom_news, oman_air, air_arabia_updates |
| Every 15 min | us_state_dept_travel, visit_dubai_news, india_mea, india_immigration_boi, qatar_airways_updates |
| Every 30 min | australia_dfat_uae, canada_gac_uae, uk_fcdo_uae |

Each endpoint: `maxDuration: 60` (1 min, down from 300s batch).

### File changes

**New:**
- `app/api/ingest/[sourceId]/route.ts` — dynamic route, thin dispatcher
- `lib/dom-cleanup.ts` — boilerplate stripping
- `lib/llm-extract.ts` — cheap LLM fallback, budget-capped

**Modified:**
- `lib/ingest.ts` — extract `ingestSingleSource(source)` as core unit. `runIngestion()` becomes loop calling it. Remove parallel batch logic and scope param.
- `lib/source-extractors.ts` — `extractHtmlSnapshot` calls DOM cleanup first. Simplify extractors that worked around nav chrome.
- `lib/source-quality.ts` — add summary-length and name-overlap quality checks.
- `vercel.json` — 19 per-source cron entries + brief refresh + flights/X signals.
- `app/api/ingest/route.ts` — batch/manual trigger, loops all sources.

**Unchanged:**
- `lib/sources.ts`, `lib/unified-updates.ts`, `lib/chrome-relay.ts`
- `lib/update-validation.ts`, `lib/x-signals.ts`, `lib/flightradar.ts`, `lib/opensky.ts`

**Removed:**
- `Promise.allSettled` batch fetch pattern in ingest.ts
- `scope` parameter (airline vs full) — replaced by per-source scheduling
