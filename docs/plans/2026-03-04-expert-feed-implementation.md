# Expert Commentary Feed — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a curated expert analyst X/Twitter feed panel to the dashboard, monitoring ~25 accounts for Iran conflict / Gulf disruption commentary with hybrid keyword+LLM relevance scoring and LLM-generated digest summaries.

**Architecture:** Fully separate module from the existing official X signal pipeline. Own DB tables (`expert_signals`, `expert_digests`), own ingestion module (`lib/expert-feed-ingest.ts`), own API routes, own frontend component. Reuses the same X API v2 bearer token and Supabase admin client patterns.

**Tech Stack:** Next.js API routes, Supabase PostgreSQL, X API v2, OpenAI GPT-4o-mini, React 19 client component, Tailwind CSS 4.

**Design doc:** `docs/plans/2026-03-04-expert-commentary-feed-design.md`

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260304_expert_feed.sql`

**Step 1: Write migration SQL**

```sql
-- Expert commentary feed tables
create table expert_signals (
  id uuid primary key default gen_random_uuid(),
  handle text not null,
  post_id text not null,
  posted_at timestamptz not null,
  text_original text not null default '',
  text_en text null,
  url text not null,
  category text not null,
  relevance_score numeric(4,3) not null default 0,
  relevance_method text not null default 'keyword',
  keyword_matches text[] not null default '{}',
  included_in_digest boolean not null default false,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(handle, post_id)
);

create index idx_expert_signals_posted on expert_signals(posted_at desc);
create index idx_expert_signals_category on expert_signals(category, posted_at desc);
create index idx_expert_signals_relevance on expert_signals(relevance_score desc);

create table expert_digests (
  id uuid primary key default gen_random_uuid(),
  digest_text text not null,
  signal_ids uuid[] not null default '{}',
  signal_count int not null default 0,
  generated_at timestamptz not null default now()
);

create index idx_expert_digests_generated on expert_digests(generated_at desc);
```

**Step 2: Append tables to schema.sql for reference**

Add the same SQL to the bottom of `supabase/schema.sql` after the existing tables, under a `-- Expert commentary feed` comment block. This file is the reference schema; the migration file is what actually runs.

**Step 3: Push migration**

Run: `supabase db push`
Expected: Tables created successfully.

**Step 4: Verify tables exist**

Run: `supabase db push --dry-run` (should show no pending changes)

**Step 5: Commit**

```bash
git add supabase/migrations/20260304_expert_feed.sql supabase/schema.sql
git commit -m "feat: add expert_signals and expert_digests tables"
```

---

## Task 2: Types & Account Registry

**Files:**
- Create: `lib/expert-feed.ts`
- Test: `lib/expert-feed.test.ts`

**Step 1: Write the failing test for keyword matching**

Create `lib/expert-feed.test.ts`:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findGulfKeywords, scoreRelevance, EXPERT_ACCOUNTS } from "./expert-feed";

describe("findGulfKeywords", () => {
  it("matches geographic terms", () => {
    const kw = findGulfKeywords("Tanker transiting Strait of Hormuz under escort");
    assert.ok(kw.includes("hormuz"));
    assert.ok(kw.includes("tanker"));
  });

  it("matches military terms", () => {
    const kw = findGulfKeywords("CENTCOM announces carrier strike group deployment");
    assert.ok(kw.includes("centcom"));
    assert.ok(kw.includes("carrier"));
    assert.ok(kw.includes("strike group"));
    assert.ok(kw.includes("deployment"));
  });

  it("returns empty for irrelevant content", () => {
    const kw = findGulfKeywords("Great dinner at the new restaurant downtown");
    assert.equal(kw.length, 0);
  });

  it("matches energy terms", () => {
    const kw = findGulfKeywords("Brent crude spiking on sanctions news from OPEC");
    assert.ok(kw.includes("crude"));
    assert.ok(kw.includes("sanctions"));
    assert.ok(kw.includes("opec"));
  });

  it("matches aviation terms", () => {
    const kw = findGulfKeywords("New NOTAM issued restricting overflight of Tehran FIR");
    assert.ok(kw.includes("notam"));
    assert.ok(kw.includes("overflight"));
    assert.ok(kw.includes("tehran fir"));
  });
});

describe("scoreRelevance", () => {
  it("scores 0 keywords as 0.15", () => {
    assert.equal(scoreRelevance([]), 0.15);
  });

  it("scores 1 keyword as 0.45", () => {
    assert.equal(scoreRelevance(["hormuz"]), 0.45);
  });

  it("scores 2 keywords as 0.6", () => {
    assert.equal(scoreRelevance(["hormuz", "tanker"]), 0.6);
  });

  it("scores 3+ keywords as 0.8", () => {
    assert.equal(scoreRelevance(["hormuz", "tanker", "centcom"]), 0.8);
  });

  it("scores 4+ keywords as 0.92", () => {
    assert.equal(scoreRelevance(["hormuz", "tanker", "centcom", "carrier"]), 0.92);
  });
});

describe("EXPERT_ACCOUNTS", () => {
  it("has expected count (Tier 1 + 2)", () => {
    assert.ok(EXPERT_ACCOUNTS.length >= 20);
    assert.ok(EXPERT_ACCOUNTS.length <= 30);
  });

  it("all have required fields", () => {
    for (const acc of EXPERT_ACCOUNTS) {
      assert.ok(acc.handle, `missing handle`);
      assert.ok(acc.category, `missing category for ${acc.handle}`);
      assert.ok(acc.label, `missing label for ${acc.handle}`);
      assert.ok([1, 2].includes(acc.tier), `invalid tier for ${acc.handle}`);
    }
  });

  it("handles are lowercase without @", () => {
    for (const acc of EXPERT_ACCOUNTS) {
      assert.ok(!acc.handle.startsWith("@"), `${acc.handle} starts with @`);
      assert.equal(acc.handle, acc.handle.toLowerCase(), `${acc.handle} not lowercase`);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/expert-feed.test.ts`
