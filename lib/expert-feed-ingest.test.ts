import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildRelevanceResult } from "./expert-feed-ingest";

describe("buildRelevanceResult", () => {
  it("returns keyword method when keywords match", () => {
    const result = buildRelevanceResult("CENTCOM deploys carrier to Hormuz");
    assert.equal(result.method, "keyword");
    assert.ok(result.score >= 0.6);
    assert.ok(result.keywords.length >= 2);
    assert.ok(result.passesGate);
  });

  it("returns needs_llm when no keywords match", () => {
    const result = buildRelevanceResult("Beautiful sunset today");
    assert.equal(result.method, "needs_llm");
    assert.equal(result.score, 0.15);
    assert.equal(result.keywords.length, 0);
    assert.equal(result.passesGate, false);
  });

  it("passes gate with single keyword", () => {
    const result = buildRelevanceResult("Iran situation is escalating");
    assert.equal(result.method, "keyword");
    assert.ok(result.score >= 0.4);
    assert.ok(result.passesGate);
  });
});
