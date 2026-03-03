import assert from "node:assert/strict";
import test from "node:test";
import { normalizeUnifiedUpdateRow, sortUnifiedUpdates } from "./unified-updates-types.ts";
import type { UnifiedUpdateItem, UnifiedUpdateRow } from "./unified-updates-types.ts";

function makeItem(overrides: Partial<UnifiedUpdateItem>): UnifiedUpdateItem {
  return {
    id: "1",
    source_id: "source",
    source_name: "Source",
    update_type: "snapshot",
    event_at: "2026-03-03T12:00:00.000Z",
    fetched_at: "2026-03-03T12:00:00.000Z",
    headline: "Headline",
    summary: "Summary",
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

test("normalizes snapshot and x rows to a shared item contract", () => {
  const snapshotRow: UnifiedUpdateRow = {
    ...makeItem({ id: "snap-1", update_type: "snapshot", priority: 90 }),
    priority: 90,
  };
  const xRow: UnifiedUpdateRow = {
    ...makeItem({
      id: "x-1",
      update_type: "x",
      source_id: "rta_dubai",
      source_name: "RTA Dubai",
      headline: "@rta_dubai on X",
      summary: "Service delay update",
      original_url: "https://x.com/rta_dubai/status/123",
      confirmation_state: "unconfirmed_social",
      evidence_basis: "x+official",
    }),
    priority: null,
  };

  const normalized = [normalizeUnifiedUpdateRow(snapshotRow), normalizeUnifiedUpdateRow(xRow)];
  assert.equal(normalized[0].update_type, "snapshot");
  assert.equal(normalized[1].update_type, "x");
  assert.equal(typeof normalized[0].priority, "number");
  assert.equal(typeof normalized[1].priority, "number");
});

test("sorts mixed updates by recency", () => {
  const items = [
    makeItem({ id: "older", update_type: "snapshot", event_at: "2026-03-03T10:00:00.000Z" }),
    makeItem({ id: "newer", update_type: "x", event_at: "2026-03-03T12:00:00.000Z" }),
  ];
  const sorted = sortUnifiedUpdates(items);
  assert.equal(sorted[0].id, "newer");
  assert.equal(sorted[1].id, "older");
});

test("breaks same-time ties by validation state then priority", () => {
  const baseTime = "2026-03-03T12:00:00.000Z";
  const items = [
    makeItem({ id: "validated-low-priority", event_at: baseTime, validation_state: "validated", priority: 10 }),
    makeItem({ id: "unvalidated-high-priority", event_at: baseTime, validation_state: "unvalidated", priority: 100 }),
    makeItem({ id: "validated-high-priority", event_at: baseTime, validation_state: "validated", priority: 90 }),
  ];
  const sorted = sortUnifiedUpdates(items);
  assert.equal(sorted[0].id, "validated-high-priority");
  assert.equal(sorted[1].id, "validated-low-priority");
  assert.equal(sorted[2].id, "unvalidated-high-priority");
});
