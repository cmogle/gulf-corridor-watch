import {
  buildRecentFlights,
  buildRouteSummaries,
  FOCUSED_ROUTE_GROUPS,
  FlightObservationRow,
  LOOKBACK_HOURS,
  routeGroupFor,
  toTimelineItem,
  type FlightTimelineItem,
  type RouteFlightListItem,
  type RouteSummaryCard,
} from "@/lib/focused-routes";
import { getSupabaseAdmin } from "@/lib/supabase";

const SELECT_COLUMNS =
  "id,flight_number,callsign,flight_id,airline,origin_iata,destination_iata,status,is_delayed,delay_minutes,scheduled_time,estimated_time,actual_time,fetched_at,raw_payload";

const MAX_ROWS = 5000;

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
  fetchedAt: string;
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

  return {
    queriedAt: nowIso,
    summaries: buildRouteSummaries(observations, nowIso),
    flights: buildRecentFlights(observations, nowIso, limit),
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
  const cutoff = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
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

export async function loadFocusedFlightDetail(id: string): Promise<FocusedFlightDetailPayload | null> {
  const seed = await fetchObservationById(id);
  if (!seed) return null;

  const routeGroup = routeGroupFor(seed.origin_iata, seed.destination_iata);
  if (!routeGroup) return null;

  const [latestItem] = buildRecentFlights([seed], new Date().toISOString(), 1);
  if (!latestItem) return null;

  const timelineRows = await fetchTimelineRows(seed);
  const timeline = timelineRows.map(toTimelineItem);

  return {
    ...latestItem,
    rawPayload: seed.raw_payload,
    timeline,
  };
}
