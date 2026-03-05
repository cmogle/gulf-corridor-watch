# Crisis Ops Answer Engine - Design Spec

**Date:** 2026-03-05  
**Status:** Proposed  
**Scope:** Product + architecture + schema redesign (no implementation in this document)

## 1) Problem

`gulf-corridor-watch` is currently source-centric and feed-centric:
- ingestion produces `source_snapshots` and social rows
- feed composition ranks source updates
- briefing generation writes one paragraph
- chat answers are mostly prompt-composed from selected rows

This design cannot consistently deliver high-confidence operational answers to questions like:
- "What happened overnight in the UAE?"
- "Were there ongoing attacks?"
- "Did anything get through air defenses?"
- "Will Dublin -> Dubai operate today?"

The current stack lacks first-class entities for:
- explicit claims
- claim contradictions/corroboration
- computed state estimates
- answer-time traceability

## 2) Product Decision

Reframe the app from a live update dashboard into a **Crisis Ops Answer Engine**:
- primary output is a structured operational answer
- feed remains evidence drill-down, not primary interface
- every high-stakes statement must be tied to evidence and confidence

## 3) Goals

1. Deterministic answer shape for core crisis intents.
2. Evidence trace for every major sentence.
3. Explicit handling of uncertainty (`confirmed`, `not confirmed`, `unclear`).
4. Route-operability estimation grounded in airline notices + flight telemetry + official advisories.
5. Preserve current ingestion strengths while adding claim/state layers.

## 4) Non-Goals

1. Predictive geopolitical intelligence beyond declared confidence bounds.
2. Replacing all current UI surfaces in phase 1.
3. Removing existing feed endpoints (`/api/updates/feed`, `/api/brief/current`) immediately.

## 5) Core User Intents

The engine must route questions into one primary intent:
- `overnight_sitrep`
- `attack_activity_status`
- `penetration_status`
- `airspace_status`
- `route_operability`
- `flight_number_status`
- `general_context` (fallback)

## 6) Answer Contract (for crisis intents)

All crisis-intent responses return:
1. `bottom_line`
2. `overnight_delta`
3. `attack_status`
4. `penetration_status`
5. `airspace_status`
6. `route_operability` (when route present or inferable)
7. `unknowns`
8. `sources` (URLs + fetched/published times)

Each section carries:
- `confidence: high | medium | low`
- `evidence_ids[]`
- `last_updated_at`

## 7) Proposed Architecture

### 7.1 Evidence Layer (existing + extended)

Use existing sources:
- `source_snapshots`
- `social_signals`
- `source_events_v2`
- `flight_observations`

Add normalized evidence table to unify answer-time retrieval:
- `evidence_items`

### 7.2 Claim Layer (new)

Create machine-readable claims extracted from evidence.

New table:
- `claims`

Claim fields:
- `claim_type` (`attack_event`, `intercept_event`, `airspace_restriction`, `airport_ops`, `airline_schedule`, `route_disruption`, etc.)
- `subject`, `predicate`, `object`
- `location_scope`
- `time_start`, `time_end`
- `polarity` (`affirmed`, `denied`, `unclear`)
- `claim_confidence`
- `ingestion_run_id`

Bridge table:
- `claim_evidence_links` (many-to-many)

### 7.3 State Layer (new)

Compute rolling estimates per region/route:
- `state_estimates`

State keys:
- `uae.attack_activity`
- `uae.penetration`
- `uae.airspace_posture`
- `route.DUB-DXB.operability`

Each estimate stores:
- categorical value
- numeric score (0-100)
- confidence
- validity window
- supporting claim ids

### 7.4 Answer Layer (new)

Intent-aware answer composer:
- query claims + state estimates
- fill deterministic response schema
- optional LLM wording pass constrained to provided JSON

Persist each answer:
- `answer_runs` + `answer_sections`

This gives full post-hoc auditability.

## 8) Schema Additions (proposed)

### 8.1 `evidence_items`

Purpose: canonical evidence record for all upstream sources.

Key columns:
- `evidence_id uuid pk`
- `source_kind text` (`snapshot`, `trusted_event`, `social_x`, `news_item`, `flight_metric`)
- `source_ref text` (upstream row id)
- `source_id text`
- `headline text`
- `body text`
- `event_at timestamptz`
- `fetched_at timestamptz`
- `url text`
- `reliability text`
- `validation_state text`
- `content_hash text`

Indexes:
- `(source_id, event_at desc)`
- `(event_at desc)`
- `(content_hash)`

### 8.2 `claims`

Key columns:
- `claim_id uuid pk`
- `claim_type text`
- `subject text`
- `predicate text`
- `object text`
- `location_scope text`
- `time_start timestamptz`
- `time_end timestamptz`
- `polarity text`
- `claim_confidence numeric(4,3)`
- `status_level text`
- `extraction_method text` (`rule`, `llm`, `hybrid`)
- `created_at`

Indexes:
- `(claim_type, time_start desc)`
- `(location_scope, time_start desc)`
- `(polarity, claim_confidence desc)`

### 8.3 `claim_evidence_links`

