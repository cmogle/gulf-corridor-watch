# Feed Quality Cleanup Design

**Goal:** Fix raw markdown artifacts, broken summaries, and low-signal content in the LATEST UPDATES feed by cleaning Jina markdown globally, expanding unusable-content detection, and improving per-source extractors.

---

## Problem

When Jina reader converts JavaScript-rendered sites to markdown, the raw markdown syntax flows into summaries:
- Navigation links: `* [Skip to main content](#main)`
- Image syntax: `![Image 1: Ar Arabia](http://...)`
- Separator lines: `==============`
- Sources echoing their own name as the summary (India BOI)
- Dead pages returning "File Not Found" (UAE GCAA)

Root cause: `stripJinaPrefix` removes Jina header metadata but not markdown syntax in the body. `stripHtml` only strips HTML tags, not markdown. No patterns catch "File Not Found" or name-only summaries.

## Design

### 1. `stripMarkdown` function (lib/source-extractors.ts)

New exported function that converts markdown syntax to plain text:
- `![alt](url)` → removed (images meaningless as text)
- `[text](url)` → `text` (keep link text, drop URL)
- `====` / `----` setext underlines → removed
- `### ` ATX heading markers → removed (keep heading text)
- `* ` / `- ` / `+ ` list bullets → removed (keep item text)
- Collapse excess newlines

Called globally for all Jina content in `fetchTextWithFallback`, chained after `stripJinaPrefix`:
```
const text = fromMirror ? stripMarkdown(stripJinaPrefix(rawText)) : rawText;
```

### 2. Expanded UNUSABLE_PATTERNS (lib/source-quality.ts)

Add patterns to reject dead/error pages:
- `/file not found/i`
- `/page not found/i`
- `/404 not found/i`
- `/page you requested was not found/i`
- `/this page (is|has been) (removed|unavailable)/i`

These get caught by `isUnusableSourceText` → `isUsableSnapshot` → hidden from feed.

### 3. Summary-equals-name guard (lib/source-extractors.ts)

In `extractHtmlSnapshot`, after building the summary, check if it just matches the source name:
```typescript
const nameOnly = summary.trim().toLowerCase() === source.name.trim().toLowerCase();
const unusable = nameOnly || isUnusableSourceText(`${title} ${summary}`);
```

Catches India BOI and any future source where extraction yields nothing useful.

### 4. Per-source extractor notes

- **india_boi_home:** After `stripMarkdown`, ATX heading markers are gone so `readJinaHeadings` won't match them. This extractor needs no code changes — the summary-equals-name guard handles the fallback case.
- **india_mea_press:** Navigation lines won't be detected as setext headings after underline stripping. Naturally fixed.
- **GCAA (html_title_text):** "File Not Found" caught by new UNUSABLE_PATTERNS. No extractor changes needed.

## Testing

- Unit tests for `stripMarkdown`: images, links, underlines, headings, bullets, plain text passthrough
- Unit tests for new unusable patterns: "File Not Found", "Page not found", "404 Not Found"
- Unit test for summary-equals-name guard
- Full test suite + build verification after each task

## Files changed

| File | Change |
|------|--------|
| `lib/source-extractors.ts` | Add `stripMarkdown()`, summary-equals-name guard in `extractHtmlSnapshot` |
| `lib/source-extractors.test.ts` | Add `stripMarkdown` tests, summary-equals-name test |
| `lib/source-quality.ts` | Add 5 patterns to `UNUSABLE_PATTERNS` |
| `lib/ingest.ts` | Wire `stripMarkdown` into `fetchTextWithFallback` import + call |

No new files. No new dependencies. No API changes.
