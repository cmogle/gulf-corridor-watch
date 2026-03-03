import assert from "node:assert/strict";
import test from "node:test";
import { deduplicateFeedItems } from "./unified-updates.ts";
import type { UnifiedUpdateItem } from "./unified-updates-types.ts";

function makeItem(overrides: Partial<UnifiedUpdateItem>): UnifiedUpdateItem {
  return {
    id: "1",
    source_id: "source",
    source_name: "Source",
    update_type: "snapshot",
    event_at: "2026-03-03T12:00:00.000Z",
    fetched_at: "2026-03-03T12:00:00.000Z",
    headline: "Headline",
    summary: "Summary text here that is long enough",
    original_url: "https://example.com",
    validation_state: "unvalidated",
    validation_score: null,
    confirmation_state: "confirmed",
    evidence_basis: "official_web",
    status_level: "normal",
    reliability: "reliable",
    priority: 50,
    ...overrides,
  };
}

test("deduplicateFeedItems removes same-source same-summary duplicates, keeps newest", () => {
  const items = [
    makeItem({ id: "newer", source_id: "uae_mofa", summary: "Same content", event_at: "2026-03-03T14:00:00Z" }),
    makeItem({ id: "older", source_id: "uae_mofa", summary: "Same content", event_at: "2026-03-03T12:00:00Z" }),
  ];
  const result = deduplicateFeedItems(items);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "newer");
});

test("deduplicateFeedItems keeps items from different sources with same summary", () => {
  const items = [
    makeItem({ id: "a", source_id: "emirates", summary: "Travel update" }),
    makeItem({ id: "b", source_id: "etihad", summary: "Travel update" }),
  ];
  const result = deduplicateFeedItems(items);
  assert.equal(result.length, 2);
});

test("deduplicateFeedItems keeps items from same source with different summaries", () => {
  const items = [
    makeItem({ id: "a", source_id: "uae_mofa", summary: "Statement on Iran" }),
    makeItem({ id: "b", source_id: "uae_mofa", summary: "Ambassador meeting" }),
  ];
  const result = deduplicateFeedItems(items);
  assert.equal(result.length, 2);
});

test("deduplicateFeedItems handles empty input", () => {
  assert.deepEqual(deduplicateFeedItems([]), []);
});
