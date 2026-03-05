# Reimagined Intelligence Engine — Implementation Plan

## Summary

| Metric | Value |
|--------|-------|
| **Spec** | [reimagined-intelligence-engine.spec.md](../../specs/reimagined-intelligence-engine.spec.md) |
| **Total Tickets** | 28 |
| **Total Story Points** | 126 |
| **Overall Complexity** | High |
| **Execution Waves** | 6 |
| **Key Dependencies** | Phase 1 (LLM switch) unblocks Phase 2 (brief engine); Phase 4 (auth) unblocks Phase 2 chat persistence |

---

## Completion Status

| Ticket | Title | Points | Status | Completed Date | Notes |
|--------|-------|--------|--------|----------------|-------|
| T-001 | Switch LLM provider to Anthropic Claude | 5 | ✅ Complete | 2026-03-05 | Replaced OpenAI SDK with Anthropic Claude across all 9 LLM call sites. Created shared `lib/anthropic.ts` wrapper. |
| T-002 | Create crisis event database tables | 3 | Pending | - | - |
| T-003 | Remove evidence caps and expand LLM context | 3 | Pending | - | - |
| T-004 | Multi-section intelligence brief generation | 8 | Pending | - | - |
| T-005 | Confidence-tiered source attribution | 5 | Pending | - | - |
| T-006 | Cross-source correlation logic | 5 | Pending | - | - |
| T-007 | Cumulative statistics tracking | 3 | Pending | - | - |
| T-008 | Redesign SituationBriefing component | 5 | Pending | - | - |
| T-009 | Update brief API for structured sections | 3 | Pending | - | - |
| T-010 | Event-driven regeneration triggers | 5 | Pending | - | - |
| T-011 | Enable Supabase Auth (email/password + magic link) | 5 | Pending | - | - |
| T-012 | Create user_profiles table and RLS policies | 3 | Pending | - | - |
| T-013 | Build authentication UI components | 5 | Pending | - | - |
| T-014 | Build user profile settings page | 3 | Pending | - | - |
| T-015 | Create chat_sessions and chat_messages tables | 3 | Pending | - | - |
| T-016 | Rewrite /api/chat for multi-turn conversation | 8 | Pending | - | - |
| T-017 | Route-specific flight intelligence synthesis | 5 | Pending | - | - |
| T-018 | Implement anonymous chat rate limiting | 2 | Pending | - | - |
| T-019 | Redesign chat UI as conversational interface | 8 | Pending | - | - |
| T-020 | Add persistent user context to chat | 3 | Pending | - | - |
| T-021 | Add defense/security sources and extractors | 5 | Pending | - | - |
| T-022 | Add aviation operations sources and extractors | 5 | Pending | - | - |
| T-023 | Implement source trust tier classification | 3 | Pending | - | - |
| T-024 | Augment flight tracking with departure board data | 5 | Pending | - | - |
| T-025 | Implement crisis event auto-detection | 5 | Pending | - | - |
| T-026 | Build crisis timeline and trend analysis | 5 | Pending | - | - |
| T-027 | Build crisis event management UI | 5 | Pending | - | - |
| T-028 | Update StatusHero with trend indicator | 3 | Pending | - | - |

---

## Execution Order (Topologically Sorted)

| # | Ticket | Summary | Points | Risk | Dependencies | Status |
|---|--------|---------|--------|------|--------------|--------|
| 1 | T-001 | Switch LLM provider to Anthropic Claude | 5 | Medium | None | ✅ Complete |
| 2 | T-002 | Create crisis event database tables | 3 | Low | None | Pending |
| 3 | T-011 | Enable Supabase Auth | 5 | Medium | None | Pending |
| 4 | T-003 | Remove evidence caps, expand LLM context | 3 | Low | T-001 | Pending |
| 5 | T-004 | Multi-section intelligence brief generation | 8 | High | T-001, T-003 | Pending |
| 6 | T-005 | Confidence-tiered source attribution | 5 | Medium | T-004 | Pending |
| 7 | T-006 | Cross-source correlation logic | 5 | High | T-004 | Pending |
| 8 | T-012 | Create user_profiles table and RLS | 3 | Low | T-011 | Pending |
| 9 | T-013 | Build authentication UI | 5 | Medium | T-011 | Pending |
| 10 | T-007 | Cumulative statistics tracking | 3 | Low | T-002, T-004 | Pending |
| 11 | T-009 | Update brief API for structured sections | 3 | Low | T-004 | Pending |
| 12 | T-010 | Event-driven regeneration triggers | 5 | Medium | T-004 | Pending |
| 13 | T-008 | Redesign SituationBriefing component | 5 | Medium | T-009 | Pending |
| 14 | T-014 | Build user profile settings page | 3 | Low | T-012, T-013 | Pending |
| 15 | T-015 | Create chat tables | 3 | Low | T-011 | Pending |
| 16 | T-023 | Source trust tier classification | 3 | Low | T-005 | Pending |
| 17 | T-016 | Rewrite /api/chat for multi-turn | 8 | High | T-001, T-015 | Pending |
| 18 | T-017 | Route-specific flight intelligence | 5 | Medium | T-016 | Pending |
| 19 | T-018 | Anonymous chat rate limiting | 2 | Low | T-011, T-016 | Pending |
| 20 | T-019 | Redesign chat UI | 8 | High | T-016 | Pending |
| 21 | T-020 | Persistent user context in chat | 3 | Low | T-012, T-016 | Pending |
| 22 | T-021 | Defense/security sources + extractors | 5 | Medium | None | Pending |
| 23 | T-022 | Aviation operations sources + extractors | 5 | Medium | None | Pending |
| 24 | T-024 | Flight tracking with departure boards | 5 | High | None | Pending |
| 25 | T-025 | Crisis event auto-detection | 5 | High | T-002, T-007 | Pending |
| 26 | T-026 | Crisis timeline and trend analysis | 5 | Medium | T-025 | Pending |
| 27 | T-027 | Crisis event management UI | 5 | Medium | T-025, T-026 | Pending |
| 28 | T-028 | Update StatusHero with trend indicator | 3 | Low | T-025 | Pending |

---

## Parallel Execution Strategy

### Wave 1: Foundation (13 pts) — Execute in Parallel

| Ticket | Summary | Points | Agent | Status |
|--------|---------|--------|-------|--------|
| T-001 | Switch LLM provider to Anthropic Claude | 5 | backend-developer | ✅ Complete |
| T-002 | Create crisis event database tables | 3 | database-optimizer | Pending |
| T-011 | Enable Supabase Auth (email/password + magic link) | 5 | backend-developer | Pending |

**Note:** These three tickets have zero dependencies and set up the foundation for all subsequent work. T-001 is the most critical — it unblocks the entire brief engine and chat rewrite.

---

### Wave 2: Intelligence Brief Core (21 pts) — Sequential Chain

| Ticket | Summary | Points | Agent | Status |
|--------|---------|--------|-------|--------|
| T-003 | Remove evidence caps, expand LLM context | 3 | backend-developer | Pending |
| T-004 | Multi-section intelligence brief generation | 8 | backend-developer | Pending |
| T-005 | Confidence-tiered source attribution | 5 | backend-developer | Pending |
| T-006 | Cross-source correlation logic | 5 | backend-developer | Pending |

**Note:** T-003 → T-004 is the critical path. T-005 and T-006 can run in parallel after T-004.

---

### Wave 3: Brief Polish + Auth UI (24 pts) — Mixed Parallel/Sequential

**Parallel group A (Brief):**

