import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFallbackBriefParagraph,
  computeBriefInputHash,
  computeBriefInputHashForPolicy,
  deriveBriefFreshnessState,
  extractBriefJsonObject,
  isSourceStale,
  isNarrativePolicyCompliant,
  NARRATIVE_POLICY_VERSION,
  type BriefInputContext,
} from "./current-state-brief.ts";

function makeContext(overrides?: Partial<BriefInputContext>): BriefInputContext {
  return {
    computed_at: "2026-03-03T10:10:00.000Z",
    freshness_state: "fresh",
    confidence: "high",
    flight: {
      total: 32,
      delayed: 2,
      cancelled: 0,
      latest_fetch: "2026-03-03T10:08:00.000Z",
      stale: false,
    },
    coverage: {
      sources_included: ["emirates_updates", "etihad_advisory", "uae_mofa"],
      stale_sources: [],
      missing_expected: ["india_consulate_dubai", "india_embassy_abu_dhabi", "broader_mena_ministries"],
    },
    sources: [
      {
        source_id: "emirates_updates",
        source_name: "Emirates Travel Updates",
        status_level: "normal",
        reliability: "reliable",
        validation_state: "validated",
        priority: 100,
        fetched_at: "2026-03-03T10:05:00.000Z",
        published_at: null,
        freshness_target_minutes: 5,
        title: "Travel updates",
        summary: "All operations normal",
        stale: false,
      },
      {
        source_id: "etihad_advisory",
        source_name: "Etihad Travel Alerts",
        status_level: "advisory",
        reliability: "reliable",
        validation_state: "validated",
        priority: 98,
        fetched_at: "2026-03-03T10:04:00.000Z",
        published_at: null,
        freshness_target_minutes: 5,
        title: "Minor delay notice",
        summary: "Localized gate delays",
        stale: false,
      },
    ],
    social_signals: [
      {
        source_id: "etihad_advisory",
        handle: "etihad",
        posted_at: "2026-03-03T10:02:00.000Z",
        text_display: "Minor delay at one terminal",
        keywords: ["delay"],
        confidence: 0.65,
        validation_state: "validated",
      },
    ],
    context_gating: {
      source: {
        total: 2,
        usable: 2,
        fresh: 2,
        selected: 2,
        validated_or_skipped: 2,
        unvalidated: 0,
        failed: 0,
        policy: "validated_or_skipped_fresh",
      },
      social: {
        total: 1,
        usable: 1,
        fresh: 1,
        selected: 1,
        validated_or_skipped: 1,
        unvalidated: 0,
        failed: 0,
        policy: "validated_or_skipped_fresh",
      },
    },
    ...overrides,
  };
}

test("source staleness uses max(target*2, 20) threshold", () => {
  assert.equal(isSourceStale(19.9, 5), false);
  assert.equal(isSourceStale(20.1, 5), true);
  assert.equal(isSourceStale(17, 10), false);
  assert.equal(isSourceStale(21, 10), true);
  assert.equal(isSourceStale(25, 15), false);
  assert.equal(isSourceStale(31, 15), true);
});

test("freshness state logic maps expected scenarios", () => {
  assert.equal(deriveBriefFreshnessState({ flight_stale: false, stale_sources: 2, source_count: 8 }), "fresh");
  assert.equal(deriveBriefFreshnessState({ flight_stale: false, stale_sources: 3, source_count: 8 }), "mixed");
  assert.equal(deriveBriefFreshnessState({ flight_stale: false, stale_sources: 5, source_count: 8 }), "stale");
  assert.equal(deriveBriefFreshnessState({ flight_stale: true, stale_sources: 0, source_count: 8 }), "stale");
});

test("input hash remains stable when source/signal arrays are reordered", () => {
  const base = makeContext();
  const reversed = makeContext({
    sources: [...base.sources].reverse(),
    social_signals: [...base.social_signals].reverse(),
    coverage: {
      ...base.coverage,
      sources_included: [...base.coverage.sources_included].reverse(),
    },
  });
  assert.equal(computeBriefInputHash(base), computeBriefInputHash(reversed));
});

