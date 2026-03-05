/**
 * Crisis timeline and trend analysis (T-026)
 *
 * Builds a chronological timeline of key developments during active crises
 * and derives trend trajectories (getting-better / getting-worse / stable).
 */

import { getSupabaseAdmin } from "./supabase";
import type { CrisisEvent } from "./crisis-stats";

export type TimelineEntry = {
  timestamp: string;
  source_id: string;
  source_name: string;
  status_level: "normal" | "advisory" | "disrupted" | "unknown";
  headline: string;
  detail: string;
  severity: "low" | "medium" | "high";
};

export type FlightWindow = {
  window_start: string;
  total: number;
  delayed: number;
  cancelled: number;
  disruption_rate: number;
};

export type TrendResult = {
  trajectory: "getting_better" | "getting_worse" | "stable";
  confidence: "low" | "medium" | "high";
  flight_trend: FlightWindow[];
  escalation_count: number;
  deescalation_count: number;
  summary: string;
};

export type CrisisTimeline = {
  event: CrisisEvent;
  entries: TimelineEntry[];
  trend: TrendResult;
};

function deriveSeverity(statusLevel: string, text: string): TimelineEntry["severity"] {
  if (statusLevel === "disrupted") return "high";
  if (statusLevel === "advisory") {
    if (/closure|suspend|cancel|intercept|strike|attack|missile/i.test(text)) return "high";
    return "medium";
  }
  return "low";
}

function normalizeHeadline(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 200);
}

