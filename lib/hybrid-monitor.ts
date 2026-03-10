import {
  buildEmiratesResultKey,
  fetchEmiratesStatuses,
  FocusedEkFlight,
  toObservationFromEmirates,
} from "@/lib/emirates-status";
import {
  FlightDataSource,
  FlightObservationRow,
  routeGroupFor,
} from "@/lib/focused-routes";
import {
  fetchOpenSkyMovements,
  toObservationFromOpenSky,
} from "@/lib/opensky-live";

export const FOCUSED_EK_FLIGHTS: FocusedEkFlight[] = [
  { flightNumber: "EK500", originIata: "DXB", destinationIata: "BOM" },
  { flightNumber: "EK501", originIata: "BOM", destinationIata: "DXB" },
  { flightNumber: "EK1", originIata: "DXB", destinationIata: "LHR" },
  { flightNumber: "EK2", originIata: "LHR", destinationIata: "DXB" },
  { flightNumber: "EK69", originIata: "DXB", destinationIata: "LGW" },
  { flightNumber: "EK70", originIata: "LGW", destinationIata: "DXB" },
];

export type HybridResolution = {
  source: FlightDataSource;
  observation: FlightObservationRow;
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function observationAgeMinutes(fetchedAt: string | null, nowMs: number): number | null {
  if (!fetchedAt) return null;
  const ts = new Date(fetchedAt).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.floor((nowMs - ts) / 60_000));
}

