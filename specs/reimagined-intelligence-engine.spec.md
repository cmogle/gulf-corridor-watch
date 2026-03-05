# Feature: Reimagined Intelligence Engine

## Overview

Transform Gulf Corridor Watch from a data collection dashboard into a **situational intelligence platform**. The system currently ingests 23+ sources and displays them as individual feed items with a templated single-paragraph brief. The reimagined system will produce **Grok-quality synthesized intelligence reports** — layered situation assessments with direct answers, cumulative statistics, route-specific flight guidance, and actionable recommendations — powered by a **persistent conversational assistant** that remembers users and their concerns across sessions.

**North star**: A UAE resident asks "did any missiles get through last night?" and gets a direct answer with intercept stats, source citations, confidence tiers, and a practical bottom line — not a feed of individual source updates.

## User Persona

**Primary**: UAE resident/expat seeking ongoing situational awareness during regional crises. Tracks security situation, flights, and daily life impacts. Wants depth, nuance, and actionable intelligence — not just flight status.

**Secondary**: Traveler with an upcoming flight to/from the UAE needing route-specific guidance (will my flight operate? is it safe? what should I do?).

---

## Phase 1: Intelligence Brief Engine

### FR-BRIEF-001: Layered Situation Report Generation

When the intelligence engine detects a source status change (normal→advisory→disrupted or reverse), a new flight data anomaly, or a new defense/security source update, the system shall generate a layered situation report consisting of:
1. **Executive Summary** (2-3 sentences): headline posture, most critical development, and bottom-line advisory
2. **Expandable sections**:
   - **Security Situation**: military/defense developments, intercept statistics, threat posture
   - **Airspace & Flights**: airspace status, airline suspensions, route availability, airport operations
   - **Practical Guidance**: what to do / not do, who to contact, when to check back
   - **Source Coverage**: what sources confirm this picture, what gaps exist

### FR-BRIEF-002: Cross-Source Synthesis

When generating the situation report, the system shall correlate data across ALL available source categories (official government, airline, defense, aviation operations, expert OSINT, social signals) into a unified narrative rather than reporting each source independently. The system shall identify corroborating signals, contradictions, and gaps.

### FR-BRIEF-003: Cumulative Statistics Tracking

The system shall maintain running cumulative statistics for ongoing multi-day events, including:
- Missile/drone intercept counts (total launched vs. intercepted since event start)
- Cumulative casualties/damage reports
- Days of flight suspension by airline
- Airspace closure duration

These shall persist across brief regeneration cycles via a `crisis_event_stats` table.

### FR-BRIEF-004: Confidence-Tiered Source Attribution

The system shall label every claim in the situation report with both a confidence tier and source attribution:
- **CONFIRMED** (2+ official sources corroborate): "CONFIRMED (UAE MoD, Emirates): All scheduled flights suspended until March 7."
- **REPORTED** (1 official source or credible media): "REPORTED (Reuters): 3 ballistic missiles intercepted overnight."
- **UNVERIFIED** (social/OSINT only): "UNVERIFIED (OSINT): Debris reported in Al Quoz industrial area."

### FR-BRIEF-005: Event-Driven Regeneration

The system shall regenerate the situation report when ANY of these triggers occur:
- A source status level changes (normal↔advisory↔disrupted)
- A new source snapshot contains keywords matching active crisis event categories
- Flight observation data shows >10% change in delayed/cancelled ratio vs. previous cycle
- A new expert signal with relevance score >0.7 is ingested
- More than 30 minutes have elapsed since last generation (staleness backstop)

The system shall NOT regenerate when inputs have not meaningfully changed (retain current hash-gating mechanism).

### FR-BRIEF-006: Full Context Window for LLM

When generating the situation report, the system shall provide the LLM with ALL gated source snapshots (not just 2), ALL corroborated social signals (not just 2), the expert digest, flight statistics, and the crisis event cumulative stats. Context gating shall filter for quality and freshness but shall not artificially cap the number of evidence rows to a small fixed limit.

### FR-BRIEF-007: Claude-Powered Generation

The system shall use the Anthropic Claude API (claude-sonnet-4-6 for routine generation, claude-opus-4-6 for complex multi-section reports) as the intelligence engine LLM, replacing OpenAI gpt-4o-mini.

---

## Phase 2: Conversational Intelligence Assistant

### FR-CHAT-001: Multi-Turn Conversation with Session Persistence

