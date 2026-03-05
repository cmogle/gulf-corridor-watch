import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseFlightIntent } from "./flight-query.ts";

describe("parseFlightIntent", () => {
  describe("flight_number intent", () => {
    it("detects IATA flight numbers", () => {
      const r = parseFlightIntent("What's the status of EK16?");
      assert.equal(r.type, "flight_number");
      if (r.type === "flight_number") assert.equal(r.flightNumber, "EK16");
    });

    it("detects flight numbers with spaces", () => {
      const r = parseFlightIntent("EK 203 status");
      assert.equal(r.type, "flight_number");
      if (r.type === "flight_number") assert.equal(r.flightNumber, "EK203");
    });
  });

  describe("route intent", () => {
    it("detects IATA-to-IATA arrow routes", () => {
      const r = parseFlightIntent("DXB-LHR flights");
      assert.equal(r.type, "route");
      if (r.type === "route") {
        assert.deepEqual(r.originCodes, ["DXB"]);
        assert.deepEqual(r.destinationCodes, ["LHR"]);
      }
    });

    it("detects from/to natural language routes", () => {
      const r = parseFlightIntent("flights from Dublin to Dubai");
      assert.equal(r.type, "route");
      if (r.type === "route") {
        assert.deepEqual(r.originCodes, ["DUB"]);
        assert.deepEqual(r.destinationCodes, ["DXB"]);
      }
    });

    it("detects two IATA codes as a route", () => {
      const r = parseFlightIntent("any flights DXB LHR?");
      assert.equal(r.type, "route");
      if (r.type === "route") {
        assert.deepEqual(r.originCodes, ["DXB"]);
        assert.deepEqual(r.destinationCodes, ["LHR"]);
      }
    });
  });

  describe("airport intent", () => {
    it("detects arrivals at single IATA code", () => {
      const r = parseFlightIntent("how many flights landed at DXB today?");
      assert.equal(r.type, "airport");
      if (r.type === "airport") {
        assert.deepEqual(r.codes, ["DXB"]);
        assert.equal(r.direction, "arrivals");
      }
    });

    it("detects departures at single IATA code", () => {
      const r = parseFlightIntent("DXB departures today");
      assert.equal(r.type, "airport");
      if (r.type === "airport") {
        assert.deepEqual(r.codes, ["DXB"]);
        assert.equal(r.direction, "departures");
      }
    });

    it("detects both directions for generic airport queries", () => {
      const r = parseFlightIntent("how busy is DXB?");
      assert.equal(r.type, "airport");
      if (r.type === "airport") {
        assert.deepEqual(r.codes, ["DXB"]);
        assert.equal(r.direction, "both");
      }
    });

    it("detects arrivals with natural language", () => {
      const r = parseFlightIntent("flights arriving at DXB");
      assert.equal(r.type, "airport");
      if (r.type === "airport") {
        assert.deepEqual(r.codes, ["DXB"]);
        assert.equal(r.direction, "arrivals");
      }
    });

    it("detects departures with takeoff keyword", () => {
      const r = parseFlightIntent("flights taking off from AUH");
      assert.equal(r.type, "airport");
      if (r.type === "airport") {
        assert.deepEqual(r.codes, ["AUH"]);
        assert.equal(r.direction, "departures");
      }
    });

    it("detects airport intent from city name with direction", () => {
      const r = parseFlightIntent("flights landing at dubai");
      assert.equal(r.type, "airport");
      if (r.type === "airport") {
        assert.deepEqual(r.codes, ["DXB"]);
        assert.equal(r.direction, "arrivals");
      }
    });

    it("single IATA code without direction keywords defaults to both", () => {
      const r = parseFlightIntent("what's happening at DXB?");
      assert.equal(r.type, "airport");
      if (r.type === "airport") {
        assert.deepEqual(r.codes, ["DXB"]);
        assert.equal(r.direction, "both");
      }
    });

    it("detects inbound keyword as arrivals", () => {
      const r = parseFlightIntent("inbound flights to DXB");
      assert.equal(r.type, "airport");
      if (r.type === "airport") {
        assert.deepEqual(r.codes, ["DXB"]);
        assert.equal(r.direction, "arrivals");
      }
    });

    it("detects outbound keyword as departures", () => {
      const r = parseFlightIntent("outbound flights from DXB");
      assert.equal(r.type, "airport");
      if (r.type === "airport") {
        assert.deepEqual(r.codes, ["DXB"]);
        assert.equal(r.direction, "departures");
      }
    });
  });

  describe("unknown intent", () => {
    it("returns unknown for generic questions", () => {
      const r = parseFlightIntent("what should I pack for my trip?");
      assert.equal(r.type, "unknown");
    });
  });
});
