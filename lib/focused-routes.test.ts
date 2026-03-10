import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRecentFlights,
  buildRouteSummaries,
  routeGroupFor,
  type FlightObservationRow,
} from "@/lib/focused-routes";

function obs(overrides: Partial<FlightObservationRow>): FlightObservationRow {
  return {
    id: "obs-default",
    flight_number: "EK1",
    callsign: null,
    flight_id: null,
    airline: "Emirates",
    origin_iata: "DXB",
    destination_iata: "LHR",
    status: "CRZ",
    is_delayed: false,
    delay_minutes: null,
    scheduled_time: "2026-03-10T06:00:00.000Z",
    estimated_time: null,
    actual_time: null,
    fetched_at: "2026-03-10T06:05:00.000Z",
    raw_payload: null,
    ...overrides,
  };
}

test("routeGroupFor resolves focused routes in both directions", () => {
  assert.equal(routeGroupFor("DXB", "BOM"), "DXB-BOM");
  assert.equal(routeGroupFor("BOM", "DXB"), "DXB-BOM");
  assert.equal(routeGroupFor("DXB", "LHR"), "DXB-LHR");
  assert.equal(routeGroupFor("LGW", "DXB"), "DXB-LGW");
  assert.equal(routeGroupFor("DXB", "BEG"), null);
});

test("buildRouteSummaries returns empty cards when no data exists", () => {
  const summaries = buildRouteSummaries([], "2026-03-10T07:00:00.000Z", 180);
  assert.equal(summaries.length, 3);
  for (const card of summaries) {
    assert.equal(card.trackedFlights, 0);
    assert.equal(card.delayPercent, null);
    assert.equal(card.freshnessMinutes, null);
  }
});

test("buildRouteSummaries and buildRecentFlights use latest real observations", () => {
  const now = "2026-03-10T07:10:00.000Z";
  const rows: FlightObservationRow[] = [
    obs({
      id: "older-ek1",
      flight_number: "EK1",
      origin_iata: "DXB",
      destination_iata: "LHR",
      status: "CRZ",
      fetched_at: "2026-03-10T06:00:00.000Z",
    }),
    obs({
      id: "latest-ek1",
      flight_number: "EK1",
      origin_iata: "DXB",
      destination_iata: "LHR",
      status: "CRZ",
      fetched_at: "2026-03-10T06:40:00.000Z",
    }),
    obs({
      id: "ek500",
      flight_number: "EK500",
      origin_iata: "DXB",
      destination_iata: "BOM",
      status: "DELAYED",
      is_delayed: true,
      delay_minutes: 37,
      fetched_at: "2026-03-10T07:00:00.000Z",
    }),
  ];

  const summaries = buildRouteSummaries(rows, now, 180);
  const lhr = summaries.find((s) => s.route === "DXB-LHR");
  const bom = summaries.find((s) => s.route === "DXB-BOM");

  assert.ok(lhr);
  assert.equal(lhr.trackedFlights, 1);
  assert.equal(lhr.delayPercent, 0);

  assert.ok(bom);
  assert.equal(bom.trackedFlights, 1);
  assert.equal(bom.delayPercent, 100);

  const recent = buildRecentFlights(rows, now, 10, 360);
  assert.equal(recent.length, 2);
  assert.equal(recent[0].id, "ek500");
  assert.equal(recent[0].statusLabel, "Delayed");
  assert.equal(recent[1].id, "latest-ek1");
  assert.equal(recent[1].statusLabel, "Cruising");
});