| Ticket | Summary | Points | Agent | Status |
|--------|---------|--------|-------|--------|
| T-007 | Cumulative statistics tracking | 3 | backend-developer | Pending |
| T-009 | Update brief API for structured sections | 3 | backend-developer | Pending |
| T-010 | Event-driven regeneration triggers | 5 | backend-developer | Pending |

**Parallel group B (Auth UI):**

| Ticket | Summary | Points | Agent | Status |
|--------|---------|--------|-------|--------|
| T-012 | Create user_profiles table and RLS | 3 | database-optimizer | Pending |
| T-013 | Build authentication UI | 5 | frontend-developer | Pending |

**Sequential (after group A):**

| Ticket | Summary | Points | Agent | Status |
|--------|---------|--------|-------|--------|
| T-008 | Redesign SituationBriefing component | 5 | frontend-developer | Pending |

**Note:** Brief API (T-009) must land before SituationBriefing redesign (T-008). Auth UI (T-013) and brief work are fully independent.

---

### Wave 4: Chat Rewrite + User Profiles (32 pts) — Mostly Sequential

**Setup (parallel):**

| Ticket | Summary | Points | Agent | Status |
|--------|---------|--------|-------|--------|
| T-014 | Build user profile settings page | 3 | frontend-developer | Pending |
| T-015 | Create chat tables | 3 | database-optimizer | Pending |

**Core (sequential after T-015):**

| Ticket | Summary | Points | Agent | Status |
|--------|---------|--------|-------|--------|
| T-016 | Rewrite /api/chat for multi-turn | 8 | backend-developer | Pending |
| T-017 | Route-specific flight intelligence | 5 | backend-developer | Pending |
| T-018 | Anonymous chat rate limiting | 2 | backend-developer | Pending |

**Frontend (after T-016):**

| Ticket | Summary | Points | Agent | Status |
|--------|---------|--------|-------|--------|
| T-019 | Redesign chat UI | 8 | frontend-developer | Pending |
| T-020 | Persistent user context in chat | 3 | backend-developer | Pending |

**Note:** T-016 is the highest-risk ticket in the entire plan — it rewrites the chat API from stateless to multi-turn with streaming. T-019 (chat UI redesign) is the second highest effort.

---

### Wave 5: Expanded Sources (18 pts) — Execute in Parallel

| Ticket | Summary | Points | Agent | Status |
|--------|---------|--------|-------|--------|
| T-021 | Defense/security sources + extractors | 5 | backend-developer | Pending |
| T-022 | Aviation operations sources + extractors | 5 | backend-developer | Pending |
| T-023 | Source trust tier classification | 3 | backend-developer | Pending |
| T-024 | Flight tracking with departure boards | 5 | backend-developer | Pending |

**Note:** Source additions are independent of each other. T-023 depends on T-005 (confidence tiers) which lands in Wave 2. Can start Wave 5 as early as Wave 3 if desired.

---

### Wave 6: Crisis Framework (18 pts) — Sequential

| Ticket | Summary | Points | Agent | Status |
|--------|---------|--------|-------|--------|
| T-025 | Crisis event auto-detection | 5 | backend-developer | Pending |
| T-026 | Crisis timeline and trend analysis | 5 | backend-developer | Pending |
| T-027 | Crisis event management UI | 5 | frontend-developer | Pending |
| T-028 | Update StatusHero with trend indicator | 3 | frontend-developer | Pending |

**Note:** T-025 depends on crisis tables (T-002) and cumulative stats (T-007). T-027 and T-028 can run in parallel after T-026.

---

## Agent Recommendations

| Work Type | Recommended Agent |
|-----------|-------------------|
| LLM integration, brief engine, chat API | backend-developer |
| Database migrations, tables, indexes | database-optimizer |
| React components, UI redesign | frontend-developer |
| Source extractors, ingestion pipeline | backend-developer |
| E2E tests, integration tests | test-automator |

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Claude API cost overruns from expanded context | Medium | Monitor token usage per brief; implement token budgets; use Haiku for routine, Sonnet for complex |
| Multi-turn chat context window growth | High | Implement conversation truncation (sliding window); summarize older turns |
| NOTAM/departure board data availability | Medium | Research sources early (T-022, T-024); have fallback to current FR24 data |
| Auth migration complexity | Medium | Keep Google OAuth alongside new email/password; gradual rollout |
| Brief regeneration storms during crisis | High | Rate-limit regeneration to 20/hour (spec); debounce triggers |

---

## Document Links

- **Spec:** [reimagined-intelligence-engine.spec.md](../../specs/reimagined-intelligence-engine.spec.md)
- **Related designs:** [crisis-ops-answer-engine-design.md](./2026-03-05-crisis-ops-answer-engine-design.md)

---

## Ticket Details

### T-001: Switch LLM Provider to Anthropic Claude

**Wave:** 1 | **Points:** 5 | **Risk:** Medium | **Dependencies:** None

#### Summary

Replace all OpenAI gpt-4o-mini calls with Anthropic Claude API. This is the foundational change that unblocks the entire intelligence brief and chat rewrite.

#### Implementation Steps

1. **Install Anthropic SDK**
   ```bash
   npm install @anthropic-ai/sdk
   ```

2. **Create Claude client wrapper** (`lib/anthropic.ts`)
   - Initialize `Anthropic` client with `ANTHROPIC_API_KEY` env var
   - Export helper functions: `generateText()`, `streamText()` matching current usage patterns
   - Add error handling, timeout config, model selection (claude-sonnet-4-6 default, claude-opus-4-6 for complex)

3. **Update brief generation** (`lib/current-state-brief.ts`)
   - Replace `openai.chat.completions.create()` with Claude `messages.create()`
   - Map system/user prompt structure to Claude format
   - Update response parsing (Claude returns `content[0].text` not `choices[0].message.content`)
   - Retain fallback to extractive mode on API failure
   - Update telemetry logging for Claude token usage format

4. **Update chat API** (`app/api/chat/route.ts`)
   - Replace OpenAI call with Claude `messages.create()`
   - Map system prompt + user context to Claude message format
   - Update token usage logging

5. **Update flight query advisory mode** (`lib/flight-query.ts`)
   - Replace GPT advisory likelihood call with Claude
   - Update JSON parsing for Claude response format

6. **Update content validation** (`lib/ingest.ts`)
   - Replace GPT validation scoring with Claude
   - Update `GPT_UPDATE_VALIDATION_ENABLED` env var → `LLM_UPDATE_VALIDATION_ENABLED`

7. **Update environment variables**
   - Add `ANTHROPIC_API_KEY` to Vercel
   - Deprecate `OPENAI_API_KEY` (keep until fully migrated)
   - Update `CURRENT_STATE_BRIEF_MODEL` default to `claude-sonnet-4-6`

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `lib/anthropic.ts` | Create | Claude client wrapper with helper functions |
| `lib/current-state-brief.ts` | Modify | Replace OpenAI calls with Claude API |
| `app/api/chat/route.ts` | Modify | Replace OpenAI calls with Claude API |
| `lib/flight-query.ts` | Modify | Replace GPT advisory call with Claude |
| `lib/ingest.ts` | Modify | Replace GPT validation with Claude |
| `package.json` | Modify | Add @anthropic-ai/sdk dependency |

#### Tests

```typescript
// lib/anthropic.test.ts
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

describe("anthropic client", () => {
  it("should create client with API key from env", () => {
    // Test client initialization
  });

  it("should handle API timeout gracefully", () => {
    // Test timeout fallback
  });

  it("should map OpenAI-style messages to Claude format", () => {
    // Test message format conversion
  });
});
```