While a user is authenticated, when they send a message to the chat assistant, the system shall maintain full conversation history within the session and across sessions (stored in Supabase), enabling follow-up questions, clarifications, and evolving inquiries.

### FR-CHAT-002: Situation-Grounded Responses

When responding to any user question, the system shall automatically inject the current situation report, latest flight data, and relevant source snapshots as context, so every response is grounded in the latest intelligence picture.

### FR-CHAT-003: Direct Answer Style

When a user asks a yes/no or factual question, the system shall lead with a direct answer before providing supporting detail. Examples:
- "Did any missiles get through?" → "**No** — virtually all were intercepted. [stats follow]"
- "Will my Dublin-Dubai flight operate today?" → "**No** — Emirates has suspended all scheduled flights until March 7. [details follow]"
- "Is it safe to go to the airport?" → "**Only if your airline has directly confirmed your flight.** Dubai Airports advises against going to the airport without confirmed booking. [source follows]"

### FR-CHAT-004: Route-Specific Flight Intelligence

While the user asks about a specific route (e.g., "Dublin to Dubai"), the system shall:
1. Identify the primary carriers on that route (Emirates EK162/EK163)
2. Check airline suspension status from ingested airline sources
3. Check airspace corridor availability from aviation operations sources
4. Check individual flight status from flight observation data
5. Synthesize into a direct answer with specific flight numbers, dates, and alternatives

### FR-CHAT-005: Persistent User Context

While a user is authenticated, the system shall store and recall:
- User's tracked routes and flights
- Past questions and areas of concern
- Home location (for contextualizing advice)
- Preferred level of detail (concise vs. comprehensive)

### FR-CHAT-006: Actionable Recommendations

When the situation involves active disruption, the system shall conclude responses with concrete actionable advice:
- What to do ("Contact your airline directly for rebooking")
- What NOT to do ("Do not go to the airport without confirmed booking")
- Who to contact (specific hotline numbers, embassy contacts)
- When to check back ("Situation updates every 15 minutes; next airline review at 23:59 March 7")

---

## Phase 3: Expanded Source Registry

### FR-SRC-001: Defense & Security Sources

The system shall ingest the following new source categories:
- **UAE Ministry of Defence** official statements and press releases
- **US CENTCOM** press releases and operational updates
- **IRGC/Iranian state media** (for adversary claims — labeled as such)
- **OSINT aggregators** (e.g., Aurora Intel, Fighterman) for real-time intercept tracking
- **Regional defense ministries** (Saudi, Bahrain, Oman) for coalition updates

### FR-SRC-002: Aviation Operations Sources

The system shall ingest the following new source categories:
- **NOTAM feeds** (Notice to Airmen) for UAE FIR and adjacent FIRs
- **EUROCONTROL Network Manager** for European route impact
- **FAA airspace advisories** (KICZ) for US carrier restrictions
- **Airline-specific suspension notices** (Emirates, Etihad, FlyDubai, Air Arabia individual pages)
- **Dubai Airports / Abu Dhabi Airports** operational status feeds
- **FlightRadar24 airport boards** (departure/arrival boards, not just live positions) for actual delay/cancellation data

### FR-SRC-003: Source Quality Classification

The system shall classify all sources into trust tiers:
- **Tier 1 - Official**: Government and military official channels (UAE MoD, MOFA, GCAA)
- **Tier 2 - Operational**: Airlines, airports, aviation authorities (Emirates, EUROCONTROL, FAA)
- **Tier 3 - Credible Media**: Established news agencies (Reuters, AP, AFP, WAM)
- **Tier 4 - Expert OSINT**: Known defense/aviation analysts with track record
- **Tier 5 - Social/Unverified**: General social media, unverified accounts

Trust tiers shall map directly to the confidence tier system in the intelligence brief.

### FR-SRC-004: Flight-Level Tracking

The system shall track individual flights by flight number with:
- Scheduled departure/arrival time (from airline schedule data or airport boards)
- Actual status (on-time, delayed, cancelled, diverted, departed, arrived)
- Delay duration in minutes
- Cancellation reason when available
- Alternative routing information when available

This requires augmenting the current FR24 live-position ingestion with airport departure board data.

---

## Phase 4: Authentication & User System

### FR-AUTH-001: Supabase Authentication

The system shall implement Supabase Auth with:
- Email/password registration and login
- Magic link (passwordless) option
- Password reset flow
- Session management with JWT refresh tokens

