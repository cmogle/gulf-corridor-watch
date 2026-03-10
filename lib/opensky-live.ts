import { FlightObservationRow } from "@/lib/focused-routes";
import { FocusedEkFlight } from "@/lib/emirates-status";

type OpenSkyState = [
  string,
  string | null,
  string | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  boolean | null,
  number | null,
  number | null,
  number | null,
  number[] | null,
  number | null,
  string | null,
  boolean | null,
  number | null,
];

type OpenSkyResponse = {
  time: number;
  states: OpenSkyState[] | null;
};

export type OpenSkyMovementRecord = {
  statusCode: "on_ground" | "departure" | "approach" | "cruise" | "airborne";
  observedAt: string;
  callsign: string | null;
  icao24: string;
  matchMode: "callsign" | "icao24";
  sourceUrl: string;
  rawPayload: {
    state: OpenSkyState;
  };
};

export type OpenSkyMovementResult = {
  ok: boolean;
  flight: FocusedEkFlight;
  record: OpenSkyMovementRecord | null;
  unavailableReason: string | null;
};

type CacheEntry = {
  expiresAt: number;
  states: OpenSkyState[];
};

const OPENSKY_BASE_URL = (process.env.OPENSKY_BASE_URL ?? "https://opensky-network.org").replace(/\/$/, "");
const CACHE_TTL_MS = Number.parseInt(process.env.OPENSKY_CACHE_TTL_MS ?? "90000", 10);
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.OPENSKY_TIMEOUT_MS ?? "10000", 10);

const stateCache = new Map<string, CacheEntry>();

const REGIONS = [
  {
    id: "dxb",
    bounds: { lamin: 24.6, lomin: 54.7, lamax: 25.9, lomax: 56.1 },
  },
  {
    id: "bom",
    bounds: { lamin: 18.5, lomin: 71.8, lamax: 20.3, lomax: 73.4 },
  },
  {
    id: "lon",
    bounds: { lamin: 50.6, lomin: -1.2, lamax: 52.2, lomax: 0.8 },
  },
] as const;

