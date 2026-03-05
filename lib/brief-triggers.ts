/**
 * Event-driven regeneration triggers for intelligence brief (T-010)
 *
 * Detects meaningful source changes and triggers brief regeneration:
 * - Source status transitions (normal → advisory/disrupted)
 * - Flight anomalies (>10% change in delayed/cancelled ratio)
 * - Expert signals with high relevance
 * - Staleness backstop (>30 min since last generation)
 *
 * Rate-limited to 20 regenerations/hour.
 */

import { getSupabaseAdmin } from "./supabase";

export type TriggerReason =
  | "source_status_change"
  | "flight_anomaly"
  | "expert_signal"
  | "staleness_backstop";

export type TriggerResult = {
  should_regenerate: boolean;
  reasons: TriggerReason[];
  details: string[];
  rate_limited: boolean;
};

const MAX_REGENERATIONS_PER_HOUR = 20;
const STALENESS_MINUTES = 30;
const FLIGHT_ANOMALY_THRESHOLD = 0.10; // 10% change

// In-memory rate limiter (resets on cold start, fine for serverless)
const regenerationTimestamps: number[] = [];

function isRateLimited(): boolean {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  // Prune old entries
  while (regenerationTimestamps.length > 0 && regenerationTimestamps[0] < oneHourAgo) {
    regenerationTimestamps.shift();
  }
  return regenerationTimestamps.length >= MAX_REGENERATIONS_PER_HOUR;
}

function recordRegeneration(): void {
  regenerationTimestamps.push(Date.now());
}

/**
 * Check if the brief is stale (>30 min since last generation).
 */
async function checkStaleness(): Promise<{ triggered: boolean; detail: string }> {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("current_state_brief")
      .select("refreshed_at")
      .eq("key", "global")
      .single();

    if (!data?.refreshed_at) {
      return { triggered: true, detail: "No existing brief found" };
    }

    const ageMinutes = (Date.now() - new Date(data.refreshed_at).getTime()) / 60_000;
    if (ageMinutes > STALENESS_MINUTES) {
      return { triggered: true, detail: `Brief is ${Math.round(ageMinutes)} min old (threshold: ${STALENESS_MINUTES} min)` };
    }

    return { triggered: false, detail: "" };
  } catch {
    return { triggered: false, detail: "" };
  }
}

/**
 * Detect source status transitions by comparing current vs. previous snapshots.
 */
export async function detectSourceStatusChange(
  currentSnapshots: Array<{ source_id: string; status_level: string }>,
): Promise<{ triggered: boolean; details: string[] }> {
  try {
    const supabase = getSupabaseAdmin();

    // Load previous brief's sources_used to compare
    const { data: briefRow } = await supabase
      .from("current_state_brief")
      .select("sources_used")
      .eq("key", "global")
      .single();

    if (!briefRow?.sources_used) return { triggered: false, details: [] };

    const previousSources = briefRow.sources_used as Array<{ source_id: string; status_level: string }>;
    const previousBySource = new Map(previousSources.map((s) => [s.source_id, s.status_level]));

    const transitions: string[] = [];
    for (const current of currentSnapshots) {
      const prev = previousBySource.get(current.source_id);
      if (!prev) continue;
      if (prev !== current.status_level) {
        // Only trigger on escalation (normal→advisory, normal→disrupted, advisory→disrupted)
        const escalated =
          (prev === "normal" && current.status_level !== "normal") ||
          (prev === "advisory" && current.status_level === "disrupted");
        if (escalated) {
          transitions.push(`${current.source_id}: ${prev} → ${current.status_level}`);
        }
      }
    }

    return {
      triggered: transitions.length > 0,
      details: transitions,
    };
  } catch {
    return { triggered: false, details: [] };
  }
}

/**
 * Detect flight anomalies — >10% change in delayed/cancelled ratio.
 */
export async function detectFlightAnomaly(
  currentFlights: { total: number; delayed: number; cancelled: number },
): Promise<{ triggered: boolean; detail: string }> {
  try {
    if (currentFlights.total === 0) return { triggered: false, detail: "" };

    const supabase = getSupabaseAdmin();
    const { data: briefRow } = await supabase
      .from("current_state_brief")
      .select("flight_summary")
      .eq("key", "global")
      .single();

    if (!briefRow?.flight_summary) return { triggered: false, detail: "" };

    const prev = briefRow.flight_summary as { total?: number; delayed?: number; cancelled?: number };
    if (!prev.total || prev.total === 0) return { triggered: false, detail: "" };

    const prevDisruptionRate = ((prev.delayed ?? 0) + (prev.cancelled ?? 0)) / prev.total;
    const currentDisruptionRate = (currentFlights.delayed + currentFlights.cancelled) / currentFlights.total;
    const delta = Math.abs(currentDisruptionRate - prevDisruptionRate);

    if (delta > FLIGHT_ANOMALY_THRESHOLD) {
      return {
        triggered: true,
        detail: `Flight disruption rate changed ${(delta * 100).toFixed(1)}% (${(prevDisruptionRate * 100).toFixed(1)}% → ${(currentDisruptionRate * 100).toFixed(1)}%)`,
      };
    }

    return { triggered: false, detail: "" };
  } catch {
    return { triggered: false, detail: "" };
  }
}

/**
 * Detect high-relevance expert signals added since last brief.
 */
export async function detectExpertSignal(): Promise<{ triggered: boolean; detail: string }> {
  try {
    const supabase = getSupabaseAdmin();

    // Get last brief timestamp
    const { data: briefRow } = await supabase
      .from("current_state_brief")
      .select("refreshed_at")
      .eq("key", "global")
      .single();

    if (!briefRow?.refreshed_at) return { triggered: false, detail: "" };

    // Check for expert digests since last brief
    const { data: digests, error } = await supabase
      .from("expert_digests")
      .select("id,relevance_score")
      .gte("fetched_at", briefRow.refreshed_at)
      .gt("relevance_score", 0.7)
      .limit(5);

    if (error || !digests || digests.length === 0) return { triggered: false, detail: "" };

    return {
      triggered: true,
      detail: `${digests.length} high-relevance expert signal(s) since last brief`,
    };
  } catch {
    return { triggered: false, detail: "" };
  }
}

/**
 * Evaluate all triggers and determine if brief should regenerate.
 */
export async function evaluateBriefTriggers(
  currentSnapshots: Array<{ source_id: string; status_level: string }>,
  currentFlights: { total: number; delayed: number; cancelled: number },
): Promise<TriggerResult> {
  if (isRateLimited()) {
    return { should_regenerate: false, reasons: [], details: ["Rate limited"], rate_limited: true };
  }

  const [staleness, statusChange, flightAnomaly, expertSignal] = await Promise.all([
    checkStaleness(),
    detectSourceStatusChange(currentSnapshots),
    detectFlightAnomaly(currentFlights),
    detectExpertSignal(),
  ]);

  const reasons: TriggerReason[] = [];
  const details: string[] = [];

  if (statusChange.triggered) {
    reasons.push("source_status_change");
    details.push(...statusChange.details);
  }
  if (flightAnomaly.triggered) {
    reasons.push("flight_anomaly");
    details.push(flightAnomaly.detail);
  }
  if (expertSignal.triggered) {
    reasons.push("expert_signal");
    details.push(expertSignal.detail);
  }
  if (staleness.triggered) {
    reasons.push("staleness_backstop");
    details.push(staleness.detail);
  }

  const shouldRegenerate = reasons.length > 0;
  if (shouldRegenerate) {
    recordRegeneration();
  }

  return { should_regenerate: shouldRegenerate, reasons, details, rate_limited: false };
}