### FR-AUTH-002: Anonymous Access

While a user is not authenticated, the system shall provide full read access to the situation report and feed, but the chat assistant shall be limited to 5 messages per session with no persistence.

### FR-AUTH-003: User Profile

While a user is authenticated, the system shall store a user profile including:
- Display name
- Home airport (for personalizing flight guidance)
- Tracked routes (up to 10)
- Tracked flight numbers (up to 20)
- Notification preferences (future phase)
- Preferred detail level: `concise` | `standard` | `comprehensive`

---

## Phase 5: Crisis Event Framework

### FR-CRISIS-001: Crisis Event Detection and Tracking

When multiple sources transition to `advisory` or `disrupted` status within a 6-hour window, the system shall detect this as a **crisis event** and create a `crisis_event` record with:
- Event name (auto-generated, editable)
- Start timestamp
- Category (military, weather, political, infrastructure)
- Affected regions/airports
- Running cumulative statistics

### FR-CRISIS-002: Timeline Construction

While a crisis event is active, the system shall maintain a chronological timeline of key developments, automatically extracted from source snapshots, organized by timestamp with source attribution.

### FR-CRISIS-003: Trend Analysis

While a crisis event is active, the system shall analyze trends across time:
- "Getting better" / "Getting worse" / "Stable" trajectory
- Rate of change in flight disruptions
- Escalation/de-escalation signals from defense sources
- Recovery timeline estimation when sufficient data exists

---

## Non-Functional Requirements

### Performance
- Situation report generation: <15s for full multi-section report
- Chat response time: <8s for grounded response with full context
- Feed loading: <500ms p95 (current performance maintained)
- Brief API response: <200ms (cached), <15s (regeneration)

### Security
- Authentication: Supabase Auth with JWT
- Authorization: RLS policies on all user-specific tables
- Data protection: No PII stored beyond email and display name
- API rate limiting: 60 chat messages/hour per authenticated user, 5/session for anonymous

### Scalability
- Concurrent users: 5,000 (Vercel serverless handles this)
- Source ingestion: 30+ sources in parallel within 60s window
- Chat history: 90-day retention, then archive
- Flight observations: 7-day hot storage, 30-day archive

### Cost Management
- Claude Sonnet for routine brief generation (~$3/1M input tokens)
- Claude Opus for complex synthesis (estimated <5% of calls)
- Brief regeneration capped at 20 regenerations/hour maximum
- Chat context window managed to stay within reasonable token budgets

### Reliability
- Brief generation must never fail silently — fallback to extractive mode if LLM unavailable
- Chat must gracefully degrade to single-shot mode if conversation history is unavailable
- Source ingestion failures must not block brief generation (use last-known-good data)

---

## Acceptance Criteria

### AC-001: Intelligence Brief Quality
Given an active crisis with 15+ sources reporting, multiple airline suspensions, and defense intercept data available,
When the situation report is generated,
Then it shall contain: (a) a 2-3 sentence executive summary with posture assessment, (b) expandable sections for security, flights, and guidance, (c) cumulative statistics (e.g., "175 of 189 missiles intercepted since Feb 28"), (d) confidence-tiered + source-attributed claims, and (e) a practical "bottom line" advisory.

### AC-002: Direct Question Answering
Given the current situation report indicates all Emirates flights are suspended until March 7,
When a user asks "will my Dublin to Dubai flight operate tomorrow?",
Then the chat shall respond with: a direct "No" lead, specific flight numbers affected (EK162/EK163), the suspension end date, the source (Emirates), and actionable next steps.

### AC-003: Cross-Source Synthesis
Given UAE MoD reports intercepting 121 drones, Emirates reports flight suspensions, and Dubai Airports advises against airport travel,
When the situation report is generated,
Then it shall synthesize these into a coherent narrative (not three separate bullet points), connecting the military situation to the flight impact to the practical guidance.

### AC-004: Multi-Turn Conversation
Given a user has asked "what's the current situation?" and received a response,
When they follow up with "what about flights specifically?",
Then the chat shall use the previous exchange as context and provide flight-specific detail without repeating the full situation overview.

### AC-005: Persistent User Memory
Given a user has previously indicated they're tracking the Dublin-Dubai route,
When they ask "any updates on my route?",
Then the system shall recall their tracked route and provide Dublin-Dubai-specific intelligence without being told the route again.

