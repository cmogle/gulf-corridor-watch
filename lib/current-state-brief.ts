import { createHash } from "crypto";
import { generateText, hasAnthropicKey, extractClaudeUsage } from "./anthropic";
import { gateSnapshotContext, gateSocialContext, getContextGatingConfig, type ContextGateSummary } from "./context-gating";
import { logLlmTelemetry } from "./llm-telemetry";
import { generateStructuredBrief, type BriefSections } from "./intelligence-brief";
import { OFFICIAL_SOURCES, confidenceLabelForTier, type TrustTier } from "./sources";

const BRIEF_KEY = "global";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_TIMEOUT_MS = 8000;
const EXPECTED_MISSING_SOURCES = ["india_consulate_dubai", "india_embassy_abu_dhabi", "broader_mena_ministries"];
export const NARRATIVE_POLICY_VERSION = "v5_uae_airspace_sitrep_regional_instability";
const DEFAULT_BRIEF_GENERATION_MODE = "extractive";
const SECURITY_RELEVANCE_KEYWORDS = [
  "airspace",
  "air traffic",
  "airport",
  "aviation",
  "flight",
  "delay",
  "cancel",
  "reroute",
  "diversion",
  "suspend",
  "closure",
  "closed",
  "runway",
  "terminal",
  "operation",
  "missile",
  "drone",
  "uav",
  "fighter",
  "military",
  "air defense",
  "intercept",
  "sirens",
  "security alert",
  "strike",
  "retaliation",
  "posture",
  "deployment",
  "president trump",
  "trump",
  "pentagon",
  "centcom",
  "white house",
];
const REGIONAL_RELEVANCE_KEYWORDS = [
  "uae",
  "united arab emirates",
  "dubai",
  "abu dhabi",
  "gulf",
  "middle east",
  "iran",
  "iraq",
  "israel",
  "gaza",
  "lebanon",
  "jordan",
  "qatar",
  "oman",
  "bahrain",
  "kuwait",
  "saudi",
  "yemen",
  "syria",
  "red sea",
  "strait of hormuz",
];
/** Narrow UAE-specific terms — content must reference these to be included from non-government sources */
const UAE_SPECIFIC_KEYWORDS = [
  "uae",
  "united arab emirates",
  "dubai",
  "abu dhabi",
  "dxb",
  "auh",
  "dwc",
  "shj",
  "sharjah",
  "al maktoum",
  "jebel ali",
];
/** Sources whose content is inherently UAE-specific (government, local infrastructure) */
const ALWAYS_RELEVANT_SOURCE_IDS = new Set([
  "uae_mofa",
  "visit_dubai_news",
  "rta_dubai",
  "dubai_airports",
  "abu_dhabi_airports",
  "gcaa",
]);

export type BriefFreshnessState = "fresh" | "mixed" | "stale";
export type BriefConfidence = "high" | "medium" | "low";

export type BriefCoverage = {
  sources_included: string[];
  stale_sources: string[];
  missing_expected: string[];
};

export type CurrentStateBrief = {
  paragraph: string;
  sections: BriefSections | null;
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
  validation_state: "validated" | "unvalidated" | "failed" | "skipped";
  priority: number;
  trust_tier: TrustTier;
  confidence_label: "CONFIRMED" | "REPORTED" | "UNVERIFIED";
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
  validation_state: "validated" | "unvalidated" | "failed" | "skipped";
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
  context_gating: {
    source: ContextGateSummary;
    social: ContextGateSummary;
  };
};

type SnapshotRow = {
  source_id: string;
  source_name: string;
  status_level: "normal" | "advisory" | "disrupted" | "unknown";
  reliability: "reliable" | "degraded" | "blocked";
  validation_state: "validated" | "unvalidated" | "failed" | "skipped";
  fetched_at: string;
  published_at: string | null;
  freshness_target_minutes: number;
  priority: number;
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
  validation_state: "validated" | "unvalidated" | "failed" | "skipped";
};

type FlightRow = {
  status: string;
  is_delayed: boolean;
  fetched_at: string;
};

