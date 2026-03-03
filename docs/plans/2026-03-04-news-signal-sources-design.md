# News Signal Sources Design

**Date:** 2026-03-04
**Status:** Approved

## Problem

The site monitors 19 official airline/government sources but has zero visibility on breaking news. A story like "US Consulate Dubai on fire" (Al Jazeera, 20:00 tonight) goes completely undetected. Official sources confirm disruptions after the fact; news outlets report them as they happen.

## Decision

Add 8 RSS news feeds to `OFFICIAL_SOURCES` using the existing `rss_default` extractor. Differentiate them with a `"news"` category, lower priority, and `unconfirmed_social` confirmation state. Prep the `social_signals` schema for future Telegram/rss_item providers.

## Scope

### In Scope (Tier 1 + Tier 2 schema prep)

1. **8 new RSS sources** added to `OFFICIAL_SOURCES`:
   - 5 Google News keyword queries (UAE flights, Gulf conflict, Strait of Hormuz, Dubai airport, India-Dubai travel)
   - BBC Middle East RSS
   - Al Jazeera RSS
   - UK FCDO Iran travel advice (Atom)
2. **`"news"` category** in `SourceDef.category` type union
3. **Ingest logic** — news-category sources set `confirmation_state: 'unconfirmed_social'`
4. **Schema migration** — widen `social_signals.provider` CHECK to `('x','telegram','rss_item')`

### Out of Scope (deferred)

- Per-article `news_signals` table (Tier 3)
- Telegram bot integration
- `rss_item` signal extraction into `social_signals`
- GPT validation of news feeds (keyword scoring sufficient)
- Dedicated frontend news filter tab

## Source Definitions

| Source ID | Name | URL | Priority | Freshness | Region |
|-----------|------|-----|----------|-----------|--------|
| `gn_uae_flights` | Google News: UAE Flights | `https://news.google.com/rss/search?q=UAE+flights+suspended+cancelled&hl=en-GB&gl=GB&ceid=GB:en` | 55 | 10m | UAE |
| `gn_gulf_conflict` | Google News: Gulf Conflict | `https://news.google.com/rss/search?q=Iran+war+Gulf+UAE+airspace&hl=en-GB&gl=GB&ceid=GB:en` | 55 | 10m | Gulf region |
| `gn_strait_hormuz` | Google News: Strait of Hormuz | `https://news.google.com/rss/search?q=Strait+Hormuz+shipping+flights&hl=en-GB&gl=GB&ceid=GB:en` | 50 | 15m | Gulf region |
| `gn_dubai_airport` | Google News: Dubai Airport | `https://news.google.com/rss/search?q=Dubai+airport+DXB+open+closed&hl=en-GB&gl=GB&ceid=GB:en` | 55 | 10m | Dubai |
| `gn_india_dubai_travel` | Google News: India-Dubai Travel | `https://news.google.com/rss/search?q=India+UAE+flights+advisory+travel&hl=en-GB&gl=GB&ceid=GB:en` | 45 | 15m | India/UAE |
| `bbc_middle_east` | BBC News: Middle East | `https://feeds.bbci.co.uk/news/world/middle_east/rss.xml` | 60 | 10m | Middle East |
| `aljazeera_news` | Al Jazeera News | `https://www.aljazeera.com/xml/rss/all.xml` | 58 | 10m | Global/Middle East |
| `uk_fcdo_iran` | UK FCDO Travel Advice - Iran | `https://www.gov.uk/foreign-travel-advice/iran.atom` | 70 | 15m | UK/Iran |

All sources: `parser: "rss"`, `connector: "rss"`, `extractor_id: "rss_default"`, `category: "news"`.

Exception: `uk_fcdo_iran` is arguably `category: "government"` but grouped with news for consistency. Its higher priority (70) reflects its official nature.

## Type Changes

```typescript
// sources.ts — SourceDef.category
category: "government" | "airline" | "transport" | "news";
```

## Schema Migration

```sql
-- Widen social_signals.provider for Tier 2 prep
ALTER TABLE social_signals DROP CONSTRAINT social_signals_provider_check;
ALTER TABLE social_signals ADD CONSTRAINT social_signals_provider_check
  CHECK (provider IN ('x','telegram','rss_item'));
```

No migration needed for `source_snapshots.category` — it has no CHECK constraint.

## Ingest Behaviour

- News sources use the existing `fetchRss` + `pickBestRssItemsScored` + `formatRssSummary` pipeline
- Keyword scoring filters top items per feed (existing behaviour)
- `confirmation_state` set to `'unconfirmed_social'` for `category === 'news'`
- `evidence_basis` remains `'rss'` (existing behaviour for RSS sources)
- No GPT validation — keyword scoring is the quality gate
- Deduplication via `content_hash` works as-is

## Frontend Behaviour

- News snapshots appear in the "all" unified updates feed
- No dedicated "News" filter tab (deferred)
- Existing badge system shows appropriate unverified indicator via `confirmation_state: 'unconfirmed_social'`
- Source Health grid includes news sources

## Brief Generation

- News sources included in context with their lower priority (45-60)
- They won't dominate over official sources (80-100) in the extractive brief
- They provide corroborating context for official statements

## Future Path

1. **Tier 2:** Build `rss_item` signal extraction — promote high-relevance individual articles from news feeds into `social_signals` with `provider: 'rss_item'`. Schema is already prepped.
2. **Tier 2:** Telegram bot for UAE MOFA/Emirates channels — `provider: 'telegram'`. Schema is already prepped.
3. **Tier 3:** Dedicated `news_signals` table with per-article dedup, individual relevance scoring, and `unified_updates` view branch.