### AC-006: Confidence Tiering
Given a defense intercept report from UAE MoD (Tier 1) and an unverified OSINT report of debris in a residential area (Tier 4),
When the situation report is generated,
Then the MoD intercept claim shall be labeled "CONFIRMED" and the debris report shall be labeled "UNVERIFIED" with source attribution.

### AC-007: Event-Driven Regeneration
Given the situation report was generated 10 minutes ago,
When a source transitions from `normal` to `disrupted`,
Then the situation report shall regenerate within 60 seconds, incorporating the new disrupted source.

### AC-008: Flight-Level Tracking
Given Emirates EK162 (Dublin-Dubai) is in the flight tracking system,
When a user asks "what's the status of EK162?",
Then the system shall respond with: scheduled departure time, current status (cancelled/delayed/on-time), and if cancelled, the airline's suspension notice details.

### AC-009: Anonymous Access
Given a user is not authenticated,
When they visit the dashboard,
Then they shall see the full situation report and feed, and be able to send up to 5 chat messages per session, with a prompt to sign up for persistent chat.

### AC-010: Graceful Degradation
Given the Claude API is unavailable,
When the situation report needs regeneration,
Then the system shall fall back to extractive mode (deterministic template) with a banner indicating "AI synthesis temporarily unavailable — showing automated summary."

---

## Error Handling

| Error Condition | Response | User Message |
|---|---|---|
| Claude API unavailable | Fall back to extractive mode | "AI synthesis temporarily unavailable — showing automated summary" |
| Claude API rate limited | Queue and retry with exponential backoff | Brief shows last-known-good with "Updating..." indicator |
| All sources stale (>3h) | Display staleness warning prominently | "Data may be outdated — last updated [time]. Sources may be experiencing delays." |
| No flight data available for requested route | Provide advisory context instead | "I don't have specific flight data for [route], but here's the current airspace situation..." |
| Chat history unavailable | Degrade to single-shot mode | "I'm unable to access our previous conversation right now. How can I help?" |
| User exceeds anonymous chat limit | Prompt signup | "You've reached the free message limit. Sign up to continue the conversation." |
| Source ingestion failure | Use last-known-good | No user-visible error; source marked degraded in SourceHealth |
| Crisis event detection false positive | Allow manual override | Admin can dismiss auto-detected crisis events |
| Conflicting source data | Present both with attribution | "UAE MoD reports all intercepted; [source] reports debris impact. The official position is..." |

---

## Implementation TODO

### Phase 1: Intelligence Brief Engine (Priority: Critical)
- [ ] Create `crisis_event_stats` table (running cumulative stats per crisis event)
- [ ] Create `crisis_events` table (event tracking with start/end, category, affected regions)
- [ ] Switch LLM provider from OpenAI to Anthropic Claude SDK
- [ ] Rewrite `lib/current-state-brief.ts` → `lib/intelligence-brief.ts` with multi-section generation
- [ ] Remove the 2-row evidence cap — pass ALL gated sources to LLM
- [ ] Design new structured brief prompt for Claude (sections: executive summary, security, flights, guidance)
- [ ] Implement confidence-tiered attribution system (`confirmed`/`reported`/`unverified`)
- [ ] Implement cross-source correlation logic (corroboration detection)
- [ ] Add cumulative statistics tracking and injection into brief context
- [ ] Update `SituationBriefing` component for layered expandable UI
- [ ] Implement event-driven regeneration triggers (source status change, flight anomaly, expert signal)
- [ ] Add staleness backstop (regenerate if >30 min since last generation)
- [ ] Update brief API to return structured sections (not single paragraph)
- [ ] Write tests for brief generation with multi-source synthesis scenarios

### Phase 2: Conversational Intelligence Assistant (Priority: Critical)
- [ ] Create `chat_sessions` table (user_id, created_at, last_message_at)
- [ ] Create `chat_messages` table (session_id, role, content, created_at, context_snapshot)
- [ ] Rewrite `/api/chat/route.ts` to support multi-turn with conversation history
- [ ] Implement situation-grounded context injection (current brief + relevant sources + flight data)
- [ ] Design Claude system prompt for conversational intelligence assistant role
- [ ] Implement direct-answer-first response style via prompt engineering
- [ ] Add route-specific flight intelligence synthesis (carrier identification, suspension status, alternatives)
- [ ] Add actionable recommendation generation for disrupted scenarios
- [ ] Implement anonymous chat rate limiting (5 messages/session)
- [ ] Rewrite `unified-query.tsx` as a proper chat interface with message history
- [ ] Add streaming responses (Anthropic streaming API)
- [ ] Write tests for multi-turn conversation context management