type PersistedBriefRow = {
  key: string;
  paragraph: string;
  sections: unknown;
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
  trust_tier: TrustTier;
  confidence_label: "CONFIRMED" | "REPORTED" | "UNVERIFIED";
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

function getBriefGenerationMode(): "extractive" | "llm" {
  const raw = process.env.CURRENT_STATE_BRIEF_GENERATION_MODE?.trim().toLowerCase();
  if (raw === "llm") return "llm";
  return DEFAULT_BRIEF_GENERATION_MODE;
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
      validation_state: row.validation_state,
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
      validation_state: row.validation_state,
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

function relevanceScore(text: string): number {
  const normalized = text.toLowerCase();
  let score = 0;
  for (const keyword of SECURITY_RELEVANCE_KEYWORDS) {
    if (normalized.includes(keyword)) score += 1;
  }
  for (const keyword of REGIONAL_RELEVANCE_KEYWORDS) {
    if (normalized.includes(keyword)) score += 1;
  }
  return score;
}

function keywordHitCount(text: string, keywords: string[]): number {
  const normalized = text.toLowerCase();
  let hits = 0;
  for (const keyword of keywords) {
    if (normalized.includes(keyword)) hits += 1;
  }
  return hits;
}

/**
 * Determines if evidence text is relevant to the UAE airspace/travel briefing.
 * Three tiers:
 *  1. Always-relevant sources (UAE government/infrastructure) — auto-pass
 *  2. Content mentioning UAE specifically — needs 1+ security or regional keyword
 *  3. Content without UAE mention — needs security keyword + crisis-region keyword
 *     (not just any GCC country, to filter out e.g. "Oman Air moves terminal at Riyadh")
 */
const CRISIS_REGION_KEYWORDS = [
  "gulf", "middle east", "iran", "iraq", "israel", "gaza", "lebanon",
  "yemen", "syria", "red sea", "strait of hormuz",
];
function isRegionallyRelevantEvidence(text: string, sourceId: string): boolean {
  if (ALWAYS_RELEVANT_SOURCE_IDS.has(sourceId) || sourceId.startsWith("flightradar_")) return true;
  const uaeHits = keywordHitCount(text, UAE_SPECIFIC_KEYWORDS);
  // Content that directly references UAE — low bar (any security or regional keyword)
  if (uaeHits > 0) {
    const securityHits = keywordHitCount(text, SECURITY_RELEVANCE_KEYWORDS);
    const regionalHits = keywordHitCount(text, REGIONAL_RELEVANCE_KEYWORDS);
    return securityHits > 0 || regionalHits > 0;
  }
  // Content without UAE mention — high bar: must reference a crisis region, not just a GCC neighbor
  const securityHits = keywordHitCount(text, SECURITY_RELEVANCE_KEYWORDS);
  const crisisHits = keywordHitCount(text, CRISIS_REGION_KEYWORDS);
  return securityHits > 0 && crisisHits > 0;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function cleanEvidenceText(text: string): string {
  return stripBoilerplate(text)
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[[^\]]+]\(https?:\/\/[^)]+\)/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\+\d+\s+more\b[^.]*\.?/gi, " ")
    .replace(/\b(?:url source|markdown content)\b[\s\S]*$/i, " ")
    .replace(/\btitle:\s*/gi, "")
    .replace(/[_=*#`>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removeSourcePrefix(text: string, sourceName: string): string {
  if (!text || !sourceName) return text;
  const escaped = escapeRegExp(sourceName);
  return text
    .replace(new RegExp(`^${escaped}\\s*:\\s*${escaped}\\s*:\\s*`, "i"), "")
    .replace(new RegExp(`^${escaped}\\s*:\\s*`, "i"), "")
    .trim();
}

function pickBestEvidenceSegment(text: string): string {
  const segments = text
    .split(/\s+\|\s+|(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= 24);
  if (segments.length === 0) return text;
  const ranked = [...segments].sort((a, b) => {
    const scoreDiff = relevanceScore(b) - relevanceScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return b.length - a.length;
  });
  return ranked[0];
}

function isLowValueEvidence(text: string): boolean {
  if (!text) return true;
  if (/fetch error|challenge-protected|unavailable or non-usable|open official source/i.test(text)) return true;
  if (/markdown content|url source|!\[image|http[s]?:\/\//i.test(text)) return true;
  const alphaCount = (text.match(/[a-z]/gi) ?? []).length;
  return alphaCount < 24;
}

/**
 * Detects whether evidence text references an event date significantly in the past.
 * Returns true if the text contains a date more than `maxAgeDays` days before `nowMs`.
 */
export function hasStaleEventDate(text: string, nowMs: number, maxAgeDays = 3): boolean {
  // Match patterns like "February 25, 2026", "25 February 2026", "Feb 25, 2026", "09 March 2026"
  const datePatterns = [
    /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/gi,
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/gi,
    /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\b/gi,
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})\b/gi,
  ];
  const cutoff = nowMs - maxAgeDays * 24 * 60 * 60_000;
  for (const pattern of datePatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const parsed = new Date(match[0].replace(",", ""));
      if (!Number.isNaN(parsed.getTime()) && parsed.getTime() < cutoff) return true;
    }
  }
  return false;
}

/**
 * Sanitize flight data for LLM consumption: omit zero delayed/cancelled to prevent
 * the model from emitting "(0 delayed, 0 cancelled)" noise.
 */
export function sanitizeFlightForLlm(flight: { total: number; delayed: number; cancelled: number; latest_fetch: string | null; stale?: boolean }): Record<string, unknown> {
  const out: Record<string, unknown> = { total: flight.total };
  if (flight.delayed > 0) out.delayed = flight.delayed;
  if (flight.cancelled > 0) out.cancelled = flight.cancelled;
  if (flight.latest_fetch) out.latest_fetch = flight.latest_fetch;
  if (flight.stale) out.stale = flight.stale;
  return out;
}

/**
 * Filter advisory rows for LLM context using the same relevance/quality checks
 * applied to narrative evidence rows — prevents irrelevant or stale signals
 * from reaching the model.
 */
export function filterAdvisoryRowsForLlm(
  context: BriefInputContext,
  nowMs?: number,
): Array<{ source: string; status_level: string; fetched_at: string; summary: string }> {
  const now = nowMs ?? Date.now();
  return context.sources
    .filter((row) => row.status_level === "advisory" || row.status_level === "disrupted")
    .filter((row) => {
      const evidenceText = compact(`${cleanEvidenceText(row.title)}. ${cleanEvidenceText(row.summary)}`, 200);
      if (isLowValueEvidence(evidenceText)) return false;
      if (!isRegionallyRelevantEvidence(evidenceText, row.source_id)) return false;
      if (relevanceScore(evidenceText) === 0) return false;
      if (hasStaleEventDate(evidenceText, now)) return false;
      return true;
    })
    .map((row) => ({
      source: row.source_name,
      status_level: row.status_level,
      fetched_at: row.fetched_at,
      summary: compact(`${row.title}. ${row.summary}`, 180),
    }));
}

function buildEvidenceClause(row: BriefSourceContext): string {
  const title = cleanEvidenceText(row.title);
  const summary = cleanEvidenceText(row.summary);
  const titleNoSource = removeSourcePrefix(title, row.source_name);
  const summaryNoSource = removeSourcePrefix(summary, row.source_name);
  const combined = [titleNoSource, summaryNoSource]
    .filter(Boolean)
    .filter((part, idx, arr) => arr.findIndex((candidate) => normalizeForDedup(candidate) === normalizeForDedup(part)) === idx)
    .join(". ");
  const picked = pickBestEvidenceSegment(combined);
  return compact(picked, 150);
}

function selectNarrativeEvidenceRows(context: BriefInputContext, maxRows = 12): NarrativeEvidenceRow[] {
  const seen = new Set<string>();
  const rows = [...context.sources].sort((a, b) => {
    const levelDiff = statusRank(b.status_level) - statusRank(a.status_level);
    if (levelDiff !== 0) return levelDiff;
    // Higher trust (lower tier number) first
    const tierDiff = a.trust_tier - b.trust_tier;
    if (tierDiff !== 0) return tierDiff;
    const priorityDiff = b.priority - a.priority;
    if (priorityDiff !== 0) return priorityDiff;
    return toMillis(b.fetched_at) - toMillis(a.fetched_at);
  });

  const nowMs = Date.now();
  const out: NarrativeEvidenceRow[] = [];
  for (const row of rows) {
    const evidenceText = buildEvidenceClause(row);
    if (isLowValueEvidence(evidenceText)) continue;
    if (!isRegionallyRelevantEvidence(evidenceText, row.source_id)) continue;
    if (relevanceScore(evidenceText) === 0) continue;
    if (hasStaleEventDate(evidenceText, nowMs)) continue;
    const key = normalizeForDedup(evidenceText);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      source_id: row.source_id,
      source_name: row.source_name,
      status_level: row.status_level,
      trust_tier: row.trust_tier,
      confidence_label: row.confidence_label,
      fetched_at: row.fetched_at,
      clause: compact(evidenceText, 180),
    });
    if (out.length >= maxRows) break;
  }
  return out;
}