function nowIso(): string {
  return new Date().toISOString();
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function parseObservedAt(state: OpenSkyState): string {
  const timePosition = state[3];
  const lastContact = state[4];
  const unix = typeof timePosition === "number" ? timePosition : lastContact;
  if (typeof unix !== "number" || !Number.isFinite(unix)) return nowIso();
  return new Date(unix * 1000).toISOString();
}

function deriveStatusCode(state: OpenSkyState): OpenSkyMovementRecord["statusCode"] {
  const onGround = state[8] === true;
  const velocity = typeof state[9] === "number" ? state[9] : 0;
  const verticalRate = typeof state[11] === "number" ? state[11] : 0;
  const altitude = typeof state[13] === "number" ? state[13] : state[7] ?? 0;

  if (onGround) return "on_ground";
  if (altitude < 1200 && verticalRate > 1.2) return "departure";
  if (altitude < 1800 && verticalRate < -1.2) return "approach";
  if (altitude > 7000 && velocity > 120) return "cruise";
  return "airborne";
}

function callsignCandidates(flight: FocusedEkFlight): string[] {
  const fn = normalize(flight.flightNumber);
  const numeric = fn.replace(/^EK/, "");
  const values = [fn];
  if (numeric) {
    values.push(`UAE${numeric}`);
    values.push(`EK${numeric}`);
  }
  return [...new Set(values)];
}

function buildAuthHeader(): string | null {
  const username = process.env.OPENSKY_USERNAME;
  const password = process.env.OPENSKY_PASSWORD;
  if (!username || !password) return null;
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

async function fetchStates(url: string): Promise<OpenSkyState[]> {
  const cached = stateCache.get(url);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.states;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const authHeader = buildAuthHeader();

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenSky request failed (${res.status}): ${body.slice(0, 160)}`);
    }

    const payload = (await res.json()) as OpenSkyResponse;
    const states = Array.isArray(payload.states) ? payload.states : [];
    stateCache.set(url, {
      expiresAt: now + CACHE_TTL_MS,
      states,
    });
    return states;
  } finally {
    clearTimeout(timer);
  }
}

function toRecord(
  state: OpenSkyState,
  sourceUrl: string,
  matchMode: OpenSkyMovementRecord["matchMode"],
): OpenSkyMovementRecord | null {
  const icao24 = normalize(state[0]);
  if (!icao24) return null;

  return {
    statusCode: deriveStatusCode(state),
    observedAt: parseObservedAt(state),
    callsign: state[1]?.trim() ?? null,
    icao24,
    matchMode,
    sourceUrl,
    rawPayload: { state },
  };
}

function lastKnownByFlightKey(rows: FlightObservationRow[]): Map<string, FlightObservationRow> {
  const map = new Map<string, FlightObservationRow>();

  for (const row of rows) {
    const key = `${normalize(row.flight_number)}:${normalize(row.origin_iata)}:${normalize(row.destination_iata)}`;
    if (!key.includes(":")) continue;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      continue;
    }

    const existingTs = existing.fetched_at ? new Date(existing.fetched_at).getTime() : 0;
    const rowTs = row.fetched_at ? new Date(row.fetched_at).getTime() : 0;
    if (rowTs > existingTs) map.set(key, row);
  }

  return map;
}

async function findByCallsign(
  flight: FocusedEkFlight,
  statesByCallsign: Map<string, { state: OpenSkyState; url: string }>,
): Promise<OpenSkyMovementRecord | null> {
  for (const candidate of callsignCandidates(flight)) {
    const matched = statesByCallsign.get(candidate);
    if (!matched) continue;
    const record = toRecord(matched.state, matched.url, "callsign");
    if (record) return record;
  }
  return null;
}

async function findByIcao24(icao24: string): Promise<OpenSkyMovementRecord | null> {
  const cleaned = normalize(icao24).toLowerCase();
  if (!cleaned) return null;

  const url = `${OPENSKY_BASE_URL}/api/states/all?icao24=${encodeURIComponent(cleaned)}`;
  try {
    const states = await fetchStates(url);
    const state = states.find((s) => normalize(s[0]).toLowerCase() === cleaned);
    if (!state) return null;
    return toRecord(state, url, "icao24");
  } catch {
    return null;
  }
}

export async function fetchOpenSkyMovements(
  flights: FocusedEkFlight[],
  lastKnownRows: FlightObservationRow[],
): Promise<Map<string, OpenSkyMovementResult>> {
  const result = new Map<string, OpenSkyMovementResult>();
  const statesByCallsign = new Map<string, { state: OpenSkyState; url: string }>();

  for (const region of REGIONS) {
    const { lamin, lomin, lamax, lomax } = region.bounds;
    const url =
      `${OPENSKY_BASE_URL}/api/states/all` +
      `?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;

    try {
      const states = await fetchStates(url);
      for (const state of states) {
        const callsign = normalize(state[1]);
        if (!callsign) continue;
        if (!statesByCallsign.has(callsign)) {
          statesByCallsign.set(callsign, { state, url });
        }
      }
    } catch {
      // Best effort by design; this region may fail independently.
    }
  }

  const hints = lastKnownByFlightKey(lastKnownRows);

  for (const flight of flights) {
    const key = `${normalize(flight.flightNumber)}:${flight.originIata}:${flight.destinationIata}`;

    let record = await findByCallsign(flight, statesByCallsign);
    let reason: string | null = null;

    if (!record) {
      const hint = hints.get(key);
      if (hint?.icao24) {
        record = await findByIcao24(hint.icao24);
      }
    }

    if (!record) {
      const hint = hints.get(key);
      if (!hint) {
        reason = "No OpenSky callsign or icao24 hint available for this flight";
      } else {
        reason = "OpenSky did not return a current movement state for this flight";
      }
    }

    result.set(key, {
      ok: Boolean(record),
      flight,
      record,
      unavailableReason: reason,
    });
  }

  return result;
}

export function toObservationFromOpenSky(
  flight: FocusedEkFlight,
  record: OpenSkyMovementRecord,
  id: string,
): FlightObservationRow {
  return {
    id,
    flight_number: flight.flightNumber,
    callsign: record.callsign,
    icao24: record.icao24,
    flight_id: null,
    airline: "Emirates",
    origin_iata: flight.originIata,
    destination_iata: flight.destinationIata,
    status: record.statusCode,
    is_delayed: false,
    delay_minutes: null,
    scheduled_time: null,
    estimated_time: null,
    actual_time: null,
    fetched_at: record.observedAt,
    raw_payload: {
      source: "opensky",
      sourceUrl: record.sourceUrl,
      matchMode: record.matchMode,
      payload: record.rawPayload,
    },
  };
}
