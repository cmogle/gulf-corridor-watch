import { createHash } from "crypto";
import OpenAI from "openai";

const BRIEF_KEY = "global";
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 8000;
const EXPECTED_MISSING_SOURCES = ["india_consulate_dubai", "india_embassy_abu_dhabi", "broader_mena_ministries"];
export const NARRATIVE_POLICY_VERSION = "v2_text_first_no_source_counts";

export type BriefFreshnessState = "fresh" | "mixed" | "stale";
export type BriefConfidence = "high" | "medium" | "low";

export type BriefCoverage = {
  sources_included: string[];
  stale_sources: string[];
  missing_expected: string[];
};

export type CurrentStateBrief = {
  paragraph: string;
  generated_at: string;
  refreshed_at: string;
  freshness_state: BriefFreshnessState;
  confidence: BriefConfidence;
  flight: {
    total: number;
    delayed: number;
    cancelled: number;
    latest_fetch: string | null;
  };
  coverage: BriefCoverage;
  model: string | null;
};

type BriefSourceContext = {
  source_id: string;
  source_name: string;
  status_level: "normal" | "advisory" | "disrupted" | "unknown";
  reliability: "reliable" | "degraded" | "blocked";
  priority: number;
  fetched_at: string;
  published_at: string | null;
  freshness_target_minutes: number;
  title: string;
  summary: string;
  stale: boolean;
};

type BriefSocialContext = {
  source_id: string;
  handle: string;
  posted_at: string;
  text_display: string;
  keywords: string[];
  confidence: number;
};

export type BriefInputContext = {
  computed_at: string;
  freshness_state: BriefFreshnessState;
  confidence: BriefConfidence;
  flight: {
    total: number;
    delayed: number;
    cancelled: number;
    latest_fetch: string | null;
    stale: boolean;
  };
  coverage: BriefCoverage;
  sources: BriefSourceContext[];
  social_signals: BriefSocialContext[];
};

type SnapshotRow = {
  source_id: string;
  source_name: string;
  status_level: "normal" | "advisory" | "disrupted" | "unknown";
  reliability: "reliable" | "degraded" | "blocked";
  priority: number;
  fetched_at: string;
  published_at: string | null;
  freshness_target_minutes: number;
  title: string;
  summary: string;
};

type SocialSignalRow = {
  linked_source_id: string;
  handle: string;
  posted_at: string;
  text: string;
  text_original: string | null;
  text_en: string | null;
  keywords: string[];
  confidence: number;
};

type FlightRow = {
  status: string;
  is_delayed: boolean;
  fetched_at: string;
};

type PersistedBriefRow = {
  key: string;
  paragraph: string;
  input_hash: string;
  generated_at: string;
  refreshed_at: string;
  model: string | null;
  freshness_state: BriefFreshnessState;
  confidence: BriefConfidence;
  flight_summary: unknown;
  coverage: unknown;
  sources_used: unknown;
};

type NarrativeEvidenceRow = {
  source_id: string;
  source_name: string;
  status_level: BriefSourceContext["status_level"];
  fetched_at: string;
  clause: string;
};

type CorroboratedSocialRow = {
  source_id: string;
  source_name: string;
  handle: string;
  posted_at: string;
  text: string;
  keywords: string[];
  confidence: number;
};

type NarrativeBasis = {
  source_evidence_rows: NarrativeEvidenceRow[];
  corroborated_social_rows: CorroboratedSocialRow[];
  freshness_caveat_required: boolean;
};

