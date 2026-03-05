# User Epic - Overnight UAE Crisis Check

**Date:** 2026-03-05  
**Status:** Proposed  
**Companion to:** `2026-03-05-crisis-ops-answer-engine-design.md`

## Epic Summary

A UAE-bound traveler asks one urgent multi-part question:

> "Summarise what happened overnight in the UAE. Were there ongoing Iranian attacks? Did any missiles/drones get through? Will Dublin to Dubai be operational today?"

The system should return a structured, evidence-linked operational answer in under 3 seconds for warm-cache scenarios.

## Persona

- Name: Aisha
- Location: Dublin Airport area
- Situation: Flight booked to Dubai today, needs immediate operational clarity
- Tolerance for ambiguity: low
- Trust requirement: high (must see what is known vs unknown)

## Journey Narrative (End-to-End)

## 1) Before user asks - data is already flowing

Every few minutes the platform ingests:
- official advisories
- airline update pages
- official X updates
- flight telemetry

### Schema support

- Raw source data: `source_snapshots`, `social_signals`, `source_events_v2`, `flight_observations`
- Canonical evidence rows: `evidence_items`
- Derived claims: `claims`
- Claim-to-proof links: `claim_evidence_links`
- Rolling situational outputs: `state_estimates`

## 2) User submits question in unified query

The input is routed to intent: `overnight_sitrep` + `route_operability`.

### Schema support

- New run row inserted: `answer_runs`
  - `question`
  - `intent=overnight_sitrep`
  - `requested_at`

## 3) Engine fetches "overnight window" evidence

Window (example): last 12 hours from query time in GST.

Pulled data:
- recent `state_estimates` for `uae.attack_activity`, `uae.penetration`, `uae.airspace_posture`
- route estimate for `route.DUB-DXB.operability`
- supporting claims and linked evidence

### Schema support

- primary read: `state_estimates`
- join to `claims` via `basis_claim_ids`
- join to `claim_evidence_links` -> `evidence_items`

## 4) System resolves each answer section

For each section, composer decides:
- final text
- confidence
- source links
- freshness caveat if needed

### Schema support

- section artifacts written to `answer_sections`
  - `section_key=bottom_line|overnight_delta|attack_status|penetration_status|airspace_status|route_operability|unknowns|sources`
  - `evidence_ids[]`
  - `state_estimate_ids[]`
  - `confidence`

## 5) User receives answer with explicit uncertainty boundaries

Example behavior:
- "No newly confirmed large-scale overnight attacks in UAE airspace" -> medium confidence
- "No confirmed penetration events in current official evidence set" -> medium confidence
- "DUB -> DXB remains degraded; check airline confirmation before airport arrival" -> high confidence if airline suspension claim exists

If evidence is insufficient:
- section must explicitly say `unclear`
- cite freshness or coverage gap reason

### Schema support

- uncertainty backed by `claims.polarity='unclear'` and/or stale `state_estimates.window_end`
- explicit source list from `evidence_items.url` and timestamps

## 6) User drills into "why"

From the answer UI, Aisha opens "Sources used."

She can inspect:
- exact advisory snippet
- exact airline update
- exact timestamp and URL

### Schema support

- deterministic trace path:
  `answer_sections.evidence_ids[]` -> `evidence_items` -> upstream source refs

## 7) Audit and reliability review

Later, ops team can replay answer construction for this run.

### Schema support

- full trail:
  - `answer_runs` (when/intent/question)
  - `answer_sections` (what was said)
  - `state_estimates` (machine state at answer time)
  - `claims` + `claim_evidence_links` + `evidence_items` (why it was said)

## Journey-to-Schema Mapping

| Journey step | User-visible behavior | Primary tables |
|---|---|---|
| Ingestion | Fresh source updates available | `source_snapshots`, `social_signals`, `source_events_v2`, `flight_observations` |
| Normalization | Unified evidence corpus | `evidence_items` |
| Interpretation | Facts become machine claims | `claims`, `claim_evidence_links` |
| Situation modeling | Current operational states computed | `state_estimates` |
| Question handling | Answer run starts | `answer_runs` |
| Response composition | Sectioned response produced | `answer_sections` |
| User trust drill-down | Sources shown with timestamps | `answer_sections`, `evidence_items` |
| Post-hoc review | Full replayability | all above |

## Epic Acceptance Criteria

1. User receives an answer with all required sections within SLA.
2. Each section includes confidence and at least one evidence link or explicit insufficiency marker.
3. Route operability section is present when an OD pair is detectable from question.
4. User can open source links for every non-`unclear` section.
5. Ops can reproduce the exact answer from persisted run data.

## Example Success Snapshot

If this epic succeeds, Aisha experiences:
- immediate clarity on "what changed overnight"
- honest uncertainty where data is incomplete
- explicit statement about DUB -> DXB operational risk
- confidence that the answer is traceable to official evidence, not generic model prose

