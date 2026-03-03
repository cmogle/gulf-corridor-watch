# Expert Commentary Feed — Design Document

**Date:** 2026-03-04
**Status:** Approved

## Overview

Add a curated expert analyst feed to Gulf Corridor Watch, monitoring ~25 Twitter/X accounts for commentary relevant to the Iran conflict and its impact on Gulf travel, shipping, and aviation. Displayed as a dedicated "Expert Analysis" panel with LLM-generated digest summaries.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Feed layout | Separate "Expert Analysis" panel | Keeps official feed authoritative and uncluttered |
| Account scope | Tier 1 + 2 (~25 accounts) | Best signal-to-noise; maritime, defense, energy, geopolitical, OSINT |
| Relevance scoring | Hybrid: keyword gate + LLM | Cost-efficient; catches nuanced analysis that keywords miss |
| Display format | LLM digest summary + expandable tweets | High-signal default with drill-down available |
| Architecture | Fully separate module | No risk to production official feed; independent evolution |
| Polling cadence | Every 30 minutes | Independent of official 15-min cycle |

## Account Registry

### Tier 1 — Highly Relevant (~15 accounts)

| Handle | Category | Context |
|--------|----------|---------|
| @MikeSchuler | maritime | gCaptain, maritime industry reporting |
| @mercoglianos | maritime | Maritime industry analyst |
| @CavasShips | maritime | Naval/shipping journalist |
| @samlagrone | maritime | USNI News naval reporter |
| @MalShelbourne | maritime | USNI News naval reporter |
| @TomSharpe134 | maritime | Royal Navy, Strait of Hormuz expertise |
| @BartGonnissen | maritime | Shipping/freight analyst |
| @JavierBlas | energy | Bloomberg energy/commodities reporter |
| @loriannlarocco | energy | CNBC shipping/trade reporter |
| @SullyCNBC | energy | CNBC markets/energy |
| @FreightAlley | energy | Freight/logistics industry |
| @mintzmyer | energy | Shipping/maritime finance analyst |
| @ed_fin | energy | Energy/finance analyst |
| @vtchakarova | geopolitical | Gulf security/geopolitical analyst |
| @Aviation_Intel | defense | Military aviation intelligence |

### Tier 2 — Relevant (~10 accounts)

| Handle | Category | Context |
|--------|----------|---------|
| @cdrsalamander | defense | Naval defense blogger/analyst |
| @brentdsadler | defense | Naval policy, Heritage Foundation |
| @BDHerzinger | defense | Indo-Pacific defense analyst |
| @JoshuaSteinman | geopolitical | National security, former NSC |
| @EzraACohen | geopolitical | Intelligence community |
| @TrentTelenko | defense | Military logistics analyst |
| @thomasbsauer | defense | Military/defense analysis |
| @Jkylebass | geopolitical | Macro/geopolitical finance |
| @Schizointel | osint | OSINT analyst |
| @vcdgf555 | osint | OSINT/geopolitical |
| @ianellisjones | osint | Geopolitical/OSINT analyst |
| @JoshYoung | energy | Energy markets analyst |
| @biancoresearch | energy | Markets/macro research |

### Excluded (Tier 3)

Political commentators and general military accounts excluded from initial scope: @TheLtColUSMC, @usmc_colonel, @infantrydort, @DaleStarkA10, @RobManess, @KurtSchlichter, @CynicalPublius, @JackPosobiec, @JesseKellyDC, @DataRepublican, @ShawnRyan762, @TomcatJunkie, @thestinkeye, @kaylahaas, @__CJohnston__, @typesfast, @chigrl, @TheStalwart, @JeremyA46925042, @James_WE_Smith.

Can be added later if coverage gaps emerge.

## Data Model

### Table: `expert_signals`

```sql
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
```

### Table: `expert_digests`

```sql
create table expert_digests (
  id uuid primary key default gen_random_uuid(),
  digest_text text not null,
  signal_ids uuid[] not null default '{}',
  signal_count int not null default 0,
  generated_at timestamptz not null default now()
);

create index idx_expert_digests_generated on expert_digests(generated_at desc);
```

## Ingestion Pipeline

### Flow

```
Cron trigger (every 30 min)
  → POST /api/ingest/expert-feed  (auth: INGEST_SECRET)
    → For each of ~25 expert handles:
        1. Fetch last 5 tweets (exclude RTs/replies) via X API v2
        2. Dedup against existing expert_signals by (handle, post_id)
        3. Hybrid relevance scoring:
           a. Keyword gate: match against Gulf/conflict keywords
              - ≥1 keyword match → relevance 0.5+, include
              - 0 keywords → send to LLM
           b. LLM scoring (GPT-4o-mini):
              - Prompt: rate 0-1 relevance to Iran conflict / Gulf disruption
              - ≥0.4 → include
              - <0.4 → discard
        4. Insert qualifying signals into expert_signals
        5. If ≥3 new qualifying signals since last digest → generate digest
        6. Store digest in expert_digests
```