Expected: FAIL — cannot find module `./expert-feed`

**Step 3: Write the implementation**

Create `lib/expert-feed.ts`:

```typescript
export type ExpertCategory = "maritime" | "defense" | "energy" | "geopolitical" | "osint";

export type ExpertAccount = {
  handle: string;
  tier: 1 | 2;
  category: ExpertCategory;
  label: string;
};

export type ExpertSignal = {
  handle: string;
  post_id: string;
  posted_at: string;
  text_original: string;
  text_en: string | null;
  url: string;
  category: ExpertCategory;
  relevance_score: number;
  relevance_method: "keyword" | "llm";
  keyword_matches: string[];
  included_in_digest: boolean;
  fetched_at: string;
};

export type ExpertDigest = {
  id: string;
  digest_text: string;
  signal_ids: string[];
  signal_count: number;
  generated_at: string;
};

export type ExpertFeedResponse = {
  ok: boolean;
  digest: ExpertDigest | null;
  signals: ExpertSignal[];
  meta: {
    total_accounts: number;
    active_signals_24h: number;
    last_poll: string | null;
  };
};

// --- Account Registry ---

export const EXPERT_ACCOUNTS: ExpertAccount[] = [
  // Tier 1 — Maritime
  { handle: "mikeschuler", tier: 1, category: "maritime", label: "gCaptain maritime editor" },
  { handle: "mercoglianos", tier: 1, category: "maritime", label: "Maritime industry analyst" },
  { handle: "cavasships", tier: 1, category: "maritime", label: "Naval/shipping journalist" },
  { handle: "samlagrone", tier: 1, category: "maritime", label: "USNI News naval reporter" },
  { handle: "malshelbourne", tier: 1, category: "maritime", label: "USNI News naval reporter" },
  { handle: "tomsharpe134", tier: 1, category: "maritime", label: "Royal Navy, Hormuz expertise" },
  { handle: "bartgonnissen", tier: 1, category: "maritime", label: "Shipping/freight analyst" },

  // Tier 1 — Energy
  { handle: "javierblas", tier: 1, category: "energy", label: "Bloomberg energy/commodities" },
  { handle: "loriannlarocco", tier: 1, category: "energy", label: "CNBC shipping/trade reporter" },
  { handle: "sullycnbc", tier: 1, category: "energy", label: "CNBC markets/energy" },
  { handle: "freightalley", tier: 1, category: "energy", label: "Freight/logistics industry" },
  { handle: "mintzmyer", tier: 1, category: "energy", label: "Shipping/maritime finance" },
  { handle: "ed_fin", tier: 1, category: "energy", label: "Energy/finance analyst" },

  // Tier 1 — Geopolitical & Defense
  { handle: "vtchakarova", tier: 1, category: "geopolitical", label: "Gulf security/geopolitical" },
  { handle: "aviation_intel", tier: 1, category: "defense", label: "Military aviation intel" },

  // Tier 2 — Defense
  { handle: "cdrsalamander", tier: 2, category: "defense", label: "Naval defense analyst" },
  { handle: "brentdsadler", tier: 2, category: "defense", label: "Heritage Foundation naval policy" },
  { handle: "bdherzinger", tier: 2, category: "defense", label: "Indo-Pacific defense analyst" },
  { handle: "trenttelenko", tier: 2, category: "defense", label: "Military logistics analyst" },
  { handle: "thomasbsauer", tier: 2, category: "defense", label: "Military/defense analysis" },

  // Tier 2 — Geopolitical
  { handle: "joshuasteinman", tier: 2, category: "geopolitical", label: "Former NSC, national security" },
  { handle: "ezracohen", tier: 2, category: "geopolitical", label: "Intelligence community" },
  { handle: "jkylebass", tier: 2, category: "geopolitical", label: "Macro/geopolitical finance" },

  // Tier 2 — OSINT
  { handle: "schizointel", tier: 2, category: "osint", label: "OSINT analyst" },
  { handle: "vcdgf555", tier: 2, category: "osint", label: "OSINT/geopolitical" },
  { handle: "ianellisjones", tier: 2, category: "osint", label: "Geopolitical/OSINT analyst" },

  // Tier 2 — Energy
  { handle: "joshyoung", tier: 2, category: "energy", label: "Energy markets analyst" },
  { handle: "biancoresearch", tier: 2, category: "energy", label: "Markets/macro research" },
];

// --- Gulf/Conflict Keywords ---

const GEOGRAPHIC_TERMS = [
  "iran", "hormuz", "persian gulf", "strait", "gulf of oman",
  "arabian sea", "uae", "adnoc", "fujairah", "bandar abbas",
  "kish", "chabahar",
];

const MILITARY_TERMS = [
  "centcom", "navy", "carrier", "destroyer", "strike group",
  "deployment", "missile", "drone", "intercept", "sortie",
  "b-52", "irgc", "quds", "revolutionary guard",
];

const SHIPPING_TERMS = [
  "tanker", "shipping lane", "insurance", "freight", "maritime",
  "piracy", "blockade", "escort", "convoy", "war risk premium",
  "p&i", "lloyds",
];

const ENERGY_TERMS = [
  "oil price", "crude", "lng", "pipeline", "sanctions",
  "opec", "barrel", "refinery", "brent",
];

const AVIATION_TERMS = [
  "airspace", "notam", "divert", "overflight", "restricted",
  "no-fly", "fir", "tehran fir",
];

const ALL_GULF_KEYWORDS = [
  ...GEOGRAPHIC_TERMS,
  ...MILITARY_TERMS,
  ...SHIPPING_TERMS,
  ...ENERGY_TERMS,
  ...AVIATION_TERMS,
];

export function findGulfKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return ALL_GULF_KEYWORDS.filter((term) => lower.includes(term));
}

export function scoreRelevance(keywords: string[]): number {
  if (keywords.length === 0) return 0.15;
  if (keywords.length === 1) return 0.45;
  if (keywords.length === 2) return 0.6;
  if (keywords.length === 3) return 0.8;
  return 0.92;
}
```