#### Acceptance Criteria

- [ ] All existing brief generation works with Claude API
- [ ] Chat responses are equivalent quality to gpt-4o-mini
- [ ] Flight advisory mode returns valid JSON from Claude
- [ ] Content validation scoring works with Claude
- [ ] Fallback to extractive mode on Claude API failure
- [ ] Telemetry logs Claude token usage correctly
- [ ] `npm run build` passes with no TypeScript errors
- [ ] All existing tests pass

---

### T-002: Create Crisis Event Database Tables

**Wave:** 1 | **Points:** 3 | **Risk:** Low | **Dependencies:** None

#### Summary

Create the `crisis_events` and `crisis_event_stats` tables for tracking multi-day crisis events with cumulative statistics.

#### Implementation Steps

1. **Create migration file** (`supabase/migrations/20260305200000_crisis_events.sql`)

2. **Create `crisis_events` table**
   ```sql
   CREATE TABLE crisis_events (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     name text NOT NULL,
     category text NOT NULL CHECK (category IN ('military', 'weather', 'political', 'infrastructure')),
     started_at timestamptz NOT NULL DEFAULT now(),
     ended_at timestamptz,
     affected_airports text[] DEFAULT '{}',
     affected_regions text[] DEFAULT '{}',
     is_active boolean DEFAULT true,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   );
   ```

3. **Create `crisis_event_stats` table**
   ```sql
   CREATE TABLE crisis_event_stats (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     event_id uuid NOT NULL REFERENCES crisis_events(id) ON DELETE CASCADE,
     stat_key text NOT NULL,
     stat_value numeric NOT NULL DEFAULT 0,
     unit text NOT NULL DEFAULT 'count',
     last_source text,
     updated_at timestamptz NOT NULL DEFAULT now(),
     UNIQUE(event_id, stat_key)
   );
   ```

