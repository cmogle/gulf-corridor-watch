# Data Quality Fixes — Design

**Date:** 2026-03-03
**Status:** Approved

## Problem

The editorial redesign landed a strong visual experience, but data quality issues undermine it. Raw Jina markdown leaks into summaries, fetch errors display as content cards, RSS summaries are pipe-joined gibberish, official sources show misleading "Unverified" badges, and duplicate entries clutter the feed.

## Root Causes

1. **Jina markdown prefix leakage** — `fetchTextWithFallback()` falls back to `r.jina.ai/` which returns markdown with `Title:` / `URL Source:` / `Markdown Content:` prefixes. Extractors are HTML-oriented and pass these through untouched into `selectSummary()`.

2. **Fetch errors as content cards** — `runIngestion()` catch block creates snapshots with `title: "${source.name} fetch error"` and inserts them. `loadUnifiedFeed()` has zero filtering, so they appear in the UI.

3. **No display-layer filtering** — `loadUnifiedFeed()` queries `unified_updates` view with no WHERE clause and no post-fetch filtering. All snapshots flow straight to the frontend.

4. **Misleading validation badges** — Binary "Verified"/"Unverified" maps everything except GPT-validated items to "Unverified", including official government sources that simply weren't GPT-validated due to budget caps.

5. **No content deduplication** — Each ingestion cycle inserts a new row. Same source with identical content appears multiple times in the feed.

6. **Pipe-joined RSS summaries** — Multiple RSS article titles joined with ` | ` look garbled in a card UI. Generic items with zero Gulf relevance display as uninformative noise.

## Design

Three layers of fixes, ordered by impact and risk.

### Layer 1: Display-Layer Filtering (lib/unified-updates.ts)

**1a. Filter unusable snapshots**

Reuse existing `isUsableSnapshot()` from `lib/source-quality.ts` in `loadUnifiedFeed()`. It already catches `reliability === "blocked"`, fetch errors, access denied, cloudflare, etc.

Additionally filter `reliability === "degraded"` — partial failures shouldn't appear as content.

Construct a `SnapshotLike` from each `UnifiedUpdateItem`:
```
{ title: item.headline, summary: item.summary, reliability: item.reliability }
```

**1b. Deduplicate by source + content**

After filtering, deduplicate by `source_id` + summary content hash. Keep only the most recent entry per unique combination. Use a `Set<string>` of `${source_id}:${hash(summary)}` to track seen items.

**1c. Fix badge logic (app/components/updates-feed.tsx)**

Replace binary Verified/Unverified with three states:
- **"Verified"** (green) — `validation_state === "validated"`
- **"Official"** (blue/neutral) — `confirmation_state === "confirmed"` and not validated
- Drop "Unverified" — misleading for official government sources

### Layer 2: Jina Markdown Sanitization (lib/source-extractors.ts)

Add `stripJinaPrefix(text: string): string` that strips the structured prefix block:
```
Title: ...
URL Source: ...
Markdown Content:
```

Apply in `fetchTextWithFallback()` when `fromMirror === true`, before text reaches any extractor. Single chokepoint covers all affected sources (Emirates, Oman Air, Etihad, MOFA, India MEA).

Regex approach: strip leading lines matching `^Title:\s`, `^URL Source:\s`, `^Markdown Content:\s*` at the start of the response.

### Layer 3: RSS Summary Quality (lib/ingest.ts)

**3a. Bullet-point format for multi-item RSS cards**

Replace pipe-join with structured format:
- Multiple relevant items: `title` = source name, `summary` = bulleted list of top 3-4 items (article title + short excerpt), with article URLs preserved for linking
- Single relevant item: use it directly as headline + summary
- The `|` separator is eliminated entirely

**3b. Minimum relevance threshold**

Add minimum score check in `pickBestRssItems`. If best item scores 0 on `GULF_CORRIDOR_KEYWORDS`:
- `title` = source name
- `summary` = "No current Gulf-relevant advisories"
- `reliability` = "degraded" (Layer 1 filtering suppresses it)

## Files Changed

| File | Change |
|------|--------|
| `lib/unified-updates.ts` | Add filtering + deduplication in `loadUnifiedFeed()` |
| `lib/source-quality.ts` | Possibly extend `isUsableSnapshot` to cover `degraded` reliability |
| `app/components/updates-feed.tsx` | Three-state badge logic |
| `lib/source-extractors.ts` | Add `stripJinaPrefix()` |
| `lib/ingest.ts` | Apply Jina stripping in `fetchTextWithFallback()`, restructure RSS summary building |
| `app/api/updates/feed/route.ts` | Apply same filtering as `loadUnifiedFeed()` if it has its own query path |

## Non-Goals

- Changing the `unified_updates` DB view (keep as complete audit trail)
- Changing ingestion behavior for fetch errors (they still get recorded, just filtered from display)
- Modifying GPT validation budget or logic
- Changing the current state brief generation
