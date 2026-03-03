/**
 * Flight Network graph builder for the Pulse Atlas.
 *
 * Queries flight_observations, deduplicates across poll cycles,
 * and aggregates into a node/edge network structure showing
 * corridor-level traffic and viability.
 */

import { getSupabaseAdmin } from "@/lib/supabase";
import { classifyAircraftType, type AircraftFamily } from "@/lib/aircraft-family";

/* ------------------------------------------------------------------ */
/*  Hub definitions                                                    */
/* ------------------------------------------------------------------ */

export type HubRegion = "me" | "india";

export type HubDef = {
  iata: string;
  label: string;
  lat: number;
  lon: number;
  region: HubRegion;
};

export const HUBS: HubDef[] = [
  // Middle East
  { iata: "DXB", label: "Dubai", lat: 25.253, lon: 55.364, region: "me" },
  { iata: "AUH", label: "Abu Dhabi", lat: 24.433, lon: 54.651, region: "me" },
  { iata: "DOH", label: "Doha", lat: 25.273, lon: 51.608, region: "me" },
  { iata: "BAH", label: "Bahrain", lat: 26.271, lon: 50.634, region: "me" },
  { iata: "KWI", label: "Kuwait", lat: 29.226, lon: 47.969, region: "me" },
  { iata: "MCT", label: "Muscat", lat: 23.593, lon: 58.284, region: "me" },
  { iata: "RUH", label: "Riyadh", lat: 24.958, lon: 46.699, region: "me" },
  { iata: "JED", label: "Jeddah", lat: 21.680, lon: 39.157, region: "me" },
  // India
  { iata: "DEL", label: "Delhi", lat: 28.556, lon: 77.100, region: "india" },
  { iata: "BOM", label: "Mumbai", lat: 19.089, lon: 72.869, region: "india" },
  { iata: "BLR", label: "Bengaluru", lat: 13.199, lon: 77.706, region: "india" },
  { iata: "HYD", label: "Hyderabad", lat: 17.231, lon: 78.430, region: "india" },
  { iata: "MAA", label: "Chennai", lat: 12.990, lon: 80.169, region: "india" },
  { iata: "COK", label: "Kochi", lat: 10.152, lon: 76.402, region: "india" },
];

const HUB_SET = new Set(HUBS.map((h) => h.iata));

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type NetworkNode = {
  iata: string;
  label: string;
  lat: number;
  lon: number;
  region: HubRegion;
  now_in: number;
  now_out: number;
  trend_score: number;
};

export type EquipmentShare = { family: AircraftFamily; count: number };

export type NetworkEdge = {
  from: string;
  to: string;
  now_count: number;
  trend_counts_5m: number[];
  delayed_ratio: number;
  cancelled_ratio: number;
  equipment_mix: EquipmentShare[];
  confidence: "high" | "medium" | "low";
};

export type NetworkSummary = {
  active_flights_now: number;
  active_routes_now: number;
  route_stability_6h: number;
  latest_fetch: string | null;
};

export type FlightNetwork = {
  ok: true;
  as_of: string;
  summary: NetworkSummary;
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  equipment_mix: EquipmentShare[];
};

/* ------------------------------------------------------------------ */
/*  Internal row shape from Supabase                                   */
/* ------------------------------------------------------------------ */

type RawRow = {
  flight_number: string;
  flight_id: string | null;
  origin_iata: string | null;
  destination_iata: string | null;
  status: string;
  is_delayed: boolean;
  delay_minutes: number | null;
  raw_payload: Record<string, unknown> | null;
  fetched_at: string;
};

/* ------------------------------------------------------------------ */
/*  Deduplication                                                      */
/* ------------------------------------------------------------------ */

const BUCKET_MS = 5 * 60_000; // 5-minute buckets

function observationKey(row: RawRow): string {
  if (row.flight_id) return row.flight_id;
  return `${row.flight_number}|${row.origin_iata ?? ""}|${row.destination_iata ?? ""}`;
}

function bucketKey(row: RawRow): string {
  const bucket = Math.floor(new Date(row.fetched_at).getTime() / BUCKET_MS);
  return `${observationKey(row)}|${bucket}`;
}

