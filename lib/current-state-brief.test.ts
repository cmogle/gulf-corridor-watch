import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFallbackBriefParagraph,
  computeBriefInputHash,
  computeBriefInputHashForPolicy,
  deriveBriefFreshnessState,
  extractBriefJsonObject,
  filterAdvisoryRowsForLlm,
  hasStaleEventDate,
  isSourceStale,
  isNarrativePolicyCompliant,
  sanitizeFlightForLlm,
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
  assert.match(paragraph, /Commercial traffic visibility is currently limited/i);
});

test("fallback paragraph avoids technical phrasing around language mentions", () => {
  const paragraph = buildFallbackBriefParagraph(makeContext());
  assert.doesNotMatch(paragraph, /advisory\/disrupted language/i);
  assert.doesNotMatch(paragraph, /disruption-related language/i);
});

test("fallback paragraph includes evidence without source/feed counts", () => {
  const paragraph = buildFallbackBriefParagraph(makeContext());
  assert.doesNotMatch(paragraph, /monitored sources?|monitored feeds?/i);
  assert.doesNotMatch(paragraph, /\b\d+\s+of\s+\d+\s+sources?\b/i);
});

test("fallback paragraph keeps flight operational numbers", () => {
  const paragraph = buildFallbackBriefParagraph(makeContext());
  assert.match(paragraph, /Commercial traffic sample shows 32 tracked flights in the last 45 minutes/i);
  assert.match(paragraph, /2 delayed/i);
  // Zero cancelled should be omitted, not shown
  assert.doesNotMatch(paragraph, /0 cancelled/i);
});

test("fallback paragraph includes posture and guidance", () => {
  const paragraph = buildFallbackBriefParagraph(makeContext());
  assert.match(paragraph, /UAE airspace posture appears/i);
  // Should contain actionable guidance (not labeled with "Practical implication:")
  assert.match(paragraph, /monitor|guidance|continue|channels/i);
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
          validation_state: "validated",
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
          validation_state: "validated",
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
  assert.match(paragraph, /official sources have not updated recently/i);
  assert.doesNotMatch(paragraph, /\b\d+\s+(official|monitored)\s+sources?\b/i);
});

