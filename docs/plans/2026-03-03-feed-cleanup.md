# Feed Quality Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix raw markdown artifacts, broken summaries, and low-signal content in the feed by cleaning Jina markdown globally, expanding unusable-content detection, and adding a summary-equals-name guard.

**Architecture:** Add a `stripMarkdown()` function that converts markdown syntax to plain text, called globally for all Jina content in `fetchTextWithFallback`. Expand `UNUSABLE_PATTERNS` to catch "File Not Found" and similar dead pages. Add a guard in `extractHtmlSnapshot` that marks snapshots unusable when the summary just echoes the source name.

**Tech Stack:** TypeScript, regex, existing `sanitizeSourceText` helper, Node.js test runner.

---

### Task 1: Add `stripMarkdown` function with tests

**Files:**
- Modify: `lib/source-extractors.ts:33` (add function after `stripJinaPrefix`)
- Modify: `lib/source-extractors.test.ts` (add tests at end of file)

**Step 1: Write the failing tests**

Append to `lib/source-extractors.test.ts`:

```typescript
import { stripMarkdown } from "./source-extractors.ts";

test("stripMarkdown removes image syntax", () => {
  assert.equal(stripMarkdown("Hello ![alt text](http://example.com/img.png) world"), "Hello  world");
});

test("stripMarkdown converts links to plain text", () => {
  assert.equal(stripMarkdown("Visit [Google](https://google.com) today"), "Visit Google today");
});

test("stripMarkdown removes setext underlines", () => {
  const input = "Heading\n========\nContent";
  assert.ok(!stripMarkdown(input).includes("========"));
  assert.ok(stripMarkdown(input).includes("Heading"));
  assert.ok(stripMarkdown(input).includes("Content"));
});

test("stripMarkdown strips ATX heading markers", () => {
  assert.equal(stripMarkdown("### Travel Updates"), "Travel Updates");
});

test("stripMarkdown strips list bullets", () => {
  const input = "* First item\n- Second item\n+ Third item";
  const result = stripMarkdown(input);
  assert.ok(result.includes("First item"));
  assert.ok(result.includes("Second item"));
  assert.ok(result.includes("Third item"));
  assert.ok(!result.includes("* "));
  assert.ok(!result.includes("- Second"));
  assert.ok(!result.includes("+ "));
});

test("stripMarkdown passes plain text unchanged", () => {
  const plain = "This is normal text with no markdown.";
  assert.equal(stripMarkdown(plain), plain);
});

test("stripMarkdown handles mixed markdown content", () => {
  const input = "# Welcome\n\n![logo](img.png)\n\nVisit [our site](http://example.com) for * updates\n- Item one\n- Item two";
  const result = stripMarkdown(input);
  assert.ok(!result.includes("!["));
  assert.ok(!result.includes("]("));
  assert.ok(result.includes("our site"));
  assert.ok(result.includes("Item one"));
});
```

**Step 2: Update the import line**

Change line 3 of `lib/source-extractors.test.ts` from:

```typescript
import { stripJinaPrefix } from "./source-extractors.ts";
```

to:

```typescript
import { stripJinaPrefix, stripMarkdown } from "./source-extractors.ts";
```

**Step 3: Run tests to verify they fail**

Run: `npx tsx --test lib/source-extractors.test.ts`
Expected: FAIL — `stripMarkdown` is not exported

**Step 4: Implement `stripMarkdown`**

Add this function in `lib/source-extractors.ts` right after `stripJinaPrefix` (after line 46):

```typescript
/**
 * Convert markdown syntax to plain text.
 * Called globally for all Jina-sourced content to prevent raw markdown
 * (links, images, headings, bullets, separators) from leaking into summaries.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")            // images: ![alt](url) → removed
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")          // links: [text](url) → text
    .replace(/^[=\-]{4,}\s*$/gm, "")                  // setext underlines: ==== / ----
    .replace(/^#{1,6}\s+/gm, "")                      // ATX heading markers: ### → removed
    .replace(/^\s*[*\-+]\s+/gm, "")                   // list bullets: * item → item
    .replace(/\n{3,}/g, "\n\n")                        // collapse excess newlines
    .trim();
}
```

**Step 5: Run tests to verify they pass**

Run: `npx tsx --test lib/source-extractors.test.ts`
Expected: All tests pass (7 existing + 7 new = 14 total)

**Step 6: Commit**

```bash
git add lib/source-extractors.ts lib/source-extractors.test.ts
git commit -m "feat: add stripMarkdown to clean Jina reader markdown syntax"
```

