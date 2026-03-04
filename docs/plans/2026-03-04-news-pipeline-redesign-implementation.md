# News RSS Pipeline Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace raw Google News headline concatenation with individual article storage + AI-generated topic summaries.

**Architecture:** Google News RSS sources (`gn_*`) get a separate ingestion path: individual articles stored as `social_signals` rows (provider='rss_item'), cross-source deduplication by article URL, and LLM cluster summarization for the display snapshot. Official RSS sources are untouched.

**Tech Stack:** TypeScript, Next.js, Supabase (Postgres), OpenAI gpt-4o-mini, fast-xml-parser, node:crypto

**Design doc:** `docs/plans/2026-03-04-news-pipeline-redesign-design.md`

---

### Task 1: Fix entity decoding in `cleanDesc`

The smallest, highest-impact fix. `cleanDesc` inside `formatRssSummary` strips HTML tags but doesn't decode entities like `&nbsp;`. The `decodeEntities` function already exists in `lib/source-extractors.ts`.

**Files:**
- Modify: `lib/source-extractors.ts` (export `decodeEntities`)
- Modify: `lib/ingest.ts:235` (add `decodeEntities` call in `cleanDesc`)
- Modify: `lib/ingest.test.ts` (add entity decoding test)

**Step 1: Write the failing test**

Add to `lib/ingest.test.ts`:

```typescript
test("formatRssSummary decodes HTML entities in descriptions", () => {
  const result = formatRssSummary([
    { title: "Dubai Update", description: "Airport open&nbsp;&nbsp;Emirates confirms", score: 1 },
  ]);
  assert.ok(!result.summary.includes("&nbsp;"), "should not contain &nbsp;");
  assert.ok(result.summary.includes("Airport open"), "should preserve text before entity");
  assert.ok(result.summary.includes("Emirates confirms"), "should preserve text after entity");
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/monkeyclaw/gulf-corridor-watch && npx tsx --test lib/ingest.test.ts`
Expected: FAIL — `&nbsp;` is still in the output

**Step 3: Export `decodeEntities` from `source-extractors.ts`**

In `lib/source-extractors.ts`, the `decodeEntities` function at line 13 is currently not exported. Add `export`:

```typescript
export function decodeEntities(input: string): string {
```

**Step 4: Add `decodeEntities` to `cleanDesc` in `lib/ingest.ts`**

Add import at top of `lib/ingest.ts`:

```typescript
import { extractHtmlSnapshot, stripJinaPrefix, stripMarkdown, decodeEntities } from "./source-extractors";
```

Change `cleanDesc` at line 235 from:

```typescript
const cleanDesc = (desc: string) => desc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);
```

To:

```typescript
const cleanDesc = (desc: string) => decodeEntities(desc.replace(/<[^>]+>/g, " ")).slice(0, 150);
```

Note: `decodeEntities` already collapses whitespace and trims, so the `.replace(/\s+/g, " ").trim()` is redundant after calling it.

**Step 5: Run test to verify it passes**

Run: `cd /Users/monkeyclaw/gulf-corridor-watch && npx tsx --test lib/ingest.test.ts`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add lib/source-extractors.ts lib/ingest.ts lib/ingest.test.ts
git commit -m "fix: decode HTML entities in RSS descriptions"
```

---

### Task 2: Add `stripGoogleNewsPublisher` function

Google News RSS titles follow the pattern `"Article Headline - Publisher Name"`. This function strips the publisher suffix. The split must use the LAST occurrence of ` - ` since headlines themselves may contain dashes.

**Files:**
- Modify: `lib/ingest.ts` (add function + export)
- Modify: `lib/ingest.test.ts` (add tests)

**Step 1: Write the failing tests**

Add to `lib/ingest.test.ts`:

```typescript
import { formatRssSummary, pickBestRssItemsScored, ingestSingleSource, stripGoogleNewsPublisher } from "./ingest.ts";

test("stripGoogleNewsPublisher strips publisher from standard title", () => {
  const result = stripGoogleNewsPublisher("Dubai airport open after strikes - Hindustan Times");
  assert.equal(result.headline, "Dubai airport open after strikes");
  assert.equal(result.publisher, "Hindustan Times");
});

test("stripGoogleNewsPublisher handles title with multiple dashes", () => {
  const result = stripGoogleNewsPublisher("Is Dubai Airport Open? Check Status - Report - NewsX");
  assert.equal(result.headline, "Is Dubai Airport Open? Check Status - Report");
  assert.equal(result.publisher, "NewsX");
});