test("fallback paragraph strips markdown/url artifacts from source evidence", () => {
  const paragraph = buildFallbackBriefParagraph(
    makeContext({
      sources: [
        {
          source_id: "oman_air",
          source_name: "Oman Air Travel Updates",
          status_level: "advisory",
          reliability: "reliable",
          validation_state: "validated",
          priority: 98,
          fetched_at: "2026-03-03T10:06:00.000Z",
          published_at: null,
          freshness_target_minutes: 5,
          title: "Oman Air Travel Updates",
          summary:
            "Title: Oman Air URL Source: http://www.omanair.com/om/en/travel-updates Markdown Content: Oman Air =============== ![Image 18: notification icon](http://ww...)",
          stale: false,
        },
        ...makeContext().sources,
      ],
    }),
  );
  assert.doesNotMatch(paragraph, /Markdown Content|URL Source|!\[Image|http:\/\//i);
});

test("fallback paragraph filters out non-regional global advisories", () => {
  const paragraph = buildFallbackBriefParagraph(
    makeContext({
      sources: [
        {
          source_id: "us_state_dept_travel",
          source_name: "US State Dept Travel Advisories",
          status_level: "advisory",
          reliability: "reliable",
          validation_state: "validated",
          priority: 85,
          fetched_at: "2026-03-03T10:07:00.000Z",
          published_at: null,
          freshness_target_minutes: 15,
          title: "Sudan advisory update",
          summary: "Embassy in Khartoum suspended operations in April 2023 due to the outbreak.",
          stale: false,
        },
        {
          source_id: "uae_mofa",
          source_name: "UAE Ministry of Foreign Affairs",
          status_level: "advisory",
          reliability: "reliable",
          validation_state: "validated",
          priority: 90,
          fetched_at: "2026-03-03T10:08:00.000Z",
          published_at: null,
          freshness_target_minutes: 10,
          title: "Joint Statement Condemning Iran’s Missile and Drone Attacks in the Region",
          summary: "Official statement addressing regional missile and drone escalation.",
          stale: false,
        },
      ],
      coverage: {
        sources_included: ["us_state_dept_travel", "uae_mofa"],
        stale_sources: [],
        missing_expected: [],
      },
      flight: {
        total: 12,
        delayed: 0,
        cancelled: 0,
        latest_fetch: "2026-03-03T10:09:00.000Z",
        stale: false,
      },
    }),
  );
  assert.match(paragraph, /Iran’s Missile and Drone Attacks/i);
  assert.doesNotMatch(paragraph, /Khartoum/i);
});

test("hash changes when narrative policy version changes", () => {
  const base = makeContext();
  const current = computeBriefInputHash(base);
  const legacy = computeBriefInputHashForPolicy(base, "v1");
  assert.notEqual(current, legacy);
  assert.equal(current, computeBriefInputHashForPolicy(base, NARRATIVE_POLICY_VERSION));
});

test("policy compliance rejects source/feed count phrasing and disallowed x mentions", () => {
  assert.equal(isNarrativePolicyCompliant("Across 11 monitored sources, two are stale.", { allowXMention: true }), false);
  assert.equal(isNarrativePolicyCompliant("Recent official X posts from @etihad align with advisories.", { allowXMention: false }), false);
  assert.equal(isNarrativePolicyCompliant("UAE airspace posture appears unclear and confirmed official signals show localized delays.", { allowXMention: false }), true);
});

test("json extraction handles markdown code fences", () => {
  const payload = "```json\n{\"paragraph\":\"Status stable.\"}\n```";
  assert.equal(extractBriefJsonObject(payload), "{\"paragraph\":\"Status stable.\"}");
});

// --- hasStaleEventDate ---

test("hasStaleEventDate detects past dates in evidence text", () => {
  const march5 = new Date("2026-03-05T12:00:00Z").getTime();
  // Feb 25 is 8 days ago → stale
  assert.equal(hasStaleEventDate("starting February 25, 2026", march5), true);
  assert.equal(hasStaleEventDate("starting 25 February 2026", march5), true);
  assert.equal(hasStaleEventDate("starting Feb 25, 2026", march5), true);
  // March 9 is in the future → not stale
  assert.equal(hasStaleEventDate("until 15:00 on Monday, 09 March 2026", march5), false);
  // March 3 is 2 days ago (within 3-day window) → not stale
  assert.equal(hasStaleEventDate("issued March 3, 2026", march5), false);
  // No dates → not stale
  assert.equal(hasStaleEventDate("All flights operating normally", march5), false);
});

// --- sanitizeFlightForLlm ---

test("sanitizeFlightForLlm omits zero delayed and cancelled", () => {
  const result = sanitizeFlightForLlm({
    total: 140,
    delayed: 0,
    cancelled: 0,
    latest_fetch: "2026-03-05T10:00:00Z",
  });
  assert.equal(result.total, 140);
  assert.equal(result.delayed, undefined);
  assert.equal(result.cancelled, undefined);
  assert.equal(result.latest_fetch, "2026-03-05T10:00:00Z");
});

test("sanitizeFlightForLlm keeps non-zero disruption counts", () => {
  const result = sanitizeFlightForLlm({
    total: 140,
    delayed: 5,
    cancelled: 2,
    latest_fetch: "2026-03-05T10:00:00Z",
  });
  assert.equal(result.delayed, 5);
  assert.equal(result.cancelled, 2);
});

// --- filterAdvisoryRowsForLlm ---

test("filterAdvisoryRowsForLlm rejects non-UAE irrelevant signals", () => {
  const ctx = makeContext({
    sources: [
      {
        source_id: "oman_air",
        source_name: "Oman Air Travel Updates",
        status_level: "advisory",
        reliability: "reliable",
        validation_state: "validated",
        priority: 70,
        fetched_at: "2026-03-05T10:00:00Z",
        published_at: null,
        freshness_target_minutes: 10,
        title: "Oman Air Travel Updates",
        summary: "Oman Air will begin operating from Terminal 5 at Riyadh King Khalid International Airport starting February 25, 2026.",
        stale: false,
      },
      {
        source_id: "air_arabia_updates",
        source_name: "Air Arabia Travel Updates",
        status_level: "advisory",
        reliability: "reliable",
        validation_state: "validated",
        priority: 85,
        fetched_at: "2026-03-05T10:00:00Z",
        published_at: null,
        freshness_target_minutes: 10,
        title: "Air Arabia Travel Updates",
        summary: "Air Arabia flights to and from the UAE are temporarily suspended until 15:00 (UAE time) on Monday, 09 March 2026.",
        stale: false,
      },
    ],
  });

  const nowMs = new Date("2026-03-05T12:00:00Z").getTime();
  const rows = filterAdvisoryRowsForLlm(ctx, nowMs);

  // Air Arabia (UAE-relevant, future date) should pass
  assert.equal(rows.some((r) => r.source.includes("Air Arabia")), true);
  // Oman Air Riyadh (not UAE-relevant, past date) should be filtered out
  assert.equal(rows.some((r) => r.source.includes("Oman Air")), false);
});

test("fallback paragraph filters out stale-dated evidence", () => {
  const paragraph = buildFallbackBriefParagraph(
    makeContext({
      sources: [
        {
          source_id: "oman_air",
          source_name: "Oman Air Travel Updates",
          status_level: "advisory",
          reliability: "reliable",
          validation_state: "validated",
          priority: 70,
          fetched_at: "2026-03-05T10:00:00Z",
          published_at: null,
          freshness_target_minutes: 10,
          title: "Terminal change",
          summary: "Oman Air will begin operating from Terminal 5 at Riyadh King Khalid International Airport starting February 25, 2026.",
          stale: false,
        },
      ],
      flight: { total: 100, delayed: 0, cancelled: 0, latest_fetch: "2026-03-05T10:00:00Z", stale: false },
    }),
  );
  // Riyadh terminal change should not appear
  assert.doesNotMatch(paragraph, /Riyadh/i);
  assert.doesNotMatch(paragraph, /Terminal 5/i);
});

test("fallback paragraph suppresses zero disruption parenthetical", () => {
  const paragraph = buildFallbackBriefParagraph(
    makeContext({
      flight: { total: 140, delayed: 0, cancelled: 0, latest_fetch: "2026-03-05T10:00:00Z", stale: false },
    }),
  );
  assert.match(paragraph, /140 tracked flights/);
  assert.doesNotMatch(paragraph, /0 delayed/);
  assert.doesNotMatch(paragraph, /0 cancelled/);
  // Should NOT have parenthetical at all
  assert.doesNotMatch(paragraph, /\(.*delayed.*\)/);
});