4. **Add indexes**
   ```sql
   CREATE INDEX idx_crisis_events_active ON crisis_events(is_active, started_at DESC);
   CREATE INDEX idx_crisis_event_stats_event ON crisis_event_stats(event_id);
   ```

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/20260305200000_crisis_events.sql` | Create | Migration with both tables, indexes, constraints |

#### Acceptance Criteria

- [ ] Migration applies cleanly via `supabase db push`
- [ ] Tables accept sample data inserts
- [ ] Unique constraint on (event_id, stat_key) enforced
- [ ] CASCADE delete from crisis_events removes stats

---

### T-003: Remove Evidence Caps and Expand LLM Context

**Wave:** 2 | **Points:** 3 | **Risk:** Low | **Dependencies:** T-001

#### Summary

Remove the hard 2-row evidence cap on narrative evidence and corroborated social rows. Pass all quality-gated sources to the LLM instead of artificially limiting to 2.

#### Implementation Steps

1. **Update `selectNarrativeEvidenceRows()`** in `lib/current-state-brief.ts`
   - Remove `maxRows=2` parameter
   - Pass all regionally-relevant, non-low-value rows (after quality filtering)
   - Keep deduplication by normalized text

2. **Update `selectCorroboratedSocialRows()`** in `lib/current-state-brief.ts`
   - Remove `maxRows=2` parameter
   - Pass all corroborated social rows

3. **Update context gating defaults** in `lib/context-gating.ts`
   - Increase `source_max_rows` from 12 to 24
   - Increase `social_max_rows` from 8 to 16
   - Keep env var overrides for tuning

4. **Update advisory row limit** in `buildNarrativeBasis()`
   - Remove `advisoryRows` 6-row cap
   - Pass all advisory/disrupted sources

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `lib/current-state-brief.ts` | Modify | Remove evidence caps in selectNarrativeEvidenceRows, selectCorroboratedSocialRows |
| `lib/context-gating.ts` | Modify | Increase default max rows for sources and social signals |

#### Acceptance Criteria

- [ ] Brief generation receives all gated sources (not just 2)
- [ ] Social signal context includes all corroborated posts
- [ ] Context gating still filters for quality/freshness
- [ ] Brief still generates within timeout (monitor token usage)
- [ ] No TypeScript errors

---

### T-004: Multi-Section Intelligence Brief Generation

**Wave:** 2 | **Points:** 8 | **Risk:** High | **Dependencies:** T-001, T-003

#### Summary

Replace the single-paragraph brief with a multi-section intelligence report: executive summary, security situation, airspace & flights, practical guidance, and source coverage.

#### Implementation Steps

1. **Create `lib/intelligence-brief.ts`** — new module for structured brief generation
   - Define `IntelligenceBrief` type:
     ```typescript
     type IntelligenceBrief = {
       executive_summary: string;         // 2-3 sentences
       sections: {
         security: string;                // Military/defense developments
         flights: string;                 // Airspace status, airline suspensions
         guidance: string;                // What to do / not do
         source_coverage: string;         // Gaps, confidence assessment
       };
       metadata: {
         generated_at: string;
         model: string;
         freshness_state: string;
         confidence: string;
         input_hash: string;
       };
     };
     ```

2. **Design Claude system prompt** for multi-section generation
   - Role: "You are an intelligence analyst producing a layered situation report for UAE residents"
   - Output format: structured JSON with sections
   - Constraints: direct language, no speculation, source attribution required
   - Tone: authoritative but accessible (like a trusted advisor, not a news anchor)

3. **Build context assembler** — gather ALL data for LLM context
   - All gated source snapshots (from T-003 expanded context)
   - All corroborated social signals
   - Expert digest (from expert_digests table)
   - Flight statistics (total, delayed, cancelled, by airport)
   - Crisis event cumulative stats (when available)
   - Source health status

4. **Implement section-by-section generation**
   - Single LLM call with full context
   - Parse structured JSON response
   - Validate all sections are non-empty
   - Fallback: generate extractive version per section if LLM fails

5. **Update `refreshCurrentStateBrief()`** to use new generator
   - Keep backward compatibility: store `paragraph` as executive_summary for legacy callers
   - Store full structured brief in `current_state_brief` table (add `sections` JSONB column)
   - Retain hash-gating mechanism for regeneration detection

6. **Update `current_state_brief` table**
   - Add `sections jsonb DEFAULT '{}'` column
   - Migration: `ALTER TABLE current_state_brief ADD COLUMN sections jsonb DEFAULT '{}'::jsonb;`

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `lib/intelligence-brief.ts` | Create | New structured brief generation module |
| `lib/current-state-brief.ts` | Modify | Integrate new generator, backward compatibility |
| `supabase/migrations/20260305210000_brief_sections.sql` | Create | Add sections column to current_state_brief |

#### Acceptance Criteria

- [ ] Brief contains executive_summary + 4 expandable sections
- [ ] All sections grounded in source data (no hallucination)
- [ ] Structured JSON output parses correctly
- [ ] Fallback works when Claude API unavailable
- [ ] Generation completes within 15 seconds
- [ ] Hash-gating still prevents unnecessary regeneration
- [ ] Backward compatibility: paragraph field still populated

---

### T-005: Confidence-Tiered Source Attribution

**Wave:** 2 | **Points:** 5 | **Risk:** Medium | **Dependencies:** T-004

#### Summary

Implement CONFIRMED / REPORTED / UNVERIFIED confidence tiers based on source trust levels. Every claim in the brief gets a confidence label and source attribution.

#### Implementation Steps

1. **Add `trust_tier` field to `SourceDef`** in `lib/sources.ts`
   ```typescript
   trust_tier: 1 | 2 | 3 | 4 | 5;
   // 1=Official gov/military, 2=Airlines/airports, 3=Credible media, 4=Expert OSINT, 5=Social
   ```

2. **Classify all 28 existing sources** into trust tiers:
   - Tier 1: UAE MOFA, GCAA, US State Dept, White House, DoD, CENTCOM
   - Tier 2: Emirates, Etihad, flydubai, Air Arabia, Oman Air, Qatar Airways
   - Tier 3: BBC, Al Jazeera, Google News sources, RTA
   - Tier 4: (future expert sources)
   - Tier 5: X signals

3. **Implement confidence tier mapping logic** in `lib/intelligence-brief.ts`
   - CONFIRMED: 2+ Tier 1-2 sources corroborate a claim
   - REPORTED: 1 Tier 1-3 source reports a claim
   - UNVERIFIED: Only Tier 4-5 sources report a claim

4. **Inject attribution format into Claude prompt**
   - Instruct Claude to prefix claims with: `CONFIRMED (source1, source2): ...` or `REPORTED (source): ...`

5. **Parse attribution from Claude response** for frontend rendering

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `lib/sources.ts` | Modify | Add trust_tier to SourceDef, classify all sources |
| `lib/intelligence-brief.ts` | Modify | Add confidence tier logic and prompt instructions |

#### Acceptance Criteria

- [ ] All sources have trust_tier assigned
- [ ] Brief sections contain CONFIRMED/REPORTED/UNVERIFIED labels
- [ ] Each labeled claim includes source attribution
- [ ] 2+ Tier 1-2 corroboration → CONFIRMED
- [ ] Single official source → REPORTED
- [ ] Social-only → UNVERIFIED

---

### T-006: Cross-Source Correlation Logic

**Wave:** 2 | **Points:** 5 | **Risk:** High | **Dependencies:** T-004

#### Summary

Build logic to detect corroborating signals, contradictions, and coverage gaps across sources, feeding the results into the intelligence brief.

#### Implementation Steps

1. **Build correlation detector** in `lib/intelligence-brief.ts`
   - Group source snapshots by topic (keyword clustering)
   - Detect corroboration: multiple sources reporting same event
   - Detect contradictions: conflicting status levels or claims
   - Detect gaps: expected sources not reporting (e.g., airline silent during crisis)

2. **Generate correlation summary** for Claude context
   - "Corroborated: [source1] and [source2] both report airspace closure"
   - "Contradiction: [source1] reports normal operations while [source2] reports disruption"
   - "Gap: No update from Emirates in 4 hours during active crisis"

3. **Inject correlation data into brief prompt**
   - Add correlation summary as dedicated context section
   - Instruct Claude to highlight contradictions and gaps in source_coverage section

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `lib/intelligence-brief.ts` | Modify | Add correlation detection and summary generation |

#### Acceptance Criteria

- [ ] Corroborating signals identified across 2+ sources
- [ ] Contradictions surfaced with both source positions
- [ ] Coverage gaps detected for expected sources
- [ ] Correlation data reflected in brief source_coverage section

---

### T-007: Cumulative Statistics Tracking

**Wave:** 3 | **Points:** 3 | **Risk:** Low | **Dependencies:** T-002, T-004

#### Summary

Track and accumulate running statistics for ongoing crisis events (intercept counts, suspension days, closure duration) and inject them into brief context.

#### Implementation Steps

1. **Create stat accumulation functions** in `lib/crisis-stats.ts`
   - `updateCrisisStat(eventId, key, value, source)` — upsert stat
   - `getCrisisStats(eventId)` — fetch all stats for event
   - `getActiveEventStats()` — stats for all active events

2. **Define standard stat keys**
   ```typescript
   const CRISIS_STAT_KEYS = [
     'missiles_launched', 'missiles_intercepted', 'drones_launched', 'drones_intercepted',
     'flights_cancelled', 'flights_delayed', 'airlines_suspended',
     'airspace_closure_hours', 'casualty_reports'
   ] as const;
   ```

3. **Inject active crisis stats into brief context** in `lib/intelligence-brief.ts`
   - Include running totals in Claude prompt: "Since event start: 175 of 189 missiles intercepted"

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `lib/crisis-stats.ts` | Create | Stat accumulation and retrieval functions |
| `lib/intelligence-brief.ts` | Modify | Inject crisis stats into brief context |

#### Acceptance Criteria

- [ ] Stats upserted correctly (increment, not duplicate)
- [ ] Active event stats included in brief generation context
- [ ] Stats persist across brief regeneration cycles

---

### T-008: Redesign SituationBriefing Component

**Wave:** 3 | **Points:** 5 | **Risk:** Medium | **Dependencies:** T-009

#### Summary

Replace the single-paragraph briefing display with an expandable multi-section layout showing executive summary, security, flights, guidance, and source coverage.

#### Implementation Steps

1. **Create expandable section component** (`app/components/brief-section.tsx`)
   - Collapsible sections with chevron indicator
   - Default: executive summary visible, sections collapsed
   - Smooth expand/collapse animation
   - Mobile: all sections stacked, tap to expand

2. **Update `SituationBriefing` component** (`app/components/situation-briefing.tsx`)
   - Accept new `sections` prop alongside existing `paragraph`
   - If sections available: render layered view
   - If only paragraph: render legacy single-paragraph (backward compat)
   - Add confidence badges per claim (parse CONFIRMED/REPORTED/UNVERIFIED)
   - Add source attribution chips

3. **Styling**
   - Confidence badge colors: green=CONFIRMED, amber=REPORTED, red=UNVERIFIED
   - Section headers: Security, Airspace & Flights, Practical Guidance, Source Coverage
   - Maintain current max-width and responsive padding

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `app/components/brief-section.tsx` | Create | Reusable expandable section component |
| `app/components/situation-briefing.tsx` | Modify | Multi-section layout with confidence badges |

#### Acceptance Criteria

- [ ] Executive summary always visible
- [ ] 4 sections expand/collapse individually
- [ ] Confidence badges render with correct colors
- [ ] Backward compatible with paragraph-only briefs
- [ ] Responsive on mobile

---

### T-009: Update Brief API for Structured Sections

**Wave:** 3 | **Points:** 3 | **Risk:** Low | **Dependencies:** T-004

#### Summary

Modify the brief API endpoints to return structured sections alongside the legacy paragraph field.

#### Implementation Steps

1. **Update `/api/brief/current`** (`app/api/brief/current/route.ts`)
   - Include `sections` field in response when available
   - Keep `paragraph` field for backward compatibility

2. **Update `/api/brief/refresh`** (`app/api/brief/refresh/route.ts`)
   - Include `sections` in response after regeneration

3. **Update `loadCurrentStateBrief()`** in `lib/current-state-brief.ts`
   - Return sections from `current_state_brief.sections` JSONB column

4. **Update `page.tsx`** to pass sections to SituationBriefing component

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `app/api/brief/current/route.ts` | Modify | Include sections in response |
| `app/api/brief/refresh/route.ts` | Modify | Include sections in response |
| `lib/current-state-brief.ts` | Modify | Load/return sections field |
| `app/page.tsx` | Modify | Pass sections prop to SituationBriefing |

#### Acceptance Criteria

- [ ] /api/brief/current returns sections when available
- [ ] Legacy paragraph field still present
- [ ] Frontend receives and passes sections to component
- [ ] No breaking changes for existing consumers

---

### T-010: Event-Driven Regeneration Triggers

**Wave:** 3 | **Points:** 5 | **Risk:** Medium | **Dependencies:** T-004

#### Summary

Implement automatic brief regeneration when meaningful source changes occur: status transitions, flight anomalies, expert signals, and staleness backstop.

#### Implementation Steps

1. **Create trigger detection logic** in `lib/brief-triggers.ts`
   - `detectSourceStatusChange()` — compare current vs. previous source status_level
   - `detectFlightAnomaly()` — >10% change in delayed/cancelled ratio
   - `detectExpertSignal()` — new expert signal with relevance_score > 0.7
   - `isStale()` — >30 minutes since last generation

2. **Integrate triggers into ingestion pipeline** (`lib/ingest.ts`)
   - After source ingestion: check for status changes
   - After flight ingestion: check for anomalies
   - After expert signal ingestion: check for high-relevance signals
   - If any trigger fires: call `refreshCurrentStateBrief({ forceRegenerate: true })`

3. **Rate limiting** — max 20 regenerations per hour
   - Track regeneration count in memory or brief table
   - Skip regeneration if rate limit reached

4. **Retain hash-gating** — don't regenerate if inputs haven't meaningfully changed

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `lib/brief-triggers.ts` | Create | Trigger detection functions |
| `lib/ingest.ts` | Modify | Integrate trigger checks after ingestion stages |

#### Acceptance Criteria

- [ ] Source status change triggers regeneration within 60 seconds
- [ ] >10% flight disruption change triggers regeneration
- [ ] Expert signal with relevance >0.7 triggers regeneration
- [ ] 30-minute staleness backstop works
- [ ] Rate limited to 20 regenerations/hour
- [ ] Hash-gating prevents unnecessary regeneration

---

### T-011: Enable Supabase Auth (Email/Password + Magic Link)

**Wave:** 1 | **Points:** 5 | **Risk:** Medium | **Dependencies:** None

#### Summary

Configure Supabase Auth for email/password registration, magic link login, and password reset. This enables user persistence for chat and profiles.

#### Implementation Steps

1. **Configure Supabase Auth settings**
   - Enable email provider in Supabase dashboard
   - Configure email templates (confirm signup, magic link, password reset)
   - Set redirect URLs for production (keepcalmandcarryon.help)
   - Enable JWT refresh tokens

2. **Create auth middleware** (`lib/auth.ts`)
   - `getAuthUser(req)` — extract user from JWT in request
   - `requireAuth(req)` — throw 401 if not authenticated
   - `optionalAuth(req)` — return user or null
   - Uses `supabase.auth.getUser()` with access token from Authorization header

3. **Update Supabase browser client** (`lib/supabase-browser.ts`)
   - Already has `persistSession: true`, `autoRefreshToken: true`
   - Add `signUp()`, `signInWithPassword()`, `signInWithOtp()` helper exports

4. **Add auth environment variables**
   - `NEXT_PUBLIC_SUPABASE_URL` (already exists)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (already exists)
   - Verify Supabase auth email settings in dashboard

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `lib/auth.ts` | Create | Auth middleware helpers (getAuthUser, requireAuth, optionalAuth) |
| `lib/supabase-browser.ts` | Modify | Add auth helper function exports |

#### Acceptance Criteria

- [ ] Email/password registration works
- [ ] Magic link login works
- [ ] Password reset flow works
- [ ] JWT refresh tokens enabled
- [ ] Auth middleware correctly extracts user from request
- [ ] Existing Google OAuth continues to work

---

### T-012: Create user_profiles Table and RLS Policies

**Wave:** 3 | **Points:** 3 | **Risk:** Low | **Dependencies:** T-011

#### Summary

Create the user_profiles table for storing user preferences, tracked routes, and home airport.

#### Implementation Steps

1. **Create migration** (`supabase/migrations/20260305220000_user_profiles.sql`)
   ```sql
   CREATE TABLE user_profiles (
     id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
     display_name text,
     home_airport text,
     tracked_routes jsonb DEFAULT '[]',
     tracked_flights jsonb DEFAULT '[]',
     detail_preference text DEFAULT 'standard' CHECK (detail_preference IN ('concise', 'standard', 'comprehensive')),
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   );

   ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "Users can read own profile" ON user_profiles FOR SELECT USING (auth.uid() = id);
   CREATE POLICY "Users can insert own profile" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = id);
   CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE USING (auth.uid() = id);
   ```

2. **Create TypeScript types** in existing types file or `lib/user-profile.ts`

3. **Create profile CRUD helpers** in `lib/user-profile.ts`
   - `getOrCreateProfile(userId)` — fetch or auto-create on first login
   - `updateProfile(userId, updates)` — partial update

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/20260305220000_user_profiles.sql` | Create | Table, RLS policies |
| `lib/user-profile.ts` | Create | Profile CRUD helpers and types |

