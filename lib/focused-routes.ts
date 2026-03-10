import { humanizeStatus } from "@/lib/status-human";

export const SUMMARY_WINDOW_MINUTES = 180;
export const RECENT_FLIGHTS_WINDOW_MINUTES = 360;
export const LOOKBACK_HOURS = 24;

export const FOCUSED_ROUTE_GROUPS = ["DXB-BOM", "DXB-LHR", "DXB-LGW"] as const;
export type FocusedRouteGroup = (typeof FOCUSED_ROUTE_GROUPS)[number];
export type FlightDataSource = "EMIRATES" | "OPENSKY" | "LAST_KNOWN";

type FocusedDirection =
  | "DXB-BOM"
  | "BOM-DXB"
  | "DXB-LHR"
  | "LHR-DXB"
  | "DXB-LGW"
  | "LGW-DXB";

const FOCUSED_DIRECTION_SET = new Set<FocusedDirection>([
  "DXB-BOM",
  "BOM-DXB",
  "DXB-LHR",
  "LHR-DXB",
  "DXB-LGW",
  "LGW-DXB",
]);

export type FlightObservationRow = {
  id: string;
  flight_number: string;
  callsign: string | null;
  icao24: string | null;
  flight_id: string | null;
  airline: string | null;
  origin_iata: string | null;
  destination_iata: string | null;
  status: string;
  is_delayed: boolean;
  delay_minutes: number | null;
  scheduled_time: string | null;
  estimated_time: string | null;
  actual_time: string | null;
  fetched_at: string | null;
  raw_payload: Record<string, unknown> | null;
  source_provenance?: FlightDataSource;
  stale_reason?: string | null;
  empty_reason?: string | null;
  movement_note?: string | null;
};

export type RouteSummaryCard = {
  route: FocusedRouteGroup;
  label: string;
  trackedFlights: number;
  delayedFlights: number;
  delayPercent: number | null;
  freshnessMinutes: number | null;
  latestObservedAt: string | null;
};

export type RouteFlightListItem = {
  id: string;
  flightNumber: string;
  callsign: string | null;
  airline: string | null;
  originIata: string | null;
  destinationIata: string | null;
  routeLabel: string;
  routeGroup: FocusedRouteGroup;
  routeGroupLabel: string;
  statusCode: string;
  statusLabel: string;
  isDelayed: boolean;
  delayMinutes: number | null;
  scheduledTime: string | null;
  estimatedTime: string | null;
  actualTime: string | null;
  fetchedAt: string | null;
  freshnessMinutes: number | null;
  sourceProvenance: FlightDataSource;
  staleReason: string | null;
  emptyReason: string | null;
  movementNote: string | null;
};

export type FlightTimelineItem = {
  id: string;
  statusCode: string;
  statusLabel: string;
  isDelayed: boolean;
  delayMinutes: number | null;
  fetchedAt: string | null;
  scheduledTime: string | null;
  estimatedTime: string | null;
  actualTime: string | null;
};

export function normalizeIata(code: string | null): string | null {
  if (!code) return null;
  const value = code.trim().toUpperCase();
  if (!value) return null;
  return value;
}

export function routeGroupFor(
  originRaw: string | null,
  destinationRaw: string | null,
): FocusedRouteGroup | null {
  const origin = normalizeIata(originRaw);
  const destination = normalizeIata(destinationRaw);
  if (!origin || !destination) return null;

  const direction = `${origin}-${destination}` as FocusedDirection;
  if (!FOCUSED_DIRECTION_SET.has(direction)) return null;

  if (direction.includes("BOM")) return "DXB-BOM";
  if (direction.includes("LHR")) return "DXB-LHR";
  if (direction.includes("LGW")) return "DXB-LGW";
  return null;
}

export function routeLabelFor(
  originRaw: string | null,
  destinationRaw: string | null,
): string {
  const origin = normalizeIata(originRaw) ?? "???";
  const destination = normalizeIata(destinationRaw) ?? "???";
  return `${origin} -> ${destination}`;
}

export function routeGroupLabel(route: FocusedRouteGroup): string {
  return route.replace("-", " <-> ");
}

