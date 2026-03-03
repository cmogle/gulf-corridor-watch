# News Signal Sources Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 8 RSS news feeds (Google News, BBC, Al Jazeera, UK FCDO Iran) and prep social_signals schema for future Telegram/rss_item providers.

**Architecture:** Extend the existing OFFICIAL_SOURCES array with a new `"news"` category. News sources flow through the same `fetchRss` + `pickBestRssItemsScored` pipeline but get `confirmation_state: 'unconfirmed_social'` to distinguish them from official sources. One SQL migration widens `social_signals.provider` CHECK for Tier 2 prep.

**Tech Stack:** TypeScript, Supabase Postgres, Next.js, fast-xml-parser (existing)

---

### Task 1: Add "news" to SourceDef category type

**Files:**
- Modify: `lib/sources.ts:4`

**Step 1: Edit the category type union**

In `lib/sources.ts`, line 4, change:

```typescript
category: "government" | "airline" | "transport";
```

to:

```typescript
category: "government" | "airline" | "transport" | "news";
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors (existing errors may remain, but no new ones from this change)

**Step 3: Commit**

```bash
git add lib/sources.ts
git commit -m "feat: add news category to SourceDef type"
```

---

### Task 2: Add 8 new RSS news sources

**Files:**
- Modify: `lib/sources.ts:284` (append before closing bracket of OFFICIAL_SOURCES array)

**Step 1: Add the source definitions**

In `lib/sources.ts`, add these 8 entries to the end of the `OFFICIAL_SOURCES` array (before the final `];` on line 284):

```typescript
  {
    id: "gn_uae_flights",
    name: "Google News: UAE Flights",
    category: "news",
    url: "https://news.google.com/rss/search?q=UAE+flights+suspended+cancelled&hl=en-GB&gl=GB&ceid=GB:en",
    parser: "rss",
    connector: "rss",
    extractor_id: "rss_default",
    priority: 55,
    freshness_target_minutes: 10,
    region: "UAE",
  },
  {
    id: "gn_gulf_conflict",
    name: "Google News: Gulf Conflict",
    category: "news",
    url: "https://news.google.com/rss/search?q=Iran+war+Gulf+UAE+airspace&hl=en-GB&gl=GB&ceid=GB:en",
    parser: "rss",
    connector: "rss",
    extractor_id: "rss_default",
    priority: 55,
    freshness_target_minutes: 10,
    region: "Gulf region",
  },
  {
    id: "gn_strait_hormuz",
    name: "Google News: Strait of Hormuz",
    category: "news",
    url: "https://news.google.com/rss/search?q=Strait+Hormuz+shipping+flights&hl=en-GB&gl=GB&ceid=GB:en",
    parser: "rss",
    connector: "rss",
    extractor_id: "rss_default",
    priority: 50,
    freshness_target_minutes: 15,
    region: "Gulf region",
  },
  {
    id: "gn_dubai_airport",
    name: "Google News: Dubai Airport",
    category: "news",
    url: "https://news.google.com/rss/search?q=Dubai+airport+DXB+open+closed&hl=en-GB&gl=GB&ceid=GB:en",
    parser: "rss",
    connector: "rss",
    extractor_id: "rss_default",
    priority: 55,
    freshness_target_minutes: 10,
    region: "Dubai",
  },
  {
    id: "gn_india_dubai_travel",
    name: "Google News: India-Dubai Travel",
    category: "news",
    url: "https://news.google.com/rss/search?q=India+UAE+flights+advisory+travel&hl=en-GB&gl=GB&ceid=GB:en",
    parser: "rss",
    connector: "rss",
    extractor_id: "rss_default",
    priority: 45,
    freshness_target_minutes: 15,
    region: "India / UAE",
  },
  {
    id: "bbc_middle_east",
    name: "BBC News: Middle East",
    category: "news",
    url: "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml",
    parser: "rss",
    connector: "rss",
    extractor_id: "rss_default",
    priority: 60,
    freshness_target_minutes: 10,
    region: "Middle East",
  },
  {
    id: "aljazeera_news",
    name: "Al Jazeera News",
    category: "news",
    url: "https://www.aljazeera.com/xml/rss/all.xml",
    parser: "rss",
    connector: "rss",
    extractor_id: "rss_default",
    priority: 58,
    freshness_target_minutes: 10,
    region: "Global / Middle East",
  },
  {
    id: "uk_fcdo_iran",
    name: "UK FCDO Travel Advice — Iran",
    category: "news",
    url: "https://www.gov.uk/foreign-travel-advice/iran.atom",
    parser: "rss",
    connector: "rss",
    extractor_id: "rss_default",
    priority: 70,
    freshness_target_minutes: 15,
    region: "UK / Iran",
  },
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors from these additions