### Phase 3: Expanded Source Registry (Priority: High)
- [ ] Add defense/security sources to `lib/sources.ts`:
  - [ ] UAE Ministry of Defence
  - [ ] US CENTCOM press releases
  - [ ] Regional defense ministries
  - [ ] OSINT aggregator feeds
- [ ] Add aviation operations sources:
  - [ ] NOTAM feed parser
  - [ ] EUROCONTROL advisories
  - [ ] FAA KICZ advisories
  - [ ] Airline-specific suspension pages (Emirates, Etihad, FlyDubai, Air Arabia)
  - [ ] Dubai Airports / Abu Dhabi Airports operational status
- [ ] Implement source trust tier classification system in `lib/sources.ts`
- [ ] Build extractors for each new source in `lib/source-extractors.ts`
- [ ] Augment flight ingestion with airport departure board data (FR24 or alternative)
- [ ] Create `flight_schedules` table for tracking scheduled vs. actual
- [ ] Implement flight-level status tracking (delayed, cancelled, diverted) with schedule comparison
- [ ] Write extractors and quality tests for all new sources

### Phase 4: Authentication & User System (Priority: High)
- [ ] Enable Supabase Auth (email/password + magic link)
- [ ] Create `user_profiles` table (home_airport, tracked_routes, tracked_flights, detail_preference)
- [ ] Build login/signup UI components
- [ ] Implement RLS policies for user-specific tables
- [ ] Build user profile settings page (tracked routes, flights, preferences)
- [ ] Implement persistent chat history tied to user accounts
- [ ] Add user context injection into chat (tracked routes, past concerns)

### Phase 5: Crisis Event Framework (Priority: Medium)
- [ ] Implement crisis event auto-detection (multi-source advisory threshold)
- [ ] Build crisis timeline construction from source snapshots
- [ ] Implement trend analysis (getting better/worse/stable)
- [ ] Build crisis event management UI (timeline view, stats dashboard)
- [ ] Add admin controls for crisis event management (dismiss false positives, edit names)

### Frontend
- [ ] Redesign `SituationBriefing` as layered expandable component
- [ ] Redesign chat UI as persistent conversational interface (not single-shot query)
- [ ] Add authentication UI (login, signup, profile)
- [ ] Update `StatusHero` for richer posture display with trend indicator
- [ ] Build crisis timeline component
- [ ] Add user route/flight tracking management UI
- [ ] Ensure responsive design for all new components

### Testing
- [ ] Unit tests for intelligence brief synthesis with multi-source scenarios
- [ ] Unit tests for confidence tiering and source attribution
- [ ] Unit tests for cross-source correlation detection
- [ ] Integration tests for chat session management and multi-turn context
- [ ] Integration tests for event-driven brief regeneration
- [ ] Integration tests for flight-level tracking (scheduled vs. actual)
- [ ] E2E test for complete user flow: signup → track route → ask question → get personalized answer

---

## Out of Scope (Future Phases)

- **Push notifications** (email alerts, browser push for critical changes)
- **Multi-language support** (Arabic, Hindi, Urdu translation)
- **Mobile app** (native iOS/Android)
- **Rebranding** (new name, domain — separate decision)
- **Premium tier** (paid features, advanced flight tracking)
- **API access** (public API for third-party integrations)
- **Historical analysis** (post-crisis retrospective reports)
- **Community features** (user-submitted reports, crowdsourced intelligence)

---

## Open Questions

- [ ] **Claude model selection**: Should routine brief generation use Haiku (cheapest) or Sonnet (better synthesis)? Need to test quality vs. cost tradeoff.
- [ ] **NOTAM data source**: Best free/affordable NOTAM feed for UAE FIR? ICAO API requires subscription. Alternatives: FAA NOTAM API (US-focused), EAD (European), or scraping UAE GCAA.
- [ ] **FR24 departure boards**: Does the current FR24 API subscription include airport board data, or only live positions? If not, alternative sources for scheduled vs. actual flight status.
- [ ] **Crisis event detection threshold**: How many sources need to transition to advisory/disrupted within what time window to auto-detect a crisis? Need tuning after initial deployment.
- [ ] **Chat token budget**: With full conversation history + situation report + source context, Claude context windows can get large. What's the token budget per chat turn? Truncation strategy for long conversations?
- [ ] **Expert signal integration**: Should expert OSINT signals (currently in separate ExpertAnalysisPanel) feed directly into the main intelligence brief, or remain supplementary?
- [ ] **Rate limiting strategy**: 60 chat messages/hour may be too restrictive during active crisis. Should limits be dynamic based on crisis event status?