#### Acceptance Criteria

- [ ] Migration applies cleanly
- [ ] RLS policies enforce user-only access
- [ ] Profile auto-created on first authenticated access
- [ ] detail_preference defaults to 'standard'

---

### T-013: Build Authentication UI Components

**Wave:** 3 | **Points:** 5 | **Risk:** Medium | **Dependencies:** T-011

#### Summary

Build login, signup, magic link, and password reset UI components, plus a session indicator in the dashboard header.

#### Implementation Steps

1. **Create auth page** (`app/auth/page.tsx`)
   - Tab interface: Login | Sign Up
   - Login form: email + password, "Forgot password?" link, "Use magic link" option
   - Sign up form: email + password + confirm password
   - Magic link form: email only
   - Success/error messages
   - Redirect to dashboard on successful auth

2. **Create password reset page** (`app/auth/reset/page.tsx`)
   - Email input for reset request
   - New password form (when accessed via reset link)

3. **Add session indicator** to StatusHero or layout
   - Logged in: avatar/email + "Sign out" link
   - Logged out: "Sign in" link
   - Uses `supabase.auth.getSession()` on client

4. **Auth state provider** (`app/components/auth-provider.tsx`)
   - React context for auth state
   - Listen to `onAuthStateChange` events
   - Expose `user`, `signOut`, `isAuthenticated`

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `app/auth/page.tsx` | Create | Login/signup page |
| `app/auth/reset/page.tsx` | Create | Password reset page |
| `app/components/auth-provider.tsx` | Create | Auth state context provider |
| `app/layout.tsx` | Modify | Wrap with AuthProvider |
| `app/components/status-hero.tsx` | Modify | Add session indicator |

#### Acceptance Criteria

- [ ] Users can register with email/password
- [ ] Users can log in with email/password
- [ ] Users can log in with magic link
- [ ] Password reset flow works end-to-end
- [ ] Session indicator shows current auth state
- [ ] Sign out clears session

---

### T-014: Build User Profile Settings Page

**Wave:** 4 | **Points:** 3 | **Risk:** Low | **Dependencies:** T-012, T-013

#### Summary

Build a settings page where authenticated users can manage their profile, tracked routes/flights, and detail preferences.

#### Implementation Steps

1. **Create settings page** (`app/settings/page.tsx`)
   - Display name editing
   - Home airport selection (dropdown of common airports)
   - Detail preference toggle: Concise / Standard / Comprehensive
   - Tracked routes list with add/remove
   - Tracked flights list with add/remove
   - Save changes button

2. **Integrate with existing MyTrackingPanel**
   - Sync localStorage tracking with user_profiles
   - Import existing local tracking into profile on first login

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `app/settings/page.tsx` | Create | User profile settings page |
| `app/components/my-tracking-panel.tsx` | Modify | Sync with server-side profile |

#### Acceptance Criteria

- [ ] Users can edit display name and home airport
- [ ] Detail preference saved and retrieved
- [ ] Tracked routes/flights synced from localStorage on first login
- [ ] Changes persist across sessions