**Step 3: Verify source count**

Quick sanity check — the OFFICIAL_SOURCES array should now have 27 entries (was 19 + 8 new).

Run: `node -e "const s = require('./lib/sources'); console.log(s.OFFICIAL_SOURCES.length)"`

Note: This may not work if the module uses ESM-only syntax. If so, just verify by reading the file that all 8 entries are present.

**Step 4: Commit**

```bash
git add lib/sources.ts
git commit -m "feat: add 8 RSS news sources (Google News, BBC, Al Jazeera, FCDO Iran)"
```

---

### Task 3: Set confirmation_state to unconfirmed_social for news sources

**Files:**
- Modify: `lib/ingest.ts:340` (in `fetchRss` function)
- Modify: `lib/ingest.ts:517` (in error snapshot path)

**Step 1: Update fetchRss return**

In `lib/ingest.ts`, line 340, change:

```typescript
    confirmation_state: "confirmed",
```

to:

```typescript
    confirmation_state: source.category === "news" ? "unconfirmed_social" : "confirmed",
```

**Step 2: Update error snapshot path**

In `lib/ingest.ts`, line 517, change:

```typescript
        confirmation_state: "confirmed",
```

to:

```typescript
        confirmation_state: source.category === "news" ? "unconfirmed_social" : "confirmed",
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 4: Commit**

```bash
git add lib/ingest.ts
git commit -m "feat: set news sources as unconfirmed_social in ingest pipeline"
```

---

### Task 4: Create SQL migration to widen social_signals.provider

**Files:**
- Create: `supabase/migrations/20260304100000_widen_social_signals_provider.sql`

**Step 1: Write the migration**

Create `supabase/migrations/20260304100000_widen_social_signals_provider.sql`:

```sql
-- Widen social_signals.provider to support Telegram and RSS-item signals (Tier 2 prep)
alter table social_signals drop constraint social_signals_provider_check;
alter table social_signals add constraint social_signals_provider_check
  check (provider in ('x', 'telegram', 'rss_item'));
```

**Step 2: Update schema.sql to match**

In `supabase/schema.sql`, line 89, change:

```sql
  provider text not null check (provider in ('x')),
```

to:

```sql
  provider text not null check (provider in ('x', 'telegram', 'rss_item')),
```

This keeps the schema definition file in sync with the migration.

**Step 3: Commit**

```bash
git add supabase/migrations/20260304100000_widen_social_signals_provider.sql supabase/schema.sql
git commit -m "feat: widen social_signals.provider for telegram and rss_item (Tier 2 prep)"
```

---

### Task 5: Verify full build and test feeds

**Files:** None (verification only)

**Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds with no errors related to the changes

**Step 2: Manually verify a Google News RSS feed responds**

Run: `curl -s 'https://news.google.com/rss/search?q=UAE+flights+suspended+cancelled&hl=en-GB&gl=GB&ceid=GB:en' | head -20`
Expected: Valid RSS XML with `<rss>` root element and `<item>` entries

**Step 3: Manually verify BBC RSS feed responds**

Run: `curl -s 'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml' | head -20`
Expected: Valid RSS XML

**Step 4: Manually verify Al Jazeera RSS feed responds**

Run: `curl -s 'https://www.aljazeera.com/xml/rss/all.xml' | head -20`
Expected: Valid RSS XML

**Step 5: Commit (if any build fixes were needed)**

Only commit if fixes were required in earlier steps. Otherwise skip — all prior commits cover the changes.

---

### Task 6: Run migration against Supabase (if remote DB available)

**Files:** None (operational task)

**Step 1: Check if Supabase CLI is configured**

Run: `npx supabase status 2>/dev/null || echo "Supabase not configured locally"`

If Supabase is not configured or there's no remote access, skip this task — the migration file is ready to be applied manually or during next deployment.

**Step 2: Apply migration (if local Supabase is running)**

Run: `npx supabase db push`
Expected: Migration applied successfully

If remote-only, note: the migration needs to be applied via the Supabase dashboard SQL editor or `supabase db push --linked`.

**Step 3: Final commit (squash message)**

```bash
git add -A
git commit -m "feat: add news signal sources with schema prep for Tier 2

- 8 new RSS sources: 5 Google News queries, BBC, Al Jazeera, FCDO Iran
- News category with unconfirmed_social confirmation state
- Widened social_signals.provider for telegram/rss_item (Tier 2 prep)"
```

Only if there are uncommitted changes. Otherwise the per-task commits already cover everything.
