/**
 * Flight Intelligence Panel — shared query & aggregation logic.
 *
 * Provides airport-level and route-level detail data for the
 * slide-out Flight Detail drawer, including hourly volume bins,
 * airline breakdown, equipment mix, delay stats, and baseline
 * recovery comparison.
 */

import { getSupabaseAdmin } from "@/lib/supabase";
import { classifyAircraftType, type AircraftFamily } from "@/lib/aircraft-family";
import { HUBS } from "@/lib/flight-network";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type HourlyBin = {
  hour: number;       // 0-23 (UTC+4)
  label: string;      // "14:00"
  arrivals: number;
  departures: number;
  total: number;
};

export type BaselineBin = {
  hour: number;
  avg_total: number;
};

export type RecoveryInfo = {
  percent: number;
  trend: "up" | "flat" | "down";
};

export type TopRoute = { route: string; count: number };

export type AirlineCount = { name: string; count: number };

export type EquipmentCount = { family: AircraftFamily; count: number };

export type DelayStats = {
  total: number;
  delayed: number;
  delayed_pct: number;
  avg_delay_min: number;
  cancelled: number;
};

export type ActiveFlight = {
  flight_number: string;
  airline: string | null;
  status: string;
  aircraft_type: string | null;
  is_delayed: boolean;
  delay_minutes: number | null;
  fetched_at: string;
};

export type AirportDetailResult = {
  ok: true;
  airport: { iata: string; label: string };
  hourly_bins: HourlyBin[];
  baseline_bins: BaselineBin[] | null;
  recovery: RecoveryInfo | null;
  top_routes: TopRoute[];
  airlines: AirlineCount[];
  equipment: EquipmentCount[];
  delays: DelayStats;
  as_of: string;
};

export type RouteDetailResult = {
  ok: true;
  route: { from: string; to: string; label: string };
  hourly_bins: HourlyBin[];
  baseline_bins: BaselineBin[] | null;
  recovery: RecoveryInfo | null;
  active_flights: ActiveFlight[];
  airlines: AirlineCount[];
  equipment: EquipmentCount[];
  delays: DelayStats;
  as_of: string;
};

/* ------------------------------------------------------------------ */
/*  Internal row shape                                                 */
/* ------------------------------------------------------------------ */

type ObsRow = {
  flight_number: string;
  flight_id: string | null;
  airline: string | null;
  origin_iata: string | null;
  destination_iata: string | null;
  status: string;
  is_delayed: boolean;
  delay_minutes: number | null;
  raw_payload: Record<string, unknown> | null;
  fetched_at: string;
};

type BaselineRow = {
  hour_of_day: number;
  avg_arrivals: number;
  avg_departures: number;
  avg_total: number;
};

/* ------------------------------------------------------------------ */
/*  Deduplication (mirrors flight-network.ts)                          */
/* ------------------------------------------------------------------ */

const BUCKET_MS = 5 * 60_000;

function observationKey(row: ObsRow): string {
  if (row.flight_id) return row.flight_id;
  return `${row.flight_number}|${row.origin_iata ?? ""}|${row.destination_iata ?? ""}`;
}

function deduplicate(rows: ObsRow[]): ObsRow[] {
  const best = new Map<string, ObsRow>();
  for (const row of rows) {
    const bucket = Math.floor(new Date(row.fetched_at).getTime() / BUCKET_MS);
    const key = `${observationKey(row)}|${bucket}`;
    const existing = best.get(key);
    if (!existing || new Date(row.fetched_at).getTime() > new Date(existing.fetched_at).getTime()) {
      best.set(key, row);
    }
  }
  return Array.from(best.values());
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const UAE_OFFSET_MS = 4 * 60 * 60_000; // UTC+4

function toUAEHour(iso: string): number {
  return new Date(new Date(iso).getTime() + UAE_OFFSET_MS).getUTCHours();
}

function hourLabel(h: number): string {
  return `${h.toString().padStart(2, "0")}:00`;
}

/** Sorted route key for baseline: always alphabetical. */
export function routeBaselineKey(a: string, b: string): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

const HUB_MAP = new Map(HUBS.map((h) => [h.iata, h]));

function hubLabel(iata: string): string {
  return HUB_MAP.get(iata)?.label ?? iata;
}

/* ------------------------------------------------------------------ */
/*  Hourly bin builder                                                 */
/* ------------------------------------------------------------------ */

function buildHourlyBins(
  rows: ObsRow[],
  windowHours: number,
  isArrival: (r: ObsRow) => boolean,
  isDeparture: (r: ObsRow) => boolean,
): HourlyBin[] {
  const now = Date.now();
  const bins: HourlyBin[] = [];

  for (let i = windowHours - 1; i >= 0; i--) {
    const binStart = now - (i + 1) * 3600_000;
    const binEnd = now - i * 3600_000;
    const binRows = rows.filter((r) => {
      const t = new Date(r.fetched_at).getTime();
      return t >= binStart && t < binEnd;
    });

    const hour = toUAEHour(new Date(binEnd).toISOString());
    let arrivals = 0;
    let departures = 0;
    for (const r of binRows) {
      if (isArrival(r)) arrivals++;
      if (isDeparture(r)) departures++;
    }

    bins.push({
      hour,
      label: hourLabel(hour),
      arrivals,
      departures,
      total: arrivals + departures,
    });
  }

  return bins;
}

/* ------------------------------------------------------------------ */
/*  Aggregation helpers                                                */
/* ------------------------------------------------------------------ */

function aggregateAirlines(rows: ObsRow[]): AirlineCount[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const name = r.airline?.trim() || "Unknown";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1]);

  // Top 5 + Other
  if (sorted.length <= 6) {
    return sorted.map(([name, count]) => ({ name, count }));
  }
  const top5 = sorted.slice(0, 5).map(([name, count]) => ({ name, count }));
  const otherCount = sorted.slice(5).reduce((sum, [, c]) => sum + c, 0);
  return [...top5, { name: "Other", count: otherCount }];
}