---

### T-015: Create Chat Tables

**Wave:** 4 | **Points:** 3 | **Risk:** Low | **Dependencies:** T-011

#### Summary

Create chat_sessions and chat_messages tables with RLS for persistent multi-turn conversations.

#### Implementation Steps

1. **Create migration** (`supabase/migrations/20260305230000_chat_tables.sql`)
   ```sql
   CREATE TABLE chat_sessions (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
     title text,
     created_at timestamptz NOT NULL DEFAULT now(),
     last_message_at timestamptz NOT NULL DEFAULT now()
   );

   CREATE TABLE chat_messages (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
     role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
     content text NOT NULL,
     context_snapshot jsonb DEFAULT '{}',
     created_at timestamptz NOT NULL DEFAULT now()
   );

   -- Indexes
   CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id, last_message_at DESC);
   CREATE INDEX idx_chat_messages_session ON chat_messages(session_id, created_at ASC);

   -- RLS
   ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
   ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "Users can access own sessions" ON chat_sessions FOR ALL USING (auth.uid() = user_id);
   CREATE POLICY "Users can access messages in own sessions" ON chat_messages FOR ALL
     USING (session_id IN (SELECT id FROM chat_sessions WHERE user_id = auth.uid()));
   ```

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/20260305230000_chat_tables.sql` | Create | Chat tables with RLS |

#### Acceptance Criteria

- [ ] Migration applies cleanly
- [ ] RLS enforces user-only access to sessions and messages
- [ ] Messages ordered by created_at ASC within session
- [ ] CASCADE delete: removing session removes messages

---

### T-016: Rewrite /api/chat for Multi-Turn Conversation

**Wave:** 4 | **Points:** 8 | **Risk:** High | **Dependencies:** T-001, T-015

#### Summary

Rewrite the chat API to support multi-turn conversations with session persistence, situation-grounded context injection, streaming responses, and direct-answer-first style.

#### Implementation Steps

1. **Update API signature** (`app/api/chat/route.ts`)
   - Accept: `{ question, session_id?, user_id? }`
   - Return streaming response (Anthropic streaming API)

2. **Session management**
   - If `session_id` provided: load conversation history from `chat_messages`
   - If no `session_id`: create new session
   - Store each turn (user message + assistant response) in `chat_messages`
   - Truncation strategy: keep last 20 messages, summarize older context

3. **Situation-grounded context injection**
   - Inject current intelligence brief (executive summary + relevant sections)
   - Inject relevant source snapshots based on question topic
   - Inject flight data when question is flight-related
   - Inject user profile context (tracked routes, home airport) when available

4. **Design Claude system prompt**
   - Role: "You are a situational intelligence assistant for UAE residents and travelers"
   - Style: Direct answer first, then supporting detail
   - Rules: Only cite sources from provided context, acknowledge uncertainty
   - Format: Markdown-friendly output

5. **Implement streaming**
   - Use Anthropic streaming API (`messages.create({ stream: true })`)
   - Return Server-Sent Events or ReadableStream
   - Progressive rendering on frontend

6. **Retain flight intent detection**
   - Keep `parseFlightIntent()` for route-specific queries
   - Enhanced: after detecting flight intent, also inject airline suspension status

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `app/api/chat/route.ts` | Modify | Full rewrite for multi-turn + streaming |
| `lib/chat-context.ts` | Create | Context assembly for chat (brief + sources + flights + user profile) |

#### Acceptance Criteria

- [ ] Multi-turn conversation with history recall
- [ ] Streaming responses render progressively
- [ ] Situation brief injected as context automatically
- [ ] Direct-answer-first style ("No — Emirates has suspended...")
- [ ] Session persisted in chat_sessions/chat_messages tables
- [ ] Flight intent detection still works
- [ ] Response time <8 seconds for grounded response
- [ ] Token budget managed (truncation for long conversations)

---

### T-017: Route-Specific Flight Intelligence Synthesis

**Wave:** 4 | **Points:** 5 | **Risk:** Medium | **Dependencies:** T-016

#### Summary

When a user asks about a specific route, synthesize carrier identification, suspension status, airspace availability, and flight status into a direct answer.

#### Implementation Steps

1. **Enhance flight intent handling** in chat context
   - Identify primary carriers on the route (from airline IATA prefix matching)
   - Check airline suspension status from ingested airline source snapshots
   - Check airspace corridor from aviation operations sources
   - Check individual flight status from flight_observations

2. **Build route intelligence summary** in `lib/chat-context.ts`
   - "Route: Dublin (DUB) → Dubai (DXB)"
   - "Primary carriers: Emirates (EK162/EK163), likely 1x daily"
   - "Airline status: Emirates suspended all flights until March 7 (source: emirates_updates)"
   - "Airspace: UAE FIR currently closed (source: gcaa_notams)"
   - "Alternative: Qatar Airways via Doha still operating"

3. **Inject route summary into Claude context** for synthesis

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `lib/chat-context.ts` | Modify | Add route intelligence assembly |
| `lib/flight-query.ts` | Modify | Add carrier identification per route |

#### Acceptance Criteria

- [ ] Route question returns carrier-specific answer
- [ ] Suspension status included with source attribution
- [ ] Flight numbers mentioned when identifiable
- [ ] Alternatives suggested when primary carrier suspended

---

### T-018: Implement Anonymous Chat Rate Limiting

**Wave:** 4 | **Points:** 2 | **Risk:** Low | **Dependencies:** T-011, T-016

#### Summary

Limit unauthenticated users to 5 chat messages per session, prompting signup after the limit.

#### Implementation Steps

1. **Track anonymous message count** via cookie or request IP
   - Set cookie `gcw_anon_chat_count` on first message
   - Increment on each message
   - Reset on new browser session

2. **Enforce limit in `/api/chat`**
   - If not authenticated and count >= 5: return 429 with signup prompt
   - Response: `{ ok: false, limit_reached: true, message: "Sign up for unlimited chat" }`

3. **Frontend handling**
   - Display signup prompt when limit reached
   - Link to auth page

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `app/api/chat/route.ts` | Modify | Add anonymous rate limiting check |
| `app/components/unified-query.tsx` | Modify | Handle limit_reached response |

#### Acceptance Criteria

- [ ] Anonymous users limited to 5 messages per session
- [ ] Authenticated users unlimited
- [ ] Friendly signup prompt on limit
- [ ] Count resets on new session

---

### T-019: Redesign Chat UI as Conversational Interface

**Wave:** 4 | **Points:** 8 | **Risk:** High | **Dependencies:** T-016

#### Summary

Replace the single-shot query box with a persistent conversational interface showing message history, streaming responses, and follow-up support.

#### Implementation Steps

1. **Create chat panel component** (`app/components/chat-panel.tsx`)
   - Full message history display (user + assistant messages)
   - Auto-scroll to latest message
   - Input field at bottom with send button
   - Streaming response display (typewriter effect)
   - Session management: new chat, continue existing

2. **Message bubble components**
   - User messages: right-aligned, dark background
   - Assistant messages: left-aligned, with source attribution chips
   - Loading state: typing indicator dots

3. **Session sidebar** (optional, for authenticated users)
   - List of past sessions with titles
   - Click to resume session
   - Delete session option

4. **Integration with dashboard**
   - Replace UnifiedQuery component in StatusHero
   - Or: add as slide-out panel / dedicated chat route

5. **Mobile-responsive**
   - Full-screen chat on mobile
   - Compact input on desktop

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `app/components/chat-panel.tsx` | Create | Full conversational chat interface |
| `app/components/chat-message.tsx` | Create | Individual message bubble component |
| `app/components/unified-query.tsx` | Modify | Integrate or replace with chat-panel |
| `app/components/status-hero.tsx` | Modify | Update chat integration point |

#### Acceptance Criteria

- [ ] Multi-turn message display with scrollable history
- [ ] Streaming response with progressive rendering
- [ ] Follow-up questions maintain context
- [ ] Session persistence for authenticated users
- [ ] Anonymous users see messages within session (no persistence)
- [ ] Mobile-responsive design
- [ ] Suggested prompts still available

---

### T-020: Add Persistent User Context to Chat

**Wave:** 4 | **Points:** 3 | **Risk:** Low | **Dependencies:** T-012, T-016

#### Summary

Inject user profile data (tracked routes, home airport, past concerns) into chat context so the assistant can personalize responses.

#### Implementation Steps

1. **Load user profile in chat context assembly** (`lib/chat-context.ts`)
   - Fetch user_profiles for authenticated user
   - Include tracked routes, tracked flights, home airport, detail preference

2. **Inject into Claude system prompt**
   - "The user tracks these routes: DUB→DXB, LHR→AUH"
   - "Home airport: DUB"
   - "Preferred detail level: comprehensive"

3. **Enable "my route" queries**
   - When user asks "any updates on my route?" → resolve from profile
   - When user asks "what about my flights?" → resolve tracked flight numbers

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `lib/chat-context.ts` | Modify | Add user profile injection |

#### Acceptance Criteria

- [ ] Authenticated user's tracked routes available in chat context
- [ ] "My route" queries resolve to user's tracked routes
- [ ] Detail preference affects response verbosity
- [ ] Works without profile (graceful degradation for unauthenticated)

---

### T-021: Add Defense/Security Sources and Extractors

**Wave:** 5 | **Points:** 5 | **Risk:** Medium | **Dependencies:** None

#### Summary

Add defense and security sources to the source registry: UAE Ministry of Defence, US CENTCOM, regional defense ministries, and OSINT aggregators.

#### Implementation Steps

1. **Add sources to `lib/sources.ts`**
   - UAE Ministry of Defence (RSS/HTML, Tier 1, priority 95)
   - US CENTCOM press releases (RSS, Tier 1, priority 93 — already exists, verify coverage)
   - Saudi MOD (HTML, Tier 1, priority 70)
   - Bahrain MOD (HTML, Tier 1, priority 65)
   - OSINT aggregators like Aurora Intel (HTML, Tier 4, priority 55)

2. **Build extractors** in `lib/source-extractors.ts`
   - Per-source HTML/RSS extraction patterns
   - Use Jina reader for SPA sites
   - Security keyword filtering

3. **Test extraction quality** with real content

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `lib/sources.ts` | Modify | Add defense/security source definitions |
| `lib/source-extractors.ts` | Modify | Add extractors for new sources |

#### Acceptance Criteria

- [ ] New sources appear in source registry
- [ ] Extractors produce usable headlines and summaries
- [ ] Quality filtering handles blocked/degraded states
- [ ] Sources integrate into existing ingestion pipeline

---

### T-022: Add Aviation Operations Sources and Extractors

**Wave:** 5 | **Points:** 5 | **Risk:** Medium | **Dependencies:** None

#### Summary

Add aviation operations sources: NOTAM feeds, EUROCONTROL, FAA advisories, airline suspension pages, and airport operational status.

#### Implementation Steps

1. **Research NOTAM data sources** (open question from spec)
   - FAA NOTAM API (free, US-focused but includes UAE FIR mentions)
   - ICAO API (subscription required)
   - UAE GCAA NOTAM page (HTML scrape)
   - Select best option

2. **Add sources to `lib/sources.ts`**
   - NOTAM feed (Tier 2, priority 85)
   - EUROCONTROL Network Manager (Tier 2, priority 80)
   - FAA KICZ advisories (Tier 2, priority 75)
   - Dubai Airports operational status (Tier 2, priority 90)
   - Abu Dhabi Airports status (Tier 2, priority 88)

3. **Build extractors** for each new source

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `lib/sources.ts` | Modify | Add aviation operations source definitions |
| `lib/source-extractors.ts` | Modify | Add extractors for new sources |

#### Acceptance Criteria

- [ ] NOTAM data accessible and parsed
- [ ] Airport operational status ingested
- [ ] Aviation sources integrate into existing pipeline
- [ ] Quality filtering handles blocked/degraded states

---

### T-023: Implement Source Trust Tier Classification

**Wave:** 5 | **Points:** 3 | **Risk:** Low | **Dependencies:** T-005

#### Summary

Formalize the 5-tier trust classification system and apply it to all sources, mapping tiers to the confidence attribution system.

#### Implementation Steps

1. **Document tier definitions** in source registry comments
   - Tier 1 - Official: Government/military (UAE MoD, MOFA, GCAA, State Dept, CENTCOM)
   - Tier 2 - Operational: Airlines, airports, aviation authorities
   - Tier 3 - Credible Media: Established news agencies (Reuters, BBC, WAM)
   - Tier 4 - Expert OSINT: Known defense/aviation analysts
   - Tier 5 - Social/Unverified: X signals, unverified accounts

2. **Verify all sources classified** — ensure every source in OFFICIAL_SOURCES has trust_tier

3. **Update confidence mapping** in intelligence brief to use trust_tier directly

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `lib/sources.ts` | Modify | Verify all sources have trust_tier |
| `lib/intelligence-brief.ts` | Modify | Use trust_tier in confidence mapping |

#### Acceptance Criteria

- [ ] All sources have trust_tier 1-5
- [ ] Tier classification documented
- [ ] Confidence tiers derive from trust_tier

---

### T-024: Augment Flight Tracking with Departure Board Data

**Wave:** 5 | **Points:** 5 | **Risk:** High | **Dependencies:** None

#### Summary

Add airport departure/arrival board data to track scheduled vs. actual flight status (delayed, cancelled, diverted).

#### Implementation Steps

1. **Research data availability** (open question from spec)
   - Does current FR24 API subscription include airport boards?
   - Alternative: FR24 airport page scraping
   - Alternative: AviationStack API (has scheduled + actual)
   - Alternative: FlightAware AeroAPI

2. **Create `flight_schedules` table**
   ```sql
   CREATE TABLE flight_schedules (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     flight_number text NOT NULL,
     origin_iata text NOT NULL,
     destination_iata text NOT NULL,
     scheduled_departure timestamptz NOT NULL,
     scheduled_arrival timestamptz,
     actual_departure timestamptz,
     actual_arrival timestamptz,
     status text DEFAULT 'scheduled',
     delay_minutes int,
     cancellation_reason text,
     source text NOT NULL,
     fetched_at timestamptz NOT NULL DEFAULT now()
   );
   ```

3. **Build schedule ingestion** in `lib/flight-schedules.ts`
   - Fetch departure board data for DXB, AUH, DWC
   - Compare scheduled vs. actual
   - Compute delay and cancellation status

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/20260305250000_flight_schedules.sql` | Create | Schedule table |
| `lib/flight-schedules.ts` | Create | Schedule ingestion and comparison |
| `lib/ingest.ts` | Modify | Integrate schedule ingestion |

