import assert from "node:assert/strict";
import test from "node:test";
import { formatRssSummary } from "./ingest.ts";

test("formatRssSummary returns single item as direct headline + summary", () => {
  const result = formatRssSummary([
    { title: "Iran Level 4 - Do Not Travel", description: "Embassy advises all citizens to depart.", score: 3 },
  ]);
  assert.equal(result.title, "Iran Level 4 - Do Not Travel");
  assert.ok(result.summary.includes("Embassy advises"));
  assert.equal(result.isBulletList, false);
});

test("formatRssSummary returns multiple items as bullet list", () => {
  const result = formatRssSummary([
    { title: "Iran advisory", description: "Do not travel.", score: 3 },
    { title: "Lebanon advisory", description: "Reconsider travel.", score: 2 },
    { title: "Syria advisory", description: "Do not travel.", score: 2 },
  ]);
  assert.ok(result.summary.includes("- Iran advisory"));
  assert.ok(result.summary.includes("- Lebanon advisory"));
  assert.ok(result.summary.includes("- Syria advisory"));
  assert.equal(result.isBulletList, true);
});

test("formatRssSummary returns empty for no items", () => {
  const result = formatRssSummary([]);
  assert.equal(result.title, "");
  assert.equal(result.summary, "");
});

test("formatRssSummary strips HTML from descriptions", () => {
  const result = formatRssSummary([
    { title: "Update", description: "<p>Bold <b>text</b> here</p>", score: 1 },
  ]);
  assert.ok(!result.summary.includes("<p>"));
  assert.ok(!result.summary.includes("<b>"));
});

test("formatRssSummary caps at 4 bullet items", () => {
  const items = Array.from({ length: 6 }, (_, i) => ({
    title: `Advisory ${i + 1}`,
    description: `Description ${i + 1}`,
    score: 6 - i,
  }));
  const result = formatRssSummary(items);
  const bulletCount = (result.summary.match(/^- /gm) ?? []).length;
  assert.ok(bulletCount <= 4);
});
