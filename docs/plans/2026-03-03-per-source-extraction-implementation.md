# Per-Source Extraction Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the batch ingestion pipeline with per-source endpoints and add DOM cleanup + LLM fallback extraction so that HTML sources produce usable summaries instead of page navigation chrome.

**Architecture:** One dynamic Next.js route `/api/ingest/[sourceId]` dispatches to per-source logic. Each source is independently scheduled via Vercel cron at its own frequency. Extraction runs cleaned DOM through existing extractors, with a cheap LLM fallback (GPT-4o-mini) when structured extraction still fails quality checks. The old batch endpoint stays as a manual re-ingest trigger.

**Tech Stack:** Next.js 15 (App Router), Supabase, OpenAI SDK (already in deps), Node built-in test runner (`node --test`)

---

### Task 1: DOM Cleanup Module

**Files:**
- Create: `lib/dom-cleanup.ts`
- Create: `lib/dom-cleanup.test.ts`

**Step 1: Write failing tests**

In `lib/dom-cleanup.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { cleanDom } from "./dom-cleanup.ts";

test("cleanDom strips <nav> tags and contents", () => {
  const html = '<html><body><nav><ul><li>Home</li><li>About</li></ul></nav><main><p>Real content here.</p></main></body></html>';
  const result = cleanDom(html);
  assert.ok(!result.includes("Home"));
  assert.ok(!result.includes("About"));
  assert.ok(result.includes("Real content here."));
});

test("cleanDom strips <header> and <footer> tags", () => {
  const html = '<header><div>Skip to main content</div></header><article><p>Flight operations normal.</p></article><footer>Copyright 2026</footer>';
  const result = cleanDom(html);
  assert.ok(!result.includes("Skip to main content"));
  assert.ok(!result.includes("Copyright 2026"));
  assert.ok(result.includes("Flight operations normal."));
});

test("cleanDom strips <aside>, <script>, <style>, <noscript>", () => {
  const html = '<aside>Sidebar ad</aside><script>var x=1;</script><style>.foo{}</style><noscript>Enable JS</noscript><div><p>Important update about flights.</p></div>';
  const result = cleanDom(html);
  assert.ok(!result.includes("Sidebar ad"));
  assert.ok(!result.includes("var x=1"));
  assert.ok(!result.includes(".foo"));
  assert.ok(!result.includes("Enable JS"));
  assert.ok(result.includes("Important update about flights."));
});

test("cleanDom strips elements with boilerplate class names", () => {
  const html = '<div class="cookie-banner">Accept cookies</div><div class="breadcrumb">Home > News</div><div class="content"><p>Travel advisory issued today.</p></div>';
  const result = cleanDom(html);
  assert.ok(!result.includes("Accept cookies"));
  assert.ok(!result.includes("Home > News"));
  assert.ok(result.includes("Travel advisory issued today."));
});

test("cleanDom strips elements with role=banner, role=navigation, role=contentinfo", () => {
  const html = '<div role="banner">Site header</div><div role="navigation">Nav links</div><div role="main"><p>Advisory content here.</p></div><div role="contentinfo">Footer info</div>';
  const result = cleanDom(html);
  assert.ok(!result.includes("Site header"));
  assert.ok(!result.includes("Nav links"));
  assert.ok(!result.includes("Footer info"));
  assert.ok(result.includes("Advisory content here."));
});

test("cleanDom preserves <main> and <article> content", () => {
  const html = '<nav>Menu</nav><main><article><h1>Breaking News</h1><p>UAE airspace update.</p></article></main>';
  const result = cleanDom(html);
  assert.ok(result.includes("Breaking News"));
  assert.ok(result.includes("UAE airspace update."));
});

test("cleanDom returns full body when no boilerplate tags present", () => {
  const html = '<html><body><h1>Simple Page</h1><p>Content without any nav or header tags.</p></body></html>';
  const result = cleanDom(html);
  assert.ok(result.includes("Simple Page"));
  assert.ok(result.includes("Content without any nav or header tags."));
});

test("cleanDom handles empty input", () => {
  assert.equal(cleanDom(""), "");
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test lib/dom-cleanup.test.ts`
Expected: FAIL — module `./dom-cleanup.ts` not found