async function getSupabaseAdminClient() {
  const mod = await import("./supabase");
  return mod.getSupabaseAdmin();
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

function toMillis(iso: string | null | undefined): number {
  if (!iso) return 0;
  const parsed = new Date(iso).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function ageMinutes(iso: string | null | undefined, nowMs: number): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const ms = toMillis(iso);
  if (ms <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, (nowMs - ms) / 60_000);
}

export function isSourceStale(sourceAgeMinutes: number, freshnessTargetMinutes: number): boolean {
  const threshold = Math.max(freshnessTargetMinutes * 2, 20);
  return sourceAgeMinutes > threshold;
}

function isFlightStale(latestFetch: string | null, nowMs: number): boolean {
  return ageMinutes(latestFetch, nowMs) > 10;
}

export function deriveBriefFreshnessState(input: { flight_stale: boolean; stale_sources: number; source_count: number }): BriefFreshnessState {
  if (input.flight_stale || input.source_count === 0) return "stale";
  if (input.stale_sources <= 2) return "fresh";
  if (input.stale_sources > input.source_count / 2) return "stale";
  return "mixed";
}

function deriveBriefConfidence(input: { freshness_state: BriefFreshnessState; source_count: number }): BriefConfidence {
  if (input.freshness_state === "stale") return "low";
  if (input.source_count < 3) return "low";
  if (input.freshness_state === "mixed") return "medium";
  return "high";
}

function compact(text: string, maxLen = 600): string {
  return text.replace(/\s+/g, " ").trim().slice(0, maxLen);
}

function formatDubaiTime(iso: string): string {
  const dt = new Date(iso);
  const stamp = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(dt);
  return `${stamp} GST`;
}

function trafficLevel(totalFlights: number): string {
  if (totalFlights <= 20) return "very light";
  if (totalFlights <= 80) return "light";
  if (totalFlights <= 180) return "moderate";
  return "elevated";
}

function stableArray<T>(rows: T[], keyFn: (row: T) => string): T[] {
  return [...rows].sort((a, b) => keyFn(a).localeCompare(keyFn(b)));
}

export function computeBriefInputHashForPolicy(input: BriefInputContext, narrativePolicyVersion: string): string {
  const normalized = {
    narrative_policy_version: narrativePolicyVersion,
    freshness_state: input.freshness_state,
    confidence: input.confidence,
    flight: {
      ...input.flight,
      latest_fetch: input.flight.latest_fetch ?? null,
    },
    coverage: {
      sources_included: [...input.coverage.sources_included].sort(),
      stale_sources: [...input.coverage.stale_sources].sort(),
      missing_expected: [...input.coverage.missing_expected].sort(),
    },
    sources: stableArray(input.sources, (row) => row.source_id).map((row) => ({
      source_id: row.source_id,
      status_level: row.status_level,
      reliability: row.reliability,
      priority: row.priority,
      fetched_at: row.fetched_at,
      published_at: row.published_at,
      freshness_target_minutes: row.freshness_target_minutes,
      stale: row.stale,
      title: compact(row.title, 300),
      summary: compact(row.summary, 500),
    })),
    social_signals: stableArray(input.social_signals, (row) => `${row.source_id}:${row.handle}`).map((row) => ({
      source_id: row.source_id,
      handle: row.handle,
      posted_at: row.posted_at,
      text_display: compact(row.text_display, 300),
      keywords: [...row.keywords].sort(),
      confidence: Math.round(row.confidence * 1000) / 1000,
    })),
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export function computeBriefInputHash(input: BriefInputContext): string {
  return computeBriefInputHashForPolicy(input, NARRATIVE_POLICY_VERSION);
}

export function extractBriefJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found in model output");
  return match[0];
}

function statusRank(level: BriefSourceContext["status_level"]): number {
  if (level === "disrupted") return 3;
  if (level === "advisory") return 2;
  if (level === "unknown") return 1;
  return 0;
}

function normalizeForDedup(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function stripBoilerplate(text: string): string {
  return text
    .replace(/\bopen official source for live details\.?/gi, "")
    .replace(/\bsource currently blocked or challenge-protected\.?/gi, "")
    .replace(/\bsource fetch failed during ingestion\.?/gi, "")
    .replace(/\bsource page content was unavailable or non-usable in this fetch\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLowValueEvidence(text: string): boolean {
  if (!text) return true;
  return /fetch error|challenge-protected|unavailable or non-usable|open official source/i.test(text);
}

function selectNarrativeEvidenceRows(context: BriefInputContext, maxRows = 3): NarrativeEvidenceRow[] {
  const seen = new Set<string>();
  const rows = [...context.sources].sort((a, b) => {
    const levelDiff = statusRank(b.status_level) - statusRank(a.status_level);
    if (levelDiff !== 0) return levelDiff;
    const priorityDiff = b.priority - a.priority;
    if (priorityDiff !== 0) return priorityDiff;
    return toMillis(b.fetched_at) - toMillis(a.fetched_at);
  });

  const out: NarrativeEvidenceRow[] = [];
  for (const row of rows) {
    const evidenceText = stripBoilerplate(compact(`${row.title}. ${row.summary}`, 240));
    if (isLowValueEvidence(evidenceText)) continue;
    const key = normalizeForDedup(evidenceText);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      source_id: row.source_id,
      source_name: row.source_name,
      status_level: row.status_level,
      fetched_at: row.fetched_at,
      clause: compact(evidenceText, 180),
    });
    if (out.length >= maxRows) break;
  }
  return out;
}

function selectCorroboratedSocialRows(context: BriefInputContext, maxRows = 2): CorroboratedSocialRow[] {
  const sourceById = new Map(context.sources.map((row) => [row.source_id, row]));
  return context.social_signals
    .filter((row) => row.keywords.length > 0)
    .map((row) => {
      const source = sourceById.get(row.source_id);
      if (!source) return null;
      if (!(source.status_level === "advisory" || source.status_level === "disrupted")) return null;
      return {
        source_id: row.source_id,
        source_name: source.source_name,
        handle: row.handle,
        posted_at: row.posted_at,
        text: compact(stripBoilerplate(row.text_display), 140),
        keywords: row.keywords,
        confidence: row.confidence,
      } satisfies CorroboratedSocialRow;
    })
    .filter((row): row is CorroboratedSocialRow => Boolean(row))
    .sort((a, b) => {
      const confidenceDiff = b.confidence - a.confidence;
      if (confidenceDiff !== 0) return confidenceDiff;
      return toMillis(b.posted_at) - toMillis(a.posted_at);
    })
    .slice(0, maxRows);
}

function buildNarrativeBasis(context: BriefInputContext): NarrativeBasis {
  return {
    source_evidence_rows: selectNarrativeEvidenceRows(context),
    corroborated_social_rows: selectCorroboratedSocialRows(context),
    freshness_caveat_required: context.coverage.stale_sources.length > 0 || context.flight.stale,
  };
}

function buildSourceNarrativeSentence(rows: NarrativeEvidenceRow[]): string {
  if (rows.length === 0) {
    return "Official source pages currently provide limited clear narrative detail.";
  }
  const clauses = rows.map((row) => `${row.source_name}: ${row.clause}`);
  return `Key official updates: ${clauses.join(" | ")}.`;
}

function buildSocialNarrativeSentence(rows: CorroboratedSocialRow[]): string {
  if (rows.length === 0) return "";
  const handles = Array.from(new Set(rows.map((row) => `@${row.handle}`)));
  const socialTheme = rows.map((row) => row.text).join(" | ");
  return `Recent official X posts from ${handles.join(", ")} corroborate the same advisory themes: ${socialTheme}.`;
}

function buildFreshnessCaveat(shouldInclude: boolean): string {
  if (!shouldInclude) return "";
  return "Some official pages have not updated recently; verify source links directly for the latest notice.";
}

export function isNarrativePolicyCompliant(paragraph: string, opts: { allowXMention: boolean }): boolean {
  const bannedPatterns = [
    /\bmonitored sources?\b/i,
    /\bmonitored feeds?\b/i,
    /\b\d+\s+of\s+\d+\s+sources?\b/i,
    /\bdisruption-related language\b/i,
    /\badvisory\/disrupted language\b/i,
    /\b\d+\s+(official|monitored)\s+(sources|feeds)\b/i,
  ];
  if (bannedPatterns.some((pattern) => pattern.test(paragraph))) return false;
  if (!opts.allowXMention && (/\bX posts?\b/i.test(paragraph) || /@\w+/.test(paragraph))) return false;
  return true;
}

export function buildFallbackBriefParagraph(context: BriefInputContext): string {
  const basis = buildNarrativeBasis(context);
  const flightPhrase =
    context.flight.total > 0
      ? `${context.flight.total} tracked flights in the last 45 minutes (${context.flight.delayed} delayed, ${context.flight.cancelled} cancelled)`
      : "limited current flight telemetry";
  const sourceNarrative = buildSourceNarrativeSentence(basis.source_evidence_rows);
  const socialNarrative = buildSocialNarrativeSentence(basis.corroborated_social_rows);
  const freshnessCaveat = buildFreshnessCaveat(basis.freshness_caveat_required);
  return compact(
    `As of ${formatDubaiTime(context.computed_at)}, regional air traffic around DXB/AUH appears ${trafficLevel(context.flight.total)}, with ${flightPhrase}. ${sourceNarrative} ${socialNarrative} ${freshnessCaveat}`,
    1200,
  );
}

function normalizeFlightSummary(value: unknown): CurrentStateBrief["flight"] {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    total: Number(raw.total ?? 0) || 0,
    delayed: Number(raw.delayed ?? 0) || 0,
    cancelled: Number(raw.cancelled ?? 0) || 0,
    latest_fetch: typeof raw.latest_fetch === "string" ? raw.latest_fetch : null,
  };
}

function normalizeCoverage(value: unknown): BriefCoverage {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const toTextArray = (input: unknown) =>
    Array.isArray(input) ? input.filter((item): item is string => typeof item === "string").sort() : [];
  return {
    sources_included: toTextArray(raw.sources_included),
    stale_sources: toTextArray(raw.stale_sources),
    missing_expected: toTextArray(raw.missing_expected),
  };
}

function rowToBrief(row: PersistedBriefRow): CurrentStateBrief {
  return {
    paragraph: row.paragraph,
    generated_at: row.generated_at,
    refreshed_at: row.refreshed_at,
    freshness_state: row.freshness_state,
    confidence: row.confidence,
    flight: normalizeFlightSummary(row.flight_summary),
    coverage: normalizeCoverage(row.coverage),
    model: row.model ?? null,
  };
}

export async function buildBriefInputContext(): Promise<BriefInputContext> {
  const supabase = await getSupabaseAdminClient();
  const cutoff = new Date(Date.now() - 45 * 60_000).toISOString();

  const [{ data: snapshots, error: snapshotsError }, { data: socialSignals, error: socialSignalsError }, { data: flights, error: flightsError }] =
    await Promise.all([
      supabase
        .from("latest_source_snapshots")
        .select("source_id,source_name,status_level,reliability,priority,fetched_at,published_at,freshness_target_minutes,title,summary")
        .limit(150),
      supabase
        .from("social_signals")
        .select("linked_source_id,handle,posted_at,text,text_original,text_en,keywords,confidence")
        .eq("provider", "x")
        .order("posted_at", { ascending: false })
        .limit(400),
      supabase.from("flight_observations").select("status,is_delayed,fetched_at").gte("fetched_at", cutoff).order("fetched_at", { ascending: false }).limit(2500),
    ]);

  if (snapshotsError) throw snapshotsError;
  if (socialSignalsError) throw socialSignalsError;
  if (flightsError) throw flightsError;

  const nowIso = new Date().toISOString();
  const nowMs = Date.now();

  const mappedSources = ((snapshots ?? []) as SnapshotRow[])
    .map((row) => {
      const stale = isSourceStale(ageMinutes(row.fetched_at, nowMs), row.freshness_target_minutes);
      return {
        source_id: row.source_id,
        source_name: row.source_name,
        status_level: row.status_level,
        reliability: row.reliability,
        priority: Number(row.priority ?? 0) || 0,
        fetched_at: row.fetched_at,
        published_at: row.published_at,
        freshness_target_minutes: row.freshness_target_minutes,
        title: row.title ?? "",
        summary: row.summary ?? "",
        stale,
      } satisfies BriefSourceContext;
    })
    .sort((a, b) => a.source_id.localeCompare(b.source_id));

  const latestSocialBySource = new Map<string, SocialSignalRow>();
  for (const row of (socialSignals ?? []) as SocialSignalRow[]) {
    if (!latestSocialBySource.has(row.linked_source_id)) latestSocialBySource.set(row.linked_source_id, row);
  }
  const mappedSignals = Array.from(latestSocialBySource.values())
    .map((row) => ({
      source_id: row.linked_source_id,
      handle: row.handle,
      posted_at: row.posted_at,
      text_display: row.text_en ?? row.text_original ?? row.text,
      keywords: row.keywords ?? [],
      confidence: Number(row.confidence ?? 0) || 0,
    }))
    .sort((a, b) => `${a.source_id}:${a.handle}`.localeCompare(`${b.source_id}:${b.handle}`));

  const flightRows = (flights ?? []) as FlightRow[];
  const latestFlightFetch = flightRows.length > 0 ? flightRows[0].fetched_at : null;
  const delayedCount = flightRows.filter((row) => row.is_delayed).length;
  const cancelledCount = flightRows.filter((row) => /cancel/i.test(row.status)).length;
  const flightStale = isFlightStale(latestFlightFetch, nowMs);

  const staleSources = mappedSources.filter((row) => row.stale).map((row) => row.source_id);
  const freshnessState = deriveBriefFreshnessState({
    flight_stale: flightStale,
    stale_sources: staleSources.length,
    source_count: mappedSources.length,
  });

  const confidence = deriveBriefConfidence({ freshness_state: freshnessState, source_count: mappedSources.length });

  return {
    computed_at: nowIso,
    freshness_state: freshnessState,
    confidence,
    flight: {
      total: flightRows.length,
      delayed: delayedCount,
      cancelled: cancelledCount,
      latest_fetch: latestFlightFetch,
      stale: flightStale,
    },
    coverage: {
      sources_included: mappedSources.map((row) => row.source_id).sort(),
      stale_sources: staleSources.sort(),
      missing_expected: [...EXPECTED_MISSING_SOURCES],
    },
    sources: mappedSources,
    social_signals: mappedSignals,
  };
}

async function generateBriefParagraphWithModel(
  context: BriefInputContext,
  fallbackParagraph: string,
  basis: NarrativeBasis,
): Promise<{ paragraph: string; model: string | null; fallback_reason: string | null }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { paragraph: fallbackParagraph, model: null, fallback_reason: "missing_openai_api_key" };

  const timeoutMs = parsePositiveInt(process.env.CURRENT_STATE_BRIEF_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const model = process.env.CURRENT_STATE_BRIEF_MODEL?.trim() || DEFAULT_MODEL;
  const client = new OpenAI({ apiKey });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const advisoryRows = context.sources
      .filter((row) => row.status_level === "advisory" || row.status_level === "disrupted")
      .slice(0, 6)
      .map((row) => ({
        source: row.source_name,
        status_level: row.status_level,
        fetched_at: row.fetched_at,
        summary: compact(`${row.title}. ${row.summary}`, 180),
      }));
    const completion = await client.chat.completions.create(
      {
        model,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content:
              "You synthesize transport and official advisory context. Output strict JSON only: {\"paragraph\": string}. Requirements: one concise English paragraph (70-110 words), include air-traffic state with operational flight counts, and summarize underlying official-source text snippets. Do not include source/feed quantification or source count language. Mention official X only when corroborated_social_rows are provided. No speculation, no policy advice, no bullet points. If freshness_caveat_required is true, include one short plain-language caveat.",
          },
          {
            role: "user",
            content: JSON.stringify(
              {
                narrative_policy_version: NARRATIVE_POLICY_VERSION,
                timestamp_gst: formatDubaiTime(context.computed_at),
                flight: context.flight,
                source_evidence_rows: basis.source_evidence_rows,
                corroborated_social_rows: basis.corroborated_social_rows,
                freshness_caveat_required: basis.freshness_caveat_required,
                advisory_rows: advisoryRows,
              },
              null,
              2,
            ),
          },
        ],
      },
      { signal: controller.signal },
    );

    const content = completion.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(extractBriefJsonObject(content)) as { paragraph?: unknown };
    const paragraph = typeof parsed.paragraph === "string" ? compact(parsed.paragraph, 1200) : "";
    if (!paragraph) return { paragraph: fallbackParagraph, model: null, fallback_reason: "empty_or_invalid_model_output" };
    if (!isNarrativePolicyCompliant(paragraph, { allowXMention: basis.corroborated_social_rows.length > 0 })) {
      return { paragraph: fallbackParagraph, model: null, fallback_reason: "policy_non_compliant_output" };
    }
    return { paragraph, model, fallback_reason: null };
  } catch {
    return { paragraph: fallbackParagraph, model: null, fallback_reason: "model_request_failed" };
  } finally {
    clearTimeout(timer);
  }
}

