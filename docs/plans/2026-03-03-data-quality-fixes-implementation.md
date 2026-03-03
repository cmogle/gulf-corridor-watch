# Data Quality Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix six production data quality issues: filter unusable snapshots from the feed, deduplicate entries, fix misleading badges, strip Jina markdown prefixes, and restructure RSS summaries as bullet points.

**Architecture:** Three layers — display-layer filtering in `loadUnifiedFeed()`, Jina prefix stripping in `fetchTextWithFallback()`, and RSS summary restructuring in `fetchRss()`. All changes are backward-compatible; the DB view stays untouched as an audit trail.

**Tech Stack:** TypeScript, Next.js 16, Node built-in test runner (`node:test`), Supabase

---

### Task 1: Add `isUsableFeedItem` filter function

**Files:**
- Modify: `lib/source-quality.ts:48-58`
- Create: `lib/source-quality.test.ts`

**Step 1: Write the failing tests**

Create `lib/source-quality.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { isUsableSnapshot, isUsableFeedItem } from "./source-quality.ts";

test("isUsableSnapshot rejects blocked reliability", () => {
  assert.equal(isUsableSnapshot({ title: "Emirates", summary: "Normal ops", reliability: "blocked" }), false);
});

test("isUsableSnapshot rejects fetch error text", () => {
  assert.equal(isUsableSnapshot({ title: "Emirates fetch error", summary: "Source fetch failed", reliability: "reliable" }), false);
});

test("isUsableSnapshot accepts normal content", () => {
  assert.equal(isUsableSnapshot({ title: "Emirates Travel Updates", summary: "All operations are running normally today.", reliability: "reliable" }), true);
});

test("isUsableFeedItem rejects degraded reliability", () => {
  assert.equal(isUsableFeedItem({ headline: "UAE MOFA", summary: "SEO boilerplate text here for testing", reliability: "degraded", update_type: "snapshot" }), false);
});

test("isUsableFeedItem rejects blocked reliability", () => {
  assert.equal(isUsableFeedItem({ headline: "Emirates", summary: "Access denied by CDN", reliability: "blocked", update_type: "snapshot" }), false);
});

test("isUsableFeedItem accepts reliable snapshot", () => {
  assert.equal(isUsableFeedItem({ headline: "Emirates Travel Updates", summary: "All operations running normally.", reliability: "reliable", update_type: "snapshot" }), true);
});

test("isUsableFeedItem always accepts x posts regardless of reliability", () => {
  assert.equal(isUsableFeedItem({ headline: "@rta_dubai on X", summary: "Service update", reliability: "degraded", update_type: "x" }), true);
});
```

**Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --no-warnings lib/source-quality.test.ts`
Expected: FAIL — `isUsableFeedItem` is not exported

**Step 3: Implement `isUsableFeedItem`**

Add to `lib/source-quality.ts` after the existing `isUsableSnapshot`:

```typescript
export type FeedItemLike = {
  headline: string;
  summary: string;
  reliability: "reliable" | "degraded" | "blocked";
  update_type: "snapshot" | "x";
};

export function isUsableFeedItem(item: FeedItemLike): boolean {
  if (item.update_type === "x") return true;
  if (item.reliability === "degraded" || item.reliability === "blocked") return false;
  const merged = `${item.headline} ${item.summary}`;
  return !isUnusableSourceText(merged);
}
```

**Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --no-warnings lib/source-quality.test.ts`
Expected: All 7 tests PASS

**Step 5: Commit**

```bash
git add lib/source-quality.ts lib/source-quality.test.ts
git commit -m "feat: add isUsableFeedItem for display-layer filtering"
```

---

### Task 2: Add feed deduplication utility

**Files:**
- Modify: `lib/unified-updates.ts`
- Create: `lib/unified-updates.test.ts` (new, separate from `unified-updates-types.test.ts`)

**Step 1: Write the failing tests**