**Step 3: Implement cleanDom**

In `lib/dom-cleanup.ts`:

```typescript
/**
 * Strip boilerplate HTML elements (nav, header, footer, cookie banners, etc.)
 * leaving only content-bearing markup. Works on raw HTML strings using regex
 * since we don't have a DOM parser in the serverless environment.
 */

// Tags whose entire content should be removed
const STRIP_TAGS = ["nav", "header", "footer", "aside", "script", "style", "noscript"];

// Class/id substrings that indicate boilerplate containers
const BOILERPLATE_CLASSES = [
  "cookie", "banner", "breadcrumb", "sidebar", "menu",
  "skip-to", "skip-link", "skipnav", "site-header", "site-footer",
  "nav-bar", "navbar", "navigation", "masthead", "toolbar",
];

// ARIA roles that indicate non-content regions
const BOILERPLATE_ROLES = ["banner", "navigation", "contentinfo", "complementary"];

export function cleanDom(html: string): string {
  if (!html) return "";

  let cleaned = html;

  // Strip known boilerplate tags and their contents
  for (const tag of STRIP_TAGS) {
    const pattern = new RegExp(`<${tag}[\\s>][\\s\\S]*?<\\/${tag}>`, "gi");
    cleaned = cleaned.replace(pattern, " ");
  }

  // Strip self-closing variants too (e.g. <script ... />)
  for (const tag of STRIP_TAGS) {
    const pattern = new RegExp(`<${tag}[^>]*/\\s*>`, "gi");
    cleaned = cleaned.replace(pattern, " ");
  }

  // Strip divs/sections with boilerplate class or id
  for (const keyword of BOILERPLATE_CLASSES) {
    const pattern = new RegExp(
      `<(div|section|span|ul|ol)\\b[^>]*(?:class|id)="[^"]*${keyword}[^"]*"[^>]*>[\\s\\S]*?</\\1>`,
      "gi",
    );
    cleaned = cleaned.replace(pattern, " ");
  }

  // Strip elements with boilerplate ARIA roles
  for (const role of BOILERPLATE_ROLES) {
    const pattern = new RegExp(
      `<\\w+[^>]*role=["']${role}["'][^>]*>[\\s\\S]*?</\\w+>`,
      "gi",
    );
    cleaned = cleaned.replace(pattern, " ");
  }

  return cleaned;
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test lib/dom-cleanup.test.ts`
Expected: All 8 tests PASS

**Step 5: Commit**

```bash
git add lib/dom-cleanup.ts lib/dom-cleanup.test.ts
git commit -m "feat: add DOM cleanup module to strip boilerplate HTML"
```

---

### Task 2: Tighten Quality Checks

**Files:**
- Modify: `lib/source-quality.ts` (add two new checks)
- Modify: `lib/source-quality.test.ts` (add tests)

**Step 1: Write failing tests**

Append to `lib/source-quality.test.ts`:

```typescript
import { isLowConfidenceExtraction } from "./source-quality.ts";

test("isLowConfidenceExtraction returns true for summary under 50 chars", () => {
  assert.equal(isLowConfidenceExtraction("Short.", "Emirates Travel Updates"), true);
});

test("isLowConfidenceExtraction returns true when summary overlaps 90%+ with source name", () => {
  assert.equal(
    isLowConfidenceExtraction("Emirates Travel Updates information", "Emirates Travel Updates"),
    true,
  );
});

test("isLowConfidenceExtraction returns false for substantive summary", () => {
  assert.equal(
    isLowConfidenceExtraction(
      "All flights from Dubai International are operating on schedule. Passengers are advised to check gate information.",
      "Emirates Travel Updates",
    ),
    false,
  );
});

