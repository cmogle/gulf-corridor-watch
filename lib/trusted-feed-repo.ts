import { getSupabaseAdmin } from "./supabase";
import { OFFICIAL_SOURCES } from "./sources";
import { TRUSTED_FEED_CORE_SOURCE_IDS } from "./trusted-feed-core-sources";
import { isTrustedOperationallyRelevant } from "./trusted-feed-quality";
import type { TrustedFeedItem, TrustedQualityState, TrustedSourceHealthItem, TrustedStatusLevel } from "./trusted-feed-types";

const SOURCE_META = new Map(OFFICIAL_SOURCES.map((source) => [source.id, source]));
const CORE_SOURCE_SET = new Set<string>(TRUSTED_FEED_CORE_SOURCE_IDS);
const FEED_MAX_EVENT_AGE_HOURS = Number(process.env.TRUSTED_FEED_MAX_EVENT_AGE_HOURS ?? 48);
const TRUSTED_SOURCE_OVERRIDES = new Map([
  ["heathrow_airport_x", { name: "Heathrow Airport (Official X)", url: "https://x.com/HeathrowAirport" }],
  ["emirates_x", { name: "Emirates (Official X)", url: "https://x.com/emirates" }],
  ["etihad_x", { name: "Etihad Airways (Official X)", url: "https://x.com/etihad" }],
  ["flydubai_x", { name: "flydubai (Official X)", url: "https://x.com/flydubai" }],
]);

function sourceName(sourceId: string): string {
  return TRUSTED_SOURCE_OVERRIDES.get(sourceId)?.name ?? SOURCE_META.get(sourceId)?.name ?? sourceId;
}

function sourceUrl(sourceId: string): string {
  return TRUSTED_SOURCE_OVERRIDES.get(sourceId)?.url ?? SOURCE_META.get(sourceId)?.url ?? "";
}

function clampLimit(limit?: number): number {
  if (!Number.isFinite(limit) || !limit) return 40;
  return Math.max(1, Math.min(200, Math.round(limit)));
}

function parseCutoffIso(raw: string | undefined): string | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function dedupeKey(row: { source_id: string; headline: string; summary: string }): string {
  const normalize = (text: string, max = 240) =>
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  return `${row.source_id}|${normalize(row.headline, 120)}|${normalize(row.summary, 220)}`;
}

function isRecentEvent(eventIso: string, maxAgeHours = 24 * 7): boolean {
  const parsed = new Date(eventIso).getTime();
  if (!Number.isFinite(parsed)) return false;
  const ageHours = (Date.now() - parsed) / (60 * 60 * 1000);
  return ageHours <= maxAgeHours;
}