Create `lib/unified-updates.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { deduplicateFeedItems } from "./unified-updates.ts";
import type { UnifiedUpdateItem } from "./unified-updates-types.ts";

function makeItem(overrides: Partial<UnifiedUpdateItem>): UnifiedUpdateItem {
  return {
    id: "1",
    source_id: "source",
    source_name: "Source",
    update_type: "snapshot",
    event_at: "2026-03-03T12:00:00.000Z",
    fetched_at: "2026-03-03T12:00:00.000Z",
    headline: "Headline",
    summary: "Summary text here that is long enough",
    original_url: "https://example.com",
    validation_state: "unvalidated",
    validation_score: null,
    confirmation_state: "confirmed",
    evidence_basis: "official_web",
    status_level: "normal",
    reliability: "reliable",
    priority: 50,
    ...overrides,
  };
}

test("deduplicateFeedItems removes same-source same-summary duplicates, keeps newest", () => {
  const items = [
    makeItem({ id: "newer", source_id: "uae_mofa", summary: "Same content", event_at: "2026-03-03T14:00:00Z" }),
    makeItem({ id: "older", source_id: "uae_mofa", summary: "Same content", event_at: "2026-03-03T12:00:00Z" }),
  ];
  const result = deduplicateFeedItems(items);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "newer");
});

test("deduplicateFeedItems keeps items from different sources with same summary", () => {
  const items = [
    makeItem({ id: "a", source_id: "emirates", summary: "Travel update" }),
    makeItem({ id: "b", source_id: "etihad", summary: "Travel update" }),
  ];
  const result = deduplicateFeedItems(items);
  assert.equal(result.length, 2);
});

test("deduplicateFeedItems keeps items from same source with different summaries", () => {
  const items = [
    makeItem({ id: "a", source_id: "uae_mofa", summary: "Statement on Iran" }),
    makeItem({ id: "b", source_id: "uae_mofa", summary: "Ambassador meeting" }),
  ];
  const result = deduplicateFeedItems(items);
  assert.equal(result.length, 2);
});

test("deduplicateFeedItems handles empty input", () => {
  assert.deepEqual(deduplicateFeedItems([]), []);
});
```

**Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --no-warnings lib/unified-updates.test.ts`
Expected: FAIL — `deduplicateFeedItems` not exported

**Step 3: Implement `deduplicateFeedItems`**

Add to `lib/unified-updates.ts` (exported, before `loadUnifiedFeed`):

```typescript
import { isUsableFeedItem } from "@/lib/source-quality";

