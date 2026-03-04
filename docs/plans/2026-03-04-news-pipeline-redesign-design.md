# News RSS Pipeline Redesign

**Date:** 2026-03-04
**Status:** Approved

## Problem

Google News RSS sources (`gn_*`) are treated identically to official RSS sources. This produces unusable output: raw concatenated headlines with publisher names baked in, HTML entities leaking through, no summarization, and no cross-source deduplication. Example of current output:

```
Google News: Dubai Airport
- Is Dubai airport open today? What we know after Iranian missile strikes damage site, iconic Burj Al Arab hotel | World News - Hindustan Times: Is Dubai airport open today? What we know after Iranian missile strikes damage site, iconic Burj Al Arab hotel | World News &nbsp;&nbsp; Hindustan Tim
```

Five compounding failures:
1. Google News titles include publisher attribution (`Headline - Publisher Name`)
2. `cleanDesc` in `formatRssSummary` doesn't decode HTML entities (`&nbsp;` leaks through)
3. No AI summarization for news items — just raw headline concatenation
4. No cross-source deduplication (same story from `gn_dubai_airport` and `gn_uae_flights` both appear)
5. Bullet-list text renders as raw string in the feed component

## Decision

Split the RSS ingestion pipeline: official RSS sources keep current behavior; Google News RSS sources (`gn_*`) get a new path that stores individual articles as `social_signals` rows and generates AI summaries for display.

## Architecture

### Pipeline Split at `fetchRss()`

```
Google News RSS XML
  |
  +-- Parse items, score by Gulf Corridor keywords
  |
  +-- For each relevant item:
  |     +-- Strip publisher from title ("Headline - Publisher" -> "Headline")
  |     +-- Decode HTML entities in description
  |     +-- Deduplicate by article URL across ALL gn_* sources
  |     +-- Store as social_signals row (provider='rss_item')
  |
  +-- Summarize cluster:
        +-- Pass top items to gpt-4o-mini -> 2-3 sentence summary
        +-- Fallback: best single cleaned headline if LLM fails/budget exhausted
        +-- Store as source_snapshot (what the feed card shows)
```

Official RSS sources (State Dept, CENTCOM, BBC, Al Jazeera, UK FCDO) continue using the existing `formatRssSummary` path unchanged.

### Storage Model

**Individual articles** -> `social_signals` table:

| Field | Value |
|-------|-------|
| `provider` | `'rss_item'` |
| `handle` | source_id (e.g., `'gn_dubai_airport'`) |
| `post_id` | `SHA256(article_url)` |
| `text` | cleaned headline (publisher stripped) |
| `text_original` | raw Google News title |
| `text_en` | cleaned description (entity-decoded, tag-stripped) |
| `url` | article URL (from RSS `<link>`) |
| `linked_source_id` | source_id (e.g., `'gn_dubai_airport'`) |
| `keywords` | matched Gulf Corridor keywords |
| `confidence` | keyword score (same scale as X scoring) |
| `posted_at` | RSS `pubDate` |
| `translation_status` | `'not_needed'` |

**Topic summary** -> `source_snapshots` table (same table, better content):

| Field | Before | After |
|-------|--------|-------|
| `title` | `"Google News: Dubai Airport"` | `"Dubai Airport: DXB disrupted after Iranian strikes"` |
| `summary` | Raw bullet concatenation | 2-3 sentence AI summary of what's happening |

### Deduplication

**Cross-source dedup by article URL:** Before inserting an `rss_item`, query `social_signals WHERE provider='rss_item' AND post_id = :url_hash` (ignoring handle). If the article already exists from any `gn_*` source, skip insertion.

The existing `UNIQUE(provider, handle, post_id)` constraint prevents duplicates within a single source. The application-level check prevents duplicates across sources.

### Unified Updates View

Add a third branch for news articles:

```sql
-- NEWS ARTICLES BRANCH
SELECT
  x.id::text AS id,
  x.linked_source_id AS source_id,
  COALESCE(m.source_name, x.linked_source_id) AS source_name,
  'news'::text AS update_type,
  COALESCE(x.posted_at, x.fetched_at) AS event_at,
  x.fetched_at,
  x.text AS headline,
  COALESCE(NULLIF(x.text_en, ''), x.text) AS summary,
  x.url AS original_url,
  x.validation_state,
  x.validation_score,
  'unconfirmed_social'::text AS confirmation_state,
  'rss'::text AS evidence_basis,
  COALESCE(ls.status_level, 'unknown'::text) AS status_level,
  'reliable'::text AS reliability,
  COALESCE(m.priority, 0) AS priority
FROM social_signals x
LEFT JOIN latest_source_meta m ON m.source_id = x.linked_source_id
LEFT JOIN latest_source_snapshots ls ON ls.source_id = x.linked_source_id
WHERE x.provider = 'rss_item'
```

`UnifiedUpdateType` expands: `'snapshot' | 'x' | 'news'`

Individual `'news'` items appear in History view when expanding a `gn_*` source card — not in the main feed (the AI summary snapshot is what's shown there).

### LLM Budget

Only re-summarize when article content has changed. Compare content hash of current articles against previous snapshot's content hash. If unchanged, reuse previous summary — no LLM call needed.

Separate budget env var: `NEWS_SUMMARY_LLM_MAX` (default: 8, one per `gn_*` source).

### Display Changes

For `gn_*` source cards in `updates-feed.tsx`:
- Badge: "News" instead of "Official"
- Article count shown (e.g., "3 articles")
- History expansion shows individual articles (the `rss_item` social signals)
- Summary text is coherent AI prose

### New Functions

| Function | Location | Purpose |
|----------|----------|---------|
| `stripGoogleNewsPublisher(title)` | `lib/ingest.ts` | Split on last ` - `, return `{ headline, publisher }` |
| `summarizeNewsCluster(items)` | `lib/news-summarize.ts` | LLM call to produce 2-3 sentence digest from article titles/descriptions |
| `fetchGoogleNewsRss(source)` | `lib/ingest.ts` | New path in `fetchRss` for `category === 'news'` sources with `gn_*` ids |
| `storeNewsArticles(items, sourceId)` | `lib/ingest.ts` | Insert deduped items into `social_signals` |

### What Doesn't Change

- Official RSS sources (State Dept, CENTCOM, BBC, Al Jazeera, UK FCDO)
- HTML sources and extractors
- X signal polling
- Current state brief (ignores news sources already)
- Validation pipeline (works for both snapshots and social signals)

### Entity Decoding Fix

`cleanDesc` in `formatRssSummary` gets `decodeEntities()` call added. This fixes the immediate `&nbsp;` leak even for non-`gn_*` RSS sources.

## Files Modified

| File | Change |
|------|--------|
| `lib/ingest.ts` | Split `fetchRss` for `gn_*` sources, add `stripGoogleNewsPublisher`, `storeNewsArticles`, entity decoding in `cleanDesc` |
| `lib/news-summarize.ts` | New file: LLM cluster summarization |
| `lib/unified-updates-types.ts` | Add `'news'` to `UnifiedUpdateType` |
| `app/components/updates-feed.tsx` | "News" badge, article count, display tweaks |
| `supabase/migrations/YYYYMMDD_news_pipeline_view.sql` | Updated `unified_updates` view with `rss_item` branch |
