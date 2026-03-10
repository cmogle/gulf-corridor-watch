import {
  buildRecentFlights,
  buildRouteSummaries,
  FOCUSED_ROUTE_GROUPS,
  FlightObservationRow,
  LOOKBACK_HOURS,
  routeGroupFor,
  toTimelineItem,
  type FlightDataSource,
  type FlightTimelineItem,
  type RouteFlightListItem,
  type RouteSummaryCard,
} from "@/lib/focused-routes";
import {
  buildHybridFocusedObservations,
} from "@/lib/hybrid-monitor";
import { getSupabaseAdmin } from "@/lib/supabase";

const SELECT_COLUMNS =
  "id,flight_number,callsign,icao24,flight_id,airline,origin_iata,destination_iata,status,is_delayed,delay_minutes,scheduled_time,estimated_time,actual_time,fetched_at,raw_payload";

const MAX_ROWS = 5000;
const DETAIL_TIMELINE_LOOKBACK_HOURS = 36;
const HYBRID_RECENT_WINDOW_MINUTES = 14 * 24 * 60;

export type FocusedMonitorPayload = {
  queriedAt: string;
  summaries: RouteSummaryCard[];
  flights: RouteFlightListItem[];
};

export type FocusedFlightDetailPayload = {
  id: string;
  flightNumber: string;
  callsign: string | null;
  airline: string | null;
  originIata: string | null;
  destinationIata: string | null;
  routeLabel: string;
  routeGroup: (typeof FOCUSED_ROUTE_GROUPS)[number];
  statusCode: string;
  statusLabel: string;
  isDelayed: boolean;
  delayMinutes: number | null;
  scheduledTime: string | null;
  estimatedTime: string | null;
  actualTime: string | null;
  fetchedAt: string | null;
  sourceProvenance: FlightDataSource;
  staleReason: string | null;
  emptyReason: string | null;
  movementNote: string | null;
  rawPayload: Record<string, unknown> | null;
  timeline: FlightTimelineItem[];
};

async function fetchFocusedObservations(lookbackHours = LOOKBACK_HOURS): Promise<FlightObservationRow[]> {
  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("flight_observations")
    .select(SELECT_COLUMNS)
    .or("origin_iata.eq.DXB,destination_iata.eq.DXB")
    .gte("fetched_at", cutoff)
    .order("fetched_at", { ascending: false })
    .limit(MAX_ROWS);

  if (error) throw error;

  const rows = (data ?? []) as FlightObservationRow[];
  return rows.filter((row) => routeGroupFor(row.origin_iata, row.destination_iata) !== null);
}

export async function loadFocusedMonitorData(limit: number): Promise<FocusedMonitorPayload> {
  const nowIso = new Date().toISOString();
  const observations = await fetchFocusedObservations();
  const hybrid = await buildHybridFocusedObservations(observations, nowIso);

  return {
    queriedAt: nowIso,
    summaries: buildRouteSummaries(hybrid, nowIso),
    flights: buildRecentFlights(hybrid, nowIso, limit, HYBRID_RECENT_WINDOW_MINUTES),
  };
}

async function fetchObservationById(id: string): Promise<FlightObservationRow | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("flight_observations")
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return data as FlightObservationRow;
}

async function fetchTimelineRows(seed: FlightObservationRow): Promise<FlightObservationRow[]> {
  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - DETAIL_TIMELINE_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  let query = supabase
    .from("flight_observations")
    .select(SELECT_COLUMNS)
    .gte("fetched_at", cutoff)
    .order("fetched_at", { ascending: false })
    .limit(80);

  if (seed.flight_id) {
    query = query.eq("flight_id", seed.flight_id);
  } else if (seed.origin_iata && seed.destination_iata) {
    query = query
      .eq("flight_number", seed.flight_number)
      .eq("origin_iata", seed.origin_iata)
      .eq("destination_iata", seed.destination_iata);
  } else {
    query = query.eq("flight_number", seed.flight_number);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []) as FlightObservationRow[];
}

function decorateFallbackSource(row: FlightObservationRow): FlightObservationRow {
  return {
    ...row,
    source_provenance: row.source_provenance ?? "LAST_KNOWN",
    stale_reason: row.stale_reason ?? null,
    empty_reason: row.empty_reason ?? null,
    movement_note: row.movement_note ?? null,
  };
}

export async function loadFocusedFlightDetail(id: string): Promise<FocusedFlightDetailPayload | null> {
  const nowIso = new Date().toISOString();

  const observations = await fetchFocusedObservations();
  const hybrid = await buildHybridFocusedObservations(observations, nowIso);

  let seed = hybrid.find((row) => row.id === id) ?? null;

  if (!seed) {
    // Backward compatibility for legacy detail links that still reference DB observation UUIDs.
    const legacySeed = await fetchObservationById(id);
    if (legacySeed) seed = decorateFallbackSource(legacySeed);
  }

  if (!seed) return null;

  const routeGroup = routeGroupFor(seed.origin_iata, seed.destination_iata);
  if (!routeGroup) return null;

  const [latestItem] = buildRecentFlights([seed], nowIso, 1, HYBRID_RECENT_WINDOW_MINUTES);
  if (!latestItem) return null;

  const timelineRows = await fetchTimelineRows(seed);
  const timeline = timelineRows.map(toTimelineItem);

  return {
    ...latestItem,
    rawPayload: seed.raw_payload,
    timeline,
  };
}
