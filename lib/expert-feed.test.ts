import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findGulfKeywords, scoreRelevance, EXPERT_ACCOUNTS } from "./expert-feed";

describe("findGulfKeywords", () => {
  it("matches geographic terms", () => {
    const kw = findGulfKeywords("Tanker transiting Strait of Hormuz under escort");
    assert.ok(kw.includes("hormuz"));
    assert.ok(kw.includes("tanker"));
  });

  it("matches military terms", () => {
    const kw = findGulfKeywords("CENTCOM announces carrier strike group deployment");
    assert.ok(kw.includes("centcom"));
    assert.ok(kw.includes("carrier"));
    assert.ok(kw.includes("strike group"));
    assert.ok(kw.includes("deployment"));
  });

  it("returns empty for irrelevant content", () => {
    const kw = findGulfKeywords("Great dinner at the new restaurant downtown");
    assert.equal(kw.length, 0);
  });

  it("matches energy terms", () => {
    const kw = findGulfKeywords("Brent crude spiking on sanctions news from OPEC");
    assert.ok(kw.includes("crude"));
    assert.ok(kw.includes("sanctions"));
    assert.ok(kw.includes("opec"));
  });

  it("matches aviation terms", () => {
    const kw = findGulfKeywords("New NOTAM issued restricting overflight of Tehran FIR");
    assert.ok(kw.includes("notam"));
    assert.ok(kw.includes("overflight"));
    assert.ok(kw.includes("tehran fir"));
  });
});

describe("scoreRelevance", () => {
  it("scores 0 keywords as 0.15", () => {
    assert.equal(scoreRelevance([]), 0.15);
  });

  it("scores 1 keyword as 0.45", () => {
    assert.equal(scoreRelevance(["hormuz"]), 0.45);
  });

  it("scores 2 keywords as 0.6", () => {
    assert.equal(scoreRelevance(["hormuz", "tanker"]), 0.6);
  });

  it("scores 3+ keywords as 0.8", () => {
    assert.equal(scoreRelevance(["hormuz", "tanker", "centcom"]), 0.8);
  });

  it("scores 4+ keywords as 0.92", () => {
    assert.equal(scoreRelevance(["hormuz", "tanker", "centcom", "carrier"]), 0.92);
  });
});

describe("EXPERT_ACCOUNTS", () => {
  it("has expected count (Tier 1 + 2)", () => {
    assert.ok(EXPERT_ACCOUNTS.length >= 20);
    assert.ok(EXPERT_ACCOUNTS.length <= 30);
  });

  it("all have required fields", () => {
    for (const acc of EXPERT_ACCOUNTS) {
      assert.ok(acc.handle, `missing handle`);
      assert.ok(acc.category, `missing category for ${acc.handle}`);
      assert.ok(acc.label, `missing label for ${acc.handle}`);
      assert.ok([1, 2].includes(acc.tier), `invalid tier for ${acc.handle}`);
    }
  });

  it("handles are lowercase without @", () => {
    for (const acc of EXPERT_ACCOUNTS) {
      assert.ok(!acc.handle.startsWith("@"), `${acc.handle} starts with @`);
      assert.equal(acc.handle, acc.handle.toLowerCase(), `${acc.handle} not lowercase`);
    }
  });
});