### Gulf/Conflict Keyword List

**Geographic:** Iran, Hormuz, Persian Gulf, Strait, Gulf of Oman, Arabian Sea, UAE, ADNOC, Fujairah, Bandar Abbas, Kish, Chabahar

**Military:** CENTCOM, Navy, carrier, destroyer, strike group, deployment, missile, drone, intercept, sortie, B-52, IRGC, Quds, Revolutionary Guard

**Shipping:** tanker, shipping lane, insurance, freight, maritime, piracy, blockade, escort, convoy, war risk premium, P&I, Lloyds

**Energy:** oil price, crude, LNG, pipeline, sanctions, OPEC, barrel, refinery, Brent

**Aviation:** airspace, NOTAM, divert, overflight, restricted, no-fly, FIR, Tehran FIR

### Rate Limit Budget

- 25 handles × 5 tweets = 125 tweets per 30-min cycle
- LLM calls: ~50-75 per cycle (only keyword-miss tweets)
- Well within X API basic tier and OpenAI budget
- Independent of official feed's 15-min cycle

## Digest Generation

### Trigger

Generate a new digest when ≥3 new qualifying signals have accumulated since the last digest.

### LLM Prompt

```
You are a crisis monitoring analyst. Summarize the following expert commentary
tweets into a concise 2-4 sentence digest for UAE travelers/residents monitoring
the Iran situation. Group by theme (maritime, defense, energy, aviation) if
signals span multiple domains. Cite authors by @handle. Focus on actionable
intelligence and emerging developments. Do not editorialize.
```

### Output

```json
{
  "digest_text": "Maritime experts (@MikeSchuler, @JavierBlas) flagging 40% spike in Hormuz transit insurance premiums. Defense analysts (@cdrsalamander) noting increased CENTCOM carrier activity in Arabian Sea. Energy sector (@FreightAlley) reporting tanker rerouting around Strait.",
  "signal_count": 7,
  "signal_ids": ["uuid1", "uuid2", ...]
}
```

## API Route

### `GET /api/expert-feed`

Returns the latest digest plus underlying signals.

```json
{
  "digest": {
    "id": "uuid",
    "text": "Maritime experts (@MikeSchuler, @JavierBlas) flagging...",
    "generated_at": "2026-03-04T12:30:00Z",
    "signal_count": 7
  },
  "signals": [
    {
      "handle": "JavierBlas",
      "category": "energy",
      "text": "...",
      "posted_at": "2026-03-04T12:15:00Z",
      "relevance_score": 0.85,
      "url": "https://x.com/JavierBlas/status/..."
    }
  ],
  "meta": {
    "total_accounts": 25,
    "active_signals_24h": 12,
    "last_poll": "2026-03-04T12:15:00Z"
  }
}
```

### `POST /api/ingest/expert-feed`

Cron-triggered ingestion endpoint. Auth via `INGEST_SECRET` header. Returns ingestion stats.

## Frontend Component

### `<ExpertAnalysisPanel>`

Placed below the official feed on the dashboard.

**Structure:**
- Header: "Expert Analysis" with info tooltip
- Digest card: LLM summary, timestamp, signal count
- Expandable section: individual signal cards
  - @handle, category badge, relevance dot, truncated text, "View on X" link
- Category filter chips: Maritime, Defense, Energy, Geopolitical, OSINT
- Auto-refresh: polls `/api/expert-feed` every 5 minutes

**Empty state:** "No relevant expert commentary in the last 24 hours"

**Category badge colors:**
- Maritime: blue
- Defense: red
- Energy: amber
- Geopolitical: purple
- OSINT: green

## File Structure

```
lib/
  expert-feed.ts           # Account registry, types, keyword list
  expert-feed-ingest.ts    # Polling, scoring, digest generation
  expert-feed-repo.ts      # Database operations (insert/query)

app/
  api/expert-feed/route.ts           # GET endpoint
  api/ingest/expert-feed/route.ts    # POST cron endpoint
  components/expert-analysis-panel.tsx  # Frontend component

supabase/
  migrations/20260304_expert_feed.sql  # Tables + indexes
```

## Future Enhancements (Not in Scope)

- Account self-nomination / user-suggested handles
- Engagement metrics (likes/retweets) for ranking
- Thread detection and unrolling
- Cross-referencing expert claims with official source data
- User-configurable account list
- Push notifications for high-relevance expert signals