---

### Task 2: Wire `stripMarkdown` into the fetch pipeline

**Files:**
- Modify: `lib/ingest.ts:8` (update import)
- Modify: `lib/ingest.ts:190` (chain stripMarkdown after stripJinaPrefix)

**Step 1: Update the import**

Change line 8 of `lib/ingest.ts` from:

```typescript
import { extractHtmlSnapshot, stripJinaPrefix } from "./source-extractors";
```

to:

```typescript
import { extractHtmlSnapshot, stripJinaPrefix, stripMarkdown } from "./source-extractors";
```

**Step 2: Chain `stripMarkdown` in `fetchTextWithFallback`**

Change line 190 of `lib/ingest.ts` from:

```typescript
      const text = fromMirror ? stripJinaPrefix(rawText) : rawText;
```

to:

```typescript
      const text = fromMirror ? stripMarkdown(stripJinaPrefix(rawText)) : rawText;
```

**Step 3: Run all tests**

Run: `npx tsx --test lib/ingest.test.ts && npx tsx --test lib/source-extractors.test.ts`
Expected: All tests pass

**Step 4: Run build**

Run: `npx next build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add lib/ingest.ts
git commit -m "feat: wire stripMarkdown into Jina fetch pipeline

All Jina-sourced content now has markdown syntax converted to plain text
before reaching extractors. Fixes raw [link](url), ![image](url), and
navigation bullet artifacts in feed summaries."
```

---

### Task 3: Expand `UNUSABLE_PATTERNS` with tests

**Files:**
- Modify: `lib/source-quality.ts:1-27` (add patterns to array)
- Modify: `lib/source-quality.test.ts` (add tests)

**Step 1: Write the failing tests**

Append to `lib/source-quality.test.ts`:

```typescript
test("isUsableSnapshot rejects 'File Not Found' content", () => {
  assert.equal(isUsableSnapshot({ title: "UAE General Civil Aviation Authority", summary: "File Not Found", reliability: "reliable" }), false);
});

test("isUsableSnapshot rejects 'Page not found' content", () => {
  assert.equal(isUsableSnapshot({ title: "Some Source", summary: "The page you requested was not found on this server.", reliability: "reliable" }), false);
});

test("isUsableSnapshot rejects '404 Not Found' content", () => {
  assert.equal(isUsableSnapshot({ title: "404 Not Found", summary: "This page has been removed or is unavailable.", reliability: "reliable" }), false);
});
```

**Step 2: Run tests to verify they fail**

Run: `npx tsx --test lib/source-quality.test.ts`
Expected: 3 new tests FAIL (patterns not yet added)

**Step 3: Add the patterns**

In `lib/source-quality.ts`, add these lines after the existing `UNUSABLE_PATTERNS` entries (after line 26, before the closing `];`):

```typescript
  /file not found/i,
  /page not found/i,
  /404 not found/i,
  /page you requested was not found/i,
  /this page (is|has been) (removed|unavailable)/i,
```

**Step 4: Run tests to verify they pass**

Run: `npx tsx --test lib/source-quality.test.ts`
Expected: All tests pass (8 existing + 3 new = 11 total)

**Step 5: Commit**

```bash
git add lib/source-quality.ts lib/source-quality.test.ts
git commit -m "fix: reject 'File Not Found' and similar dead pages from feed

Adds patterns for common HTTP error page text to UNUSABLE_PATTERNS.
These snapshots are now marked unusable and hidden from the feed."
```

---

### Task 4: Add summary-equals-name guard with test

**Files:**
- Modify: `lib/source-extractors.ts:350-363` (add guard in `extractHtmlSnapshot`)
- Modify: `lib/source-extractors.test.ts` (add test)

**Step 1: Write the failing test**

Append to `lib/source-extractors.test.ts`:

