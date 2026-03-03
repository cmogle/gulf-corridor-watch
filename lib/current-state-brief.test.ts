import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFallbackBriefParagraph,
  computeBriefInputHash,
  deriveBriefFreshnessState,
  extractBriefJsonObject,
  isSourceStale,
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
      },
    ],
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

test("json extraction handles markdown code fences", () => {
  const payload = "```json\n{\"paragraph\":\"Status stable.\"}\n```";
  assert.equal(extractBriefJsonObject(payload), "{\"paragraph\":\"Status stable.\"}");
});
