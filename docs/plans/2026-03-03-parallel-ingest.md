# Parallel Ingestion Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Parallelize the source-fetch phase of `runIngestion()` so the full ingest completes within Vercel's 300s function timeout (currently ~25 min sequential).

**Architecture:** Extract a `fetchSource()` helper that fetches a single source and catches errors internally (always returns a `Snapshot`). Replace the sequential `for...of` loop with `Promise.allSettled()` to fetch all 19 sources concurrently. Validation remains sequential after all fetches complete, preserving budget enforcement. Rest of the pipeline (flights, X polling, brief generation) stays sequential.

**Tech Stack:** TypeScript, Node.js `fetch`, `Promise.allSettled`, existing `fetchRss`/`fetchHtml` helpers.

---

### Task 1: Extract `fetchSource` helper function

**Files:**
- Modify: `lib/ingest.ts:480-538` (extract logic from the loop body)

**Context:**
The current loop at lines 480-538 does two things per source:
1. Fetches the source (RSS or HTML), catching errors to build a failure snapshot
2. Validates the snapshot and pushes it to the array

We need to separate concern #1 into its own function. The function must _always_ return a `Snapshot` — it catches fetch errors internally and returns a failure snapshot instead of throwing.

**Step 1: Add `fetchSource` function above `runIngestion`**

Insert this function at line 419 (after `getSourcesForScope`, before `runIngestion`):

```typescript
async function fetchSource(source: SourceDef): Promise<Snapshot> {
  try {
    return source.parser === "rss" ? await fetchRss(source) : await fetchHtml(source);
  } catch (error) {
    const errorText = String(error);
    const blocked = /403|401|429|denied|rejected|forbidden|captcha/i.test(errorText);
    return {
      source_id: source.id,
      source_name: source.name,
      source_url: source.url,
      category: source.category,
      fetched_at: new Date().toISOString(),
      published_at: null,
      title: `${source.name} fetch error`,
      summary: blocked
        ? "Source currently blocked or challenge-protected. Open Official source for live details."
        : "Source fetch failed during ingestion. Open Official source for live details.",
      raw_text: "",
      status_level: "unknown",
      ingest_method: source.parser === "rss" ? "rss" : "official_web",
      reliability: blocked ? "blocked" : "degraded",
      block_reason: blocked ? errorText.slice(0, 200) : null,
      priority: source.priority,
      freshness_target_minutes: source.freshness_target_minutes,
      evidence_basis: source.parser === "rss" ? "rss" : "official_web",
      confirmation_state: "confirmed",
      content_hash: null,
      validation_state: "unvalidated",
      validation_score: null,
      validation_reason: null,
      validation_model: null,
      validated_at: null,
    };
  }
}
```

This is an exact extraction of the error-handling logic from the existing `catch` block (lines 496-536). No behavior change.

**Step 2: Run existing tests to confirm no regressions**

Run: `npx tsx --test lib/ingest.test.ts`
Expected: All 8 tests pass (the new function is internal, no exports changed)

**Step 3: Run build**

Run: `npx next build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add lib/ingest.ts
git commit -m "refactor: extract fetchSource helper from ingestion loop"
```

---

### Task 2: Replace sequential loop with parallel fetch + sequential validate

**Files:**
- Modify: `lib/ingest.ts:480-538` (replace `for...of` loop)

**Context:**
The key insight: each source has a unique `source_id`, so there are no cross-source read/write conflicts on `latestSnapshotValidation`. The only shared mutable state that matters across sources is `validationRuns` — we solve this by deferring all validation to a sequential phase after parallel fetching.

**Step 1: Replace lines 480-538 with parallel fetch + sequential validate**

Delete the entire `for (const source of sources) { ... }` block (lines 480-538) and replace with:

```typescript
  // Phase 1: Fetch all sources in parallel
  const fetchResults = await Promise.allSettled(
    sources.map((source) => fetchSource(source))
  );

  // Phase 2: Validate sequentially (respects validation budget)
  for (const result of fetchResults) {
    if (result.status === "rejected") continue; // fetchSource never rejects; defensive skip
    const snapshot = result.value;
    const validated = await validateSnapshot(snapshot);
    snapshots.push(validated);
    latestSnapshotValidation.set(snapshot.source_id, {
      source_id: snapshot.source_id,
      content_hash: validated.content_hash,
      validation_state: validated.validation_state,
      validation_score: validated.validation_score,
      validation_reason: validated.validation_reason,
      validation_model: validated.validation_model,
      validated_at: validated.validated_at,
      fetched_at: validated.fetched_at,
    });
  }
```

**Why this works:**
- `fetchSource` catches all errors and returns a failure `Snapshot` — it never rejects.
- `Promise.allSettled` runs all 19 fetches concurrently. Network I/O is the bottleneck (~30-90s per source sequentially → ~30-90s total in parallel).
- Validation runs sequentially after, so `validationRuns` counter is safe — no races.
- `latestSnapshotValidation` was pre-loaded from DB (lines 426-429). Each source_id is unique, so no cross-source conflicts.

**Step 2: Run existing tests**

Run: `npx tsx --test lib/ingest.test.ts`
Expected: All 8 tests pass

**Step 3: Run build**

Run: `npx next build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add lib/ingest.ts
git commit -m "perf: parallelize source fetching with Promise.allSettled

Replace sequential for...of loop with parallel fetch phase followed by
sequential validation. Reduces ~25min runtime to ~60-90s for 19 sources.
Validation budget enforcement preserved via sequential post-fetch phase."
```

---

### Task 3: Verify end-to-end (manual smoke test)

**Step 1: Run the full test suite**

Run: `npx tsx --test lib/ingest.test.ts`
Expected: All 8 tests pass

**Step 2: Run production build**

Run: `npx next build`
Expected: Build succeeds with no type errors

**Step 3: (Optional) Local integration test**

If env vars are available, verify the actual pipeline runs:

```bash
export $(grep -v '^#' .env.local | xargs) && npx tsx -e "
  const { runIngestion } = require('./lib/ingest');
  runIngestion({ scope: 'full' }).then(r => {
    console.log('count:', r.count, 'validation_runs:', r.validation_runs);
    console.log('Done in parallel!');
  }).catch(console.error);
"
```

Expected: Completes in under 120s (vs ~25 min previously). Should report `count: 19` snapshots.

---

## Summary of changes

| File | Change | Lines |
|------|--------|-------|
| `lib/ingest.ts` | Add `fetchSource()` helper | ~line 419 (new function) |
| `lib/ingest.ts` | Replace sequential loop with `Promise.allSettled` + sequential validate | Lines 480-538 (replaced) |

**No new files.** No new dependencies. No API changes — `runIngestion()` returns the same shape. The `vercel.json` `maxDuration: 300` is already configured.

**Performance model:**
- Before: 19 sources × ~60-90s each = ~20-28 min (sequential)
- After: max(all 19 fetches) + validation ≈ 60-90s fetch + ~20s validation = **~80-110s total**
