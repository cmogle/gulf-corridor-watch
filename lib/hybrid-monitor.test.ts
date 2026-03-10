import assert from "node:assert/strict";
import test from "node:test";
import { FocusedEkFlight } from "@/lib/emirates-status";
import {
  focusedFlightId,
  parseFocusedFlightId,
  resolveHybridObservation,
} from "@/lib/hybrid-monitor";
import { FlightObservationRow } from "@/lib/focused-routes";

const FLIGHT: FocusedEkFlight = {
  flightNumber: "EK500",
  originIata: "DXB",
  destinationIata: "BOM",
};

function makeObservation(overrides: Partial<FlightObservationRow>): FlightObservationRow {
  return {
    id: focusedFlightId(FLIGHT),
    flight_number: FLIGHT.flightNumber,
    callsign: null,
    icao24: null,
    flight_id: null,
    airline: "Emirates",
    origin_iata: FLIGHT.originIata,
    destination_iata: FLIGHT.destinationIata,
    status: "SCH",
    is_delayed: false,
    delay_minutes: null,
    scheduled_time: null,
    estimated_time: null,
    actual_time: null,
    fetched_at: "2026-03-10T10:00:00.000Z",
    raw_payload: null,
    source_provenance: "LAST_KNOWN",
    stale_reason: null,
    empty_reason: null,
    movement_note: null,
    ...overrides,
  };
}

test("focusedFlightId and parseFocusedFlightId round trip", () => {
  const id = focusedFlightId(FLIGHT);
  assert.equal(id, "focused:EK500:DXB:BOM");
  assert.deepEqual(parseFocusedFlightId(id), FLIGHT);
  assert.equal(parseFocusedFlightId("focused:EK500:DXB:BEG"), null);
});

test("resolveHybridObservation prefers Emirates over OpenSky and last-known", () => {
  const result = resolveHybridObservation({
    flight: FLIGHT,
    id: focusedFlightId(FLIGHT),
    nowIso: "2026-03-10T10:05:00.000Z",
    emiratesObservation: makeObservation({ status: "DEP" }),
    emiratesReason: null,
    openskyObservation: makeObservation({ status: "cruise", fetched_at: "2026-03-10T10:04:00.000Z" }),
    openskyReason: null,
    lastKnownObservation: makeObservation({ status: "SCH", fetched_at: "2026-03-10T09:00:00.000Z" }),
  });

  assert.equal(result.source, "EMIRATES");
  assert.equal(result.observation.source_provenance, "EMIRATES");
});

test("resolveHybridObservation falls back to OpenSky then LAST_KNOWN", () => {
  const openSkyWinner = resolveHybridObservation({
    flight: FLIGHT,
    id: focusedFlightId(FLIGHT),
    nowIso: "2026-03-10T10:05:00.000Z",
    emiratesObservation: null,
    emiratesReason: "blocked",
    openskyObservation: makeObservation({ status: "airborne", fetched_at: "2026-03-10T10:04:00.000Z" }),
    openskyReason: null,
    lastKnownObservation: makeObservation({ status: "SCH", fetched_at: "2026-03-10T09:00:00.000Z" }),
  });

  assert.equal(openSkyWinner.source, "OPENSKY");
  assert.equal(openSkyWinner.observation.source_provenance, "OPENSKY");

  const lastKnownWinner = resolveHybridObservation({
    flight: FLIGHT,
    id: focusedFlightId(FLIGHT),
    nowIso: "2026-03-10T10:05:00.000Z",
    emiratesObservation: null,
    emiratesReason: "blocked",
    openskyObservation: null,
    openskyReason: "rate-limited",
    lastKnownObservation: makeObservation({ status: "SCH", fetched_at: "2026-03-10T09:00:00.000Z" }),
  });

  assert.equal(lastKnownWinner.source, "LAST_KNOWN");
  assert.equal(lastKnownWinner.observation.source_provenance, "LAST_KNOWN");
  assert.match(lastKnownWinner.observation.stale_reason ?? "", /Last known observation is/);
});