test("fallback paragraph calls out limited telemetry when no flights are available", () => {
  const paragraph = buildFallbackBriefParagraph(
    makeContext({
      flight: {
        total: 0,
        delayed: 0,
        cancelled: 0,
        latest_fetch: null,
        stale: true,
      },
      freshness_state: "stale",
      confidence: "low",
    }),
  );
  assert.match(paragraph, /limited current flight telemetry/i);
});

test("fallback paragraph avoids technical phrasing around language mentions", () => {
  const paragraph = buildFallbackBriefParagraph(makeContext());
  assert.doesNotMatch(paragraph, /advisory\/disrupted language/i);
  assert.doesNotMatch(paragraph, /disruption-related language/i);
});

test("fallback paragraph is evidence-first and omits source/feed counts", () => {
  const paragraph = buildFallbackBriefParagraph(makeContext());
  assert.match(paragraph, /Key official updates:/i);
  assert.match(paragraph, /Minor delay notice/i);
  assert.doesNotMatch(paragraph, /monitored sources?|monitored feeds?/i);
  assert.doesNotMatch(paragraph, /\b\d+\s+of\s+\d+\s+sources?\b/i);
});

test("fallback paragraph keeps flight operational numbers", () => {
  const paragraph = buildFallbackBriefParagraph(makeContext());
  assert.match(paragraph, /32 tracked flights in the last 45 minutes/i);
  assert.match(paragraph, /2 delayed/i);
  assert.match(paragraph, /0 cancelled/i);
});

test("fallback paragraph omits x narrative when not corroborated", () => {
  const paragraph = buildFallbackBriefParagraph(
    makeContext({
      sources: [
        {
          source_id: "emirates_updates",
          source_name: "Emirates Travel Updates",
          status_level: "normal",
          reliability: "reliable",
          priority: 100,
          fetched_at: "2026-03-03T10:05:00.000Z",
          published_at: null,
          freshness_target_minutes: 5,
          title: "Travel updates",
          summary: "All operations normal",
          stale: false,
        },
      ],
      social_signals: [
        {
          source_id: "emirates_updates",
          handle: "emirates",
          posted_at: "2026-03-03T10:02:00.000Z",
          text_display: "General service announcement",
          keywords: [],
          confidence: 0.3,
        },
      ],
    }),
  );
  assert.doesNotMatch(paragraph, /Recent official X posts/i);
  assert.doesNotMatch(paragraph, /@emirates/i);
});

test("fallback paragraph adds short freshness caveat without numeric source counts", () => {
  const paragraph = buildFallbackBriefParagraph(
    makeContext({
      coverage: {
        sources_included: ["emirates_updates", "etihad_advisory"],
        stale_sources: ["emirates_updates"],
        missing_expected: [],
      },
    }),
  );
  assert.match(paragraph, /Some official pages have not updated recently/i);
  assert.doesNotMatch(paragraph, /\b\d+\s+(official|monitored)\s+sources?\b/i);
});

test("hash changes when narrative policy version changes", () => {
  const base = makeContext();
  const current = computeBriefInputHash(base);
  const legacy = computeBriefInputHashForPolicy(base, "v1");
  assert.notEqual(current, legacy);
  assert.equal(current, computeBriefInputHashForPolicy(base, NARRATIVE_POLICY_VERSION));
});

test("policy compliance rejects source/feed count phrasing and disallowed x mentions", () => {
  assert.equal(isNarrativePolicyCompliant("Across 11 monitored official sources, two are stale.", { allowXMention: true }), false);
  assert.equal(isNarrativePolicyCompliant("Recent official X posts from @etihad align with advisories.", { allowXMention: false }), false);
  assert.equal(isNarrativePolicyCompliant("Regional air traffic is light and official updates indicate localized delays.", { allowXMention: false }), true);
});

test("json extraction handles markdown code fences", () => {
  const payload = "```json\n{\"paragraph\":\"Status stable.\"}\n```";
  assert.equal(extractBriefJsonObject(payload), "{\"paragraph\":\"Status stable.\"}");
});