#### Acceptance Criteria

- [ ] Schedule data ingested for DXB, AUH, DWC
- [ ] Scheduled vs. actual comparison computed
- [ ] Delay minutes and cancellation status tracked
- [ ] Data accessible for chat and brief context

---

### T-025: Implement Crisis Event Auto-Detection

**Wave:** 6 | **Points:** 5 | **Risk:** High | **Dependencies:** T-002, T-007

#### Summary

Automatically detect crisis events when multiple sources transition to advisory/disrupted status within a 6-hour window.

#### Implementation Steps

1. **Create detection logic** in `lib/crisis-detection.ts`
   - After each ingestion cycle, check:
     - How many sources transitioned to advisory/disrupted in last 6 hours?
     - Threshold: 3+ sources → trigger crisis event detection
   - Auto-create `crisis_event` record with:
     - Name: auto-generated from dominant keywords
     - Category: inferred from source types (military sources → military, airline sources → infrastructure)
     - Affected airports: from source metadata
     - Start time: earliest source transition

2. **Integrate into ingestion pipeline**
   - Run detection after source status updates
   - Skip if active crisis already exists covering same sources

3. **Admin override** — add `is_false_positive` flag to dismiss false positives

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `lib/crisis-detection.ts` | Create | Auto-detection logic |
| `lib/ingest.ts` | Modify | Trigger detection after source updates |