function selectCorroboratedSocialRows(context: BriefInputContext, maxRows = 8): CorroboratedSocialRow[] {
  const sourceById = new Map(context.sources.map((row) => [row.source_id, row]));
  return context.social_signals
    .filter((row) => row.keywords.length > 0)
    .map((row) => {
      const source = sourceById.get(row.source_id);
      if (!source) return null;
      if (!(source.status_level === "advisory" || source.status_level === "disrupted")) return null;
      const cleanText = compact(cleanEvidenceText(row.text_display), 120);
      if (isLowValueEvidence(cleanText)) return null;
      if (!isRegionallyRelevantEvidence(cleanText, row.source_id)) return null;
      if (relevanceScore(cleanText) === 0) return null;
      return {
        source_id: row.source_id,
        source_name: source.source_name,
        handle: row.handle,
        posted_at: row.posted_at,
        text: cleanText,
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

function hasSecuritySignal(rows: NarrativeEvidenceRow[], socialRows: CorroboratedSocialRow[]): boolean {
  const combined = [...rows.map((row) => row.clause), ...socialRows.map((row) => row.text)].join(" ").toLowerCase();
  return keywordHitCount(combined, SECURITY_RELEVANCE_KEYWORDS) > 0;
}

function deriveAirspacePosture(context: BriefInputContext, basis: NarrativeBasis): "normal" | "heightened" | "unclear" {
  const securitySignals = hasSecuritySignal(basis.source_evidence_rows, basis.corroborated_social_rows);
  const operationalDisruption = context.flight.delayed > 0 || context.flight.cancelled > 0;
  if (context.flight.stale || basis.freshness_caveat_required) return "unclear";
  if (securitySignals || operationalDisruption) return "heightened";
  return "normal";
}

function buildPostureSentence(context: BriefInputContext, posture: "normal" | "heightened" | "unclear"): string {
  const postureText =
    posture === "normal"
      ? "normal"
      : posture === "heightened"
        ? "heightened"
        : "unclear";
  const disruptionParts: string[] = [];
  if (context.flight.delayed > 0) disruptionParts.push(`${context.flight.delayed} delayed`);
  if (context.flight.cancelled > 0) disruptionParts.push(`${context.flight.cancelled} cancelled`);
  const flightSentence =
    context.flight.total > 0
      ? disruptionParts.length > 0
        ? `Commercial traffic sample shows ${context.flight.total} tracked flights in the last 45 minutes (${disruptionParts.join(", ")}).`
        : `Commercial traffic sample shows ${context.flight.total} tracked flights in the last 45 minutes.`
      : "Commercial traffic visibility is currently limited.";
  return `As of ${formatDubaiTime(context.computed_at)}, UAE airspace posture appears ${postureText}. ${flightSentence}`;
}

/** Build a natural-language sentence summarising confirmed evidence rows */
function buildSignalsSentence(rows: NarrativeEvidenceRow[], socialRows: CorroboratedSocialRow[]): string {
  if (rows.length === 0 && socialRows.length === 0) {
    return "No confirmed disruptions or security incidents found in current sources.";
  }
  // Present evidence as readable clauses without [label] Source: prefix
  const clauses = rows.map((row) => row.clause).filter(Boolean);
  const socialClauses = socialRows.map((row) => row.text).filter(Boolean);
  const all = [...clauses, ...socialClauses];
  if (all.length === 1) return all[0].replace(/\.?$/, ".");
  if (all.length <= 3) return all.join(". ").replace(/\.?\.\s*/g, ". ").replace(/\.?$/, ".");
  // More than 3: take the top 3 most relevant, note the rest
  return all.slice(0, 3).join(". ").replace(/\.?\.\s*/g, ". ").replace(/\.?$/, ".");
}

function buildGapsSentence(context: BriefInputContext): string {
  const parts: string[] = [];
  if (context.coverage.stale_sources.length > 0) parts.push("some official sources have not updated recently");
  if (context.flight.stale) parts.push("flight telemetry is stale");
  if (parts.length === 0) return "";
  return parts.join(" and ").replace(/^./, (c) => c.toUpperCase()) + " — verify official channels directly.";
}

function buildGuidanceSentence(posture: "normal" | "heightened" | "unclear"): string {
  if (posture === "heightened") {
    return "Expect possible short-notice schedule changes; monitor airline and government channels.";
  }
  if (posture === "normal") {
    return "No broad disruption signal confirmed. Continue normal plans.";
  }
  return "Conditions are uncertain. Rely on official UAE channels for immediate guidance.";
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
  const posture = deriveAirspacePosture(context, basis);
  const postureSentence = buildPostureSentence(context, posture);
  const signals = buildSignalsSentence(basis.source_evidence_rows, basis.corroborated_social_rows);
  const gaps = buildGapsSentence(context);
  const guidance = buildGuidanceSentence(posture);
  const parts = [postureSentence, signals, gaps, guidance].filter(Boolean);
  return compact(parts.join(" "), 800);
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

function normalizeSections(value: unknown): BriefSections | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const security = typeof raw.security === "string" ? raw.security : "";
  const flights = typeof raw.flights === "string" ? raw.flights : "";
  const guidance = typeof raw.guidance === "string" ? raw.guidance : "";
  const source_coverage = typeof raw.source_coverage === "string" ? raw.source_coverage : "";
  if (!security && !flights && !guidance && !source_coverage) return null;
  return { security, flights, guidance, source_coverage };
}

function rowToBrief(row: PersistedBriefRow): CurrentStateBrief {
  return {
    paragraph: row.paragraph,
    sections: normalizeSections(row.sections),
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
  const gating = getContextGatingConfig();
  const nowMs = Date.now();

  const snapshotSelect = "source_id,source_name,status_level,reliability,validation_state,fetched_at,published_at,freshness_target_minutes,priority,title,summary";
  const legacySnapshotSelect = "source_id,source_name,status_level,reliability,fetched_at,published_at,freshness_target_minutes,priority,title,summary";
  let { data: snapshots, error: snapshotsError } = await supabase.from("latest_source_snapshots").select(snapshotSelect).limit(150);
  if (snapshotsError && /validation_state|content_hash|validated_at/i.test(snapshotsError.message ?? "")) {
    const legacy = await supabase.from("latest_source_snapshots").select(legacySnapshotSelect).limit(150);
    snapshots = (legacy.data ?? []).map((row) => ({ ...row, validation_state: "unvalidated" }));
    snapshotsError = legacy.error;
  }
  if (snapshotsError) throw snapshotsError;

  const socialSelect = "linked_source_id,handle,posted_at,text,text_original,text_en,keywords,confidence,validation_state";
  const legacySocialSelect = "linked_source_id,handle,posted_at,text,text_original,text_en,keywords,confidence";
  let { data: socialSignals, error: socialSignalsError } = await supabase
    .from("social_signals")
    .select(socialSelect)
    .eq("provider", "x")
    .order("posted_at", { ascending: false })
    .limit(400);
  if (socialSignalsError && /validation_state/i.test(socialSignalsError.message ?? "")) {
    const legacy = await supabase.from("social_signals").select(legacySocialSelect).eq("provider", "x").order("posted_at", { ascending: false }).limit(400);
    socialSignals = (legacy.data ?? []).map((row) => ({ ...row, validation_state: "unvalidated" }));
    socialSignalsError = legacy.error;
  }
  if (socialSignalsError) throw socialSignalsError;

  const { data: flights, error: flightsError } = await supabase
    .from("flight_observations")
    .select("status,is_delayed,fetched_at")
    .gte("fetched_at", cutoff)
    .order("fetched_at", { ascending: false })
    .limit(2500);
  if (flightsError) throw flightsError;

  const nowIso = new Date().toISOString();

  const sourceTierMap = new Map(OFFICIAL_SOURCES.map((s) => [s.id, s.trust_tier]));
  const mappedSources = ((snapshots ?? []) as SnapshotRow[])
    .map((row) => {
      const stale = isSourceStale(ageMinutes(row.fetched_at, nowMs), row.freshness_target_minutes);
      const trust_tier = (sourceTierMap.get(row.source_id) ?? 4) as TrustTier;
      return {
        source_id: row.source_id,
        source_name: row.source_name,
        status_level: row.status_level,
        reliability: row.reliability,
        validation_state: row.validation_state,
        priority: Number(row.priority ?? 0) || 0,
        trust_tier,
        confidence_label: confidenceLabelForTier(trust_tier),
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
      validation_state: row.validation_state,
    }))
    .sort((a, b) => `${a.source_id}:${a.handle}`.localeCompare(`${b.source_id}:${b.handle}`));

  const sourceGate = gateSnapshotContext(
    mappedSources.map((row) => ({
      source_id: row.source_id,
      source_name: row.source_name,
      title: row.title,
      summary: row.summary,
      reliability: row.reliability,
      validation_state: row.validation_state,
      fetched_at: row.fetched_at,
      freshness_target_minutes: row.freshness_target_minutes,
      priority: row.priority,
    })),
    {
      nowMs,
      maxAgeMinutes: gating.source_max_age_minutes,
      minFreshMinutes: gating.source_min_fresh_minutes,
      freshnessMultiplier: gating.source_freshness_multiplier,
      maxRows: gating.source_max_rows,
    },
  );
  const sourceById = new Map(mappedSources.map((row) => [row.source_id, row]));
  const gatedSources = sourceGate.selected
    .map((row) => sourceById.get(row.source_id))
    .filter((row): row is BriefSourceContext => Boolean(row));

  const socialGate = gateSocialContext(
    mappedSignals.map((row) => ({
      linked_source_id: row.source_id,
      handle: row.handle,
      posted_at: row.posted_at,
      text_en: row.text_display,
      text_original: row.text_display,
      confidence: row.confidence,
      validation_state: row.validation_state,
    })),
    {
      nowMs,
      maxAgeMinutes: gating.social_max_age_minutes,
      maxRows: gating.social_max_rows,
    },
  );
  const signalByKey = new Map(mappedSignals.map((row) => [`${row.source_id}:${row.handle}:${row.posted_at}`, row]));
  const gatedSignals = socialGate.selected
    .map((row) => signalByKey.get(`${row.linked_source_id}:${row.handle}:${row.posted_at}`))
    .filter((row): row is BriefSocialContext => Boolean(row));

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
    sources: gatedSources,
    social_signals: gatedSignals,
    context_gating: {
      source: sourceGate.summary,
      social: socialGate.summary,
    },
  };
}

async function generateBriefParagraphWithModel(
  context: BriefInputContext,
  fallbackParagraph: string,
  basis: NarrativeBasis,
): Promise<{
  paragraph: string;
  model: string | null;
  fallback_reason: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  duration_ms: number;
}> {
  const startedAt = Date.now();
  const generationMode = getBriefGenerationMode();
  if (generationMode !== "llm") {
    logLlmTelemetry("brief_generation", {
      route: "/api/brief/refresh",
      mode: "current_state_brief",
      model: null,
      success: true,
      duration_ms: Date.now() - startedAt,
      fallback_reason: "extractive_policy",
      context: {
        source_rows: context.sources.length,
        social_rows: context.social_signals.length,
      },
    });
    return {
      paragraph: fallbackParagraph,
      model: null,
      fallback_reason: "extractive_policy",
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      duration_ms: Date.now() - startedAt,
    };
  }

  if (!hasAnthropicKey()) {
    logLlmTelemetry("brief_generation", {
      route: "/api/brief/refresh",
      mode: "current_state_brief",
      model: null,
      success: false,
      duration_ms: Date.now() - startedAt,
      fallback_reason: "missing_anthropic_api_key",
      context: {
        source_rows: context.sources.length,
        social_rows: context.social_signals.length,
      },
    });
    return {
      paragraph: fallbackParagraph,
      model: null,
      fallback_reason: "missing_anthropic_api_key",
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      duration_ms: Date.now() - startedAt,
    };
  }

  const timeoutMs = parsePositiveInt(process.env.CURRENT_STATE_BRIEF_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const model = process.env.CURRENT_STATE_BRIEF_MODEL?.trim() || DEFAULT_MODEL;

  try {
    const advisoryRows = filterAdvisoryRowsForLlm(context);
    const result = await generateText({
      model,
      temperature: 0.1,
      timeoutMs,
      system:
        "You write a UAE resident airspace situation brief. Output strict JSON only: {\"paragraph\": string}. Requirements: one concise English paragraph (90-140 words). Begin with timestamp and airspace posture assessment (normal/heightened/unclear). Follow with confirmed signals from the evidence. Note any data gaps or uncertainties. End with practical guidance for travelers. Use only provided snippets; no speculation and no invented facts. Include flight count only when non-zero disruptions exist. Do not emit '0 delayed' or '0 cancelled'. Do not use section labels like 'Confirmed signals:' — write flowing prose. Mention official X only when corroborated_social_rows are provided. Do not include source/feed quantification.",
      userMessage: JSON.stringify(
        {
          narrative_policy_version: NARRATIVE_POLICY_VERSION,
          timestamp_gst: formatDubaiTime(context.computed_at),
          flight: sanitizeFlightForLlm(context.flight),
          source_evidence_rows: basis.source_evidence_rows,
          corroborated_social_rows: basis.corroborated_social_rows,
          freshness_caveat_required: basis.freshness_caveat_required,
          advisory_rows: advisoryRows,
        },
        null,
        2,
      ),
    });

    const content = result.text;
    const parsed = JSON.parse(extractBriefJsonObject(content)) as { paragraph?: unknown };
    const paragraph = typeof parsed.paragraph === "string" ? compact(parsed.paragraph, 1200) : "";
    if (!paragraph) {
      const usage = extractClaudeUsage(result);
      logLlmTelemetry("brief_generation", {
        route: "/api/brief/refresh",
        mode: "current_state_brief",
        model,
        success: false,
        duration_ms: Date.now() - startedAt,
        fallback_reason: "empty_or_invalid_model_output",
        ...usage,
      });
      return {
        paragraph: fallbackParagraph,
        model: null,
        fallback_reason: "empty_or_invalid_model_output",
        ...usage,
        duration_ms: Date.now() - startedAt,
      };
    }

    if (!isNarrativePolicyCompliant(paragraph, { allowXMention: basis.corroborated_social_rows.length > 0 })) {
      const usage = extractClaudeUsage(result);
      logLlmTelemetry("brief_generation", {
        route: "/api/brief/refresh",
        mode: "current_state_brief",
        model,
        success: false,
        duration_ms: Date.now() - startedAt,
        fallback_reason: "policy_non_compliant_output",
        ...usage,
      });
      return {
        paragraph: fallbackParagraph,
        model: null,
        fallback_reason: "policy_non_compliant_output",
        ...usage,
        duration_ms: Date.now() - startedAt,
      };
    }

    const usage = extractClaudeUsage(result);
    logLlmTelemetry("brief_generation", {
      route: "/api/brief/refresh",
      mode: "current_state_brief",
      model,
      success: true,
      duration_ms: Date.now() - startedAt,
      ...usage,
      context: {
        freshness_state: context.freshness_state,
        confidence: context.confidence,
        source_rows: context.sources.length,
        social_rows: context.social_signals.length,
        source_gate_policy: context.context_gating.source.policy,
        social_gate_policy: context.context_gating.social.policy,
      },
    });
    return {
      paragraph,
      model,
      fallback_reason: null,
      ...usage,
      duration_ms: Date.now() - startedAt,
    };
  } catch (error) {
    logLlmTelemetry("brief_generation", {
      route: "/api/brief/refresh",
      mode: "current_state_brief",
      model,
      success: false,
      duration_ms: Date.now() - startedAt,
      fallback_reason: "model_request_failed",
      error: String(error),
      context: {
        freshness_state: context.freshness_state,
        confidence: context.confidence,
        source_rows: context.sources.length,
        social_rows: context.social_signals.length,
      },
    });
    return {
      paragraph: fallbackParagraph,
      model: null,
      fallback_reason: "model_request_failed",
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      duration_ms: Date.now() - startedAt,
    };
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
    sections: null,
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
  input_hash: string;
}> {
  const startedAt = Date.now();
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
    logLlmTelemetry("brief_refresh", {
      route: "/api/brief/refresh",
      mode: "current_state_brief",
      model: (updated as PersistedBriefRow).model ?? null,
      success: true,
      duration_ms: Date.now() - startedAt,
      fallback_reason: "unchanged_input_hash",
      context: {
        regenerated: false,
        source_rows: context.sources.length,
        social_rows: context.social_signals.length,
        source_gate_policy: context.context_gating.source.policy,
        social_gate_policy: context.context_gating.social.policy,
      },
    });
    return { item: rowToBrief(updated as PersistedBriefRow), regenerated: false, reason: "unchanged_input_hash", input_hash: hash };
  }

  const basis = buildNarrativeBasis(context);
  const fallbackParagraph = buildFallbackBriefParagraph(context);

  // Generate both: legacy paragraph + structured sections
  const [generation, structuredGeneration] = await Promise.all([
    generateBriefParagraphWithModel(context, fallbackParagraph, basis),
    generateStructuredBrief(context, basis),
  ]);
  const generatedAt = nowIso;

  // Use structured executive_summary as paragraph if LLM generation succeeded
  const paragraph = structuredGeneration.model
    ? structuredGeneration.executive_summary
    : generation.paragraph;

  const sourcesUsed = {
    narrative_policy_version: NARRATIVE_POLICY_VERSION,
    narrative_basis: basis.source_evidence_rows,
    social_basis: basis.corroborated_social_rows,
    snapshots: context.sources.map((row) => ({
      source_id: row.source_id,
      source_name: row.source_name,
      status_level: row.status_level,
      reliability: row.reliability,
      validation_state: row.validation_state,
      priority: row.priority,
      trust_tier: row.trust_tier,
      confidence_label: row.confidence_label,
      fetched_at: row.fetched_at,
      stale: row.stale,
    })),
    social_signals: context.social_signals.map((row) => ({
      source_id: row.source_id,
      handle: row.handle,
      posted_at: row.posted_at,
      keywords: row.keywords,
      confidence: row.confidence,
      validation_state: row.validation_state,
    })),
  };

  const upsertPayload = {
    key: BRIEF_KEY,
    paragraph,
    sections: structuredGeneration.sections,
    input_hash: hash,
    generated_at: generatedAt,
    refreshed_at: nowIso,
    model: structuredGeneration.model ?? generation.model,
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

  logLlmTelemetry("brief_refresh", {
    route: "/api/brief/refresh",
    mode: "current_state_brief",
    model: generation.model,
    success: true,
    duration_ms: Date.now() - startedAt,
    fallback_reason: generation.fallback_reason,
    prompt_tokens: generation.prompt_tokens,
    completion_tokens: generation.completion_tokens,
    total_tokens: generation.total_tokens,
    context: {
      regenerated: true,
      reason: generation.model ? "input_changed_regenerated_model" : (generation.fallback_reason ?? "input_changed_regenerated_fallback"),
      generation_duration_ms: generation.duration_ms,
      source_rows: context.sources.length,
      social_rows: context.social_signals.length,
      source_gate_policy: context.context_gating.source.policy,
      social_gate_policy: context.context_gating.social.policy,
      source_total: context.context_gating.source.total,
      source_selected: context.context_gating.source.selected,
      social_total: context.context_gating.social.total,
      social_selected: context.context_gating.social.selected,
    },
  });

  return {
    item: rowToBrief(saved as PersistedBriefRow),
    regenerated: true,
    reason: generation.model ? "input_changed_regenerated_model" : (generation.fallback_reason ?? "input_changed_regenerated_fallback"),
    input_hash: hash,
  };
}