export async function insertTrustedFetchRun(input: {
  run_id: string;
  source_id: string;
  started_at: string;
  completed_at: string;
  http_status: number | null;
  fetch_status: "success" | "failed";
  error_code: string | null;
  error_detail: string | null;
  artifact_url: string | null;
  duration_ms: number;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("source_fetch_runs").insert(input);
  if (error) throw error;
}

export async function insertTrustedSourceDocument(input: {
  run_id: string;
  source_id: string;
  content_type: "html" | "rss" | "text";
  raw_text: string;
  normalized_text: string;
  fetched_at: string;
  source_url: string;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("source_documents").insert(input);
  if (error) throw error;
}

export async function insertTrustedSourceEvent(input: {
  source_id: string;
  run_id: string;
  event_time: string;
  headline: string;
  summary: string;
  original_url: string;
  evidence_excerpt: string;
  event_hash: string;
  quality_state: TrustedQualityState;
  quality_reason: string | null;
  parse_confidence: number;
  published_at: string | null;
  status_level: TrustedStatusLevel;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("source_events_v2").insert(input);
  if (error) throw error;
}

export async function hasRecentPublishedEvent(sourceId: string, eventHash: string, windowHours = 72): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - windowHours * 60 * 60_000).toISOString();
  const { data, error } = await supabase
    .from("source_events_v2")
    .select("event_id")
    .eq("source_id", sourceId)
    .eq("event_hash", eventHash)
    .eq("quality_state", "published")
    .gte("event_time", cutoff)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function upsertTrustedSourceHealth(input: {
  source_id: string;
  latest_run_at: string;
  latest_success_at: string | null;
  last_publish_at: string | null;
  health_state: "healthy" | "degraded" | "failing" | "unknown";
  health_reason: string | null;
  run_was_failure: boolean;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: existingError } = await supabase
    .from("source_health_v2")
    .select("consecutive_failures,last_publish_at,latest_success_at")
    .eq("source_id", input.source_id)
    .maybeSingle();
  if (existingError) throw existingError;

  const previousFailures = Number(existing?.consecutive_failures ?? 0) || 0;
  const nextFailures = input.run_was_failure ? previousFailures + 1 : 0;

  const payload = {
    source_id: input.source_id,
    latest_run_at: input.latest_run_at,
    latest_success_at: input.latest_success_at ?? existing?.latest_success_at ?? null,
    last_publish_at: input.last_publish_at ?? existing?.last_publish_at ?? null,
    consecutive_failures: nextFailures,
    health_state: input.health_state,
    health_reason: input.health_reason,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("source_health_v2").upsert(payload, { onConflict: "source_id" });
  if (error) throw error;
}

export async function loadTrustedFeed(limit?: number): Promise<TrustedFeedItem[]> {
  const pageSize = clampLimit(limit);
  const fetchSize = Math.max(pageSize, Math.min(500, pageSize * 5));
  const cutoffIso = parseCutoffIso(process.env.TRUSTED_FEED_CUTOFF_ISO);
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("source_events_v2")
    .select("event_id,source_id,run_id,event_time,headline,summary,original_url,evidence_excerpt,quality_state,quality_reason,published_at,status_level")
    .eq("quality_state", "published")
    .in("source_id", [...TRUSTED_FEED_CORE_SOURCE_IDS])
    .order("event_time", { ascending: false })
    .limit(fetchSize);
  if (cutoffIso) {
    query = query.gte("event_time", cutoffIso);
  }
  const { data, error } = await query;
  if (error) throw error;

  const mapped = ((data ?? []) as Array<{
    event_id: string;
    source_id: string;
    run_id: string;
    event_time: string;
    headline: string;
    summary: string;
    original_url: string;
    evidence_excerpt: string;
    quality_state: TrustedQualityState;
    quality_reason: string | null;
    published_at: string;
    status_level: TrustedStatusLevel;
  }>).map((row) => ({
    id: row.event_id,
    source_id: row.source_id,
    source_name: sourceName(row.source_id),
    update_type: "published_event" as const,
    event_at: row.event_time,
    fetched_at: row.published_at,
    headline: row.headline,
    summary: row.summary,
    original_url: row.original_url,
    run_id: row.run_id,
    evidence_excerpt: row.evidence_excerpt,
    quality_state: row.quality_state,
    quality_reason: row.quality_reason,
    published_at: row.published_at,
    status_level: row.status_level,
  }))
    .filter((row) =>
      isRecentEvent(row.event_at, Number.isFinite(FEED_MAX_EVENT_AGE_HOURS) ? FEED_MAX_EVENT_AGE_HOURS : 48),
    )
    .filter((row) => isTrustedOperationallyRelevant(row.headline, row.summary));

  const deduped: TrustedFeedItem[] = [];
  const seen = new Set<string>();
  for (const row of mapped) {
    const key = dedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
    if (deduped.length >= pageSize) break;
  }

  return deduped;
}

export async function loadTrustedSourceHistory(
  sourceId: string,
  opts?: { limit?: number; before?: string | null; include_failures?: boolean },
): Promise<{ items: TrustedFeedItem[]; next_before: string | null; source_health: TrustedSourceHealthItem | null }> {
  const pageSize = clampLimit(opts?.limit);
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("source_events_v2")
    .select("event_id,source_id,run_id,event_time,headline,summary,original_url,evidence_excerpt,quality_state,quality_reason,published_at,status_level")
    .eq("source_id", sourceId)
    .order("event_time", { ascending: false })
    .limit(pageSize + 10);

  if (!opts?.include_failures) {
    query = query.eq("quality_state", "published");
  }
  if (opts?.before) {
    query = query.lt("event_time", opts.before);
  }

  const { data, error } = await query;
  if (error) throw error;

  const mapped = ((data ?? []) as Array<{
    event_id: string;
    source_id: string;
    run_id: string;
    event_time: string;
    headline: string;
    summary: string;
    original_url: string;
    evidence_excerpt: string;
    quality_state: TrustedQualityState;
    quality_reason: string | null;
    published_at: string | null;
    status_level: TrustedStatusLevel;
  }>).map((row) => ({
    id: row.event_id,
    source_id: row.source_id,
    source_name: sourceName(row.source_id),
    update_type: "published_event" as const,
    event_at: row.event_time,
    fetched_at: row.published_at ?? row.event_time,
    headline: row.headline,
    summary: row.summary,
    original_url: row.original_url,
    run_id: row.run_id,
    evidence_excerpt: row.evidence_excerpt,
    quality_state: row.quality_state,
    quality_reason: row.quality_reason,
    published_at: row.published_at ?? row.event_time,
    status_level: row.status_level,
  }));

  const items = mapped.slice(0, pageSize);
  const next_before = mapped.length > pageSize ? items[items.length - 1]?.event_at ?? null : null;
  const source_health = await loadTrustedSourceHealthById(sourceId);

  return { items, next_before, source_health };
}

export async function loadTrustedSourceHealthById(sourceId: string): Promise<TrustedSourceHealthItem | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("source_health_v2")
    .select("source_id,latest_run_at,latest_success_at,last_publish_at,consecutive_failures,health_state,health_reason,updated_at")
    .eq("source_id", sourceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const exists = SOURCE_META.has(sourceId) || TRUSTED_SOURCE_OVERRIDES.has(sourceId) || CORE_SOURCE_SET.has(sourceId);
    if (!exists) return null;
    return {
      source_id: sourceId,
      source_name: sourceName(sourceId),
      source_url: sourceUrl(sourceId),
      latest_run_at: null,
      latest_success_at: null,
      last_publish_at: null,
      consecutive_failures: 0,
      health_state: "unknown",
      health_reason: "No runs recorded yet",
      updated_at: new Date(0).toISOString(),
    };
  }

  return {
    source_id: data.source_id,
    source_name: sourceName(data.source_id),
    source_url: sourceUrl(data.source_id),
    latest_run_at: data.latest_run_at,
    latest_success_at: data.latest_success_at,
    last_publish_at: data.last_publish_at,
    consecutive_failures: Number(data.consecutive_failures ?? 0) || 0,
    health_state: data.health_state,
    health_reason: data.health_reason,
    updated_at: data.updated_at,
  };
}

export async function loadTrustedSourceHealth(): Promise<TrustedSourceHealthItem[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("source_health_v2")
    .select("source_id,latest_run_at,latest_success_at,last_publish_at,consecutive_failures,health_state,health_reason,updated_at")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  const mapped = ((data ?? []) as Array<{
    source_id: string;
    latest_run_at: string | null;
    latest_success_at: string | null;
    last_publish_at: string | null;
    consecutive_failures: number | null;
    health_state: "healthy" | "degraded" | "failing" | "unknown";
    health_reason: string | null;
    updated_at: string;
  }>).map((row) => ({
    source_id: row.source_id,
    source_name: sourceName(row.source_id),
    source_url: sourceUrl(row.source_id),
    latest_run_at: row.latest_run_at,
    latest_success_at: row.latest_success_at,
    last_publish_at: row.last_publish_at,
    consecutive_failures: Number(row.consecutive_failures ?? 0) || 0,
    health_state: row.health_state,
    health_reason: row.health_reason,
    updated_at: row.updated_at,
  }));

  const byId = new Map(mapped.filter((row) => CORE_SOURCE_SET.has(row.source_id)).map((row) => [row.source_id, row]));
  for (const sourceId of TRUSTED_FEED_CORE_SOURCE_IDS) {
    if (byId.has(sourceId)) continue;
    byId.set(sourceId, {
      source_id: sourceId,
      source_name: sourceName(sourceId),
      source_url: sourceUrl(sourceId),
      latest_run_at: null,
      latest_success_at: null,
      last_publish_at: null,
      consecutive_failures: 0,
      health_state: "unknown",
      health_reason: "No runs recorded yet",
      updated_at: new Date(0).toISOString(),
    });
  }

  return [...byId.values()].sort((a, b) => a.source_name.localeCompare(b.source_name));
}

export async function recordFeedBaselineMetric(input: {
  backend: "v1" | "v2";
  sources_total: number;
  sources_healthy: number;
  sources_degraded: number;
  feed_item_count: number;
  published_count: number;
  notes?: Record<string, unknown>;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("feed_baseline_metrics").insert({
    backend: input.backend,
    sources_total: input.sources_total,
    sources_healthy: input.sources_healthy,
    sources_degraded: input.sources_degraded,
    feed_item_count: input.feed_item_count,
    published_count: input.published_count,
    notes: input.notes ?? {},
  });
  if (error) throw error;
}