function deduplicateEntries(entries: TimelineEntry[]): TimelineEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.source_id}:${entry.headline.toLowerCase().slice(0, 80)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Build a chronological timeline of key developments during a crisis.
 */
export async function buildCrisisTimeline(event: CrisisEvent): Promise<TimelineEntry[]> {
  const supabase = getSupabaseAdmin();
  const endTime = event.ended_at ?? new Date().toISOString();

  // Get all source snapshots during the crisis window
  const { data: snapshots, error } = await supabase
    .from("source_snapshots")
    .select("source_id,source_name,status_level,title,summary,fetched_at")
    .in("status_level", ["advisory", "disrupted"])
    .gte("fetched_at", event.started_at)
    .lte("fetched_at", endTime)
    .order("fetched_at", { ascending: true })
    .limit(200);

  if (error || !snapshots) return [];

  const entries: TimelineEntry[] = (snapshots as Array<Record<string, unknown>>).map((snap) => {
    const title = String(snap.title ?? "");
    const summary = String(snap.summary ?? "");
    const statusLevel = String(snap.status_level ?? "unknown") as TimelineEntry["status_level"];
    const headline = normalizeHeadline(title || summary.split("|")[0] || "Status update");
    const detail = normalizeHeadline(summary.slice(0, 300));

    return {
      timestamp: String(snap.fetched_at),
      source_id: String(snap.source_id),
      source_name: String(snap.source_name),
      status_level: statusLevel,
      headline,
      detail,
      severity: deriveSeverity(statusLevel, `${title} ${summary}`),
    };
  });

  return deduplicateEntries(entries);
}

/**
 * Analyze flight disruption trends over the crisis period.
 */
export async function analyzeFlightTrend(event: CrisisEvent, windowHours = 2): Promise<FlightWindow[]> {
  const supabase = getSupabaseAdmin();
  const endTime = event.ended_at ?? new Date().toISOString();
  const startMs = new Date(event.started_at).getTime();
  const endMs = new Date(endTime).getTime();

  // Get all flight observations during the crisis
  const { data: flights, error } = await supabase
    .from("flight_observations")
    .select("is_delayed,status,fetched_at")
    .gte("fetched_at", event.started_at)
    .lte("fetched_at", endTime)
    .order("fetched_at", { ascending: true })
    .limit(5000);

  if (error || !flights || flights.length === 0) return [];

  // Group into time windows
  const windowMs = windowHours * 60 * 60 * 1000;
  const windows: FlightWindow[] = [];

  for (let winStart = startMs; winStart < endMs; winStart += windowMs) {
    const winEnd = winStart + windowMs;
    const windowFlights = (flights as Array<Record<string, unknown>>).filter((f) => {
      const ts = new Date(String(f.fetched_at)).getTime();
      return ts >= winStart && ts < winEnd;
    });

    if (windowFlights.length === 0) continue;

    const total = windowFlights.length;
    const delayed = windowFlights.filter((f) => f.is_delayed === true).length;
    const cancelled = windowFlights.filter((f) => String(f.status) === "cancelled").length;
    const disruption_rate = total > 0 ? (delayed + cancelled) / total : 0;

    windows.push({
      window_start: new Date(winStart).toISOString(),
      total,
      delayed,
      cancelled,
      disruption_rate: Math.round(disruption_rate * 1000) / 1000,
    });
  }

  return windows;
}

/**
 * Derive the overall trend trajectory from flight windows and timeline entries.
 */
export function deriveTrend(entries: TimelineEntry[], flightWindows: FlightWindow[]): TrendResult {
  // Count escalations vs de-escalations from timeline
  let escalation_count = 0;
  let deescalation_count = 0;

  // Look at severity transitions
  const severityBySource = new Map<string, TimelineEntry["severity"][]>();
  for (const entry of entries) {
    if (!severityBySource.has(entry.source_id)) severityBySource.set(entry.source_id, []);
    severityBySource.get(entry.source_id)!.push(entry.severity);
  }

  for (const severities of severityBySource.values()) {
    for (let i = 1; i < severities.length; i++) {
      const prev = { low: 0, medium: 1, high: 2 }[severities[i - 1]];
      const curr = { low: 0, medium: 1, high: 2 }[severities[i]];
      if (curr > prev) escalation_count++;
      if (curr < prev) deescalation_count++;
    }
  }

  // Analyze flight disruption rate trend
  let flightTrend: "improving" | "worsening" | "flat" = "flat";
  if (flightWindows.length >= 3) {
    const recentHalf = flightWindows.slice(Math.floor(flightWindows.length / 2));
    const earlyHalf = flightWindows.slice(0, Math.floor(flightWindows.length / 2));
    const avgRecent = recentHalf.reduce((a, w) => a + w.disruption_rate, 0) / recentHalf.length;
    const avgEarly = earlyHalf.reduce((a, w) => a + w.disruption_rate, 0) / earlyHalf.length;

    if (avgRecent < avgEarly * 0.7) flightTrend = "improving";
    else if (avgRecent > avgEarly * 1.3) flightTrend = "worsening";
  }

  // Combine signals
  let trajectory: TrendResult["trajectory"] = "stable";
  if (flightTrend === "improving" && deescalation_count > escalation_count) {
    trajectory = "getting_better";
  } else if (flightTrend === "worsening" || escalation_count > deescalation_count + 2) {
    trajectory = "getting_worse";
  } else if (deescalation_count > escalation_count) {
    trajectory = "getting_better";
  }

  // Confidence based on data volume
  const confidence: TrendResult["confidence"] =
    flightWindows.length >= 6 && entries.length >= 10 ? "high"
    : flightWindows.length >= 3 || entries.length >= 5 ? "medium"
    : "low";

  // Summary sentence
  const summaryParts: string[] = [];
  if (trajectory === "getting_better") summaryParts.push("Situation appears to be improving");
  else if (trajectory === "getting_worse") summaryParts.push("Situation appears to be worsening");
  else summaryParts.push("Situation appears stable");

  if (flightWindows.length > 0) {
    const latest = flightWindows[flightWindows.length - 1];
    summaryParts.push(`Current disruption rate: ${Math.round(latest.disruption_rate * 100)}%`);
  }

  summaryParts.push(`${escalation_count} escalation(s), ${deescalation_count} de-escalation(s) observed`);

  return {
    trajectory,
    confidence,
    flight_trend: flightWindows,
    escalation_count,
    deescalation_count,
    summary: summaryParts.join(". ") + ".",
  };
}

/**
 * Build the full crisis timeline with trend analysis.
 */
export async function getCrisisTimeline(event: CrisisEvent): Promise<CrisisTimeline> {
  const [entries, flightWindows] = await Promise.all([
    buildCrisisTimeline(event),
    analyzeFlightTrend(event),
  ]);

  const trend = deriveTrend(entries, flightWindows);

  return { event, entries, trend };
}