test("stripGoogleNewsPublisher returns full title when no dash separator", () => {
  const result = stripGoogleNewsPublisher("Dubai airport remains operational");
  assert.equal(result.headline, "Dubai airport remains operational");
  assert.equal(result.publisher, "");
});

test("stripGoogleNewsPublisher handles pipe-separated publisher", () => {
  const result = stripGoogleNewsPublisher("Airport update | World News - Hindustan Times");
  assert.equal(result.headline, "Airport update | World News");
  assert.equal(result.publisher, "Hindustan Times");
});
```

Update the import line at top of test file to include `stripGoogleNewsPublisher`.

**Step 2: Run test to verify it fails**

Run: `cd /Users/monkeyclaw/gulf-corridor-watch && npx tsx --test lib/ingest.test.ts`
Expected: FAIL — `stripGoogleNewsPublisher` not exported

**Step 3: Implement the function**

Add to `lib/ingest.ts` after the `GULF_CORRIDOR_KEYWORDS` array (around line 221), before the `RssItem` type:

```typescript
export function stripGoogleNewsPublisher(title: string): { headline: string; publisher: string } {
  const idx = title.lastIndexOf(" - ");
  if (idx <= 0) return { headline: title.trim(), publisher: "" };
  return {
    headline: title.slice(0, idx).trim(),
    publisher: title.slice(idx + 3).trim(),
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/monkeyclaw/gulf-corridor-watch && npx tsx --test lib/ingest.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add lib/ingest.ts lib/ingest.test.ts
git commit -m "feat: add stripGoogleNewsPublisher for news title cleanup"
```

---

### Task 3: Create `lib/news-summarize.ts` — LLM cluster summarization

This module takes an array of cleaned article headlines + descriptions and produces a 2-3 sentence summary via gpt-4o-mini. It also provides a deterministic fallback when LLM is unavailable.

**Files:**
- Create: `lib/news-summarize.ts`
- Create: `lib/news-summarize.test.ts`

**Step 1: Write the failing tests**

Create `lib/news-summarize.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { buildNewsSummaryPrompt, parseNewsSummaryResponse, buildFallbackNewsSummary } from "./news-summarize.ts";

test("buildNewsSummaryPrompt includes source topic and article titles", () => {
  const prompt = buildNewsSummaryPrompt("Dubai Airport", [
    { headline: "DXB operations disrupted", description: "Flights cancelled after strikes" },
    { headline: "Emirates reports damage", description: "Minor damage, 4 staff injured" },
  ]);
  assert.ok(prompt.includes("Dubai Airport"));
  assert.ok(prompt.includes("DXB operations disrupted"));
  assert.ok(prompt.includes("Emirates reports damage"));
});

test("parseNewsSummaryResponse returns trimmed text for valid response", () => {
  const result = parseNewsSummaryResponse("  Dubai Airport remains disrupted after strikes.  ");
  assert.equal(result, "Dubai Airport remains disrupted after strikes.");
});

test("parseNewsSummaryResponse returns null for empty or EMPTY response", () => {
  assert.equal(parseNewsSummaryResponse(""), null);
  assert.equal(parseNewsSummaryResponse("EMPTY"), null);
  assert.equal(parseNewsSummaryResponse("   "), null);
});

test("parseNewsSummaryResponse returns null for too-short response", () => {
  assert.equal(parseNewsSummaryResponse("Short."), null);
});

test("buildFallbackNewsSummary returns first headline when only one item", () => {
  const result = buildFallbackNewsSummary("Dubai Airport", [
    { headline: "DXB closed after missile strikes", description: "" },
  ]);
  assert.equal(result, "DXB closed after missile strikes");
});

test("buildFallbackNewsSummary joins up to 3 headlines with semicolons", () => {
  const result = buildFallbackNewsSummary("Dubai Airport", [
    { headline: "DXB closed", description: "" },
    { headline: "Emirates suspends flights", description: "" },
    { headline: "Airspace closures reported", description: "" },
    { headline: "Fourth article ignored", description: "" },
  ]);
  assert.ok(result.includes("DXB closed"));
  assert.ok(result.includes("Emirates suspends flights"));
  assert.ok(result.includes("Airspace closures reported"));
  assert.ok(!result.includes("Fourth article"));
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/monkeyclaw/gulf-corridor-watch && npx tsx --test lib/news-summarize.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `lib/news-summarize.ts`**

```typescript
import OpenAI from "openai";

const NEWS_SUMMARY_MODEL = "gpt-4o-mini";

export type NewsArticleInput = {
  headline: string;
  description: string;
};

export function buildNewsSummaryPrompt(sourceTopic: string, articles: NewsArticleInput[]): string {
  const articleList = articles
    .slice(0, 6)
    .map((a, i) => `${i + 1}. ${a.headline}${a.description ? `\n   ${a.description}` : ""}`)
    .join("\n");

  return `You are summarizing news coverage about "${sourceTopic}" for travellers monitoring the India-UAE Gulf corridor.

Below are ${articles.length} recent news articles on this topic. Write a 2-3 sentence summary that captures the key facts relevant to travellers: what happened, current status, and practical impact on travel/flights.

Do NOT list individual articles. Synthesize into a coherent briefing. If the articles describe an ongoing crisis, lead with current status. Be factual and concise.

Articles:
${articleList}`;
}

export function parseNewsSummaryResponse(response: string): string | null {
  const trimmed = response.trim();
  if (!trimmed || trimmed.toUpperCase() === "EMPTY" || trimmed.length < 20) return null;
  return trimmed;
}

export function buildFallbackNewsSummary(sourceTopic: string, articles: NewsArticleInput[]): string {
  if (articles.length === 0) return `No current news for ${sourceTopic}`;
  if (articles.length === 1) return articles[0].headline;
  return articles.slice(0, 3).map((a) => a.headline).join("; ");
}

export async function summarizeNewsCluster(
  sourceTopic: string,
  articles: NewsArticleInput[],
): Promise<string> {
  if (articles.length === 0) return `No current news for ${sourceTopic}`;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return buildFallbackNewsSummary(sourceTopic, articles);

  try {
    const client = new OpenAI({ apiKey });
    const prompt = buildNewsSummaryPrompt(sourceTopic, articles);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await client.chat.completions.create(
        {
          model: NEWS_SUMMARY_MODEL,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 250,
          temperature: 0.2,
        },
        { signal: controller.signal },
      );

      const text = response.choices?.[0]?.message?.content ?? "";
      return parseNewsSummaryResponse(text) ?? buildFallbackNewsSummary(sourceTopic, articles);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return buildFallbackNewsSummary(sourceTopic, articles);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/monkeyclaw/gulf-corridor-watch && npx tsx --test lib/news-summarize.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add lib/news-summarize.ts lib/news-summarize.test.ts
git commit -m "feat: add news cluster summarization module"
```

---

### Task 4: Implement Google News RSS pipeline split in `fetchRss`

This is the core change. When `fetchRss` handles a `gn_*` source, it:
1. Parses RSS items as before
2. Strips publisher from each title, decodes entities in description
3. Stores individual articles as `social_signals` rows with cross-source dedup
4. Calls `summarizeNewsCluster` to generate the snapshot summary
5. Returns the snapshot with AI summary (not raw concatenation)

**Files:**
- Modify: `lib/ingest.ts` (modify `fetchRss`, add `storeNewsArticles` helper)

**Step 1: Write the failing test**

Add to `lib/ingest.test.ts`:

```typescript
import { formatRssSummary, pickBestRssItemsScored, ingestSingleSource, stripGoogleNewsPublisher, isGoogleNewsSource } from "./ingest.ts";

test("isGoogleNewsSource returns true for gn_ prefixed source ids", () => {
  assert.equal(isGoogleNewsSource({ id: "gn_dubai_airport", category: "news" } as any), true);
  assert.equal(isGoogleNewsSource({ id: "gn_uae_flights", category: "news" } as any), true);
});

test("isGoogleNewsSource returns false for non-gn sources", () => {
  assert.equal(isGoogleNewsSource({ id: "bbc_middle_east", category: "news" } as any), false);
  assert.equal(isGoogleNewsSource({ id: "us_state_dept_travel", category: "government" } as any), false);
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/monkeyclaw/gulf-corridor-watch && npx tsx --test lib/ingest.test.ts`
Expected: FAIL — `isGoogleNewsSource` not exported

**Step 3: Add `isGoogleNewsSource` and refactor `fetchRss`**

Add to `lib/ingest.ts` after `stripGoogleNewsPublisher`:

```typescript
export function isGoogleNewsSource(source: SourceDef): boolean {
  return source.id.startsWith("gn_") && source.category === "news";
}
```

Add import at top of file:

```typescript
import { summarizeNewsCluster } from "./news-summarize";
```

Add `storeNewsArticles` helper (after `isGoogleNewsSource`):

```typescript
type NewsArticleRow = {
  provider: "rss_item";
  handle: string;
  post_id: string;
  posted_at: string;
  text: string;
  text_original: string;
  text_en: string;
  url: string;
  keywords: string[];
  fetched_at: string;
  confidence: number;
  linked_source_id: string;
  language_original: null;
  translation_provider: null;
  translation_confidence: null;
  translation_status: "not_needed";
  content_hash: string | null;
  validation_state: "skipped";
  validation_score: null;
  validation_reason: string;
  validation_model: null;
  validated_at: null;
};

async function storeNewsArticles(
  source: SourceDef,
  scoredItems: ScoredRssItem[],
  rawItems: RssItem[],
): Promise<{ stored: NewsArticleRow[]; allClean: Array<{ headline: string; description: string }> }> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  // Build clean article data
  const allClean = scoredItems.map((item, i) => {
    const { headline } = stripGoogleNewsPublisher(item.title);
    const description = decodeEntities(item.description.replace(/<[^>]+>/g, " ")).slice(0, 300);
    return { headline, description };
  });

  // Build rows for insertion
  const rows: NewsArticleRow[] = [];
  for (let i = 0; i < scoredItems.length; i++) {
    const item = scoredItems[i];
    const raw = rawItems.find((r) => r.title === item.title);
    const articleUrl = raw?.link ?? "";
    if (!articleUrl) continue;

    const urlHash = createHash("sha256").update(articleUrl).digest("hex").slice(0, 32);
    const { headline } = stripGoogleNewsPublisher(item.title);
    const description = decodeEntities(item.description.replace(/<[^>]+>/g, " ")).slice(0, 300);
    const textForKeywords = `${headline} ${description}`.toLowerCase();
    const keywords = GULF_CORRIDOR_KEYWORDS.filter((kw) => textForKeywords.includes(kw));
    const confidence = keywords.length === 0 ? 0.2 : Math.min(0.92, 0.2 + keywords.length * 0.15);
    const posted = raw?.pubDate ? new Date(raw.pubDate).toISOString() : now;

    rows.push({
      provider: "rss_item",
      handle: source.id,
      post_id: urlHash,
      posted_at: posted,
      text: headline,
      text_original: item.title,
      text_en: description,
      url: articleUrl,
      keywords,
      fetched_at: now,
      confidence,
      linked_source_id: source.id,
      language_original: null,
      translation_provider: null,
      translation_confidence: null,
      translation_status: "not_needed",
      content_hash: null,
      validation_state: "skipped",
      validation_score: null,
      validation_reason: "News article — validation via cluster summary",
      validation_model: null,
      validated_at: null,
    });
  }

  if (rows.length === 0) return { stored: [], allClean };

  // Cross-source dedup: check which URL hashes already exist across ANY gn_* source
  const postIds = rows.map((r) => r.post_id);
  const { data: existing } = await supabase
    .from("social_signals")
    .select("post_id")
    .eq("provider", "rss_item")
    .in("post_id", postIds);
  const existingIds = new Set((existing ?? []).map((r: { post_id: string }) => r.post_id));
  const fresh = rows.filter((r) => !existingIds.has(r.post_id));

  if (fresh.length > 0) {
    const { error } = await supabase
      .from("social_signals")
      .upsert(fresh, { onConflict: "provider,handle,post_id", ignoreDuplicates: true });
    if (error) console.error(`storeNewsArticles error for ${source.id}:`, error.message);
  }

  return { stored: fresh, allClean };
}
```

Add import for `createHash` at top:

```typescript
import { createHash } from "crypto";
```

**Step 4: Modify `fetchRss` to branch on `isGoogleNewsSource`**

Replace the else-branch at the bottom of `fetchRss` (lines 316-320). The full function structure becomes:

In `fetchRss`, after `const hasRelevantItems` check and the `!hasRelevantItems` branch and `us_state_dept_travel` branch, change the final `else` block (lines 316-320) to:

```typescript
  } else if (isGoogleNewsSource(source)) {
    // Google News: store individual articles + generate AI summary
    const { allClean } = await storeNewsArticles(source, scoredItems, rawItems);
    const topicName = source.name.replace(/^Google News:\s*/i, "").trim();
    summary = await summarizeNewsCluster(topicName, allClean);
    title = allClean[0]?.headline
      ? `${topicName}: ${allClean[0].headline.slice(0, 80)}`
      : source.name;
  } else {
    const formatted = formatRssSummary(scoredItems);
    title = formatted.isBulletList ? source.name : (formatted.title || String(scoredItems[0]?.title ?? source.name));
    summary = formatted.summary;
  }
```

**Step 5: Run tests to verify everything passes**

Run: `cd /Users/monkeyclaw/gulf-corridor-watch && npx tsx --test lib/ingest.test.ts`
Expected: ALL PASS

**Step 6: Verify build**

Run: `cd /Users/monkeyclaw/gulf-corridor-watch && npx next build 2>&1 | tail -20`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add lib/ingest.ts lib/ingest.test.ts
git commit -m "feat: split Google News RSS into article storage + AI summary"
```

---

### Task 5: Add `'news'` to `UnifiedUpdateType` and update `source-quality.ts`

The unified types and feed quality filter need to know about the new `'news'` update type.

**Files:**
- Modify: `lib/unified-updates-types.ts:1` (add `'news'`)
- Modify: `lib/source-quality.ts:66-78` (accept `'news'` in `FeedItemLike`)

**Step 1: Update `UnifiedUpdateType`**

In `lib/unified-updates-types.ts`, change line 1:

```typescript
export type UnifiedUpdateType = "snapshot" | "x" | "news";
```

**Step 2: Update `FeedItemLike` type and `isUsableFeedItem`**

In `lib/source-quality.ts`, change the `FeedItemLike` type (line 65-70):

```typescript
export type FeedItemLike = {
  headline: string;
  summary: string;
  reliability: "reliable" | "degraded" | "blocked";
  update_type: "snapshot" | "x" | "news";
};
```

And in `isUsableFeedItem` (line 72-78), add `'news'` to the pass-through like X posts:

```typescript
export function isUsableFeedItem(item: FeedItemLike): boolean {
  if (item.update_type === "x" || item.update_type === "news") return true;
  if (item.reliability === "degraded" || item.reliability === "blocked") return false;
  if (!item.summary.trim()) return false;
  const merged = `${item.headline} ${item.summary}`;
  return !isUnusableSourceText(merged);
}
```

**Step 3: Verify build**

Run: `cd /Users/monkeyclaw/gulf-corridor-watch && npx next build 2>&1 | tail -20`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add lib/unified-updates-types.ts lib/source-quality.ts
git commit -m "feat: add 'news' to UnifiedUpdateType and feed quality filter"
```

---

### Task 6: Migration — update `unified_updates` view with `rss_item` branch

Add a third `UNION ALL` branch for news articles from `social_signals WHERE provider = 'rss_item'`.

**Files:**
- Create: `supabase/migrations/20260304120000_news_pipeline_view.sql`

**Step 1: Write the migration**

Create `supabase/migrations/20260304120000_news_pipeline_view.sql`:

```sql
-- News Pipeline: add rss_item social signals as 'news' update_type in unified view
drop view if exists unified_updates;

create view unified_updates as
with latest_source_meta as (
  select distinct on (source_id)
    source_id,
    source_name,
    priority
  from source_snapshots
  order by source_id, fetched_at desc
)

-- SNAPSHOTS BRANCH (unchanged)
select
  s.id::text as id,
  s.source_id,
  s.source_name,
  'snapshot'::text as update_type,
  coalesce(s.published_at, s.fetched_at) as event_at,
  s.fetched_at,
  s.title as headline,
  s.summary,
  s.source_url as original_url,
  s.validation_state,
  s.validation_score,
  s.confirmation_state,
  s.evidence_basis,
  s.status_level,
  s.reliability,
  s.priority
from source_snapshots s

union all

-- X POSTS BRANCH (unchanged)
select
  x.id::text as id,
  x.linked_source_id as source_id,
  coalesce(m.source_name, x.linked_source_id) as source_name,
  'x'::text as update_type,
  coalesce(x.posted_at, x.fetched_at) as event_at,
  x.fetched_at,
  ('@' || x.handle || ' on X')::text as headline,
  coalesce(nullif(x.text_en, ''), nullif(x.text_original, ''), x.text) as summary,
  x.url as original_url,
  x.validation_state,
  x.validation_score,
  'unconfirmed_social'::text as confirmation_state,
  case when cardinality(x.keywords) > 0 then 'x+official'::text else 'official_web'::text end as evidence_basis,
  coalesce(ls.status_level, 'unknown'::text) as status_level,
  'reliable'::text as reliability,
  coalesce(m.priority, 0) as priority
from social_signals x
left join latest_source_meta m on m.source_id = x.linked_source_id
left join latest_source_snapshots ls on ls.source_id = x.linked_source_id
where x.provider = 'x'

union all

-- NEWS ARTICLES BRANCH (new)
select
  n.id::text as id,
  n.linked_source_id as source_id,
  coalesce(m.source_name, n.linked_source_id) as source_name,
  'news'::text as update_type,
  coalesce(n.posted_at, n.fetched_at) as event_at,
  n.fetched_at,
  n.text as headline,
  coalesce(nullif(n.text_en, ''), n.text) as summary,
  n.url as original_url,
  n.validation_state,
  n.validation_score,
  'unconfirmed_social'::text as confirmation_state,
  'rss'::text as evidence_basis,
  coalesce(ls.status_level, 'unknown'::text) as status_level,
  'reliable'::text as reliability,
  coalesce(m.priority, 0) as priority
from social_signals n
left join latest_source_meta m on m.source_id = n.linked_source_id
left join latest_source_snapshots ls on ls.source_id = n.linked_source_id
where n.provider = 'rss_item';
```

Note: The existing X posts branch now needs `where x.provider = 'x'` to avoid double-counting `rss_item` rows. Previously it implicitly selected all social_signals because only X posts existed.

**Step 2: Commit**

```bash
git add supabase/migrations/20260304120000_news_pipeline_view.sql
git commit -m "feat: add news articles branch to unified_updates view"
```

**Step 3: Apply migration to Supabase**

Run: `cd /Users/monkeyclaw/gulf-corridor-watch && npx supabase db push`

Or if using remote: `npx supabase db push --linked`

Verify: Query the view in Supabase dashboard or via SQL: `SELECT update_type, count(*) FROM unified_updates GROUP BY update_type;`

---

### Task 7: Update `updates-feed.tsx` display for news items

Add "News" badge for news sources, show article count, and handle the `'news'` update type in the component.

**Files:**
- Modify: `app/components/updates-feed.tsx`

**Step 1: Update badge rendering**

In `updates-feed.tsx`, change the badge span (lines 158-162):

```typescript
<span className={`rounded-full px-2 py-0.5 ${
  item.update_type === "snapshot"
    ? item.source_id.startsWith("gn_")
      ? "bg-amber-100 text-amber-800"
      : "bg-blue-100 text-blue-800"
    : item.update_type === "news"
      ? "bg-amber-100 text-amber-800"
      : "bg-indigo-100 text-indigo-800"
}`}>
  {item.update_type === "snapshot"
    ? item.source_id.startsWith("gn_") ? "News" : "Official"
    : item.update_type === "news"
      ? "Article"
      : "Official X"}
</span>
```

This gives:
- `gn_*` snapshot cards (the AI summary) → amber "News" badge
- Individual news articles in history → amber "Article" badge
- Official source snapshots → blue "Official" badge (unchanged)
- X posts → indigo "Official X" badge (unchanged)

**Step 2: Verify build**

Run: `cd /Users/monkeyclaw/gulf-corridor-watch && npx next build 2>&1 | tail -20`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add app/components/updates-feed.tsx
git commit -m "feat: add News/Article badges for Google News sources in feed"
```

---

### Task 8: Verify full pipeline end-to-end

Run an ingestion cycle and verify the output is coherent.

**Step 1: Run build**

Run: `cd /Users/monkeyclaw/gulf-corridor-watch && npx next build 2>&1 | tail -20`
Expected: Build succeeds with no errors

**Step 2: Run all tests**

Run: `cd /Users/monkeyclaw/gulf-corridor-watch && npx tsx --test lib/ingest.test.ts lib/news-summarize.test.ts`
Expected: ALL PASS

**Step 3: Verify type consistency**

Run: `cd /Users/monkeyclaw/gulf-corridor-watch && npx tsc --noEmit 2>&1 | head -30`
Expected: No type errors

**Step 4: Commit any fixes if needed, then final commit**

```bash
git add -A
git commit -m "chore: verify news pipeline build and tests"
```