export async function loadCurrentStateBrief(opts?: { allowTransient?: boolean }): Promise<CurrentStateBrief | null> {
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await supabase.from("current_state_brief").select("*").eq("key", BRIEF_KEY).maybeSingle();
  if (error) throw error;
  if (data) return rowToBrief(data as PersistedBriefRow);

  if (!opts?.allowTransient) return null;
  const context = await buildBriefInputContext();
  return {
    paragraph: buildFallbackBriefParagraph(context),
    generated_at: context.computed_at,
    refreshed_at: context.computed_at,
    freshness_state: context.freshness_state,
    confidence: context.confidence,
    flight: {
      total: context.flight.total,
      delayed: context.flight.delayed,
      cancelled: context.flight.cancelled,
      latest_fetch: context.flight.latest_fetch,
    },
    coverage: context.coverage,
    model: null,
  };
}

export async function refreshCurrentStateBrief(opts?: { forceRegenerate?: boolean }): Promise<{
  item: CurrentStateBrief;
  regenerated: boolean;
  reason: string;
}> {
  const supabase = await getSupabaseAdminClient();
  const context = await buildBriefInputContext();
  const hash = computeBriefInputHash(context);
  const nowIso = new Date().toISOString();

  const { data: existing, error: existingError } = await supabase
    .from("current_state_brief")
    .select("*")
    .eq("key", BRIEF_KEY)
    .maybeSingle();
  if (existingError) throw existingError;
  const existingRow = (existing as PersistedBriefRow | null) ?? null;

  const unchanged = Boolean(existingRow && existingRow.input_hash === hash && !opts?.forceRegenerate);
  if (unchanged && existingRow) {
    const { data: updated, error: updateError } = await supabase
      .from("current_state_brief")
      .update({ refreshed_at: nowIso })
      .eq("key", BRIEF_KEY)
      .select("*")
      .single();
    if (updateError) throw updateError;
    return { item: rowToBrief(updated as PersistedBriefRow), regenerated: false, reason: "unchanged_input_hash" };
  }

  const basis = buildNarrativeBasis(context);
  const fallbackParagraph = buildFallbackBriefParagraph(context);
  const generation = await generateBriefParagraphWithModel(context, fallbackParagraph, basis);
  const generatedAt = nowIso;

  const sourcesUsed = {
    narrative_policy_version: NARRATIVE_POLICY_VERSION,
    narrative_basis: basis.source_evidence_rows,
    social_basis: basis.corroborated_social_rows,
    snapshots: context.sources.map((row) => ({
      source_id: row.source_id,
      source_name: row.source_name,
      status_level: row.status_level,
      reliability: row.reliability,
      fetched_at: row.fetched_at,
      stale: row.stale,
    })),
    social_signals: context.social_signals.map((row) => ({
      source_id: row.source_id,
      handle: row.handle,
      posted_at: row.posted_at,
      keywords: row.keywords,
      confidence: row.confidence,
    })),
  };

  const upsertPayload = {
    key: BRIEF_KEY,
    paragraph: generation.paragraph,
    input_hash: hash,
    generated_at: generatedAt,
    refreshed_at: nowIso,
    model: generation.model,
    freshness_state: context.freshness_state,
    confidence: context.confidence,
    flight_summary: {
      total: context.flight.total,
      delayed: context.flight.delayed,
      cancelled: context.flight.cancelled,
      latest_fetch: context.flight.latest_fetch,
    },
    coverage: context.coverage,
    sources_used: sourcesUsed,
  };

  const { data: saved, error: saveError } = await supabase.from("current_state_brief").upsert(upsertPayload, { onConflict: "key" }).select("*").single();
  if (saveError) throw saveError;

  return {
    item: rowToBrief(saved as PersistedBriefRow),
    regenerated: true,
    reason: generation.model ? "input_changed_regenerated_model" : (generation.fallback_reason ?? "input_changed_regenerated_fallback"),
  };
}