**Step 4: Run test to verify it passes**

Run: `npx tsx --test lib/expert-feed.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add lib/expert-feed.ts lib/expert-feed.test.ts
git commit -m "feat: add expert feed types, account registry, and keyword scoring"
```

---

## Task 3: Database Operations

**Files:**
- Create: `lib/expert-feed-repo.ts`

**Step 1: Write `lib/expert-feed-repo.ts`**

This module handles all Supabase queries for the expert feed. Pattern matches `lib/supabase.ts` admin client usage and the upsert pattern from `lib/ingest.ts:675-680`.

```typescript
import { getSupabaseAdmin } from "./supabase";
import type { ExpertSignal, ExpertDigest, ExpertFeedResponse } from "./expert-feed";

export async function loadKnownPostIds(handles: string[]): Promise<Set<string>> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("expert_signals")
    .select("handle, post_id")
    .in("handle", handles)
    .order("posted_at", { ascending: false })
    .limit(500);
  const ids = new Set<string>();
  for (const row of data ?? []) {
    ids.add(`${row.handle}:${row.post_id}`);
  }
  return ids;
}

export async function upsertExpertSignals(signals: ExpertSignal[]): Promise<{ inserted: number; error: string | null }> {
  if (signals.length === 0) return { inserted: 0, error: null };
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("expert_signals")
    .upsert(signals, { onConflict: "handle,post_id", ignoreDuplicates: true });
  if (error) return { inserted: 0, error: error.message };
  return { inserted: signals.length, error: null };
}

export async function countUndigestedSignals(): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from("expert_signals")
    .select("*", { count: "exact", head: true })
    .eq("included_in_digest", false)
    .gte("relevance_score", 0.4);
  return count ?? 0;
}

export async function getUndigestedSignals(): Promise<ExpertSignal[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("expert_signals")
    .select("*")
    .eq("included_in_digest", false)
    .gte("relevance_score", 0.4)
    .order("posted_at", { ascending: false })
    .limit(20);
  return (data ?? []) as ExpertSignal[];
}

export async function markSignalsDigested(signalIds: string[]): Promise<void> {
  if (signalIds.length === 0) return;
  const supabase = getSupabaseAdmin();
  await supabase
    .from("expert_signals")
    .update({ included_in_digest: true })
    .in("id", signalIds);
}

export async function insertDigest(digest: { digest_text: string; signal_ids: string[]; signal_count: number }): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("expert_digests")
    .insert(digest)
    .select("id")
    .single();
  if (error) return null;
  return data?.id ?? null;
}

export async function loadExpertFeed(): Promise<ExpertFeedResponse> {
  const supabase = getSupabaseAdmin();

  // Latest digest
  const { data: digestRows } = await supabase
    .from("expert_digests")
    .select("*")
    .order("generated_at", { ascending: false })
    .limit(1);
  const latestDigest = digestRows?.[0] ?? null;

  // Recent signals (last 24h, relevance >= 0.4)
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { data: signalRows } = await supabase
    .from("expert_signals")
    .select("*")
    .gte("relevance_score", 0.4)
    .gte("posted_at", cutoff)
    .order("posted_at", { ascending: false })
    .limit(50);

  const signals = (signalRows ?? []) as ExpertSignal[];

  // Last poll time
  const { data: lastPollRow } = await supabase
    .from("expert_signals")
    .select("fetched_at")
    .order("fetched_at", { ascending: false })
    .limit(1);

  return {
    ok: true,
    digest: latestDigest
      ? {
          id: latestDigest.id,
          digest_text: latestDigest.digest_text,
          signal_ids: latestDigest.signal_ids ?? [],
          signal_count: latestDigest.signal_count ?? 0,
          generated_at: latestDigest.generated_at,
        }
      : null,
    signals,
    meta: {
      total_accounts: 28,
      active_signals_24h: signals.length,
      last_poll: lastPollRow?.[0]?.fetched_at ?? null,
    },
  };
}
```

