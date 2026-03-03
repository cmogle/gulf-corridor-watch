# Handover Document — Data Quality Fixes

**Date:** 2026-03-03
**Status:** Implementation complete, deployed to production, awaiting first clean ingestion cycle

---

## What Was Done

Six production data quality issues were identified, designed, and fixed across 15 commits (09e9bbe..873b9c8). All changes are pushed to `origin/main` and deployed.

### The Problems (as observed on production)

1. **Raw Jina markdown leaking into summaries** — Emirates, Oman Air, Etihad showed `Title: ... URL Source: ... Markdown Content:` prefixes
2. **Fetch errors displayed as content cards** — "fetch error" appearing as regular updates
3. **Empty/meaningless RSS items** — US DoD, White House showing just source name with no content
4. **Generic SEO boilerplate** — UAE MOFA showing meta description instead of news
5. **Misleading "Unverified" badges** — official government/airline sources labelled "Unverified"
6. **Duplicate entries** — same source appearing multiple times with identical content

### The Fixes (three layers)

**Layer 1 — Display-layer filtering** (commits 48abad6..f9643ef)
- `isUsableFeedItem()` in `lib/source-quality.ts` — filters out degraded/blocked reliability, empty summaries, unusable text patterns
- `deduplicateFeedItems()` in `lib/unified-updates.ts` — deduplicates by `source_id` + normalized summary
- `filterAndDeduplicateFeed()` wired into `loadUnifiedFeed()` — all feed queries now go through filtering
- Badge logic in `app/components/updates-feed.tsx` — single "Official"/"Official X" badge from update_type, "Verified" badge only for GPT-validated items

**Layer 2 — Jina markdown sanitization** (commits 48c9c0d..9f7760c)
- `stripJinaPrefix()` in `lib/source-extractors.ts` — strips `Title:/URL Source:/Markdown Content:` prefix
- Wired into `fetchTextWithFallback()` in `lib/ingest.ts` — applied when `fromMirror === true`

**Layer 3 — RSS summary restructuring** (commits 0f373f8..a3b0a78)
- `formatRssSummary()` in `lib/ingest.ts` — single item becomes headline+summary, multiple items become bullet-point list
- `pickBestRssItemsScored()` — scores RSS items by Gulf Corridor keyword relevance
- Minimum relevance threshold — zero-relevance RSS feeds marked as `degraded` (filtered out by Layer 1)
- `fetchRss()` rewritten to use new functions

### Additional fixes (post-review, commits 5206a56..873b9c8)
- Removed dead `pickBestRssItems` function
- Fixed multi-item RSS title to use `source.name` instead of first item's title
- Reverted `.ts` import extensions to extensionless for Next.js compatibility
- Simplified over-fetch expression in `loadUnifiedFeed`
- Removed duplicate "Official" badge on confirmed snapshot sources
- Added empty-summary rejection to `isUsableFeedItem`

---

## Current State

### What's Working
- All code is deployed (commit 873b9c8 deployed to production)
- 29 tests across 5 test files, all passing (`npx tsx --test lib/*.test.ts`)
- Next.js build passes
- Display-layer filtering is active (degraded/blocked/empty items hidden, duplicates removed)
- Badge logic is correct (Official/Official X + optional Verified)

### What's Pending
- **First clean ingestion cycle has not yet completed.** The Jina stripping and RSS reformatting only affect NEW data created during ingestion. All current data in Supabase was ingested with the OLD code and still contains Jina prefixes and pipe-joined RSS summaries.
- The cron runs `scope=full` every 15 minutes and `scope=airline` every 5 minutes (see `vercel.json`). After the next successful full ingestion, new rows should have clean summaries.
- Old dirty rows will coexist with new clean rows in the DB. The dedup logic keeps the newest per source, so clean rows should surface.

### Known Remaining Issues
- **Old data still has Jina markdown** — will be naturally superseded by new ingestion rows, but old rows remain in DB
- **No migration to clean historical data** — could add a one-time cleanup script if needed, but not strictly necessary since new ingestion replaces old data
- **`current-state-brief.test.ts` has a pre-existing failure** — unrelated `ERR_MODULE_NOT_FOUND` for `./context-gating`, predates this work

---

## Key Files

| File | What Changed |
|------|-------------|
| `lib/source-quality.ts` | Added `FeedItemLike` type, `isUsableFeedItem()` |
| `lib/source-quality.test.ts` | 8 tests (new file) |
| `lib/unified-updates.ts` | Added `deduplicateFeedItems()`, `filterAndDeduplicateFeed()`, wired into `loadUnifiedFeed()` |
| `lib/unified-updates.test.ts` | 5 tests (new file) |
| `lib/source-extractors.ts` | Added `stripJinaPrefix()` |
| `lib/source-extractors.test.ts` | 5 tests (new file) |
| `lib/ingest.ts` | `stripJinaPrefix` wiring, `formatRssSummary()`, `pickBestRssItemsScored()`, `fetchRss()` rewrite, removed dead `pickBestRssItems` |
| `lib/ingest.test.ts` | 8 tests (new file) |
| `app/components/updates-feed.tsx` | Badge logic: single type badge + optional Verified |
| `docs/plans/2026-03-03-data-quality-fixes-design.md` | Design document |
| `docs/plans/2026-03-03-data-quality-fixes-implementation.md` | 11-task implementation plan |

---

## Testing

```bash
# Run all tests (must use tsx, not node --experimental-strip-types)
npx tsx --test lib/source-quality.test.ts lib/source-extractors.test.ts lib/unified-updates.test.ts lib/unified-updates-types.test.ts lib/ingest.test.ts

# Build
npx next build
```

**Important:** Do NOT use `node --experimental-strip-types --test` — it cannot resolve extensionless `.ts` imports in source files. Use `npx tsx --test` instead.

---

## Architecture Notes

- **Filtering happens at the application layer** (`loadUnifiedFeed()`), not the DB view. This preserves the full audit trail in Supabase while showing only clean data in the UI.
- **Deduplication uses `source_id` + first 200 chars of normalized summary** as the key. It keeps the first occurrence, so it relies on the input being sorted newest-first (which it is, from the Supabase query).
- **The `unified_updates` DB view** unions `source_snapshots` and `x_updates` tables. No schema changes were needed.
- **Ingestion creates new rows each cycle** — `event_at` and `fetched_at` are set to the current timestamp. Old rows accumulate but are naturally pushed down by newer ones.
- **Jina Reader** (`r.jina.ai/`) is the fallback when direct HTML fetch fails (CDN/anti-bot). The `fromMirror` flag in `fetchTextWithFallback()` controls whether `stripJinaPrefix()` is applied.

---

## What To Do Next

1. **Verify clean data** — After the next full ingestion cycle (cron runs every 15 min), check the production feed to confirm Jina prefixes are gone and RSS summaries show bullet points
2. **Optional: Historical cleanup** — If old dirty rows are still appearing (dedup should prevent this, but edge cases exist), consider a one-time Supabase SQL script to clean or delete old rows
3. **Optional: Improve Jina stripping resilience** — Current implementation uses chained regex for known prefix lines. If Jina changes format, may need updating (see `lib/source-extractors.ts:30-37`)