function aggregateEquipment(rows: ObsRow[]): EquipmentCount[] {
  const counts = new Map<AircraftFamily, number>();
  for (const r of rows) {
    const typeCode = r.raw_payload?.type as string | undefined;
    const family = classifyAircraftType(typeCode);
    counts.set(family, (counts.get(family) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([family, count]) => ({ family, count }))
    .sort((a, b) => b.count - a.count);
}

function aggregateDelays(rows: ObsRow[]): DelayStats {
  let delayed = 0;
  let cancelled = 0;
  let totalDelayMin = 0;
  let delayedWithMinutes = 0;

  for (const r of rows) {
    if (r.is_delayed) {
      delayed++;
      if (r.delay_minutes != null) {
        totalDelayMin += r.delay_minutes;
        delayedWithMinutes++;
      }
    }
    if (/cancel/i.test(r.status)) cancelled++;
  }

  return {
    total: rows.length,
    delayed,
    delayed_pct: rows.length > 0 ? Math.round((delayed / rows.length) * 100) : 0,
    avg_delay_min: delayedWithMinutes > 0 ? Math.round(totalDelayMin / delayedWithMinutes) : 0,
    cancelled,
  };
}

/* ------------------------------------------------------------------ */
/*  Baseline queries                                                   */
/* ------------------------------------------------------------------ */

async function fetchBaseline(entityType: string, entityKey: string): Promise<BaselineRow[] | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("flight_baselines")
    .select("hour_of_day,avg_arrivals,avg_departures,avg_total")
    .eq("entity_type", entityType)
    .eq("entity_key", entityKey)
    .order("hour_of_day", { ascending: true });

  if (error || !data || data.length === 0) return null;
  return data as BaselineRow[];
}

function computeRecovery(
  hourlyBins: HourlyBin[],
  baselineRows: BaselineRow[] | null,
): RecoveryInfo | null {
  if (!baselineRows || baselineRows.length === 0) return null;

  const baselineMap = new Map(baselineRows.map((b) => [b.hour_of_day, b.avg_total]));

  // Use the latest (most recent) bin for recovery %
  const currentBin = hourlyBins[hourlyBins.length - 1];
  const prevBin = hourlyBins.length >= 2 ? hourlyBins[hourlyBins.length - 2] : null;
  if (!currentBin) return null;

  const baselineVal = baselineMap.get(currentBin.hour) ?? 0;
  if (baselineVal <= 0) return null;

  const percent = Math.round((currentBin.total / baselineVal) * 100);

  // Trend: compare current vs previous hour
  let trend: "up" | "flat" | "down" = "flat";
  if (prevBin) {
    const change = currentBin.total - prevBin.total;
    const changePct = prevBin.total > 0 ? Math.abs(change / prevBin.total) : 0;
    if (change > 0 && changePct >= 0.1 && percent > 50) trend = "up";
    else if (change < 0 && changePct >= 0.1) trend = "down";
  }

  return { percent, trend };
}

function baselineToBins(baselineRows: BaselineRow[] | null): BaselineBin[] | null {
  if (!baselineRows || baselineRows.length === 0) return null;
  return baselineRows.map((b) => ({
    hour: b.hour_of_day,
    avg_total: Number(b.avg_total),
  }));
}

/* ------------------------------------------------------------------ */
/*  Airport detail query                                               */
/* ------------------------------------------------------------------ */

export async function queryAirportDetail(
  airport: string,
  windowMinutes = 720,
): Promise<AirportDetailResult> {
  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const recentCutoff = new Date(Date.now() - 60 * 60_000).toISOString(); // 1h for top routes

  const { data, error } = await supabase
    .from("flight_observations")
    .select("flight_number,flight_id,airline,origin_iata,destination_iata,status,is_delayed,delay_minutes,raw_payload,fetched_at")
    .or(`origin_iata.eq.${airport},destination_iata.eq.${airport}`)
    .gte("fetched_at", cutoff)
    .order("fetched_at", { ascending: false })
    .limit(8000);

  if (error) throw new Error(`airport detail query failed: ${error.message}`);

  const rows = deduplicate((data ?? []) as ObsRow[]);
  const windowHours = Math.ceil(windowMinutes / 60);

  const hourlyBins = buildHourlyBins(
    rows,
    windowHours,
    (r) => r.destination_iata === airport,
    (r) => r.origin_iata === airport,
  );

  // Top routes (last 1h only)
  const recentRows = rows.filter((r) => r.fetched_at >= recentCutoff);
  const routeCounts = new Map<string, number>();
  for (const r of recentRows) {
    const other = r.origin_iata === airport ? r.destination_iata : r.origin_iata;
    if (!other) continue;
    const route = `${airport} -> ${other}`;
    routeCounts.set(route, (routeCounts.get(route) ?? 0) + 1);
  }
  const topRoutes = Array.from(routeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([route, count]) => ({ route, count }));

  const baselineRows = await fetchBaseline("airport", airport);
  const recovery = computeRecovery(hourlyBins, baselineRows);

  return {
    ok: true,
    airport: { iata: airport, label: hubLabel(airport) },
    hourly_bins: hourlyBins,
    baseline_bins: baselineToBins(baselineRows),
    recovery,
    top_routes: topRoutes,
    airlines: aggregateAirlines(rows),
    equipment: aggregateEquipment(rows),
    delays: aggregateDelays(rows),
    as_of: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/*  Route detail query                                                 */
/* ------------------------------------------------------------------ */

export async function queryRouteDetail(
  from: string,
  to: string,
  windowMinutes = 720,
): Promise<RouteDetailResult> {
  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const nowCutoff = new Date(Date.now() - 30 * 60_000).toISOString(); // 30m for active flights

  // Query both directions
  const { data, error } = await supabase
    .from("flight_observations")
    .select("flight_number,flight_id,airline,origin_iata,destination_iata,status,is_delayed,delay_minutes,raw_payload,fetched_at")
    .or(
      `and(origin_iata.eq.${from},destination_iata.eq.${to}),and(origin_iata.eq.${to},destination_iata.eq.${from})`,
    )
    .gte("fetched_at", cutoff)
    .order("fetched_at", { ascending: false })
    .limit(5000);

  if (error) throw new Error(`route detail query failed: ${error.message}`);

  const rows = deduplicate((data ?? []) as ObsRow[]);
  const windowHours = Math.ceil(windowMinutes / 60);

  // For route: arrivals = heading to `to`, departures = heading to `from`
  const hourlyBins = buildHourlyBins(
    rows,
    windowHours,
    (r) => r.destination_iata === to,
    (r) => r.destination_iata === from,
  );

  // Active flights (last 30m, latest per flight identity)
  const recentRows = rows.filter((r) => r.fetched_at >= nowCutoff);
  const seenFlights = new Set<string>();
  const activeFlights: ActiveFlight[] = [];
  for (const r of recentRows) {
    const flightKey = r.flight_id ?? r.flight_number;
    if (seenFlights.has(flightKey)) continue;
    seenFlights.add(flightKey);
    activeFlights.push({
      flight_number: r.flight_number,
      airline: r.airline,
      status: r.status,
      aircraft_type: (r.raw_payload?.type as string) ?? null,
      is_delayed: r.is_delayed,
      delay_minutes: r.delay_minutes,
      fetched_at: r.fetched_at,
    });
  }

  const baselineKey = routeBaselineKey(from, to);
  const baselineRows = await fetchBaseline("route", baselineKey);
  const recovery = computeRecovery(hourlyBins, baselineRows);

  return {
    ok: true,
    route: { from, to, label: `${from} ↔ ${to}` },
    hourly_bins: hourlyBins,
    baseline_bins: baselineToBins(baselineRows),
    recovery,
    active_flights: activeFlights,
    airlines: aggregateAirlines(rows),
    equipment: aggregateEquipment(rows),
    delays: aggregateDelays(rows),
    as_of: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/*  Baseline capture logic                                             */
/* ------------------------------------------------------------------ */

export type BaselineCaptureResult = {
  ok: true;
  airports: string[];
  routes: string[];
  total_rows: number;
  captured_at: string;
};

export async function captureBaseline(): Promise<BaselineCaptureResult> {
  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  const { data, error } = await supabase
    .from("flight_observations")
    .select("flight_number,flight_id,airline,origin_iata,destination_iata,status,is_delayed,delay_minutes,raw_payload,fetched_at")
    .gte("fetched_at", cutoff)
    .order("fetched_at", { ascending: false })
    .limit(20000);

  if (error) throw new Error(`baseline query failed: ${error.message}`);
  const rows = deduplicate((data ?? []) as ObsRow[]);

  if (rows.length < 10) {
    throw new Error("Insufficient flight data to capture baseline. Need at least 6 hours of observations.");
  }

  // Determine how many distinct days are in the sample
  const daySet = new Set<string>();
  for (const r of rows) {
    const d = new Date(new Date(r.fetched_at).getTime() + UAE_OFFSET_MS);
    daySet.add(d.toISOString().slice(0, 10));
  }
  const sampleDays = Math.max(daySet.size, 1);
  const capturedAt = new Date().toISOString();

  // --- Airport baselines ---
  const airportHours = new Map<string, { arrivals: number; departures: number }>();
  const hubSet = new Set(HUBS.map((h) => h.iata));

  for (const r of rows) {
    const hour = toUAEHour(r.fetched_at);
    if (r.destination_iata && hubSet.has(r.destination_iata)) {
      const key = `${r.destination_iata}|${hour}`;
      const acc = airportHours.get(key) ?? { arrivals: 0, departures: 0 };
      acc.arrivals++;
      airportHours.set(key, acc);
    }
    if (r.origin_iata && hubSet.has(r.origin_iata)) {
      const key = `${r.origin_iata}|${hour}`;
      const acc = airportHours.get(key) ?? { arrivals: 0, departures: 0 };
      acc.departures++;
      airportHours.set(key, acc);
    }
  }

  // --- Route baselines ---
  const routeHours = new Map<string, { count: number }>();

  for (const r of rows) {
    if (!r.origin_iata || !r.destination_iata) continue;
    if (!hubSet.has(r.origin_iata) || !hubSet.has(r.destination_iata)) continue;
    const rKey = routeBaselineKey(r.origin_iata, r.destination_iata);
    const hour = toUAEHour(r.fetched_at);
    const key = `${rKey}|${hour}`;
    const acc = routeHours.get(key) ?? { count: 0 };
    acc.count++;
    routeHours.set(key, acc);
  }

  // Build upsert rows
  type BaselineInsert = {
    entity_type: string;
    entity_key: string;
    hour_of_day: number;
    avg_arrivals: number;
    avg_departures: number;
    avg_total: number;
    sample_days: number;
    captured_at: string;
  };

  const inserts: BaselineInsert[] = [];
  const airports = new Set<string>();
  const routes = new Set<string>();

  for (const [key, val] of airportHours) {
    const [iata, hourStr] = key.split("|");
    const hour = parseInt(hourStr, 10);
    airports.add(iata);
    inserts.push({
      entity_type: "airport",
      entity_key: iata,
      hour_of_day: hour,
      avg_arrivals: Math.round((val.arrivals / sampleDays) * 10) / 10,
      avg_departures: Math.round((val.departures / sampleDays) * 10) / 10,
      avg_total: Math.round(((val.arrivals + val.departures) / sampleDays) * 10) / 10,
      sample_days: sampleDays,
      captured_at: capturedAt,
    });
  }

  for (const [key, val] of routeHours) {
    const parts = key.split("|");
    const hour = parseInt(parts[parts.length - 1], 10);
    const routeKey = parts.slice(0, -1).join("|");
    routes.add(routeKey);
    inserts.push({
      entity_type: "route",
      entity_key: routeKey,
      hour_of_day: hour,
      avg_arrivals: 0,
      avg_departures: 0,
      avg_total: Math.round((val.count / sampleDays) * 10) / 10,
      sample_days: sampleDays,
      captured_at: capturedAt,
    });
  }

  // Clear existing baselines and insert new ones
  const { error: deleteError } = await supabase
    .from("flight_baselines")
    .delete()
    .gte("created_at", "1970-01-01");

  if (deleteError) throw new Error(`baseline delete failed: ${deleteError.message}`);

  if (inserts.length > 0) {
    const { error: insertError } = await supabase
      .from("flight_baselines")
      .insert(inserts);

    if (insertError) throw new Error(`baseline insert failed: ${insertError.message}`);
  }

  return {
    ok: true,
    airports: Array.from(airports),
    routes: Array.from(routes),
    total_rows: inserts.length,
    captured_at: capturedAt,
  };
}