**Step 2: Commit**

```bash
git add lib/expert-feed-repo.ts
git commit -m "feat: add expert feed database operations"
```

---

## Task 4: Ingestion Pipeline

**Files:**
- Create: `lib/expert-feed-ingest.ts`
- Test: `lib/expert-feed-ingest.test.ts`

**Step 1: Write tests for the ingestion helpers**

Create `lib/expert-feed-ingest.test.ts`:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildRelevanceResult } from "./expert-feed-ingest";

describe("buildRelevanceResult", () => {
  it("returns keyword method when keywords match", () => {
    const result = buildRelevanceResult("CENTCOM deploys carrier to Hormuz");
    assert.equal(result.method, "keyword");
    assert.ok(result.score >= 0.6);
    assert.ok(result.keywords.length >= 2);
    assert.ok(result.passesGate);
  });

  it("returns needs_llm when no keywords match", () => {
    const result = buildRelevanceResult("Beautiful sunset today");
    assert.equal(result.method, "needs_llm");
    assert.equal(result.score, 0.15);
    assert.equal(result.keywords.length, 0);
    assert.equal(result.passesGate, false);
  });

  it("passes gate with single keyword", () => {
    const result = buildRelevanceResult("Iran situation is escalating");
    assert.equal(result.method, "keyword");
    assert.ok(result.score >= 0.4);
    assert.ok(result.passesGate);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/expert-feed-ingest.test.ts`
Expected: FAIL — cannot resolve `./expert-feed-ingest`

**Step 3: Write the ingestion module**

Create `lib/expert-feed-ingest.ts`:

```typescript
import OpenAI from "openai";
import { EXPERT_ACCOUNTS, findGulfKeywords, scoreRelevance } from "./expert-feed";
import type { ExpertSignal, ExpertCategory } from "./expert-feed";
import {
  loadKnownPostIds,
  upsertExpertSignals,
  countUndigestedSignals,
  getUndigestedSignals,
  markSignalsDigested,
  insertDigest,
} from "./expert-feed-repo";

// --- X API helpers (mirrored from lib/x-signals.ts) ---

type XPost = { id: string; text: string; created_at: string };

function getXConfig() {
  const bearer = process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN;
  const baseUrl = (process.env.X_API_BASE_URL || "https://api.x.com/2").replace(/\/+$/, "");
  if (!bearer) throw new Error("Missing X_BEARER_TOKEN");
  return { bearer, baseUrl };
}

async function xFetch(path: string, params: URLSearchParams): Promise<Record<string, unknown>> {
  const { bearer, baseUrl } = getXConfig();
  const url = `${baseUrl}${path}?${params.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { authorization: `Bearer ${bearer}`, accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`X API error (${res.status}) ${url} ${body.slice(0, 240)}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

async function resolveUserId(username: string): Promise<string> {
  const payload = await xFetch(`/users/by/username/${encodeURIComponent(username)}`, new URLSearchParams({ "user.fields": "id" }));
  const id = (payload?.data as { id?: string } | undefined)?.id;
  if (!id) throw new Error(`X user lookup failed for @${username}`);
  return id;
}

async function fetchRecentTweets(userId: string, maxResults = 5): Promise<XPost[]> {
  const payload = await xFetch(
    `/users/${encodeURIComponent(userId)}/tweets`,
    new URLSearchParams({
      max_results: String(Math.max(5, Math.min(25, maxResults))),
      exclude: "retweets,replies",
      "tweet.fields": "created_at,text",
    }),
  );
  const data = payload?.data;
  if (!Array.isArray(data)) return [];
  return data
    .filter((row): row is { id: string; text: string; created_at: string } =>
      Boolean(row && typeof row === "object" && typeof (row as { id?: unknown }).id === "string"),
    )
    .map((row) => ({ id: row.id, text: row.text, created_at: row.created_at }));
}

// --- Relevance scoring ---

export function buildRelevanceResult(text: string): {
  method: "keyword" | "needs_llm";
  score: number;
  keywords: string[];
  passesGate: boolean;
} {
  const keywords = findGulfKeywords(text);
  const score = scoreRelevance(keywords);
  if (keywords.length > 0) {
    return { method: "keyword", score, keywords, passesGate: true };
  }
  return { method: "needs_llm", score, keywords, passesGate: false };
}

async function llmScoreRelevance(text: string): Promise<number> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return 0;
  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 10,
      messages: [
        {
          role: "system",
          content:
            "Rate the relevance of this tweet to the Iran conflict, Gulf shipping/aviation disruption, or UAE travel safety. Reply with ONLY a number between 0.0 and 1.0.",
        },
        { role: "user", content: text.slice(0, 500) },
      ],
    });
    const raw = completion.choices[0]?.message?.content?.trim() ?? "0";
    const score = parseFloat(raw);
    return Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0;
  } catch {
    return 0;
  }
}

// --- Digest generation ---

async function generateDigest(signals: ExpertSignal[]): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || signals.length === 0) return "";

  const signalTexts = signals
    .slice(0, 15)
    .map((s) => `@${s.handle} [${s.category}]: ${(s.text_en ?? s.text_original).slice(0, 280)}`)
    .join("\n");

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content:
            "You are a crisis monitoring analyst. Summarize the following expert commentary tweets into a concise 2-4 sentence digest for UAE travelers/residents monitoring the Iran situation. Group by theme (maritime, defense, energy, aviation) if signals span multiple domains. Cite authors by @handle. Focus on actionable intelligence and emerging developments. Do not editorialize.",
        },
        { role: "user", content: signalTexts },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() ?? "";
  } catch {
    return "";
  }
}

