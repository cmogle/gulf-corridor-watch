import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyIntent } from "./precomputed-answers.ts";

describe("classifyIntent", () => {
  it("classifies situation summary questions", () => {
    assert.equal(classifyIntent("What is the latest situation?"), "situation_summary");
    assert.equal(classifyIntent("What is the latest?"), "situation_summary");
    assert.equal(classifyIntent("Any updates?"), "situation_summary");
    assert.equal(classifyIntent("what happened today?"), "situation_summary");
    assert.equal(classifyIntent("catch me up"), "situation_summary");
    assert.equal(classifyIntent("any new developments?"), "situation_summary");
    assert.equal(classifyIntent("brief me"), "situation_summary");
  });

  it("classifies flight safety questions", () => {
    assert.equal(classifyIntent("Is it safe to fly?"), "flight_safety");
    assert.equal(classifyIntent("should I fly to Dubai?"), "flight_safety");
    assert.equal(classifyIntent("is it safe to travel to UAE"), "flight_safety");
    assert.equal(classifyIntent("is there risk to fly?"), "flight_safety");
  });

  it("classifies overnight sitrep questions", () => {
    assert.equal(classifyIntent("What happened overnight?"), "overnight_sitrep");
    assert.equal(classifyIntent("anything happen last night?"), "overnight_sitrep");
    assert.equal(classifyIntent("morning update please"), "overnight_sitrep");
    assert.equal(classifyIntent("what happened while I slept?"), "overnight_sitrep");
  });

  it("classifies airspace status questions", () => {
    assert.equal(classifyIntent("Is UAE airspace open?"), "airspace_status");
    assert.equal(classifyIntent("any airspace restrictions?"), "airspace_status");
    assert.equal(classifyIntent("is airspace closed?"), "airspace_status");
  });

  it("classifies attack status questions", () => {
    assert.equal(classifyIntent("Were there any attacks?"), "attack_status");
    assert.equal(classifyIntent("any missile strikes?"), "attack_status");
    assert.equal(classifyIntent("did anything get through air defense?"), "attack_status");
    assert.equal(classifyIntent("were any drones intercepted?"), "attack_status");
  });

  it("classifies what-to-do questions", () => {
    assert.equal(classifyIntent("What should I do?"), "what_to_do");
    assert.equal(classifyIntent("should I cancel my trip?"), "what_to_do");
    assert.equal(classifyIntent("what do you recommend?"), "what_to_do");
  });

  it("classifies airline status questions", () => {
    assert.equal(classifyIntent("Is Emirates operating normally?"), "airline_status");
    assert.equal(classifyIntent("are Etihad flights running?"), "airline_status");
    assert.equal(classifyIntent("has flydubai cancelled flights?"), "airline_status");
  });

  it("classifies general status questions", () => {
    assert.equal(classifyIntent("How are things?"), "general_status");
    assert.equal(classifyIntent("give me a rundown"), "general_status");
    assert.equal(classifyIntent("how is everything?"), "general_status");
  });

  it("returns null for novel questions", () => {
    assert.equal(classifyIntent("What is the best restaurant in Dubai?"), null);
    assert.equal(classifyIntent("How do I apply for a visa?"), null);
    assert.equal(classifyIntent("translate this to Arabic"), null);
  });

  it("prioritizes specific intents over general", () => {
    // Attack takes precedence over general situation
    assert.equal(classifyIntent("What is the situation with missile attacks?"), "attack_status");
    // Airspace takes precedence over situation summary
    assert.equal(classifyIntent("What is happening with airspace restrictions?"), "airspace_status");
  });
});
