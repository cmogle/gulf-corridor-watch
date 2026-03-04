import assert from "node:assert/strict";
import test from "node:test";
import { computeTrustedEventHash, inferTrustedStatusLevel, qualifyTrustedCandidate } from "./trusted-feed-quality";

const VALID_CANDIDATE = {
  event_time: "2026-03-04T00:00:00.000Z",
  headline: "Airline operational advisory for UAE routes",
  summary:
    "Airline operations remain active but selected departures are delayed due to temporary airspace controls. Passengers should verify booking status, terminal changes, and airline notifications before departure.",
  original_url: "https://example.com/advisory",
  evidence_excerpt: "selected departures are delayed due to temporary airspace controls",
  parse_confidence: 0.92,
} as const;

test("computeTrustedEventHash is stable for same payload", () => {
  const a = computeTrustedEventHash({
    source_id: "emirates_updates",
    headline: VALID_CANDIDATE.headline,
    summary: VALID_CANDIDATE.summary,
    original_url: VALID_CANDIDATE.original_url,
  });
  const b = computeTrustedEventHash({
    source_id: "emirates_updates",
    headline: VALID_CANDIDATE.headline,
    summary: VALID_CANDIDATE.summary,
    original_url: VALID_CANDIDATE.original_url,
  });
  assert.equal(a, b);
});

test("qualifyTrustedCandidate publishes valid candidate", () => {
  const result = qualifyTrustedCandidate({
    source_id: "emirates_updates",
    candidate: VALID_CANDIDATE,
    normalized_text: `Header text ${VALID_CANDIDATE.evidence_excerpt} footer text`,
    parse_threshold: 0.75,
    duplicate_recent_event: false,
  });
  assert.equal(result.quality_state, "published");
  assert.equal(result.quality_reason, null);
});

test("qualifyTrustedCandidate rejects low parse confidence", () => {
  const result = qualifyTrustedCandidate({
    source_id: "emirates_updates",
    candidate: { ...VALID_CANDIDATE, parse_confidence: 0.4 },
    normalized_text: VALID_CANDIDATE.summary,
    parse_threshold: 0.75,
    duplicate_recent_event: false,
  });
  assert.equal(result.quality_state, "rejected");
  assert.equal(result.quality_reason, "parse_confidence_below_threshold");
});

test("qualifyTrustedCandidate rejects non-traceable evidence", () => {
  const result = qualifyTrustedCandidate({
    source_id: "emirates_updates",
    candidate: { ...VALID_CANDIDATE, evidence_excerpt: "high confidence evidence not found in document" },
    normalized_text: "document does not include the configured evidence snippet",
    parse_threshold: 0.75,
    duplicate_recent_event: false,
  });
  assert.equal(result.quality_state, "rejected");
  assert.equal(result.quality_reason, "evidence_not_traceable");
});

test("qualifyTrustedCandidate rejects duplicate recent event", () => {
  const result = qualifyTrustedCandidate({
    source_id: "emirates_updates",
    candidate: VALID_CANDIDATE,
    normalized_text: VALID_CANDIDATE.summary,
    parse_threshold: 0.75,
    duplicate_recent_event: true,
  });
  assert.equal(result.quality_state, "rejected");
  assert.equal(result.quality_reason, "duplicate_recent_event");
});

test("qualifyTrustedCandidate rejects non-operational diplomatic content", () => {
  const result = qualifyTrustedCandidate({
    source_id: "uae_mofa",
    candidate: {
      ...VALID_CANDIDATE,
      headline: "Statement by ministry spokesperson",
      summary:
        "The ministry rejects inaccurate reporting by international media and reiterates its diplomatic position. The deputy prime minister held calls with foreign ministers on broader regional matters.",
      evidence_excerpt: "rejects inaccurate reporting by international media",
    },
    normalized_text:
      "The ministry rejects inaccurate reporting by international media and reiterates its diplomatic position.",
    parse_threshold: 0.7,
    duplicate_recent_event: false,
  });
  assert.equal(result.quality_state, "rejected");
  assert.equal(result.quality_reason, "not_actionable_update");
});

test("qualifyTrustedCandidate rejects 404-like page chrome", () => {
  const result = qualifyTrustedCandidate({
    source_id: "etihad_advisory",
    candidate: {
      ...VALID_CANDIDATE,
      headline: "Regional Airspace Disruption – Operational Update",
      summary:
        "Oops, looks like this page does not exist. The page you are looking for might have been removed or is temporarily unavailable.",
      evidence_excerpt: "Oops, looks like this page does not exist",
    },
    normalized_text:
      "Oops, looks like this page does not exist. The page you are looking for might have been removed or is temporarily unavailable.",
    parse_threshold: 0.7,
    duplicate_recent_event: false,
  });
  assert.equal(result.quality_state, "rejected");
  assert.equal(result.quality_reason, "not_actionable_update");
});

test("inferTrustedStatusLevel detects advisory language", () => {
  assert.equal(
    inferTrustedStatusLevel("Flights temporarily suspended and passengers advised to rebook"),
    "disrupted",
  );
  assert.equal(inferTrustedStatusLevel("All services operating normally"), "normal");
});
