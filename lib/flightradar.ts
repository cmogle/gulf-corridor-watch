const DEFAULT_BASE_URL = "https://fr24api.flightradar24.com/api";

export type AirportCode = "DXB" | "AUH";

export type FlightObservation = {
  airport: AirportCode;
  flight_number: string;
  callsign: string | null;
  icao24: string | null;
  flight_id: string | null;
  airline: string | null;
  origin_iata: string | null;
  origin_name: string | null;
  destination_iata: string | null;
  destination_name: string | null;
  scheduled_time: string | null;
  estimated_time: string | null;
  actual_time: string | null;
  status: string;
  is_delayed: boolean;
  delay_minutes: number | null;
  source_url: string;
  raw_payload: unknown;
  fetched_at: string;
};

type QueryMode = "all" | "arrivals" | "departures";

function getConfig() {
  const apiKey = process.env.FLIGHTRADAR_KEY;
  if (!apiKey) throw new Error("Missing FLIGHTRADAR_KEY");
  const baseUrl = (process.env.FLIGHTRADAR_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  return { apiKey, baseUrl };
}

function toIso(ts: unknown): string | null {
  if (typeof ts === "number" && Number.isFinite(ts)) {
    if (ts > 10_000_000_000) return new Date(ts).toISOString();
    return new Date(ts * 1000).toISOString();
  }
  if (typeof ts === "string" && ts.trim()) {
    const asNum = Number(ts);
    if (!Number.isNaN(asNum)) return toIso(asNum);
    const d = new Date(ts);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return null;
}

function toArray(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const candidates = [
    root.data,
    root.results,
    root.flights,
    root.items,
    (root.data as Record<string, unknown> | undefined)?.flights,
    (root.result as Record<string, unknown> | undefined)?.flights,
    (root.response as Record<string, unknown> | undefined)?.flights,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  }
  return [];
}

function parseDelayMinutes(raw: Record<string, unknown>): number | null {
  const direct = pick(raw, ["delay_minutes", "delayMinutes"]);
  if (typeof direct === "number") return Math.max(0, Math.round(direct));
  if (typeof direct === "string") {
    const num = Number(direct);
    if (!Number.isNaN(num)) return Math.max(0, Math.round(num));
  }
  const status = pick(raw, ["status"]) as Record<string, unknown> | null;
  const nested = status && typeof status === "object" ? pick(status, ["delay", "delayMinutes"]) : null;
  if (typeof nested === "number") return Math.max(0, Math.round(nested));
  if (typeof nested === "string") {
    const num = Number(nested);
    if (!Number.isNaN(num)) return Math.max(0, Math.round(num));
  }
  return null;
}

function normalize(airport: AirportCode, raw: Record<string, unknown>, sourceUrl: string): FlightObservation | null {
  const ident = pick(raw, ["flight_number", "flightNumber", "number", "callsign", "identification"]);
  const identification = ident && typeof ident === "object" ? (ident as Record<string, unknown>) : null;
  const number = typeof ident === "string" ? ident : (pick(identification ?? {}, ["number", "default"]) as string | null);

  const flightNumber = number?.toUpperCase().replace(/\s+/g, "") ?? "";
  if (!flightNumber) return null;

  const time = (pick(raw, ["time"]) as Record<string, unknown> | null) ?? null;
  const scheduled = toIso(pick(raw, ["scheduled_time", "scheduledTime", "scheduled"]) ?? pick(time ?? {}, ["scheduled", "scheduled_time"]));
  const estimated = toIso(pick(raw, ["estimated_time", "estimatedTime", "estimated"]) ?? pick(time ?? {}, ["estimated", "estimated_time"]));
  const actual = toIso(pick(raw, ["actual_time", "actualTime", "actual"]) ?? pick(time ?? {}, ["real", "actual", "actual_time"]));

  const airportInfo = (pick(raw, ["airport"]) as Record<string, unknown> | null) ?? null;
  const origin = (pick(raw, ["origin"]) as Record<string, unknown> | null) ?? (pick(airportInfo ?? {}, ["origin"]) as Record<string, unknown> | null);
  const destination = (pick(raw, ["destination"]) as Record<string, unknown> | null) ?? (pick(airportInfo ?? {}, ["destination"]) as Record<string, unknown> | null);

  const statusRaw =
    (pick(raw, ["status", "flight_status", "flightStatus"]) as Record<string, unknown> | string | null) ?? "unknown";
  const status =
    typeof statusRaw === "string"
      ? statusRaw.toLowerCase()
      : String(pick(statusRaw, ["text", "generic", "live"]) ?? "unknown").toLowerCase();

  const delayMinutes = parseDelayMinutes(raw);
  const isDelayed = delayMinutes !== null ? delayMinutes > 0 : /delay|late/.test(status);

  return {
    airport,
    flight_number: flightNumber,
    callsign: (pick(raw, ["callsign"]) as string | null) ?? (pick(identification ?? {}, ["callsign"]) as string | null),
    icao24: (pick(raw, ["icao24", "hex"]) as string | null) ?? null,
    flight_id: (pick(raw, ["id", "flight_id", "flightId"]) as string | null) ?? null,
    airline: (pick(raw, ["airline", "airline_name", "airlineName"]) as string | null) ?? null,
    origin_iata: (pick(origin ?? {}, ["iata", "iataCode", "code"]) as string | null)?.toUpperCase() ?? null,
    origin_name: (pick(origin ?? {}, ["name"]) as string | null) ?? null,
    destination_iata: (pick(destination ?? {}, ["iata", "iataCode", "code"]) as string | null)?.toUpperCase() ?? null,
    destination_name: (pick(destination ?? {}, ["name"]) as string | null) ?? null,
    scheduled_time: scheduled,
    estimated_time: estimated,
    actual_time: actual,
    status,
    is_delayed: isDelayed,
    delay_minutes: delayMinutes,
    source_url: sourceUrl,
    raw_payload: raw,
    fetched_at: new Date().toISOString(),
  };
}

async function fetchJson(path: string, params: URLSearchParams): Promise<{ payload: unknown; sourceUrl: string }> {
  const { apiKey, baseUrl } = getConfig();
  const url = `${baseUrl}${path}?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Flightradar request failed (${res.status}) ${url} ${body.slice(0, 300)}`);
  }
  return { payload: await res.json(), sourceUrl: url };
}