// --- Main ingestion entry point ---

export type ExpertFeedIngestResult = {
  ok: boolean;
  accounts_polled: number;
  signals_found: number;
  signals_relevant: number;
  signals_inserted: number;
  digest_generated: boolean;
  errors: string[];
};

export async function runExpertFeedIngestion(): Promise<ExpertFeedIngestResult> {
  const errors: string[] = [];
  const handles = EXPERT_ACCOUNTS.map((a) => a.handle);
  const categoryMap = new Map(EXPERT_ACCOUNTS.map((a) => [a.handle, a.category]));

  // 1. Load known post IDs for dedup
  const knownPostIds = await loadKnownPostIds(handles);

  // 2. Fetch tweets for each handle
  const fetchedAt = new Date().toISOString();
  const allSignals: ExpertSignal[] = [];
  let accountsPolled = 0;

  for (const handle of handles) {
    try {
      const userId = await resolveUserId(handle);
      const tweets = await fetchRecentTweets(userId, 5);
      accountsPolled += 1;

      for (const tweet of tweets) {
        const dedupeKey = `${handle}:${tweet.id}`;
        if (knownPostIds.has(dedupeKey)) continue;

        const text = tweet.text;
        const relevance = buildRelevanceResult(text);

        let finalScore = relevance.score;
        let finalMethod: "keyword" | "llm" = relevance.method === "keyword" ? "keyword" : "llm";

        // LLM scoring for tweets that didn't match keywords
        if (!relevance.passesGate) {
          const llmScore = await llmScoreRelevance(text);
          finalScore = llmScore;
          finalMethod = "llm";
          if (llmScore < 0.4) continue; // Below threshold, skip
        }

        allSignals.push({
          handle,
          post_id: tweet.id,
          posted_at: new Date(tweet.created_at).toISOString(),
          text_original: text.slice(0, 1500),
          text_en: null, // Most expert accounts post in English
          url: `https://x.com/${handle}/status/${tweet.id}`,
          category: categoryMap.get(handle) ?? ("osint" as ExpertCategory),
          relevance_score: finalScore,
          relevance_method: finalMethod,
          keyword_matches: relevance.keywords,
          included_in_digest: false,
          fetched_at: fetchedAt,
        });
      }
    } catch (err) {
      errors.push(`@${handle}: ${String(err).slice(0, 100)}`);
    }
  }

  // 3. Upsert qualifying signals
  const { inserted, error: upsertError } = await upsertExpertSignals(allSignals);
  if (upsertError) errors.push(`upsert: ${upsertError}`);

  // 4. Generate digest if enough new signals
  let digestGenerated = false;
  const undigestedCount = await countUndigestedSignals();
  if (undigestedCount >= 3) {
    const undigested = await getUndigestedSignals();
    const digestText = await generateDigest(undigested);
    if (digestText) {
      const signalIds = undigested.map((s) => (s as unknown as { id: string }).id).filter(Boolean);
      await insertDigest({ digest_text: digestText, signal_ids: signalIds, signal_count: signalIds.length });
      await markSignalsDigested(signalIds);
      digestGenerated = true;
    }
  }

  return {
    ok: errors.length === 0,
    accounts_polled: accountsPolled,
    signals_found: allSignals.length + (knownPostIds.size > 0 ? 0 : 0), // new signals only
    signals_relevant: allSignals.length,
    signals_inserted: inserted,
    digest_generated: digestGenerated,
    errors,
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx tsx --test lib/expert-feed-ingest.test.ts`
Expected: All tests PASS (the `buildRelevanceResult` tests are pure functions, no API calls).

**Step 5: Commit**

```bash
git add lib/expert-feed-ingest.ts lib/expert-feed-ingest.test.ts
git commit -m "feat: add expert feed ingestion pipeline with hybrid scoring"
```

---

## Task 5: Ingest API Route

**Files:**
- Create: `app/api/ingest/expert-feed/route.ts`

**Step 1: Create the cron-triggered route**

Pattern: Matches `app/api/ingest/route.ts` auth pattern.

```typescript
import { runExpertFeedIngestion } from "@/lib/expert-feed-ingest";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const key = params.get("key");
  if (process.env.INGEST_SECRET && key !== process.env.INGEST_SECRET) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runExpertFeedIngestion();
    return Response.json(result);
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add app/api/ingest/expert-feed/route.ts
git commit -m "feat: add expert feed ingest API route"
```

---

## Task 6: Feed API Route

**Files:**
- Create: `app/api/expert-feed/route.ts`

**Step 1: Create the GET endpoint**

Pattern: Matches `app/api/updates/feed/route.ts`.

```typescript
import { loadExpertFeed } from "@/lib/expert-feed-repo";

export async function GET() {
  try {
    const feed = await loadExpertFeed();
    return Response.json(feed);
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add app/api/expert-feed/route.ts
git commit -m "feat: add expert feed GET API route"
```

---

## Task 7: Frontend Component

**Files:**
- Create: `app/components/expert-analysis-panel.tsx`

**Step 1: Create the component**

Pattern: Matches `app/components/updates-feed.tsx` — client component with `useCallback`, `useEffect`, auto-refresh, Tailwind styling with CSS variables.

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import type { ExpertFeedResponse, ExpertCategory } from "@/lib/expert-feed";

const CATEGORY_STYLES: Record<ExpertCategory, { bg: string; text: string; label: string }> = {
  maritime: { bg: "bg-blue-100", text: "text-blue-800", label: "Maritime" },
  defense: { bg: "bg-red-100", text: "text-red-800", label: "Defense" },
  energy: { bg: "bg-amber-100", text: "text-amber-800", label: "Energy" },
  geopolitical: { bg: "bg-purple-100", text: "text-purple-800", label: "Geopolitical" },
  osint: { bg: "bg-emerald-100", text: "text-emerald-800", label: "OSINT" },
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function ExpertAnalysisPanel() {
  const [feed, setFeed] = useState<ExpertFeedResponse | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<ExpertCategory | "all">("all");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/expert-feed", { cache: "no-store" });
      const json = (await res.json()) as ExpertFeedResponse;
      if (json.ok) setFeed(json);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 5 * 60_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  if (!feed) return null;

  const filteredSignals = feed.signals.filter(
    (s) => categoryFilter === "all" || s.category === categoryFilter,
  );

  const categories: { label: string; value: ExpertCategory | "all" }[] = [
    { label: "All", value: "all" },
    { label: "Maritime", value: "maritime" },
    { label: "Defense", value: "defense" },
    { label: "Energy", value: "energy" },
    { label: "Geopolitical", value: "geopolitical" },
    { label: "OSINT", value: "osint" },
  ];

  return (
    <section className="mx-auto max-w-4xl px-4 py-8 md:px-0">
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">
          Expert Analysis
        </p>
        <span
          className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-[var(--text-secondary)] cursor-help"
          title="AI-curated digest from ~25 expert commentators covering maritime, defense, energy, and geopolitical developments related to the Gulf region."
        >
          ?
        </span>
      </div>

      {/* Digest card */}
      {feed.digest ? (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-[15px] leading-relaxed text-[var(--text-primary)]">
            {feed.digest.digest_text}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
            <span>{relativeTime(feed.digest.generated_at)}</span>
            <span>{feed.digest.signal_count} signals</span>
            <span>{feed.meta.active_signals_24h} active (24h)</span>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-gray-300 p-4 text-sm text-[var(--text-secondary)]">
          No relevant expert commentary in the last 24 hours.
        </div>
      )}

      {/* Expand toggle */}
      {feed.signals.length > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-xs text-[var(--primary-blue)] underline"
        >
          {expanded ? "Hide" : `View ${feed.signals.length}`} individual signals
        </button>
      )}

      {/* Expanded signals */}
      {expanded && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c.value}
                onClick={() => setCategoryFilter(c.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  categoryFilter === c.value
                    ? "bg-[var(--surface-dark)] text-white"
                    : "bg-gray-100 text-[var(--text-secondary)] hover:bg-gray-200"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="mt-3 space-y-2">
            {filteredSignals.map((signal) => {
              const style = CATEGORY_STYLES[signal.category];
              return (
                <div
                  key={`${signal.handle}:${signal.post_id}`}
                  className="rounded-lg border border-gray-100 bg-gray-50 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[var(--text-primary)]">
                      @{signal.handle}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${style.bg} ${style.text}`}>
                      {style.label}
                    </span>
                    <span
                      className={`h-2 w-2 rounded-full ${
                        signal.relevance_score >= 0.7 ? "bg-[var(--green)]" :
                        signal.relevance_score >= 0.4 ? "bg-[var(--amber)]" :
                        "bg-gray-400"
                      }`}
                      title={`Relevance: ${signal.relevance_score.toFixed(2)}`}
                    />
                    <span className="ml-auto text-[11px] text-[var(--text-secondary)]">
                      {relativeTime(signal.posted_at)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-3">
                    {signal.text_en ?? signal.text_original}
                  </p>
                  <a
                    href={signal.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-block text-xs text-[var(--primary-blue)] underline"
                  >
                    View on X
                  </a>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
```

**Step 2: Commit**

```bash
git add app/components/expert-analysis-panel.tsx
git commit -m "feat: add ExpertAnalysisPanel frontend component"
```

---

## Task 8: Dashboard Integration

**Files:**
- Modify: `app/page.tsx`

**Step 1: Add import and render**

In `app/page.tsx`:

1. Add import at top (after line 16):
```typescript
import { ExpertAnalysisPanel } from "@/app/components/expert-analysis-panel";
```

2. Add component below `<UpdatesFeed>` (after line 228):
```tsx
<ExpertAnalysisPanel />
```

The component is a client component that fetches its own data, so no server-side data loading is needed in the page.

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors.

**Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: integrate ExpertAnalysisPanel into dashboard"
```

---

## Task 9: Vercel Cron Configuration

**Files:**
- Modify: `vercel.json`

**Step 1: Add cron entry and function config**

In `vercel.json`:

1. Add to the `crons` array (after the government sources, before the closing bracket):
```json
{ "path": "/api/ingest/expert-feed?key=@ingest_secret", "schedule": "*/30 * * * *" }
```

2. Add to the `functions` object:
```json
"app/api/ingest/expert-feed/route.ts": {
  "maxDuration": 120
}
```

The 120s maxDuration allows time for ~25 X API calls + LLM scoring. The 30-min schedule (`*/30 * * * *`) runs at :00 and :30.

**Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('valid')"`
Expected: `valid`

**Step 3: Run full build**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Run all tests**

Run: `npx tsx --test lib/expert-feed.test.ts lib/expert-feed-ingest.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add vercel.json
git commit -m "feat: add expert feed cron (every 30 min) and function config"
```

---

## Task 10: Final Verification & Deploy

**Step 1: Run full test suite**

Run: `npx tsx --test lib/*.test.ts`
Expected: All tests pass (existing + new).

**Step 2: Run build**

Run: `npm run build`
Expected: Clean build, no errors.

**Step 3: Run lint**

Run: `npm run lint`
Expected: No new lint errors.

**Step 4: Deploy**

Run: `vercel --prod --yes`
Expected: Deploy succeeds.

**Step 5: Push Supabase migration**

Run: `supabase db push`
Expected: Migration applied (or already applied from Task 1).

**Step 6: Test the endpoint**

Run: `curl -s "https://keepcalmandcarryon.help/api/expert-feed" | jq .ok`
Expected: `true`

**Step 7: Trigger first ingestion**

Run: `curl -s "https://keepcalmandcarryon.help/api/ingest/expert-feed?key=$INGEST_SECRET" | jq .`
Expected: JSON with `accounts_polled`, `signals_found`, `signals_relevant` fields.

---

## Summary of Files

| File | Action | Task |
|------|--------|------|
| `supabase/migrations/20260304_expert_feed.sql` | Create | 1 |
| `supabase/schema.sql` | Modify | 1 |
| `lib/expert-feed.ts` | Create | 2 |
| `lib/expert-feed.test.ts` | Create | 2 |
| `lib/expert-feed-repo.ts` | Create | 3 |
| `lib/expert-feed-ingest.ts` | Create | 4 |
| `lib/expert-feed-ingest.test.ts` | Create | 4 |
| `app/api/ingest/expert-feed/route.ts` | Create | 5 |
| `app/api/expert-feed/route.ts` | Create | 6 |
| `app/components/expert-analysis-panel.tsx` | Create | 7 |
| `app/page.tsx` | Modify | 8 |
| `vercel.json` | Modify | 9 |