```typescript
import { extractHtmlSnapshot } from "./source-extractors.ts";

test("extractHtmlSnapshot marks unusable when summary equals source name", () => {
  const source = {
    id: "test_source",
    name: "Bureau of Immigration - BOI",
    url: "https://example.com",
    category: "government",
    parser: "html" as const,
    connector: "direct_html" as const,
    extractor_id: "html_title_text",
    priority: 60,
    freshness_target_minutes: 30,
    region: "india" as const,
  };
  // Minimal HTML that will produce the source name as both title and summary
  const html = "<html><head><title>Bureau of Immigration - BOI</title></head><body><p>Bureau of Immigration - BOI</p></body></html>";
  const result = extractHtmlSnapshot(source, html);
  assert.equal(result.unusable, true);
});

test("extractHtmlSnapshot does not mark unusable when summary has real content", () => {
  const source = {
    id: "test_source",
    name: "Emirates Travel Updates",
    url: "https://example.com",
    category: "airline",
    parser: "html" as const,
    connector: "direct_html" as const,
    extractor_id: "html_title_text",
    priority: 90,
    freshness_target_minutes: 5,
    region: "uae" as const,
  };
  const html = '<html><head><title>Emirates Travel Updates</title><meta name="description" content="Check the latest travel advisories and flight schedule changes for Emirates airline."></head><body></body></html>';
  const result = extractHtmlSnapshot(source, html);
  assert.equal(result.unusable, false);
});
```

**Step 2: Update the import line**

The import for `extractHtmlSnapshot` needs to be added. Change the import at the top of `lib/source-extractors.test.ts` from:

```typescript
import { stripJinaPrefix, stripMarkdown } from "./source-extractors.ts";
```

to:

```typescript
import { stripJinaPrefix, stripMarkdown, extractHtmlSnapshot } from "./source-extractors.ts";
```

**Step 3: Run tests to verify the "unusable when summary equals name" test fails**

Run: `npx tsx --test lib/source-extractors.test.ts`
Expected: The "marks unusable when summary equals source name" test FAILS (no guard yet)

**Step 4: Add the guard**

In `lib/source-extractors.ts`, replace the `extractHtmlSnapshot` function (lines 350-363):

From:

```typescript
export function extractHtmlSnapshot(source: SourceDef, html: string): HtmlExtractResult {
  const extracted = extractBySource(source, html);
  const title = sanitizeSourceText(extracted.title || source.name);
  const summary = sanitizeSourceText(extracted.summary);
  const rawText = sanitizeSourceText(extracted.rawText).slice(0, 10000);
  const unusable = isUnusableSourceText(`${title} ${summary}`);
  return {
    title: title || source.name,
    summary: summary || rawText.slice(0, 1000),
    raw_text: rawText,
    published_at: extracted.publishedAt,
    unusable,
  };
}
```

To:

```typescript
export function extractHtmlSnapshot(source: SourceDef, html: string): HtmlExtractResult {
  const extracted = extractBySource(source, html);
  const title = sanitizeSourceText(extracted.title || source.name);
  const summary = sanitizeSourceText(extracted.summary);
  const rawText = sanitizeSourceText(extracted.rawText).slice(0, 10000);
  const nameOnly = summary.trim().toLowerCase() === source.name.trim().toLowerCase();
  const unusable = nameOnly || isUnusableSourceText(`${title} ${summary}`);
  return {
    title: title || source.name,
    summary: summary || rawText.slice(0, 1000),
    raw_text: rawText,
    published_at: extracted.publishedAt,
    unusable,
  };
}
```

**Step 5: Run tests to verify they pass**

Run: `npx tsx --test lib/source-extractors.test.ts`
Expected: All tests pass

**Step 6: Run full test suite + build**

Run: `npx tsx --test lib/ingest.test.ts && npx tsx --test lib/source-extractors.test.ts && npx tsx --test lib/source-quality.test.ts && npx next build`
Expected: All tests pass, build succeeds

**Step 7: Commit**

```bash
git add lib/source-extractors.ts lib/source-extractors.test.ts
git commit -m "fix: mark snapshots unusable when summary just echoes source name

Adds guard in extractHtmlSnapshot that catches cases like India BOI
where extraction yields nothing beyond the source's own name."
```

---

## Summary of changes

| File | Change | Lines |
|------|--------|-------|
| `lib/source-extractors.ts` | Add `stripMarkdown()` function | After line 46 (new function) |
| `lib/source-extractors.ts` | Add summary-equals-name guard in `extractHtmlSnapshot` | Lines 350-363 (modified) |
| `lib/source-extractors.test.ts` | Add `stripMarkdown` tests + `extractHtmlSnapshot` guard tests | End of file (new tests) |
| `lib/source-quality.ts` | Add 5 patterns to `UNUSABLE_PATTERNS` | Lines 1-27 (expanded) |
| `lib/source-quality.test.ts` | Add "File Not Found" rejection tests | End of file (new tests) |
| `lib/ingest.ts` | Import `stripMarkdown`, chain in `fetchTextWithFallback` | Lines 8, 190 (modified) |

**No new files.** No new dependencies. No API changes.