test("isLowConfidenceExtraction returns true for mostly non-alphabetic text", () => {
  assert.equal(isLowConfidenceExtraction("* A+ A A- *** --- === |||  ### >>>", "Some Source"), true);
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test lib/source-quality.test.ts`
Expected: FAIL — `isLowConfidenceExtraction` not exported

**Step 3: Implement isLowConfidenceExtraction**

Add to `lib/source-quality.ts` (after the existing `isUsableFeedItem` function at line 78):

```typescript
/**
 * Detect low-confidence extractions that pass unusability checks
 * but are still too poor to display as reliable content.
 * Used to trigger LLM fallback extraction.
 */
export function isLowConfidenceExtraction(summary: string, sourceName: string): boolean {
  const cleaned = sanitizeSourceText(summary);

  // Too short to be meaningful
  if (cleaned.length < 50) return true;

  // Mostly non-alphabetic (nav chrome, symbols, formatting artifacts)
  const alphaChars = cleaned.replace(/[^a-zA-Z]/g, "").length;
  if (alphaChars / Math.max(cleaned.length, 1) < 0.2) return true;

  // Summary word overlap with source name > 90%
  const summaryWords = new Set(cleaned.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const nameWords = new Set(sourceName.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (summaryWords.size > 0 && nameWords.size > 0) {
    const overlap = [...summaryWords].filter(w => nameWords.has(w)).length;
    if (overlap / summaryWords.size > 0.9) return true;
  }

  return false;
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test lib/source-quality.test.ts`
Expected: All tests PASS (existing + 4 new)

**Step 5: Commit**

```bash
git add lib/source-quality.ts lib/source-quality.test.ts
git commit -m "feat: add isLowConfidenceExtraction quality check"
```

---

### Task 3: LLM Extraction Fallback Module

**Files:**
- Create: `lib/llm-extract.ts`
- Create: `lib/llm-extract.test.ts`

**Step 1: Write failing tests**

In `lib/llm-extract.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { buildExtractionPrompt, parseExtractionResponse, LLM_EXTRACT_MAX_PER_CYCLE } from "./llm-extract.ts";

test("buildExtractionPrompt includes source name and truncated text", () => {
  const prompt = buildExtractionPrompt("Emirates Travel Updates", "Here is some page content about flights being delayed.");
  assert.ok(prompt.includes("Emirates Travel Updates"));
  assert.ok(prompt.includes("flights being delayed"));
});

test("buildExtractionPrompt truncates text to 4000 chars", () => {
  const longText = "A".repeat(10000);
  const prompt = buildExtractionPrompt("Test Source", longText);
  assert.ok(prompt.length < 5000);
});

test("parseExtractionResponse returns null for EMPTY response", () => {
  assert.equal(parseExtractionResponse("EMPTY"), null);
  assert.equal(parseExtractionResponse("  EMPTY  "), null);
  assert.equal(parseExtractionResponse("EMPTY\n"), null);
});

test("parseExtractionResponse returns trimmed summary for real content", () => {
  const response = "  All flights from DXB are operating normally. No delays reported.  ";
  assert.equal(parseExtractionResponse(response), "All flights from DXB are operating normally. No delays reported.");
});

test("parseExtractionResponse returns null for very short response", () => {
  assert.equal(parseExtractionResponse("OK"), null);
});

test("LLM_EXTRACT_MAX_PER_CYCLE is a reasonable budget", () => {
  assert.ok(LLM_EXTRACT_MAX_PER_CYCLE >= 3 && LLM_EXTRACT_MAX_PER_CYCLE <= 10);
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test lib/llm-extract.test.ts`
Expected: FAIL — module not found

**Step 3: Implement llm-extract**

In `lib/llm-extract.ts`:

```typescript
import OpenAI from "openai";

export const LLM_EXTRACT_MAX_PER_CYCLE = 5;

const EXTRACTION_MODEL = "gpt-4o-mini";

export function buildExtractionPrompt(sourceName: string, pageText: string): string {
  const truncated = pageText.slice(0, 4000);
  return `You are extracting news content from the "${sourceName}" web page.

The page text below may contain navigation menus, cookie banners, and other boilerplate mixed with actual content.

Extract the key news, travel updates, or advisories from this page. Return a 1-3 sentence summary of actionable information relevant to travellers or aviation.

If there is no meaningful news or travel content on this page, respond with exactly: EMPTY

Page text:
${truncated}`;
}

export function parseExtractionResponse(response: string): string | null {
  const trimmed = response.trim();
  if (!trimmed || trimmed.toUpperCase() === "EMPTY" || trimmed.length < 10) return null;
  return trimmed;
}

export async function llmExtractSummary(
  sourceName: string,
  pageText: string,
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const client = new OpenAI({ apiKey });
  const prompt = buildExtractionPrompt(sourceName, pageText);

  const response = await client.chat.completions.create({
    model: EXTRACTION_MODEL,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 300,
    temperature: 0.2,
  });

  const text = response.choices?.[0]?.message?.content ?? "";
  return parseExtractionResponse(text);
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test lib/llm-extract.test.ts`
Expected: All 6 tests PASS (only tests pure functions, not the async OpenAI call)

**Step 5: Commit**

```bash
git add lib/llm-extract.ts lib/llm-extract.test.ts
git commit -m "feat: add LLM extraction fallback module"
```

---

### Task 4: Wire DOM Cleanup into Extraction

**Files:**
- Modify: `lib/source-extractors.ts` (line 216-221, `extractBase` function)
- Modify: `lib/source-extractors.test.ts` (add cleanup test)

**Step 1: Write failing test**

Append to `lib/source-extractors.test.ts`:

```typescript
test("extractHtmlSnapshot strips nav chrome before extraction", () => {
  const source = {
    id: "test_source",
    name: "Air Arabia Travel Updates",
    url: "https://example.com",
    category: "airline" as const,
    parser: "html" as const,
    connector: "direct_html" as const,
    extractor_id: "html_title_text" as const,
    priority: 85,
    freshness_target_minutes: 10,
    region: "UAE",
  };
  const html = `<html><head><title>Air Arabia Travel Updates</title>
    <meta name="description" content="Check the latest travel alerts and flight status for Air Arabia.">
  </head><body>
    <nav><ul><li>LOGIN</li><li>United Arab Emirates</li><li>AED</li><li>en</li></ul></nav>
    <header><div>Skip to main content</div></header>
    <main><p>Check the latest travel alerts and flight status for Air Arabia.</p></main>
    <footer>Copyright 2026 Air Arabia</footer>
  </body></html>`;
  const result = extractHtmlSnapshot(source, html);
  // Should get the meta description or main content, not nav chrome
  assert.ok(!result.summary.includes("LOGIN"));
  assert.ok(!result.summary.includes("Skip to main content"));
  assert.ok(result.summary.includes("travel alerts"));
});
```

**Step 2: Run test to verify it fails**

Run: `node --test lib/source-extractors.test.ts`
Expected: FAIL — the current extraction grabs nav chrome into the summary

**Step 3: Wire cleanDom into extractBase**

In `lib/source-extractors.ts`, add import at top (line 2):

```typescript
import { cleanDom } from "./dom-cleanup";
```

Then modify `extractBase` (line 216-221) to clean HTML before stripping tags:

```typescript
function extractBase(source: SourceDef, html: string): { pageTitle: string; rawText: string; publishedAt: string | null } {
  const pageTitle = readTitleTag(html) ?? source.name;
  const cleaned = cleanDom(html);
  const rawText = stripHtml(cleaned).slice(0, 10000);
  const publishedAt = readDate(html);
  return { pageTitle, rawText, publishedAt };
}
```

Also modify `extractBySource` to pass cleaned HTML to tag readers. At the start of `extractBySource` (line 223), add:

```typescript
function extractBySource(source: SourceDef, html: string): { title: string; summary: string; publishedAt: string | null; rawText: string } {
  const base = extractBase(source, html);
  const cleaned = cleanDom(html);
```

Then in each extractor branch, replace calls like `readTagTexts(html, ...)`, `readAnchorsWithKeywords(html, ...)`, `readJsonLdTextCandidates(html, ...)` to use `cleaned` instead of `html` for tag/anchor/paragraph reads. Keep `readMeta(html, ...)` and `readTitleTag(html)` reading from original `html` since meta tags are in `<head>` (not stripped).

Specifically, for each extractor block:
- `readMeta(html, ...)` → stays as `html` (meta tags in head)
- `readTagTexts(html, ...)` → change to `readTagTexts(cleaned, ...)`
- `readAnchorsWithKeywords(html, ...)` → change to `readAnchorsWithKeywords(cleaned, ...)`
- `readJsonLdTextCandidates(html, ...)` → stays as `html` (JSON-LD in script tags, already stripped by cleanDom)

Wait — JSON-LD is inside `<script>` tags which `cleanDom` strips. We need to extract JSON-LD *before* cleaning. Adjust approach:

Keep `readJsonLdTextCandidates(html, ...)` reading from original `html` (before cleanup), and only pass `cleaned` to tag/anchor readers.

**Step 4: Run all tests to verify they pass**

Run: `node --test lib/source-extractors.test.ts`
Expected: All tests PASS (existing + new)

Run: `node --test lib/dom-cleanup.test.ts`
Expected: All tests still PASS

**Step 5: Commit**

```bash
git add lib/source-extractors.ts lib/source-extractors.test.ts
git commit -m "feat: wire DOM cleanup into HTML extraction pipeline"
```

---

### Task 5: Extract `ingestSingleSource` from `ingest.ts`

**Files:**
- Modify: `lib/ingest.ts`

This task refactors the core of `ingest.ts` to expose `ingestSingleSource()` as the unit of work. This function handles: fetch → extract → quality check → LLM fallback → validate → persist for one source.

**Step 1: Write failing test**

Append to `lib/ingest.test.ts`:

```typescript
import { ingestSingleSource } from "./ingest.ts";

test("ingestSingleSource is exported as a function", () => {
  assert.equal(typeof ingestSingleSource, "function");
});
```

**Step 2: Run test to verify it fails**

Run: `node --test lib/ingest.test.ts`
Expected: FAIL — `ingestSingleSource` not exported

**Step 3: Implement ingestSingleSource**

Add to `lib/ingest.ts`:

1. Add imports at top:

```typescript
import { isLowConfidenceExtraction } from "./source-quality";
import { llmExtractSummary, LLM_EXTRACT_MAX_PER_CYCLE } from "./llm-extract";
```

2. Export `ingestSingleSource` as a new function (add after `fetchSource`, before `runIngestion`). This extracts the per-source logic from the batch pipeline:

```typescript
export async function ingestSingleSource(source: SourceDef): Promise<{
  snapshot: Snapshot;
  llm_fallback_used: boolean;
}> {
  const supabase = getSupabaseAdmin();

  // Fetch
  const snapshot = await fetchSource(source);

  // LLM fallback if extraction is low confidence but not already degraded/blocked
  let llmFallbackUsed = false;
  if (
    snapshot.reliability === "reliable" &&
    isLowConfidenceExtraction(snapshot.summary, source.name)
  ) {
    const llmSummary = await llmExtractSummary(source.name, snapshot.raw_text);
    if (llmSummary) {
      snapshot.summary = llmSummary;
      llmFallbackUsed = true;
    } else {
      snapshot.reliability = "degraded";
      snapshot.block_reason = "No extractable content (LLM fallback returned empty)";
      snapshot.summary = "Source page content was unavailable or non-usable in this fetch. Open Official source for live details.";
      snapshot.status_level = "unknown";
    }
  }

  // Validate
  const latestMap = await loadLatestSnapshotValidationBySource(supabase, [source.id]);
  const contentHash = computeUpdateContentHash({
    source_id: snapshot.source_id,
    update_type: "snapshot",
    headline: snapshot.title,
    summary: snapshot.summary,
    original_url: snapshot.source_url,
  });
  const previous = latestMap.get(source.id);
  let validated: Snapshot;
  if (previous?.content_hash && previous.content_hash === contentHash) {
    validated = withValidation(snapshot, contentHash, {
      validation_state: previous.validation_state,
      validation_score: previous.validation_score,
      validation_reason: previous.validation_reason,
      validation_model: previous.validation_model,
      validated_at: previous.validated_at,
    });
  } else if (/fetch error/i.test(snapshot.title)) {
    validated = withValidation(snapshot, contentHash, skippedValidation("Skipped GPT validation for fetch-error snapshot"));
  } else {
    const validation = await validateOfficialUpdate({
      source_id: snapshot.source_id,
      update_type: "snapshot",
      headline: snapshot.title,
      summary: snapshot.summary,
      original_url: snapshot.source_url,
      raw_text: snapshot.raw_text,
    });
    validated = withValidation(snapshot, contentHash, validation);
  }

  // Persist
  const { error } = await supabase.from("source_snapshots").insert([validated]);
  if (error) throw error;

  return { snapshot: validated, llm_fallback_used: llmFallbackUsed };
}
```

Note: `loadLatestSnapshotValidationBySource`, `withValidation`, `skippedValidation`, and `computeUpdateContentHash` are already defined in `ingest.ts` — no new imports needed for those. The `snapshot` variable needs to be `let` not `const` since we may mutate it in the LLM fallback path. Adjust the `fetchSource` return or destructure accordingly.

**Step 4: Run tests to verify they pass**

Run: `node --test lib/ingest.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add lib/ingest.ts lib/ingest.test.ts
git commit -m "feat: extract ingestSingleSource as core unit of work"
```

---

### Task 6: Create the Dynamic Route

**Files:**
- Create: `app/api/ingest/[sourceId]/route.ts`

**Step 1: Write the route handler**

```typescript
import { OFFICIAL_SOURCES } from "@/lib/sources";
import { ingestSingleSource } from "@/lib/ingest";

export const maxDuration = 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  const { sourceId } = await params;
  const key = new URL(req.url).searchParams.get("key");

  if (process.env.INGEST_SECRET && key !== process.env.INGEST_SECRET) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const source = OFFICIAL_SOURCES.find((s) => s.id === sourceId);
  if (!source) {
    return Response.json({ ok: false, error: `Unknown source: ${sourceId}` }, { status: 404 });
  }

  try {
    const result = await ingestSingleSource(source);
    return Response.json({
      ok: true,
      source_id: source.id,
      reliability: result.snapshot.reliability,
      llm_fallback_used: result.llm_fallback_used,
      summary_preview: result.snapshot.summary.slice(0, 200),
    });
  } catch (error) {
    return Response.json({ ok: false, source_id: source.id, error: String(error) }, { status: 500 });
  }
}
```

**Step 2: Test manually with build**

Run: `npm run build`
Expected: Build succeeds with no errors. The dynamic route `/api/ingest/[sourceId]` is compiled.

**Step 3: Commit**

```bash
git add app/api/ingest/\[sourceId\]/route.ts
git commit -m "feat: add per-source dynamic ingest route"
```

---

### Task 7: Refactor Batch Endpoint to Use `ingestSingleSource`

**Files:**
- Modify: `app/api/ingest/route.ts`
- Modify: `lib/ingest.ts` (keep `runIngestion` but simplify to loop over `ingestSingleSource`)

**Step 1: Simplify runIngestion**

Replace the body of `runIngestion` in `lib/ingest.ts` to loop over `ingestSingleSource` for the source-fetching portion, keeping flight/X/brief logic:

```typescript
export async function runIngestion(opts?: { scope?: IngestScope }) {
  const scope = opts?.scope ?? "full";
  const supabase = getSupabaseAdmin();
  const sources = getSourcesForScope(scope);

  const results: Array<{ source_id: string; reliability: string; llm_fallback_used: boolean; error?: string }> = [];

  for (const source of sources) {
    try {
      const result = await ingestSingleSource(source);
      results.push({
        source_id: source.id,
        reliability: result.snapshot.reliability,
        llm_fallback_used: result.llm_fallback_used,
      });
    } catch (error) {
      results.push({
        source_id: source.id,
        reliability: "degraded",
        llm_fallback_used: false,
        error: String(error),
      });
    }
  }

  // Flight observations (keep existing logic)
  let flightCount = 0;
  let flightError: string | null = null;
  // ... [keep existing flight ingestion code from lines 542-575 unchanged]

  // X signal polling (keep existing logic)
  let signalCount = 0;
  let signalError: string | null = null;
  let signalSkipped = false;
  let signalSkipReason: string | null = null;
  // ... [keep existing X polling code from lines 577-662 unchanged]

  // Brief regeneration (keep existing logic)
  let briefRegenerated: boolean | null = null;
  let briefReason: string | null = null;
  let briefError: string | null = null;
  // ... [keep existing brief code from lines 664-671 unchanged]

  return {
    scope,
    count: results.length,
    results,
    flight_count: flightCount,
    flight_error: flightError,
    signal_count: signalCount,
    signal_error: signalError,
    signal_skipped: signalSkipped,
    signal_skip_reason: signalSkipReason,
    brief_regenerated: briefRegenerated,
    brief_reason: briefReason,
    brief_error: briefError,
  };
}
```

The batch endpoint `app/api/ingest/route.ts` stays unchanged — it still calls `runIngestion()`.

**Step 2: Run existing tests**

Run: `node --test lib/ingest.test.ts`
Expected: All tests PASS

**Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add lib/ingest.ts app/api/ingest/route.ts
git commit -m "refactor: simplify runIngestion to loop over ingestSingleSource"
```

---

### Task 8: Update Vercel Cron Configuration

**Files:**
- Modify: `vercel.json`

**Step 1: Replace cron entries**

Replace the entire `vercel.json` with per-source scheduling. Group sources by their `freshness_target_minutes`:

```json
{
  "crons": [
    { "path": "/api/brief/refresh?key=@ingest_secret", "schedule": "*/5 * * * *" },

    { "path": "/api/ingest/emirates_updates?key=@ingest_secret", "schedule": "*/5 * * * *" },
    { "path": "/api/ingest/etihad_advisory?key=@ingest_secret", "schedule": "*/5 * * * *" },
    { "path": "/api/ingest/flydubai_updates?key=@ingest_secret", "schedule": "*/5 * * * *" },
    { "path": "/api/ingest/gcaa_uae?key=@ingest_secret", "schedule": "*/5 * * * *" },
    { "path": "/api/ingest/rta_dubai?key=@ingest_secret", "schedule": "*/5 * * * *" },

    { "path": "/api/ingest/uae_mofa?key=@ingest_secret", "schedule": "*/10 * * * *" },
    { "path": "/api/ingest/white_house_statements?key=@ingest_secret", "schedule": "*/10 * * * *" },
    { "path": "/api/ingest/us_dod_releases?key=@ingest_secret", "schedule": "*/10 * * * *" },
    { "path": "/api/ingest/us_centcom_news?key=@ingest_secret", "schedule": "*/10 * * * *" },
    { "path": "/api/ingest/oman_air?key=@ingest_secret", "schedule": "*/10 * * * *" },
    { "path": "/api/ingest/air_arabia_updates?key=@ingest_secret", "schedule": "*/10 * * * *" },

    { "path": "/api/ingest/us_state_dept_travel?key=@ingest_secret", "schedule": "*/15 * * * *" },
    { "path": "/api/ingest/visit_dubai_news?key=@ingest_secret", "schedule": "*/15 * * * *" },
    { "path": "/api/ingest/india_mea?key=@ingest_secret", "schedule": "*/15 * * * *" },
    { "path": "/api/ingest/india_immigration_boi?key=@ingest_secret", "schedule": "*/15 * * * *" },
    { "path": "/api/ingest/qatar_airways_updates?key=@ingest_secret", "schedule": "*/15 * * * *" },

    { "path": "/api/ingest/australia_dfat_uae?key=@ingest_secret", "schedule": "*/30 * * * *" },
    { "path": "/api/ingest/canada_gac_uae?key=@ingest_secret", "schedule": "*/30 * * * *" },
    { "path": "/api/ingest/uk_fcdo_uae?key=@ingest_secret", "schedule": "*/15 * * * *" }
  ],
  "functions": {
    "app/api/ingest/[sourceId]/route.ts": {
      "maxDuration": 60
    },
    "app/api/ingest/route.ts": {
      "maxDuration": 300
    },
    "app/api/chat/route.ts": {
      "maxDuration": 60
    }
  }
}
```

Note: `uk_fcdo_uae` has `freshness_target_minutes: 15` not 30, so it stays at `*/15`.

**Step 2: Verify JSON is valid**

Run: `node -e 'JSON.parse(require("fs").readFileSync("vercel.json","utf8")); console.log("OK")'`
Expected: `OK`

**Step 3: Verify cron count**

Run: `node -e 'const v=JSON.parse(require("fs").readFileSync("vercel.json","utf8")); console.log("Cron entries:", v.crons.length)'`
Expected: `Cron entries: 20` (1 brief + 19 sources)

**Step 4: Commit**

```bash
git add vercel.json
git commit -m "feat: replace batch cron with per-source scheduling"
```

---

### Task 9: Run Full Test Suite and Build

**Files:** None (verification only)

**Step 1: Run all tests**

Run: `node --test lib/dom-cleanup.test.ts lib/source-quality.test.ts lib/llm-extract.test.ts lib/source-extractors.test.ts lib/ingest.test.ts lib/unified-updates.test.ts lib/unified-updates-types.test.ts lib/current-state-brief.test.ts`

Expected: All tests PASS

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript or Next.js errors

**Step 3: Commit any fixups if needed**

---

### Task 10: Deploy, Clear Data, and Verify

**Step 1: Push to origin**

Run: `git push origin main`

**Step 2: Wait for Vercel deployment**

Run: `npx vercel ls 2>&1 | head -8`
Expected: New deployment shows "Ready" status within 2 minutes

**Step 3: Clear old snapshots**

Run the same truncate script from earlier:

```javascript
node -e '
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
(async () => {
  const { error } = await sb.from("source_snapshots").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) { console.error(error); process.exit(1); }
  console.log("Cleared");
})();
'
```

**Step 4: Trigger a single source to test**

Run: `curl -s "https://www.keepcalmandcarryon.help/api/ingest/emirates_updates?key=m7Vq2pX9Kc4Rz1Nf8Lh6Tg3Wb5Yd0Sa"`
Expected: JSON with `ok: true`, `reliability`, `summary_preview` showing real content (not nav chrome)

**Step 5: Trigger full batch re-ingest**

Run: `curl -s "https://www.keepcalmandcarryon.help/api/ingest?key=m7Vq2pX9Kc4Rz1Nf8Lh6Tg3Wb5Yd0Sa&scope=full"`
Expected: All 19 sources ingested, most showing improved summaries

**Step 6: Verify in UI**

Open the feed in the browser and confirm:
- No nav chrome in summaries ("LOGIN", "Skip to main content", "A+ A A-" etc. gone)
- Sources with real content show real content
- Sources with no extractable content show "degraded" not fake reliable content