---

## Architecture Diagram

```
                    ┌─────────────────────────────────────────────┐
                    │              Source Registry                  │
                    │  Tier 1: Official Gov/Military (UAE MoD,     │
                    │          MOFA, GCAA, CENTCOM)                │
                    │  Tier 2: Airlines & Aviation Ops (Emirates,  │
                    │          EUROCONTROL, NOTAMs, Airport Boards)│
                    │  Tier 3: Credible Media (Reuters, WAM)       │
                    │  Tier 4: Expert OSINT (defense analysts)     │
                    │  Tier 5: Social / Unverified (X signals)     │
                    └──────────────────┬──────────────────────────┘
                                       │
                    ┌──────────────────▼──────────────────────────┐
                    │           Ingestion Pipeline                  │
                    │  RSS / HTML scrape / API / X / FR24 boards   │
                    │  Source extractors → Quality filter → Store   │
                    └──────────────────┬──────────────────────────┘
                                       │
              ┌────────────────────────▼────────────────────────┐
              │              Intelligence Engine                  │
              │                                                   │
              │  ┌─────────────┐  ┌──────────────┐              │
              │  │ Context     │  │ Crisis Event │              │
              │  │ Assembler   │  │ Tracker      │              │
              │  │ (all sources│  │ (cumulative  │              │
              │  │  + flights  │  │  stats,      │              │
              │  │  + experts  │  │  timeline)   │              │
              │  │  + social)  │  │              │              │
              │  └──────┬──────┘  └──────┬───────┘              │
              │         │                │                       │
              │  ┌──────▼────────────────▼───────┐              │
              │  │    Claude LLM (Sonnet/Opus)    │              │
              │  │  Cross-source synthesis        │              │
              │  │  Confidence tiering            │              │
              │  │  Source attribution             │              │
              │  │  Actionable recommendations    │              │
              │  └──────┬────────────────────────┘              │
              │         │                                        │
              │  ┌──────▼──────────────┐                        │
              │  │ Layered Situation    │                        │
              │  │ Report               │                        │
              │  │ • Executive summary  │                        │
              │  │ • Security section   │                        │
              │  │ • Flights section    │                        │
              │  │ • Guidance section   │                        │
              │  │ • Source coverage    │                        │
              │  └──────┬──────────────┘                        │
              └─────────┼────────────────────────────────────────┘
                        │
         ┌──────────────┼──────────────────┐
         │              │                   │
    ┌────▼────┐   ┌────▼──────┐   ┌───────▼───────┐
    │Dashboard│   │Conversa-  │   │ Flight Intel  │
    │ Brief   │   │tional     │   │ (route-level  │
    │ (layered│   │Assistant  │   │  + flight-    │
    │  expand)│   │(multi-turn│   │  level status)│
    │         │   │ + memory) │   │               │
    └─────────┘   └───────────┘   └───────────────┘
                        │
              ┌─────────▼─────────┐
              │  User System       │
              │  (Supabase Auth)   │
              │  • Chat history    │
              │  • Tracked routes  │
              │  • Preferences     │
              └───────────────────┘
```

---

## Migration Strategy

This is a **reimagining, not a rewrite**. The existing ingestion pipeline, source registry, and database schema are retained and extended. The transformation focuses on three layers:

1. **Intelligence layer** (new): Replaces the current single-paragraph brief with a multi-section synthesized report. This is the highest-impact change.

2. **Conversation layer** (rewrite): Replaces the stateless single-shot Q&A with a persistent multi-turn assistant. Requires new tables and a new chat UI.

3. **Source layer** (extend): Adds defense/security and aviation operations sources to the existing registry. Same ingestion pipeline, new extractors.

**Recommended execution order**: Phase 1 → Phase 4 (auth needed for Phase 2) → Phase 2 → Phase 3 → Phase 5

Phase 1 delivers the most visible transformation (the brief is the landing page), Phase 4 enables persistence, Phase 2 builds the conversational experience on top of auth, Phase 3 fills knowledge gaps, and Phase 5 adds the crisis framework.