function pickLatestLastKnown(
  rows: FlightObservationRow[],
): Map<string, FlightObservationRow> {
  const byKey = new Map<string, FlightObservationRow>();

  for (const row of rows) {
    const key = `${normalize(row.flight_number)}:${normalize(row.origin_iata)}:${normalize(row.destination_iata)}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }

    const rowTs = row.fetched_at ? new Date(row.fetched_at).getTime() : 0;
    const existingTs = existing.fetched_at ? new Date(existing.fetched_at).getTime() : 0;
    if (rowTs > existingTs) byKey.set(key, row);
  }

  return byKey;
}

export function focusedFlightId(flight: FocusedEkFlight): string {
  return `focused:${normalize(flight.flightNumber)}:${flight.originIata}:${flight.destinationIata}`;
}

export function parseFocusedFlightId(id: string): FocusedEkFlight | null {
  const parts = id.split(":");
  if (parts.length !== 4 || parts[0] !== "focused") return null;

  const [, flightNumber, originIata, destinationIata] = parts;
  if (!flightNumber || !originIata || !destinationIata) return null;

  if (!routeGroupFor(originIata, destinationIata)) return null;

  return {
    flightNumber,
    originIata: originIata as FocusedEkFlight["originIata"],
    destinationIata: destinationIata as FocusedEkFlight["destinationIata"],
  };
}

function makePlaceholderObservation(
  flight: FocusedEkFlight,
  id: string,
  reason: string,
): FlightObservationRow {
  return {
    id,
    flight_number: flight.flightNumber,
    callsign: null,
    icao24: null,
    flight_id: null,
    airline: "Emirates",
    origin_iata: flight.originIata,
    destination_iata: flight.destinationIata,
    status: "unknown",
    is_delayed: false,
    delay_minutes: null,
    scheduled_time: null,
    estimated_time: null,
    actual_time: null,
    fetched_at: null,
    raw_payload: {
      source: "hybrid",
      reason,
    },
    source_provenance: "LAST_KNOWN",
    stale_reason: reason,
    empty_reason: reason,
    movement_note: null,
  };
}

function withSource(
  observation: FlightObservationRow,
  source: FlightDataSource,
  options?: {
    staleReason?: string | null;
    emptyReason?: string | null;
    movementNote?: string | null;
  },
): HybridResolution {
  return {
    source,
    observation: {
      ...observation,
      source_provenance: source,
      stale_reason: options?.staleReason ?? null,
      empty_reason: options?.emptyReason ?? null,
      movement_note: options?.movementNote ?? null,
    },
  };
}

export function resolveHybridObservation(args: {
  flight: FocusedEkFlight;
  id: string;
  nowIso: string;
  emiratesObservation: FlightObservationRow | null;
  emiratesReason: string | null;
  openskyObservation: FlightObservationRow | null;
  openskyReason: string | null;
  lastKnownObservation: FlightObservationRow | null;
}): HybridResolution {
  const {
    flight,
    id,
    nowIso,
    emiratesObservation,
    emiratesReason,
    openskyObservation,
    openskyReason,
    lastKnownObservation,
  } = args;
  const nowMs = new Date(nowIso).getTime();

  if (emiratesObservation && emiratesObservation.status !== "unknown") {
    const movementNote = openskyObservation
      ? "Movement confirmed by OpenSky"
      : openskyReason
        ? `OpenSky enrichment unavailable: ${openskyReason}`
        : null;

    return withSource(
      { ...emiratesObservation, id },
      "EMIRATES",
      { movementNote },
    );
  }

  if (openskyObservation) {
    const age = observationAgeMinutes(openskyObservation.fetched_at, nowMs);
    const staleReason =
      typeof age === "number" && age > 15
        ? `OpenSky movement is ${age} minutes old`
        : emiratesReason
          ? `Emirates unavailable: ${emiratesReason}`
          : null;

    return withSource(
      {
        ...openskyObservation,
        id,
        scheduled_time: lastKnownObservation?.scheduled_time ?? null,
        estimated_time: lastKnownObservation?.estimated_time ?? null,
        actual_time: lastKnownObservation?.actual_time ?? null,
      },
      "OPENSKY",
      {
        staleReason,
      },
    );
  }

  if (lastKnownObservation) {
    const age = observationAgeMinutes(lastKnownObservation.fetched_at, nowMs);
    const staleReason =
      typeof age === "number"
        ? `Last known observation is ${age} minutes old; live sources unavailable`
        : "Using last known observation; live sources unavailable";

    return withSource(
      { ...lastKnownObservation, id },
      "LAST_KNOWN",
      {
        staleReason,
        movementNote: emiratesReason || openskyReason
          ? `Live source issues: ${[emiratesReason, openskyReason].filter(Boolean).join(" | ")}`
          : null,
      },
    );
  }

  const emptyReason = [
    emiratesReason ? `Emirates: ${emiratesReason}` : null,
    openskyReason ? `OpenSky: ${openskyReason}` : null,
    "No cached observation available yet",
  ]
    .filter(Boolean)
    .join("; ");

  return withSource(makePlaceholderObservation(flight, id, emptyReason), "LAST_KNOWN", {
    staleReason: emptyReason,
    emptyReason,
  });
}

export async function buildHybridFocusedObservations(
  lastKnownRows: FlightObservationRow[],
  nowIso = new Date().toISOString(),
): Promise<FlightObservationRow[]> {
  const lastKnownByKey = pickLatestLastKnown(lastKnownRows);

  const emiratesByKey = await fetchEmiratesStatuses(FOCUSED_EK_FLIGHTS, nowIso);
  const openSkyByKey = await fetchOpenSkyMovements(FOCUSED_EK_FLIGHTS, lastKnownRows);

  const resolved: FlightObservationRow[] = [];

  for (const flight of FOCUSED_EK_FLIGHTS) {
    const key = `${normalize(flight.flightNumber)}:${flight.originIata}:${flight.destinationIata}`;
    const id = focusedFlightId(flight);

    const emiratesResult = emiratesByKey.get(buildEmiratesResultKey(flight, nowIso));
    const openSkyResult = openSkyByKey.get(key);
    const lastKnown = lastKnownByKey.get(key) ?? null;

    const emiratesObservation = emiratesResult?.record
      ? toObservationFromEmirates(flight, emiratesResult.record, id)
      : null;
    const openSkyObservation = openSkyResult?.record
      ? toObservationFromOpenSky(flight, openSkyResult.record, id)
      : null;

    const winner = resolveHybridObservation({
      flight,
      id,
      nowIso,
      emiratesObservation,
      emiratesReason: emiratesResult?.unavailableReason ?? null,
      openskyObservation: openSkyObservation,
      openskyReason: openSkyResult?.unavailableReason ?? null,
      lastKnownObservation: lastKnown,
    });

    resolved.push(winner.observation);
  }

  return resolved;
}