#### Acceptance Criteria

- [ ] 3+ sources transitioning to advisory/disrupted triggers crisis event
- [ ] Event auto-created with name, category, affected regions
- [ ] Duplicate detection prevents redundant events
- [ ] False positives can be dismissed

---

### T-026: Build Crisis Timeline and Trend Analysis

**Wave:** 6 | **Points:** 5 | **Risk:** Medium | **Dependencies:** T-025

#### Summary

Maintain a chronological timeline of key developments during active crises and analyze getting-better/worse/stable trends.

#### Implementation Steps

1. **Timeline construction** in `lib/crisis-timeline.ts`
   - Extract key developments from source snapshots during active crisis period
   - Organize chronologically with source attribution
   - Deduplicate similar entries

2. **Trend analysis**
   - Compare flight disruption rate over time (hourly windows)
   - Track source status level changes (escalation/de-escalation signals)
   - Derive trajectory: "Getting better" / "Getting worse" / "Stable"
   - Estimate recovery timeline when sufficient data points exist

3. **Store timeline entries** in crisis_event_stats or new timeline table

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `lib/crisis-timeline.ts` | Create | Timeline construction and trend analysis |

#### Acceptance Criteria

- [ ] Timeline shows chronological developments with timestamps and sources
- [ ] Trend analysis produces getting-better/worse/stable assessment
- [ ] Flight disruption rate tracked over time
- [ ] Recovery timeline estimated when data supports it

---

### T-027: Build Crisis Event Management UI

**Wave:** 6 | **Points:** 5 | **Risk:** Medium | **Dependencies:** T-025, T-026

#### Summary

Build a frontend component showing crisis timeline, cumulative stats, and trend indicators.

#### Implementation Steps

1. **Create crisis timeline component** (`app/components/crisis-timeline.tsx`)
   - Vertical timeline of key developments
   - Source attribution per entry
   - Color-coded by severity

2. **Create crisis stats dashboard** (`app/components/crisis-stats.tsx`)
   - Key cumulative stats (intercepts, cancellations, closure duration)
   - Trend indicator (arrow up/down/flat)
   - Last updated timestamp

3. **Integrate into dashboard** (`app/page.tsx`)
   - Show crisis section when active crisis exists
   - Expandable/collapsible

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `app/components/crisis-timeline.tsx` | Create | Timeline component |
| `app/components/crisis-stats.tsx` | Create | Stats dashboard component |
| `app/page.tsx` | Modify | Integrate crisis section |

#### Acceptance Criteria

- [ ] Timeline displays during active crisis
- [ ] Stats show running cumulative counts
- [ ] Trend indicator visible
- [ ] Hidden when no active crisis

---

### T-028: Update StatusHero with Trend Indicator

**Wave:** 6 | **Points:** 3 | **Risk:** Low | **Dependencies:** T-025

#### Summary

Add a trend indicator to StatusHero showing whether the situation is improving, worsening, or stable.

#### Implementation Steps

1. **Add trend prop** to StatusHero
   ```typescript
   trend?: 'improving' | 'worsening' | 'stable' | null;
   ```

2. **Display trend indicator** next to posture dot
   - Improving: green arrow down
   - Worsening: red arrow up
   - Stable: gray dash
   - Null: hidden (no active crisis)

3. **Derive trend from crisis analysis** in `page.tsx`

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `app/components/status-hero.tsx` | Modify | Add trend indicator display |
| `app/page.tsx` | Modify | Pass trend prop from crisis data |

#### Acceptance Criteria

- [ ] Trend indicator visible during active crisis
- [ ] Color-coded: green=improving, red=worsening, gray=stable
- [ ] Hidden when no active crisis

---

## Implementation Adjustments from Spec

**Plan Created:** 2026-03-05
**Spec:** [reimagined-intelligence-engine.spec.md](../../specs/reimagined-intelligence-engine.spec.md)

### Tickets Added (not in original spec TODO)
- T-023 was separated from T-005 since trust tier classification is a distinct deliverable from confidence-tiered attribution

### Tickets Split
- Spec's "Rewrite /api/chat/route.ts to support multi-turn" was split into T-016 (API rewrite), T-017 (route intelligence), T-018 (rate limiting), T-019 (UI), T-020 (user context) — the original was too large for a single ticket

### Execution Order Changed
- Spec recommends Phase 1 → Phase 4 → Phase 2 → Phase 3 → Phase 5
- Plan interleaves Phase 4 (auth) with Phase 1 (brief) in Wave 1/3 since auth has no dependencies
- This allows earlier parallel execution

### Open Questions Carried Forward
- **Claude model selection:** Ticket T-001 starts with Sonnet; monitor cost to decide Haiku vs Sonnet for routine
- **NOTAM data source:** Ticket T-022 includes research step
- **FR24 departure boards:** Ticket T-024 includes data availability research
- **Chat token budget:** Ticket T-016 includes truncation strategy (20-message sliding window)

---

## Completion Details

### T-001: Switch LLM Provider to Anthropic Claude

**Completed:** 2026-03-05
**Commit:** b05da93

#### Changes Made
- Created `lib/anthropic.ts` — shared Claude client wrapper (singleton client, `generateText()`, `hasAnthropicKey()`, `extractClaudeUsage()`)
- Migrated all 11 OpenAI API call sites across 9 files to use `generateText()` from the shared wrapper
- Default model: `claude-sonnet-4-6` replacing `gpt-4o-mini`
- Added `@anthropic-ai/sdk` dependency
- Preserved backward-compatible env vars (`GPT_*` as fallback for `LLM_*`)

#### Files Modified/Created
- `lib/anthropic.ts` (NEW) — Central Claude client wrapper
- `lib/anthropic.test.ts` (NEW) — 9 unit tests
- `lib/current-state-brief.ts` — Briefing generation
- `lib/update-validation.ts` — Update validation scoring
- `lib/llm-extract.ts` — LLM content extraction
- `lib/news-summarize.ts` — News cluster summarization
- `lib/flight-query.ts` — Flight advisory insights
- `lib/expert-feed-ingest.ts` — Expert feed relevance scoring + digest
- `lib/x-signals.ts` — Translation provider
- `app/api/chat/route.ts` — Chat endpoint
- `app/api/flights/query/route.ts` — Flight query endpoint
- `package.json` — Added @anthropic-ai/sdk

#### Tests Added
- `lib/anthropic.test.ts` — 9 tests (hasAnthropicKey, getAnthropicClient, extractClaudeUsage)

#### Deviations
- None

#### Follow-up Tickets
- None