Key columns:
- `claim_id uuid fk`
- `evidence_id uuid fk`
- `support_weight numeric(4,3)`
- `relation_type text` (`supports`, `contradicts`, `context`)

Primary key:
- `(claim_id, evidence_id)`

### 8.4 `state_estimates`

Key columns:
- `estimate_id uuid pk`
- `state_key text`
- `scope_key text`
- `value_text text`
- `value_score integer`
- `confidence text`
- `window_start timestamptz`
- `window_end timestamptz`
- `computed_at timestamptz`
- `method_version text`
- `basis_claim_ids uuid[]`

Indexes:
- `(state_key, scope_key, computed_at desc)`
- `(window_end desc)`

### 8.5 `answer_runs` and `answer_sections`

`answer_runs`:
- `answer_run_id uuid pk`
- `question text`
- `intent text`
- `requested_at timestamptz`
- `resolved_at timestamptz`
- `overall_confidence text`
- `model text`
- `status text`

`answer_sections`:
- `answer_section_id uuid pk`
- `answer_run_id uuid fk`
- `section_key text`
- `text text`
- `confidence text`
- `evidence_ids uuid[]`
- `state_estimate_ids uuid[]`

## 9) Pipeline Changes

## 9.1 Ingestion -> Evidence normalization

After each source ingestion run:
1. upsert `evidence_items` from new/changed upstream rows
2. mark stale evidence by TTL policy

## 9.2 Evidence -> Claims

Claim extraction pass:
1. rules for highly structured signals (airline notices, route suspensions, airport updates)
2. constrained LLM extraction for conflict/security text
3. contradiction linking when new claim polarity conflicts with recent high-confidence claims

## 9.3 Claims -> State estimates

Per 5-minute cycle compute:
- attack activity status (recent affirmed attack/intercept claims)
- penetration status (affirmed impact/breach claims vs denied/unclear)
- airspace posture (restrictions + airport ops + flight telemetry stress)
- route operability per top monitored routes

## 10) Route Operability Model (DUB -> DXB example)

Inputs:
- airline schedule advisories (`emirates_updates`, `etihad_advisory`, etc.)
- trusted event claims (`route_disruption`, `airspace_restriction`)
- flight telemetry (`flight_observations` recency, cancellation ratio, delay ratio)
- official authority notices (GCAA/MOFA equivalent source claims)

Output:
- `operability_status`: `operational`, `degraded`, `suspended`, `unclear`
- `operability_score`: 0-100
- `confidence`
- explanation with explicit drivers

## 11) API Surface (proposed)

### Keep
- `GET /api/updates/feed`
- `GET /api/brief/current`

### Add
- `POST /api/answer` (new primary endpoint)
- `GET /api/state/current?scope=uae`
- `GET /api/routes/operability?origin=DUB&destination=DXB`
- `GET /api/claims/recent?type=attack_event&scope=uae`

### `POST /api/chat`

Refactor to:
- route into `POST /api/answer`
- maintain backward compatibility for existing client payload

## 12) Prompting and Generation Guardrails

1. LLM cannot introduce facts not present in selected claims/states.
2. All numeric counts/dates in answer text must come from selected data fields.
3. If corroboration threshold is not met, section must render as `unclear`.
4. If data freshness SLA breached, inject freshness caveat automatically.

## 13) Observability

Add telemetry events:
- `claim_extraction_run`
- `state_estimation_run`
- `answer_generation_run`
- `answer_policy_violation`
- `insufficient_evidence_fallback`

Track:
- per-intent confidence distribution
- unanswered/unclear rate
- contradiction rate
- evidence age at answer time

## 14) Rollout Plan

### Phase 0 - Spec + schema migration prep
- finalize tables and indexes
- define intent taxonomy and answer contract JSON schema

### Phase 1 - Hidden backend path
- build evidence/claim/state pipelines
- keep UI unchanged
- expose `/api/answer` behind feature flag

### Phase 2 - Chat route migration
- route crisis intents from `/api/chat` to new answer engine
- fallback to legacy chat for non-crisis intent

### Phase 3 - UI reframe
- add Operational Answers panel as primary section
- demote feed/brief to supporting evidence

### Phase 4 - Legacy sunset
- retire one-paragraph brief generation as primary summary artifact

## 15) Acceptance Criteria

1. For a crisis-intent query, response shape always matches answer contract.
2. Each section has at least one evidence reference or explicit `insufficient_evidence` marker.
3. Route operability answers include confidence + freshness.
4. Re-running same query within unchanged state window yields stable output.
5. Audit trail allows reconstructing exactly why each section was produced.

## 16) Risks and Mitigations

- Risk: false precision in conflict casualty/impact numbers.  
  Mitigation: numeric facts require >=2 corroborating evidence items or explicit "single-source report" qualifier.

- Risk: contradictory source narratives.  
  Mitigation: preserve contradictory claims and downgrade state confidence.

- Risk: latency increase from multi-layer pipeline.  
  Mitigation: precompute state estimates on schedule; answer endpoint reads cached state + claims.

- Risk: schema complexity.  
  Mitigation: phase rollout and keep legacy tables/endpoints intact until parity is proven.