function readTimestampMillis(iso: string | null): number | null {
  if (!iso) return null;
  const millis = new Date(iso).getTime();
  if (!Number.isFinite(millis)) return null;
  return millis;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function flightIdentity(observation: FlightObservationRow): string {
  if (observation.flight_id) return `flight_id:${observation.flight_id}`;
  const number = observation.flight_number || "UNKNOWN";
  const origin = normalizeIata(observation.origin_iata) ?? "???";
  const destination = normalizeIata(observation.destination_iata) ?? "???";
  return `route_flight:${number}:${origin}:${destination}`;
}

function isObservationDelayed(observation: FlightObservationRow): boolean {
  if (observation.is_delayed) return true;
  if (typeof observation.delay_minutes === "number") return observation.delay_minutes > 15;
  return /DELAY/i.test(observation.status || "");
}

export function deduplicateLatestByFlight(
  observations: FlightObservationRow[],
): FlightObservationRow[] {
  const latestByKey = new Map<string, FlightObservationRow>();

  for (const observation of observations) {
    const key = flightIdentity(observation);
    const current = latestByKey.get(key);
    if (!current) {
      latestByKey.set(key, observation);
      continue;
    }

    const currentTs = readTimestampMillis(current.fetched_at) ?? 0;
    const nextTs = readTimestampMillis(observation.fetched_at) ?? 0;
    if (nextTs > currentTs) latestByKey.set(key, observation);
  }

  return [...latestByKey.values()].sort((a, b) => {
    const aTs = readTimestampMillis(a.fetched_at) ?? 0;
    const bTs = readTimestampMillis(b.fetched_at) ?? 0;
    return bTs - aTs;
  });
}

function toFreshnessMinutes(referenceNowMs: number, fetchedAt: string): number | null {
  const fetchedMs = readTimestampMillis(fetchedAt);
  if (fetchedMs === null) return null;
  const diff = Math.max(0, referenceNowMs - fetchedMs);
  return Math.floor(diff / 60_000);
}

export function buildRouteSummaries(
  observations: FlightObservationRow[],
  nowIso: string,
  summaryWindowMinutes = SUMMARY_WINDOW_MINUTES,
): RouteSummaryCard[] {
  const nowMs = readTimestampMillis(nowIso) ?? Date.now();
  const cutoffMs = nowMs - summaryWindowMinutes * 60_000;
  const latest = deduplicateLatestByFlight(observations);

  const byRoute = new Map<FocusedRouteGroup, FlightObservationRow[]>();
  const latestSeenByRoute = new Map<FocusedRouteGroup, number>();

  for (const observation of latest) {
    if (observation.empty_reason) continue;

    const route = routeGroupFor(observation.origin_iata, observation.destination_iata);
    if (!route) continue;

    const fetchedMs = readTimestampMillis(observation.fetched_at);
    if (fetchedMs !== null) {
      const current = latestSeenByRoute.get(route);
      if (current === undefined || fetchedMs > current) latestSeenByRoute.set(route, fetchedMs);
      if (fetchedMs < cutoffMs) continue;
    }

    const rows = byRoute.get(route) ?? [];
    rows.push(observation);
    byRoute.set(route, rows);
  }

  return FOCUSED_ROUTE_GROUPS.map((route) => {
    const rows = byRoute.get(route) ?? [];
    const delayed = rows.filter(isObservationDelayed).length;
    const latestSeen = latestSeenByRoute.get(route);

    return {
      route,
      label: routeGroupLabel(route),
      trackedFlights: rows.length,
      delayedFlights: delayed,
      delayPercent: rows.length ? round1((delayed / rows.length) * 100) : null,
      freshnessMinutes:
        latestSeen === undefined ? null : Math.max(0, Math.floor((nowMs - latestSeen) / 60_000)),
      latestObservedAt: latestSeen === undefined ? null : new Date(latestSeen).toISOString(),
    };
  });
}

export function buildRecentFlights(
  observations: FlightObservationRow[],
  nowIso: string,
  limit: number,
  recentWindowMinutes = RECENT_FLIGHTS_WINDOW_MINUTES,
): RouteFlightListItem[] {
  const nowMs = readTimestampMillis(nowIso) ?? Date.now();
  const cutoffMs = nowMs - recentWindowMinutes * 60_000;
  const latest = deduplicateLatestByFlight(observations);

  const rows = latest
    .filter((observation) => {
      const route = routeGroupFor(observation.origin_iata, observation.destination_iata);
      if (!route) return false;
      const fetchedMs = readTimestampMillis(observation.fetched_at);
      if (fetchedMs === null) return true;
      return fetchedMs >= cutoffMs;
    })
    .slice(0, Math.max(1, limit))
    .map((observation) => {
      const route = routeGroupFor(observation.origin_iata, observation.destination_iata);
      if (!route) return null;
      const human = humanizeStatus(observation.status || "");

      return {
        id: observation.id,
        flightNumber: observation.flight_number,
        callsign: observation.callsign,
        airline: observation.airline,
        originIata: observation.origin_iata,
        destinationIata: observation.destination_iata,
        routeLabel: routeLabelFor(observation.origin_iata, observation.destination_iata),
        routeGroup: route,
        routeGroupLabel: routeGroupLabel(route),
        statusCode: observation.status || "unknown",
        statusLabel: human.label,
        isDelayed: isObservationDelayed(observation),
        delayMinutes: observation.delay_minutes,
        scheduledTime: observation.scheduled_time,
        estimatedTime: observation.estimated_time,
        actualTime: observation.actual_time,
        fetchedAt: observation.fetched_at,
        freshnessMinutes: observation.fetched_at ? toFreshnessMinutes(nowMs, observation.fetched_at) : null,
        sourceProvenance: observation.source_provenance ?? "LAST_KNOWN",
        staleReason: observation.stale_reason ?? null,
        emptyReason: observation.empty_reason ?? null,
        movementNote: observation.movement_note ?? null,
      };
    })
    .filter((row): row is RouteFlightListItem => row !== null);

  return rows;
}

export function toTimelineItem(
  observation: FlightObservationRow,
): FlightTimelineItem {
  const human = humanizeStatus(observation.status || "");
  return {
    id: observation.id,
    statusCode: observation.status,
    statusLabel: human.label,
    isDelayed: isObservationDelayed(observation),
    delayMinutes: observation.delay_minutes,
    fetchedAt: observation.fetched_at,
    scheduledTime: observation.scheduled_time,
    estimatedTime: observation.estimated_time,
    actualTime: observation.actual_time,
  };
}
