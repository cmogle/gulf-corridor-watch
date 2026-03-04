import assert from "node:assert/strict";
import test from "node:test";
import { buildNewsSummaryPrompt, parseNewsSummaryResponse, buildFallbackNewsSummary } from "./news-summarize.ts";

test("buildNewsSummaryPrompt includes source topic and article titles", () => {
  const prompt = buildNewsSummaryPrompt("Dubai Airport", [
    { headline: "DXB operations disrupted", description: "Flights cancelled after strikes" },
    { headline: "Emirates reports damage", description: "Minor damage, 4 staff injured" },
  ]);
  assert.ok(prompt.includes("Dubai Airport"));
  assert.ok(prompt.includes("DXB operations disrupted"));
  assert.ok(prompt.includes("Emirates reports damage"));
});

test("parseNewsSummaryResponse returns trimmed text for valid response", () => {
  const result = parseNewsSummaryResponse("  Dubai Airport remains disrupted after strikes.  ");
  assert.equal(result, "Dubai Airport remains disrupted after strikes.");
});

test("parseNewsSummaryResponse returns null for empty or EMPTY response", () => {
  assert.equal(parseNewsSummaryResponse(""), null);
  assert.equal(parseNewsSummaryResponse("EMPTY"), null);
  assert.equal(parseNewsSummaryResponse("   "), null);
});

test("parseNewsSummaryResponse returns null for too-short response", () => {
  assert.equal(parseNewsSummaryResponse("Short."), null);
});

test("buildFallbackNewsSummary returns first headline when only one item", () => {
  const result = buildFallbackNewsSummary("Dubai Airport", [
    { headline: "DXB closed after missile strikes", description: "" },
  ]);
  assert.equal(result, "DXB closed after missile strikes");
});

test("buildFallbackNewsSummary joins up to 3 headlines with semicolons", () => {
  const result = buildFallbackNewsSummary("Dubai Airport", [
    { headline: "DXB closed", description: "" },
    { headline: "Emirates suspends flights", description: "" },
    { headline: "Airspace closures reported", description: "" },
    { headline: "Fourth article ignored", description: "" },
  ]);
  assert.ok(result.includes("DXB closed"));
  assert.ok(result.includes("Emirates suspends flights"));
  assert.ok(result.includes("Airspace closures reported"));
  assert.ok(!result.includes("Fourth article"));
});
