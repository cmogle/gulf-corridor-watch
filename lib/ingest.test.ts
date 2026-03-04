import assert from "node:assert/strict";
import test from "node:test";
import { formatRssSummary, pickBestRssItemsScored, ingestSingleSource, stripGoogleNewsPublisher, isGoogleNewsSource } from "./ingest.ts";

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

test("pickBestRssItemsScored returns scored items sorted by relevance", () => {
  const items = [
    { title: "Generic DOD press release", description: "Budget meeting" },
    { title: "Iran missile test near Gulf region", description: "CENTCOM reports activity near UAE" },
  ];
  const result = pickBestRssItemsScored(items);
  assert.ok(result[0].score > result[1].score);
  assert.ok(result[0].title.includes("Iran"));
});

test("pickBestRssItemsScored returns empty when no items", () => {
  assert.deepEqual(pickBestRssItemsScored([]), []);
});

test("pickBestRssItemsScored caps at maxItems", () => {
  const items = Array.from({ length: 10 }, (_, i) => ({
    title: `UAE item ${i}`,
    description: `Gulf region update ${i}`,
  }));
  const result = pickBestRssItemsScored(items, 3);
  assert.equal(result.length, 3);
});

test("formatRssSummary decodes HTML entities in descriptions", () => {
  const result = formatRssSummary([
    { title: "Dubai Update", description: "Airport open&nbsp;&nbsp;Emirates confirms", score: 1 },
  ]);
  assert.ok(!result.summary.includes("&nbsp;"), "should not contain &nbsp;");
  assert.ok(result.summary.includes("Airport open"), "should preserve text before entity");
  assert.ok(result.summary.includes("Emirates confirms"), "should preserve text after entity");
});

test("stripGoogleNewsPublisher strips publisher from standard title", () => {
  const result = stripGoogleNewsPublisher("Dubai airport open after strikes - Hindustan Times");
  assert.equal(result.headline, "Dubai airport open after strikes");
  assert.equal(result.publisher, "Hindustan Times");
});

test("stripGoogleNewsPublisher handles title with multiple dashes", () => {
  const result = stripGoogleNewsPublisher("Is Dubai Airport Open? Check Status - Report - NewsX");
  assert.equal(result.headline, "Is Dubai Airport Open? Check Status - Report");
  assert.equal(result.publisher, "NewsX");
});

test("stripGoogleNewsPublisher returns full title when no dash separator", () => {
  const result = stripGoogleNewsPublisher("Dubai airport remains operational");
  assert.equal(result.headline, "Dubai airport remains operational");
  assert.equal(result.publisher, "");
});

test("stripGoogleNewsPublisher handles pipe-separated publisher", () => {
  const result = stripGoogleNewsPublisher("Airport update | World News - Hindustan Times");
  assert.equal(result.headline, "Airport update | World News");
  assert.equal(result.publisher, "Hindustan Times");
});

test("isGoogleNewsSource returns true for gn_ prefixed source ids", () => {
  assert.equal(isGoogleNewsSource({ id: "gn_dubai_airport", category: "news" } as any), true);
  assert.equal(isGoogleNewsSource({ id: "gn_uae_flights", category: "news" } as any), true);
});

test("isGoogleNewsSource returns false for non-gn sources", () => {
  assert.equal(isGoogleNewsSource({ id: "bbc_middle_east", category: "news" } as any), false);
  assert.equal(isGoogleNewsSource({ id: "us_state_dept_travel", category: "government" } as any), false);
});

test("ingestSingleSource is exported as a function", () => {
  assert.equal(typeof ingestSingleSource, "function");
});
