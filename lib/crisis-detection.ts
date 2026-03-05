/**
 * Crisis event auto-detection (T-025)
 *
 * Automatically detects crisis events when multiple sources transition
 * to advisory/disrupted status within a 6-hour window.
 *
 * Threshold: 3+ sources in advisory/disrupted → trigger detection
 */

import { getSupabaseAdmin } from "./supabase";
import { OFFICIAL_SOURCES } from "./sources";
import type { CrisisEvent } from "./crisis-stats";

const DETECTION_WINDOW_HOURS = 6;
const SOURCE_THRESHOLD = 3;

const CATEGORY_KEYWORDS: Record<CrisisEvent["category"], RegExp> = {
  military: /military|missile|intercept|drone|strike|attack|airspace closure|defence|defense|centcom|navy|air force/i,
  weather: /weather|storm|fog|sandstorm|cyclone|flood|visibility|wind/i,
  political: /sanction|embargo|diplomatic|protest|government|political|crisis/i,
  infrastructure: /airport|runway|terminal|system|power|delay|cancel|suspend|closed/i,
};

type SnapshotRow = {
  source_id: string;
  source_name: string;
  status_level: string;
  title: string;
  summary: string;
  fetched_at: string;
};

function inferCategory(snapshots: SnapshotRow[]): CrisisEvent["category"] {
  const text = snapshots.map((s) => `${s.title} ${s.summary}`).join(" ");
  const scores: Record<CrisisEvent["category"], number> = {
    military: 0,
    weather: 0,
    political: 0,
    infrastructure: 0,
  };

  for (const [cat, pattern] of Object.entries(CATEGORY_KEYWORDS) as [CrisisEvent["category"], RegExp][]) {
    const matches = text.match(new RegExp(pattern.source, "gi"));
    scores[cat] = matches?.length ?? 0;
  }

  // Also weight by source category
  const sourceById = new Map(OFFICIAL_SOURCES.map((s) => [s.id, s]));
  for (const snap of snapshots) {
    const source = sourceById.get(snap.source_id);
    if (!source) continue;
    if (source.category === "government") scores.military += 2;
    if (source.category === "airline") scores.infrastructure += 2;
    if (source.category === "transport") scores.infrastructure += 1;
  }

  const best = (Object.entries(scores) as [CrisisEvent["category"], number][])
    .sort((a, b) => b[1] - a[1])[0];
  return best[0];
}

function inferName(snapshots: SnapshotRow[], category: CrisisEvent["category"]): string {
  const regionSet = new Set<string>();
  const sourceById = new Map(OFFICIAL_SOURCES.map((s) => [s.id, s]));
  for (const snap of snapshots) {
    const source = sourceById.get(snap.source_id);
    if (source?.region) regionSet.add(source.region);
  }

  const regions = [...regionSet].slice(0, 3).join(", ") || "Gulf Region";
  const categoryLabel = {
    military: "Security Incident",
    weather: "Weather Disruption",
    political: "Political Crisis",
    infrastructure: "Infrastructure Disruption",
  }[category];

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `${categoryLabel} — ${regions} (${dateStr})`;
}

function inferAffectedAirports(snapshots: SnapshotRow[]): string[] {
  const airports = new Set<string>();
  const text = snapshots.map((s) => `${s.title} ${s.summary}`).join(" ");

  const airportCodes = ["DXB", "AUH", "DWC", "DOH", "BAH", "KWI", "MCT", "RUH", "JED"];
  for (const code of airportCodes) {
    if (text.includes(code)) airports.add(code);
  }

  // Default to DXB/AUH if none detected
  if (airports.size === 0) {
    airports.add("DXB");
    airports.add("AUH");
  }
  return [...airports];
}

function inferAffectedRegions(snapshots: SnapshotRow[]): string[] {
  const regions = new Set<string>();
  const sourceById = new Map(OFFICIAL_SOURCES.map((s) => [s.id, s]));
  for (const snap of snapshots) {
    const source = sourceById.get(snap.source_id);
    if (source?.region) regions.add(source.region);
  }
  return [...regions];
}

/**
 * Check for crisis conditions and auto-create an event if threshold met.
 * Returns the new crisis event ID if created, null otherwise.
 */
export async function detectCrisisEvent(): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - DETECTION_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  // Check if there's already an active crisis (avoid duplicates)
  const { data: activeEvents } = await supabase
    .from("crisis_events")
    .select("id,started_at")
    .eq("is_active", true)
    .gte("started_at", cutoff);

  if (activeEvents && activeEvents.length > 0) {
    // Active crisis already exists within the detection window
    return null;
  }

  // Get recent source snapshots that are advisory or disrupted
  const { data: snapshots, error } = await supabase
    .from("latest_source_snapshots")
    .select("source_id,source_name,status_level,title,summary,fetched_at")
    .in("status_level", ["advisory", "disrupted"])
    .gte("fetched_at", cutoff);

  if (error || !snapshots) return null;
  const escalated = snapshots as SnapshotRow[];

  if (escalated.length < SOURCE_THRESHOLD) {
    return null;
  }

  // Threshold met — create crisis event
  const category = inferCategory(escalated);
  const name = inferName(escalated, category);
  const affectedAirports = inferAffectedAirports(escalated);
  const affectedRegions = inferAffectedRegions(escalated);

  // Find earliest transition
  const earliestFetch = escalated
    .map((s) => new Date(s.fetched_at).getTime())
    .reduce((a, b) => Math.min(a, b), Date.now());

  const { data: newEvent, error: insertError } = await supabase
    .from("crisis_events")
    .insert({
      name,
      category,
      started_at: new Date(earliestFetch).toISOString(),
      affected_airports: affectedAirports,
      affected_regions: affectedRegions,
      is_active: true,
    })
    .select("id")
    .single();

  if (insertError || !newEvent) {
    console.error("Failed to create crisis event:", insertError);
    return null;
  }

  console.log(`[crisis-detection] Auto-created crisis event: ${name} (${newEvent.id})`);
  return newEvent.id;
}

/**
 * Mark a crisis event as a false positive.
 */
export async function dismissCrisisEvent(eventId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("crisis_events")
    .update({ is_active: false, ended_at: new Date().toISOString() })
    .eq("id", eventId);
  if (error) throw new Error(`Failed to dismiss crisis event: ${error.message}`);
}

/**
 * End an active crisis event.
 */
export async function endCrisisEvent(eventId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("crisis_events")
    .update({ is_active: false, ended_at: new Date().toISOString() })
    .eq("id", eventId);
  if (error) throw new Error(`Failed to end crisis event: ${error.message}`);
}
