/**
 * Flight schedule ingestion — fetches airport departure/arrival boards
 * from Flightradar24 API and stores scheduled vs actual times.
 */

import type { AirportCode } from "./flightradar";

const DEFAULT_BASE_URL = "https://fr24api.flightradar24.com";

export type BoardType = "departure" | "arrival";

export type FlightScheduleRow = {
  airport: AirportCode;
  board_type: BoardType;
  flight_number: string;
  airline: string | null;
  origin_iata: string | null;
  destination_iata: string | null;
  scheduled_time: string;
  estimated_time: string | null;
  actual_time: string | null;
  status: string;
  is_delayed: boolean;
  delay_minutes: number | null;
  is_cancelled: boolean;
  cancellation_reason: string | null;
  gate: string | null;
  terminal: string | null;
  source: string;
  fetched_at: string;
};

type FR24BoardFlight = {
  flight: {
    number: string;
    iata: string;
    icao: string;
  };
  airline: {
    name: string;
    code: { iata: string; icao: string };
  } | null;
  airport: {
    origin?: { iata: string; name: string };
    destination?: { iata: string; name: string };
  };
  time: {
    scheduled: { departure: string | null; arrival: string | null };
    estimated: { departure: string | null; arrival: string | null };
    actual: { departure: string | null; arrival: string | null };
  };
  status: {
    text: string;
    type: string;
  };
  terminal: string | null;
  gate: string | null;
};

function getConfig() {
  const apiKey = process.env.FLIGHTRADAR_KEY;
  if (!apiKey) throw new Error("Missing FLIGHTRADAR_KEY");
  const baseUrl = (process.env.FLIGHTRADAR_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  return { apiKey, baseUrl };
}

function computeDelay(scheduled: string | null, estimated: string | null, actual: string | null): { is_delayed: boolean; delay_minutes: number | null } {
  if (!scheduled) return { is_delayed: false, delay_minutes: null };
  const ref = actual ?? estimated;
  if (!ref) return { is_delayed: false, delay_minutes: null };
  const diffMs = new Date(ref).getTime() - new Date(scheduled).getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  return { is_delayed: diffMinutes > 15, delay_minutes: diffMinutes > 0 ? diffMinutes : null };
}

function isCancelled(statusText: string): boolean {
  return /cancel/i.test(statusText);
}

function normalizeStatus(statusText: string, statusType: string): string {
  const text = statusText.toLowerCase();
  if (/cancel/i.test(text)) return "cancelled";
  if (/diverted/i.test(text)) return "diverted";
  if (/landed/i.test(text)) return "landed";
  if (/departed|airborne/i.test(text)) return "departed";
  if (/delay/i.test(text)) return "delayed";
  if (/scheduled|estimated/i.test(text)) return "scheduled";
  if (/boarding|gate/i.test(text)) return "boarding";
  if (statusType === "arrival") return "expected";
  return statusText.toLowerCase().slice(0, 32) || "unknown";
}

async function fetchBoard(airport: AirportCode, boardType: BoardType): Promise<FR24BoardFlight[]> {
  const { apiKey, baseUrl } = getConfig();
  const endpoint = boardType === "departure" ? "departures" : "arrivals";
  const url = `${baseUrl}/api/airports/${airport}/${endpoint}?limit=100`;

  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Accept-Version": "v1",
      "User-Agent": "gulf-corridor-watch/1.0",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`FR24 ${airport} ${boardType} board failed (${res.status}) ${body.slice(0, 200)}`);
  }

  const payload = await res.json() as { data: FR24BoardFlight[] };
  return payload.data ?? [];
}

function mapBoardFlight(airport: AirportCode, boardType: BoardType, flight: FR24BoardFlight, fetchedAt: string): FlightScheduleRow {
  const scheduled = boardType === "departure"
    ? flight.time.scheduled.departure
    : flight.time.scheduled.arrival;
  const estimated = boardType === "departure"
    ? flight.time.estimated.departure
    : flight.time.estimated.arrival;
  const actual = boardType === "departure"
    ? flight.time.actual.departure
    : flight.time.actual.arrival;

  const { is_delayed, delay_minutes } = computeDelay(scheduled, estimated, actual);
  const cancelled = isCancelled(flight.status.text);

  return {
    airport,
    board_type: boardType,
    flight_number: flight.flight.iata || flight.flight.number,
    airline: flight.airline?.name ?? null,
    origin_iata: flight.airport.origin?.iata ?? null,
    destination_iata: flight.airport.destination?.iata ?? null,
    scheduled_time: scheduled ?? fetchedAt,
    estimated_time: estimated,
    actual_time: actual,
    status: normalizeStatus(flight.status.text, flight.status.type),
    is_delayed,
    delay_minutes,
    is_cancelled: cancelled,
    cancellation_reason: cancelled ? flight.status.text : null,
    gate: flight.gate,
    terminal: flight.terminal,
    source: "fr24",
    fetched_at: fetchedAt,
  };
}

export async function fetchAirportBoard(airport: AirportCode, boardType: BoardType): Promise<FlightScheduleRow[]> {
  const fetchedAt = new Date().toISOString();
  const flights = await fetchBoard(airport, boardType);
  return flights.map((f) => mapBoardFlight(airport, boardType, f, fetchedAt));
}

export async function fetchAllBoards(): Promise<FlightScheduleRow[]> {
  const airports: AirportCode[] = ["DXB", "AUH", "DWC"];
  const boards: BoardType[] = ["departure", "arrival"];

  const results = await Promise.allSettled(
    airports.flatMap((airport) =>
      boards.map((boardType) => fetchAirportBoard(airport, boardType))
    )
  );

  const rows: FlightScheduleRow[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      rows.push(...result.value);
    }
  }
  return rows;
}

export type ScheduleStats = {
  airport: AirportCode;
  board_type: BoardType;
  total: number;
  delayed: number;
  cancelled: number;
  avg_delay_minutes: number | null;
};

export function computeScheduleStats(rows: FlightScheduleRow[]): ScheduleStats[] {
  const groups = new Map<string, FlightScheduleRow[]>();
  for (const row of rows) {
    const key = `${row.airport}:${row.board_type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const stats: ScheduleStats[] = [];
  for (const [key, group] of groups) {
    const [airport, board_type] = key.split(":") as [AirportCode, BoardType];
    const delayed = group.filter((r) => r.is_delayed).length;
    const cancelled = group.filter((r) => r.is_cancelled).length;
    const delays = group.filter((r) => r.delay_minutes && r.delay_minutes > 0).map((r) => r.delay_minutes!);
    const avg = delays.length > 0 ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : null;

    stats.push({
      airport,
      board_type,
      total: group.length,
      delayed,
      cancelled,
      avg_delay_minutes: avg,
    });
  }
  return stats;
}