export function deduplicateFeedItems(items: UnifiedUpdateItem[]): UnifiedUpdateItem[] {
  const seen = new Set<string>();
  const out: UnifiedUpdateItem[] = [];
  for (const item of items) {
    const key = `${item.source_id}:${item.summary.trim().toLowerCase().slice(0, 200)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
```

**Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --no-warnings lib/unified-updates.test.ts`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add lib/unified-updates.ts lib/unified-updates.test.ts
git commit -m "feat: add deduplicateFeedItems utility"
```

---

### Task 3: Wire filtering + deduplication into `loadUnifiedFeed`

**Files:**
- Modify: `lib/unified-updates.ts:22-32`

**Step 1: Write the failing test**

Append to `lib/unified-updates.test.ts`:

```typescript
test("filterAndDeduplicateFeed filters unusable items then deduplicates", () => {
  const items = [
    makeItem({ id: "good", source_id: "emirates", headline: "Emirates Travel Updates", summary: "All flights operating normally today.", reliability: "reliable" }),
    makeItem({ id: "fetch-err", source_id: "rta_dubai", headline: "RTA Dubai fetch error", summary: "Source fetch failed.", reliability: "degraded" }),
    makeItem({ id: "blocked", source_id: "etihad", headline: "Etihad", summary: "Access denied", reliability: "blocked" }),
    makeItem({ id: "dup-newer", source_id: "uae_mofa", headline: "MOFA", summary: "Statement on regional security.", event_at: "2026-03-03T14:00:00Z", reliability: "reliable" }),
    makeItem({ id: "dup-older", source_id: "uae_mofa", headline: "MOFA", summary: "Statement on regional security.", event_at: "2026-03-03T12:00:00Z", reliability: "reliable" }),
  ];
  const result = filterAndDeduplicateFeed(items);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((i) => i.id).sort(), ["dup-newer", "good"]);
});
```

Add the import at the top of the test file:

```typescript
import { deduplicateFeedItems, filterAndDeduplicateFeed } from "./unified-updates.ts";
```

**Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --no-warnings lib/unified-updates.test.ts`
Expected: FAIL — `filterAndDeduplicateFeed` not exported

**Step 3: Implement `filterAndDeduplicateFeed`**

Add to `lib/unified-updates.ts`:

```typescript
export function filterAndDeduplicateFeed(items: UnifiedUpdateItem[]): UnifiedUpdateItem[] {
  const usable = items.filter((item) =>
    isUsableFeedItem({
      headline: item.headline,
      summary: item.summary,
      reliability: item.reliability,
      update_type: item.update_type,
    }),
  );
  return deduplicateFeedItems(usable);
}
```

**Step 4: Update `loadUnifiedFeed` to use it**

In `loadUnifiedFeed()`, change the return line from:

```typescript
const mapped = ((data ?? []) as UnifiedUpdateRow[]).map(normalizeUnifiedUpdateRow);
return sortUnifiedUpdates(mapped).slice(0, pageSize);
```

To:

```typescript
const mapped = ((data ?? []) as UnifiedUpdateRow[]).map(normalizeUnifiedUpdateRow);
const cleaned = filterAndDeduplicateFeed(mapped);
return sortUnifiedUpdates(cleaned).slice(0, pageSize);
```

**Step 5: Run all tests to verify they pass**

Run: `node --experimental-strip-types --no-warnings lib/unified-updates.test.ts`
Expected: All 5 tests PASS

Also run existing tests:
Run: `node --experimental-strip-types --no-warnings lib/unified-updates-types.test.ts`
Expected: All existing tests still PASS

**Step 6: Commit**

```bash
git add lib/unified-updates.ts lib/unified-updates.test.ts
git commit -m "feat: wire filtering and deduplication into loadUnifiedFeed"
```

---

### Task 4: Fix validation badge logic — three-state system

**Files:**
- Modify: `app/components/updates-feed.tsx:157-167`

**Step 1: Implement the three-state badge**

Replace the validation badge span (lines 163-167) from:

```tsx
<span className={`rounded-full px-2 py-0.5 ${
  item.validation_state === "validated" ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"
}`}>
  {item.validation_state === "validated" ? "Verified" : "Unverified"}
</span>
```

To:

```tsx
{item.validation_state === "validated" ? (
  <span className="rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-800">Verified</span>
) : item.confirmation_state === "confirmed" ? (
  <span className="rounded-full px-2 py-0.5 bg-sky-100 text-sky-800">Official</span>
) : null}
```

This gives:
- `validation_state === "validated"` → green "Verified"
- `confirmation_state === "confirmed"` (official source, not GPT-validated) → blue "Official"
- Social/unconfirmed items → no badge (the "Official" / "Official X" update_type badge already identifies them)

**Step 2: Verify the build compiles**

Run: `npx next build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add app/components/updates-feed.tsx
git commit -m "fix: replace misleading Unverified badge with three-state system"
```

---

### Task 5: Add `stripJinaPrefix` function

**Files:**
- Modify: `lib/source-extractors.ts`
- Modify: `lib/source-quality.test.ts` (add Jina prefix tests here since `stripJinaPrefix` is a text-quality function, but it lives in extractors — create a new test file)
- Create: `lib/source-extractors.test.ts`

**Step 1: Write the failing tests**

Create `lib/source-extractors.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { stripJinaPrefix } from "./source-extractors.ts";

const JINA_RESPONSE = `Title: Oman Air
URL Source: http://www.omanair.com/om/en/travel-updates
Markdown Content:
Oman Air ===============

![Image 18: notification icon](http://ww...)

## Travel Updates

Important notice regarding flights.`;

test("stripJinaPrefix removes Title/URL Source/Markdown Content prefix", () => {
  const result = stripJinaPrefix(JINA_RESPONSE);
  assert.ok(!result.includes("Title: Oman Air"));
  assert.ok(!result.includes("URL Source:"));
  assert.ok(!result.includes("Markdown Content:"));
  assert.ok(result.includes("Oman Air ==============="));
  assert.ok(result.includes("## Travel Updates"));
});

test("stripJinaPrefix returns non-Jina text unchanged", () => {
  const html = "<html><body><h1>Hello</h1></body></html>";
  assert.equal(stripJinaPrefix(html), html);
});

test("stripJinaPrefix handles empty string", () => {
  assert.equal(stripJinaPrefix(""), "");
});

test("stripJinaPrefix handles partial Jina prefix (only Title line)", () => {
  const partial = "Title: Some Page\nActual content here";
  const result = stripJinaPrefix(partial);
  assert.ok(!result.includes("Title: Some Page"));
  assert.ok(result.includes("Actual content here"));
});

test("stripJinaPrefix does not strip Title: in middle of content", () => {
  const content = "Some heading\n\nTitle: this is a heading in the body\n\nMore content";
  const result = stripJinaPrefix(content);
  assert.equal(result, content);
});
```

**Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --no-warnings lib/source-extractors.test.ts`
Expected: FAIL — `stripJinaPrefix` not exported

**Step 3: Implement `stripJinaPrefix`**

Add to `lib/source-extractors.ts` (export it, place near the top after `decodeEntities`):

```typescript
/**
 * Strip the structured prefix that Jina reader (r.jina.ai) prepends to markdown output.
 * Format:
 *   Title: ...
 *   URL Source: ...
 *   Markdown Content:
 *   [actual content]
 *
 * Only strips when these lines appear at the very start of the text.
 */
export function stripJinaPrefix(text: string): string {
  if (!text.startsWith("Title: ")) return text;
  const stripped = text
    .replace(/^Title:\s*[^\n]*\n?/, "")
    .replace(/^URL Source:\s*[^\n]*\n?/, "")
    .replace(/^Markdown Content:\s*\n?/, "");
  return stripped;
}
```

**Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --no-warnings lib/source-extractors.test.ts`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add lib/source-extractors.ts lib/source-extractors.test.ts
git commit -m "feat: add stripJinaPrefix to sanitize Jina reader output"
```

---

### Task 6: Wire `stripJinaPrefix` into the fetch pipeline

**Files:**
- Modify: `lib/ingest.ts:180-205` (`fetchTextWithFallback`)

**Step 1: Import `stripJinaPrefix` in `ingest.ts`**

Add to the imports at top of `lib/ingest.ts`:

```typescript
import { stripJinaPrefix } from "./source-extractors";
```

Note: `extractHtmlSnapshot` is already imported from `"./source-extractors"`, so update the existing import line:

```typescript
import { extractHtmlSnapshot, stripJinaPrefix } from "./source-extractors";
```

**Step 2: Apply stripping in `fetchTextWithFallback`**

In `fetchTextWithFallback()`, after `const text = await res.text();` (line 189), add the Jina prefix stripping:

Change:

```typescript
const text = await res.text();
const reliable = inferReliability(text, res.status);
```

To:

```typescript
const rawText = await res.text();
const text = fromMirror ? stripJinaPrefix(rawText) : rawText;
const reliable = inferReliability(text, res.status);
```

**Step 3: Verify the build compiles**

Run: `npx next build`
Expected: Build succeeds

**Step 4: Run all existing tests to verify no regressions**

Run: `node --experimental-strip-types --no-warnings lib/source-extractors.test.ts && node --experimental-strip-types --no-warnings lib/source-quality.test.ts && node --experimental-strip-types --no-warnings lib/unified-updates.test.ts && node --experimental-strip-types --no-warnings lib/unified-updates-types.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add lib/ingest.ts
git commit -m "fix: strip Jina markdown prefix in fetchTextWithFallback"
```

---

### Task 7: Restructure RSS summary format — bullet points

**Files:**
- Modify: `lib/ingest.ts:227-314` (`pickBestRssItems` and `fetchRss`)

**Step 1: Write test for the new `formatRssSummary` function**

Create `lib/ingest.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { formatRssSummary } from "./ingest.ts";

test("formatRssSummary returns single item as direct headline + summary", () => {
  const result = formatRssSummary([
    { title: "Iran Level 4 - Do Not Travel", description: "Embassy advises all citizens to depart.", score: 3 },
  ]);
  assert.equal(result.title, "Iran Level 4 - Do Not Travel");
  assert.ok(result.summary.includes("Embassy advises"));
  assert.equal(result.isBulletList, false);
});

test("formatRssSummary returns multiple items as bullet list", () => {
  const result = formatRssSummary([
    { title: "Iran advisory", description: "Do not travel.", score: 3 },
    { title: "Lebanon advisory", description: "Reconsider travel.", score: 2 },
    { title: "Syria advisory", description: "Do not travel.", score: 2 },
  ]);
  assert.ok(result.summary.includes("- Iran advisory"));
  assert.ok(result.summary.includes("- Lebanon advisory"));
  assert.ok(result.summary.includes("- Syria advisory"));
  assert.equal(result.isBulletList, true);
});

test("formatRssSummary returns empty for no items", () => {
  const result = formatRssSummary([]);
  assert.equal(result.title, "");
  assert.equal(result.summary, "");
});

test("formatRssSummary strips HTML from descriptions", () => {
  const result = formatRssSummary([
    { title: "Update", description: "<p>Bold <b>text</b> here</p>", score: 1 },
  ]);
  assert.ok(!result.summary.includes("<p>"));
  assert.ok(!result.summary.includes("<b>"));
});

test("formatRssSummary caps at 4 bullet items", () => {
  const items = Array.from({ length: 6 }, (_, i) => ({
    title: `Advisory ${i + 1}`,
    description: `Description ${i + 1}`,
    score: 6 - i,
  }));
  const result = formatRssSummary(items);
  const bulletCount = (result.summary.match(/^- /gm) ?? []).length;
  assert.ok(bulletCount <= 4);
});
```

**Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --no-warnings lib/ingest.test.ts`
Expected: FAIL — `formatRssSummary` not exported

**Step 3: Implement `formatRssSummary`**

Add to `lib/ingest.ts` after `pickBestRssItems`:

```typescript
type ScoredRssItem = { title: string; description: string; score: number };

export function formatRssSummary(items: ScoredRssItem[]): { title: string; summary: string; isBulletList: boolean } {
  if (items.length === 0) return { title: "", summary: "", isBulletList: false };

  const cleanDesc = (desc: string) => desc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);

  if (items.length === 1) {
    const item = items[0];
    return {
      title: item.title,
      summary: cleanDesc(item.description),
      isBulletList: false,
    };
  }

  const top = items.slice(0, 4);
  const bullets = top.map((item) => {
    const desc = cleanDesc(item.description);
    return desc ? `- ${item.title}: ${desc}` : `- ${item.title}`;
  });

  return {
    title: "",
    summary: bullets.join("\n"),
    isBulletList: true,
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --no-warnings lib/ingest.test.ts`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add lib/ingest.ts lib/ingest.test.ts
git commit -m "feat: add formatRssSummary with bullet-point output"
```

---

### Task 8: Add minimum relevance threshold to `pickBestRssItems`

**Files:**
- Modify: `lib/ingest.ts:227-237` (`pickBestRssItems`)
- Modify: `lib/ingest.test.ts`

**Step 1: Write failing tests**

Append to `lib/ingest.test.ts`:

```typescript
import { pickBestRssItemsScored } from "./ingest.ts";

test("pickBestRssItemsScored returns scored items sorted by relevance", () => {
  const items = [
    { title: "Generic DOD press release", description: "Budget meeting" },
    { title: "Iran missile test near Gulf region", description: "CENTCOM reports activity near UAE" },
  ];
  const result = pickBestRssItemsScored(items);
  assert.ok(result[0].score > result[1].score);
  assert.ok(result[0].title.includes("Iran"));
});

test("pickBestRssItemsScored returns empty when no items", () => {
  assert.deepEqual(pickBestRssItemsScored([]), []);
});

test("pickBestRssItemsScored caps at maxItems", () => {
  const items = Array.from({ length: 10 }, (_, i) => ({
    title: `UAE item ${i}`,
    description: `Gulf region update ${i}`,
  }));
  const result = pickBestRssItemsScored(items, 3);
  assert.equal(result.length, 3);
});
```

**Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --no-warnings lib/ingest.test.ts`
Expected: FAIL — `pickBestRssItemsScored` not exported

**Step 3: Implement `pickBestRssItemsScored`**

Add a new exported version that returns scores alongside items. Keep the original `pickBestRssItems` as-is (it's used internally). Add after `pickBestRssItems`:

```typescript
export function pickBestRssItemsScored(items: RssItem[], maxItems = 6): ScoredRssItem[] {
  const scored = items.map((item) => {
    const text = `${item.title ?? ""} ${item.description ?? ""}`.toLowerCase();
    const score = GULF_CORRIDOR_KEYWORDS.reduce((acc, kw) => acc + (text.includes(kw) ? 1 : 0), 0);
    return { title: item.title ?? "", description: item.description ?? "", score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxItems);
}
```

**Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --no-warnings lib/ingest.test.ts`
Expected: All 8 tests PASS

**Step 5: Commit**

```bash
git add lib/ingest.ts lib/ingest.test.ts
git commit -m "feat: add pickBestRssItemsScored with relevance scores"
```

---

### Task 9: Wire new RSS formatting into `fetchRss`

**Files:**
- Modify: `lib/ingest.ts:239-314` (`fetchRss`)

**Step 1: Rewrite the summary-building section of `fetchRss`**

Replace the summary-building logic in `fetchRss` (lines 251-284). The new logic:

1. Use `pickBestRssItemsScored` instead of `pickBestRssItems`
2. Check if the best item has score > 0 (Gulf-relevant)
3. If no items are Gulf-relevant, mark as `reliability: "degraded"` with summary "No current Gulf-relevant advisories"
4. If items are relevant, use `formatRssSummary`

Replace from `const bestItems = pickBestRssItems(rawItems);` through the end of the `summary` assignment (line 284) with:

```typescript
  const scoredItems = pickBestRssItemsScored(rawItems);
  const hasRelevantItems = scoredItems.length > 0 && scoredItems[0].score > 0;
  let title: string;
  let summary: string;
  let rssReliability: Snapshot["reliability"] = inferReliability(xml, status);

  if (!hasRelevantItems) {
    title = source.name;
    summary = "No current Gulf-relevant advisories";
    rssReliability = "degraded";
  } else if (source.id === "us_state_dept_travel") {
    // Special handling: find elevated Gulf advisories
    const elevated = rawItems.filter((item) => {
      const t = (item.title ?? "").toLowerCase();
      return (t.includes("level 3") || t.includes("level 4") || t.includes("do not travel") || t.includes("reconsider")) &&
        GULF_CORRIDOR_KEYWORDS.some((k) => t.includes(k));
    });
    if (elevated.length > 0) {
      const countries = elevated.map((item) => {
        const t = item.title ?? "";
        return t.replace(/\s*-\s*Level\s*\d+.*$/i, "").trim();
      });
      title = `US Travel Advisories: ${countries.slice(0, 4).join(", ")}${countries.length > 4 ? ` +${countries.length - 4} more` : ""} elevated`;
      const formatted = formatRssSummary(
        elevated.map((item) => ({
          title: item.title ?? "",
          description: item.description ?? "",
          score: 1,
        })),
      );
      summary = formatted.summary;
    } else {
      const formatted = formatRssSummary(scoredItems);
      title = formatted.title || source.name;
      summary = formatted.summary;
    }
  } else {
    const formatted = formatRssSummary(scoredItems);
    title = formatted.title || String(scoredItems[0]?.title ?? source.name);
    summary = formatted.summary;
  }
```

Then update the `reliability` field in the returned snapshot object to use `rssReliability` instead of `inferReliability(xml, status)`.

**Step 2: Run all tests**

Run: `node --experimental-strip-types --no-warnings lib/ingest.test.ts`
Expected: All tests PASS

Run: `node --experimental-strip-types --no-warnings lib/source-quality.test.ts && node --experimental-strip-types --no-warnings lib/unified-updates.test.ts && node --experimental-strip-types --no-warnings lib/unified-updates-types.test.ts && node --experimental-strip-types --no-warnings lib/source-extractors.test.ts`
Expected: All tests PASS

**Step 3: Verify the build**

Run: `npx next build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add lib/ingest.ts
git commit -m "fix: restructure RSS summaries as bullet points with relevance threshold"
```

---

### Task 10: Verify the feed API route uses the filtered path

**Files:**
- Read: `app/api/updates/feed/route.ts`

**Step 1: Verify `route.ts` calls `loadUnifiedFeed`**

The feed API route at `app/api/updates/feed/route.ts` calls `loadUnifiedFeed(limit)` which now includes filtering and deduplication. No changes needed — it already goes through the corrected path.

**Step 2: Verify build succeeds end-to-end**

Run: `npx next build`
Expected: Build succeeds

**Step 3: Run all tests**

Run all test files:
```bash
node --experimental-strip-types --no-warnings lib/source-quality.test.ts && \
node --experimental-strip-types --no-warnings lib/source-extractors.test.ts && \
node --experimental-strip-types --no-warnings lib/unified-updates.test.ts && \
node --experimental-strip-types --no-warnings lib/unified-updates-types.test.ts && \
node --experimental-strip-types --no-warnings lib/current-state-brief.test.ts && \
node --experimental-strip-types --no-warnings lib/ingest.test.ts
```
Expected: All tests PASS

**Step 4: Commit (if any cleanup was needed)**

No commit needed if no changes were made.

---

### Task 11: Final verification and summary commit

**Step 1: Run full test suite one final time**

```bash
node --experimental-strip-types --no-warnings lib/source-quality.test.ts && \
node --experimental-strip-types --no-warnings lib/source-extractors.test.ts && \
node --experimental-strip-types --no-warnings lib/unified-updates.test.ts && \
node --experimental-strip-types --no-warnings lib/unified-updates-types.test.ts && \
node --experimental-strip-types --no-warnings lib/current-state-brief.test.ts && \
node --experimental-strip-types --no-warnings lib/ingest.test.ts
```

**Step 2: Run build**

```bash
npx next build
```

**Step 3: Verify git status is clean**

```bash
git status
```

All changes should already be committed in individual task commits.