async function fetchAirportWithCandidates(airport: AirportCode, mode: QueryMode): Promise<FlightObservation[]> {
  const candidates = [
    { path: `/airports/${airport}/flights`, params: new URLSearchParams({ mode, limit: "200" }) },
    { path: `/airport/${airport}/flights`, params: new URLSearchParams({ mode, limit: "200" }) },
    { path: `/airports/${airport}/live`, params: new URLSearchParams({ limit: "200" }) },
    { path: `/flights/airport/${airport}`, params: new URLSearchParams({ mode, limit: "200" }) },
  ];

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const { payload, sourceUrl } = await fetchJson(candidate.path, candidate.params);
      const rows = toArray(payload)
        .map((r) => normalize(airport, r, sourceUrl))
        .filter((r): r is FlightObservation => Boolean(r));
      if (rows.length > 0) return rows;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Unable to fetch ${airport} board: ${String(lastError ?? "unknown error")}`);
}

export async function getAirportBoards(airport: AirportCode): Promise<FlightObservation[]> {
  const [arrivals, departures] = await Promise.all([
    fetchAirportWithCandidates(airport, "arrivals"),
    fetchAirportWithCandidates(airport, "departures"),
  ]);
  return [...arrivals, ...departures];
}

export async function ingestAirports(airports: AirportCode[]): Promise<FlightObservation[]> {
  const batches = await Promise.all(airports.map((airport) => getAirportBoards(airport)));
  return batches.flat();
}

function normalizeFlightNumber(input: string): string {
  return input.toUpperCase().replace(/\s+/g, "");
}

export async function findFlightByNumber(flightNumber: string): Promise<FlightObservation[]> {
  const number = normalizeFlightNumber(flightNumber);
  const airports: AirportCode[] = ["DXB", "AUH"];
  const all = await ingestAirports(airports);
  return all.filter((row) => normalizeFlightNumber(row.flight_number) === number);
}

export async function findRouteFlights(originIata: string, destinationIata: string): Promise<FlightObservation[]> {
  const origin = originIata.toUpperCase().trim();
  const destination = destinationIata.toUpperCase().trim();
  const airports: AirportCode[] = ["DXB", "AUH"];
  const all = await ingestAirports(airports);
  return all.filter((row) => row.origin_iata === origin && row.destination_iata === destination);
}
