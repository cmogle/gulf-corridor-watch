/**
 * Cumulative statistics tracking for crisis events (T-007)
 *
 * Tracks running totals (intercept counts, flight cancellations, etc.)
 * across multi-day crisis events and injects them into brief context.
 */

import { getSupabaseAdmin } from "./supabase";

export const CRISIS_STAT_KEYS = [
  "missiles_launched",
  "missiles_intercepted",
  "drones_launched",
  "drones_intercepted",
  "flights_cancelled",
  "flights_delayed",
  "airlines_suspended",
  "airspace_closure_hours",
  "casualty_reports",
] as const;

export type CrisisStatKey = (typeof CRISIS_STAT_KEYS)[number];

export type CrisisStat = {
  stat_key: CrisisStatKey;
  stat_value: number;
  unit: string;
  last_source: string | null;
  updated_at: string;
};

export type CrisisEvent = {
  id: string;
  name: string;
  category: "military" | "weather" | "political" | "infrastructure";
  started_at: string;
  ended_at: string | null;
  affected_airports: string[];
  affected_regions: string[];
  is_active: boolean;
};

export type CrisisEventWithStats = CrisisEvent & {
  stats: CrisisStat[];
};

/**
 * Upsert a crisis stat — creates or updates the running total.
 */
export async function updateCrisisStat(
  eventId: string,
  key: CrisisStatKey,
  value: number,
  source: string | null = null,
  unit = "count",
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("crisis_event_stats")
    .upsert(
      {
        event_id: eventId,
        stat_key: key,
        stat_value: value,
        unit,
        last_source: source,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "event_id,stat_key" },
    );
  if (error) throw new Error(`Failed to upsert crisis stat: ${error.message}`);
}

/**
 * Increment a crisis stat by a delta value.
 */
export async function incrementCrisisStat(
  eventId: string,
  key: CrisisStatKey,
  delta: number,
  source: string | null = null,
  unit = "count",
): Promise<void> {
  const current = await getCrisisStat(eventId, key);
  const newValue = (current?.stat_value ?? 0) + delta;
  await updateCrisisStat(eventId, key, newValue, source, unit);
}

/**
 * Get a single stat for a crisis event.
 */
export async function getCrisisStat(
  eventId: string,
  key: CrisisStatKey,
): Promise<CrisisStat | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("crisis_event_stats")
    .select("stat_key,stat_value,unit,last_source,updated_at")
    .eq("event_id", eventId)
    .eq("stat_key", key)
    .single();
  if (error || !data) return null;
  return data as CrisisStat;
}

/**
 * Get all stats for a specific crisis event.
 */
export async function getCrisisStats(eventId: string): Promise<CrisisStat[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("crisis_event_stats")
    .select("stat_key,stat_value,unit,last_source,updated_at")
    .eq("event_id", eventId)
    .order("stat_key");
  if (error) return [];
  return (data ?? []) as CrisisStat[];
}

/**
 * Get all active crisis events with their stats.
 */
export async function getActiveEventsWithStats(): Promise<CrisisEventWithStats[]> {
  const supabase = getSupabaseAdmin();
  const { data: events, error: eventsError } = await supabase
    .from("crisis_events")
    .select("*")
    .eq("is_active", true)
    .order("started_at", { ascending: false });
  if (eventsError || !events || events.length === 0) return [];

  const eventIds = events.map((e: CrisisEvent) => e.id);
  const { data: stats, error: statsError } = await supabase
    .from("crisis_event_stats")
    .select("event_id,stat_key,stat_value,unit,last_source,updated_at")
    .in("event_id", eventIds);
  if (statsError) return events.map((e: CrisisEvent) => ({ ...e, stats: [] }));

  const statsByEvent = new Map<string, CrisisStat[]>();
  for (const stat of (stats ?? []) as (CrisisStat & { event_id: string })[]) {
    if (!statsByEvent.has(stat.event_id)) statsByEvent.set(stat.event_id, []);
    statsByEvent.get(stat.event_id)!.push({
      stat_key: stat.stat_key,
      stat_value: stat.stat_value,
      unit: stat.unit,
      last_source: stat.last_source,
      updated_at: stat.updated_at,
    });
  }

  return events.map((e: CrisisEvent) => ({
    ...e,
    stats: statsByEvent.get(e.id) ?? [],
  }));
}

/**
 * Format active crisis stats for injection into brief context.
 */
export async function formatCrisisStatsForBrief(): Promise<string> {
  try {
    const events = await getActiveEventsWithStats();
    if (events.length === 0) return "";

    const lines: string[] = [];
    for (const event of events) {
      const duration = Math.round(
        (Date.now() - new Date(event.started_at).getTime()) / (1000 * 60 * 60),
      );
      lines.push(`ACTIVE CRISIS: ${event.name} (${event.category}, ${duration}h duration)`);
      if (event.affected_airports.length > 0) {
        lines.push(`  Affected airports: ${event.affected_airports.join(", ")}`);
      }
      if (event.stats.length > 0) {
        lines.push("  Running totals:");
        for (const stat of event.stats) {
          const label = stat.stat_key.replace(/_/g, " ");
          lines.push(`    ${label}: ${stat.stat_value} ${stat.unit}${stat.last_source ? ` (source: ${stat.last_source})` : ""}`);
        }
      }
    }

    return lines.join("\n");
  } catch {
    return "";
  }
}