function deduplicate(rows: RawRow[]): RawRow[] {
  const best = new Map<string, RawRow>();
  for (const row of rows) {
    const key = bucketKey(row);
    const existing = best.get(key);
    if (!existing || new Date(row.fetched_at).getTime() > new Date(existing.fetched_at).getTime()) {
      best.set(key, row);
    }
  }
  return Array.from(best.values());
}

/* ------------------------------------------------------------------ */
/*  Builder                                                            */
/* ------------------------------------------------------------------ */

export async function buildFlightNetwork(opts?: {
  window_now?: number;
  window_trend?: number;
}): Promise<FlightNetwork> {
  const windowNow = Math.min(opts?.window_now ?? 20, 60);
  const windowTrend = Math.min(opts?.window_trend ?? 360, 720);
  const now = Date.now();
  const trendCutoff = new Date(now - windowTrend * 60_000).toISOString();
  const nowCutoff = new Date(now - windowNow * 60_000).toISOString();

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("flight_observations")
    .select("flight_number,flight_id,origin_iata,destination_iata,status,is_delayed,delay_minutes,raw_payload,fetched_at")
    .gte("fetched_at", trendCutoff)
    .order("fetched_at", { ascending: false })
    .limit(15000);

  if (error) throw new Error(`flight_observations query failed: ${error.message}`);
  const raw = (data ?? []) as RawRow[];
  const deduped = deduplicate(raw);

  // Split into now vs trend windows
  const nowRows = deduped.filter((r) => r.fetched_at >= nowCutoff);
  const latestFetch = raw.length > 0 ? raw[0].fetched_at : null;

  // Only include rows with at least one hub-recognized airport
  const hubRows = deduped.filter(
    (r) => (r.origin_iata && HUB_SET.has(r.origin_iata)) || (r.destination_iata && HUB_SET.has(r.destination_iata)),
  );
  const hubNowRows = nowRows.filter(
    (r) => (r.origin_iata && HUB_SET.has(r.origin_iata)) || (r.destination_iata && HUB_SET.has(r.destination_iata)),
  );

  // --- Nodes ---
  const nodeMap = new Map<string, { now_in: number; now_out: number; trend_total: number }>();
  for (const hub of HUBS) nodeMap.set(hub.iata, { now_in: 0, now_out: 0, trend_total: 0 });

  for (const r of hubNowRows) {
    if (r.destination_iata && nodeMap.has(r.destination_iata)) nodeMap.get(r.destination_iata)!.now_in += 1;
    if (r.origin_iata && nodeMap.has(r.origin_iata)) nodeMap.get(r.origin_iata)!.now_out += 1;
  }
  for (const r of hubRows) {
    if (r.destination_iata && nodeMap.has(r.destination_iata)) nodeMap.get(r.destination_iata)!.trend_total += 1;
    if (r.origin_iata && nodeMap.has(r.origin_iata)) nodeMap.get(r.origin_iata)!.trend_total += 1;
  }

  const totalBuckets = Math.ceil(windowTrend / 5);
  const nodes: NetworkNode[] = HUBS.map((hub) => {
    const stats = nodeMap.get(hub.iata)!;
    // trend_score: % of 5-min buckets where this hub had any activity
    const buckets = new Set<number>();
    for (const r of hubRows) {
      if (r.origin_iata === hub.iata || r.destination_iata === hub.iata) {
        buckets.add(Math.floor(new Date(r.fetched_at).getTime() / BUCKET_MS));
      }
    }
    const trendScore = totalBuckets > 0 ? Math.round((buckets.size / totalBuckets) * 100) : 0;
    return { ...hub, ...stats, trend_score: trendScore };
  });

  // --- Edges ---
  type EdgeAcc = {
    nowCount: number;
    trendBuckets: Map<number, number>;
    delayedCount: number;
    cancelledCount: number;
    totalTrend: number;
    equipment: Map<AircraftFamily, number>;
  };

  const edgeKey = (from: string, to: string) => `${from}->${to}`;
  const edgeMap = new Map<string, EdgeAcc>();

  function getOrCreateEdge(from: string, to: string): EdgeAcc {
    const key = edgeKey(from, to);
    let acc = edgeMap.get(key);
    if (!acc) {
      acc = { nowCount: 0, trendBuckets: new Map(), delayedCount: 0, cancelledCount: 0, totalTrend: 0, equipment: new Map() };
      edgeMap.set(key, acc);
    }
    return acc;
  }

  for (const r of hubRows) {
    const from = r.origin_iata;
    const to = r.destination_iata;
    if (!from || !to || !HUB_SET.has(from) || !HUB_SET.has(to)) continue;

    const acc = getOrCreateEdge(from, to);
    acc.totalTrend += 1;
    if (r.is_delayed) acc.delayedCount += 1;
    if (/cancel/i.test(r.status)) acc.cancelledCount += 1;

    const bucket = Math.floor(new Date(r.fetched_at).getTime() / BUCKET_MS);
    acc.trendBuckets.set(bucket, (acc.trendBuckets.get(bucket) ?? 0) + 1);

    // Equipment classification
    const typeCode = (r.raw_payload as Record<string, unknown> | null)?.type as string | undefined;
    const family = classifyAircraftType(typeCode);
    acc.equipment.set(family, (acc.equipment.get(family) ?? 0) + 1);
  }

  // Count "now" flights per edge
  for (const r of hubNowRows) {
    const from = r.origin_iata;
    const to = r.destination_iata;
    if (!from || !to || !HUB_SET.has(from) || !HUB_SET.has(to)) continue;
    const acc = edgeMap.get(edgeKey(from, to));
    if (acc) acc.nowCount += 1;
  }

  // Build trend_counts_5m arrays (72 bins for 6h default)
  const trendStart = Math.floor((now - windowTrend * 60_000) / BUCKET_MS);

  const edges: NetworkEdge[] = [];
  for (const [key, acc] of edgeMap) {
    const [from, to] = key.split("->");
    const trendCounts: number[] = [];
    for (let i = 0; i < totalBuckets; i++) {
      trendCounts.push(acc.trendBuckets.get(trendStart + i) ?? 0);
    }

    const equipmentMix: EquipmentShare[] = Array.from(acc.equipment.entries())
      .map(([family, count]) => ({ family, count }))
      .sort((a, b) => b.count - a.count);

    const confidence: "high" | "medium" | "low" =
      acc.totalTrend >= 10 ? "high" : acc.totalTrend >= 4 ? "medium" : "low";

    edges.push({
      from,
      to,
      now_count: acc.nowCount,
      trend_counts_5m: trendCounts,
      delayed_ratio: acc.totalTrend > 0 ? acc.delayedCount / acc.totalTrend : 0,
      cancelled_ratio: acc.totalTrend > 0 ? acc.cancelledCount / acc.totalTrend : 0,
      equipment_mix: equipmentMix,
      confidence,
    });
  }

  edges.sort((a, b) => b.now_count - a.now_count);

  // --- Global equipment mix ---
  const globalEquipment = new Map<AircraftFamily, number>();
  for (const r of hubRows) {
    const typeCode = (r.raw_payload as Record<string, unknown> | null)?.type as string | undefined;
    const family = classifyAircraftType(typeCode);
    globalEquipment.set(family, (globalEquipment.get(family) ?? 0) + 1);
  }
  const equipmentMix: EquipmentShare[] = Array.from(globalEquipment.entries())
    .map(([family, count]) => ({ family, count }))
    .sort((a, b) => b.count - a.count);

  // --- Summary ---
  const activeRoutesNow = edges.filter((e) => e.now_count > 0).length;
  const activeBuckets = new Set<number>();
  for (const acc of edgeMap.values()) {
    for (const b of acc.trendBuckets.keys()) activeBuckets.add(b);
  }
  const stabilityScore = totalBuckets > 0 ? Math.round((activeBuckets.size / totalBuckets) * 100) : 0;

  return {
    ok: true,
    as_of: new Date().toISOString(),
    summary: {
      active_flights_now: hubNowRows.length,
      active_routes_now: activeRoutesNow,
      route_stability_6h: Math.min(stabilityScore, 100),
      latest_fetch: latestFetch,
    },
    nodes,
    edges,
    equipment_mix: equipmentMix,
  };
}
