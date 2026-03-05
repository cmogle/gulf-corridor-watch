import { generateText, hasAnthropicKey, extractClaudeUsage } from "./anthropic";
import { logLlmTelemetry } from "./llm-telemetry";
import type { BriefInputContext } from "./current-state-brief";
import {
  buildFallbackBriefParagraph,
  extractBriefJsonObject,
  NARRATIVE_POLICY_VERSION,
} from "./current-state-brief";
import { detectCorrelations } from "./source-correlation";
import { formatCrisisStatsForBrief } from "./crisis-stats";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_TIMEOUT_MS = 15_000;

export type BriefSections = {
  security: string;
  flights: string;
  guidance: string;
  source_coverage: string;
};

export type IntelligenceBrief = {
  executive_summary: string;
  sections: BriefSections;
  metadata: {
    generated_at: string;
    model: string | null;
    freshness_state: string;
    confidence: string;
    input_hash: string;
  };
};

export type GenerateStructuredBriefResult = {
  executive_summary: string;
  sections: BriefSections;
  model: string | null;
  fallback_reason: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  duration_ms: number;
};

const SYSTEM_PROMPT = `You are a senior intelligence analyst producing a layered situation report for UAE residents and travelers during a period of regional instability.

Output strict JSON only, matching this schema:
{
  "executive_summary": string,
  "sections": {
    "security": string,
    "flights": string,
    "guidance": string,
    "source_coverage": string
  }
}

SECTION REQUIREMENTS:

executive_summary (2-3 sentences, 40-60 words):
- Lead with the current UAE airspace posture (normal/heightened/unclear)
- State the most significant development
- End with the bottom-line assessment for travelers

security (3-5 sentences):
- Military and defense developments affecting the Gulf region
- Government advisories or travel warnings
- Regional threat posture changes
- Only include information present in the evidence; never speculate

flights (3-5 sentences):
- UAE airspace operational status (open/restricted/closed)
- Airline-specific suspensions, diversions, or schedule changes
- Flight delay and cancellation statistics from the data
- Airport-specific impacts (DXB, AUH, DWC)

guidance (2-4 sentences):
- Concrete actionable advice for UAE residents and travelers
- What to do and what to avoid
- Which official channels to monitor
- Avoid generic "stay safe" platitudes; be specific

source_coverage (2-3 sentences):
- How many sources contributed to this assessment
- Note any significant data gaps or stale sources
- Highlight cross-source corroborations and contradictions from the correlation data if provided
- Overall confidence assessment and why

CONSTRAINTS:
- Use only the provided evidence snippets and flight data; never invent facts
- Use direct, authoritative language (like a trusted advisor, not a news anchor)
- Include operational flight statistics when available
- Do not mention "monitored sources" or quantify sources with numbers like "X of Y sources"
- Each section must be self-contained and independently readable`;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
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

function buildFallbackSections(context: BriefInputContext): BriefSections {
  const securitySources = context.sources
    .filter((s) => s.status_level === "disrupted" || s.status_level === "advisory")
    .map((s) => `${s.source_name}: ${compact(s.title, 100)}`)
    .slice(0, 3);

  const security = securitySources.length > 0
    ? `Active advisories detected. ${securitySources.join(". ")}.`
    : "No active security advisories detected from monitored government and military sources.";

  const flights = context.flight.total > 0
    ? (() => {
        const parts = [`${context.flight.total} flights tracked in the last 45 minutes.`];
        if (context.flight.delayed > 0 || context.flight.cancelled > 0) {
          const d = context.flight.delayed > 0 ? `${context.flight.delayed} delayed` : "";
          const c = context.flight.cancelled > 0 ? `${context.flight.cancelled} cancelled` : "";
          parts.push([d, c].filter(Boolean).join(", ") + ".");
        }
        if (context.flight.stale) parts.push("Flight telemetry is stale; verify with airline directly.");
        return parts.join(" ");
      })()
    : "Commercial flight telemetry is currently unavailable.";

  const guidance = context.freshness_state === "stale"
    ? "Data freshness is limited. Verify travel plans directly with your airline and check official UAE government channels before departing."
    : "Continue monitoring official channels. Check airline apps for real-time status on your specific flights.";

  const stalePart = context.coverage.stale_sources.length > 0
    ? ` ${context.coverage.stale_sources.length} sources have stale data.`
    : "";
  const correlation = detectCorrelations(context);
  const corroborationPart = correlation.signals.filter((s) => s.type === "corroboration").length > 0
    ? ` ${correlation.signals.filter((s) => s.type === "corroboration").length} cross-source corroboration(s) detected.`
    : "";
  const contradictionPart = correlation.signals.filter((s) => s.type === "contradiction").length > 0
    ? ` ${correlation.signals.filter((s) => s.type === "contradiction").length} contradiction(s) noted.`
    : "";
  const source_coverage = `Assessment based on ${context.coverage.sources_included.length} sources. Confidence: ${context.confidence}.${stalePart}${corroborationPart}${contradictionPart}`;

  return { security, flights, guidance, source_coverage };
}

type NarrativeEvidenceRow = {
  source_id: string;
  source_name: string;
  status_level: string;
  trust_tier: number;
  confidence_label: string;
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

export async function generateStructuredBrief(
  context: BriefInputContext,
  basis: {
    source_evidence_rows: NarrativeEvidenceRow[];
    corroborated_social_rows: CorroboratedSocialRow[];
    freshness_caveat_required: boolean;
  },
): Promise<GenerateStructuredBriefResult> {
  const startedAt = Date.now();
  const fallbackSummary = buildFallbackBriefParagraph(context);
  const fallbackSections = buildFallbackSections(context);

  const generationMode = process.env.CURRENT_STATE_BRIEF_GENERATION_MODE?.trim().toLowerCase();
  if (generationMode !== "llm") {
    logLlmTelemetry("structured_brief_generation", {
      route: "/api/brief/refresh",
      mode: "intelligence_brief",
      model: null,
      success: true,
      duration_ms: Date.now() - startedAt,
      fallback_reason: "extractive_policy",
    });
    return {
      executive_summary: fallbackSummary,
      sections: fallbackSections,
      model: null,
      fallback_reason: "extractive_policy",
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      duration_ms: Date.now() - startedAt,
    };
  }

  if (!hasAnthropicKey()) {
    return {
      executive_summary: fallbackSummary,
      sections: fallbackSections,
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

  const advisoryRows = context.sources
    .filter((row) => row.status_level === "advisory" || row.status_level === "disrupted")
    .map((row) => ({
      source: row.source_name,
      status_level: row.status_level,
      fetched_at: row.fetched_at,
      summary: compact(`${row.title}. ${row.summary}`, 180),
    }));

  const correlation = detectCorrelations(context);
  const crisisStats = await formatCrisisStatsForBrief();

  const userPayload = {
    narrative_policy_version: NARRATIVE_POLICY_VERSION,
    timestamp_gst: formatDubaiTime(context.computed_at),
    freshness_state: context.freshness_state,
    confidence: context.confidence,
    flight: context.flight,
    source_evidence_rows: basis.source_evidence_rows,
    corroborated_social_rows: basis.corroborated_social_rows,
    freshness_caveat_required: basis.freshness_caveat_required,
    advisory_rows: advisoryRows,
    source_coverage: {
      total_sources: context.coverage.sources_included.length,
      stale_sources: context.coverage.stale_sources,
      missing_expected: context.coverage.missing_expected,
    },
    ...(correlation.context_text ? { cross_source_correlation: correlation.context_text } : {}),
    ...(crisisStats ? { active_crisis_stats: crisisStats } : {}),
  };

  try {
    const result = await generateText({
      model,
      temperature: 0.15,
      maxTokens: 2048,
      timeoutMs,
      system: SYSTEM_PROMPT,
      userMessage: JSON.stringify(userPayload, null, 2),
    });

    const parsed = JSON.parse(extractBriefJsonObject(result.text)) as {
      executive_summary?: unknown;
      sections?: {
        security?: unknown;
        flights?: unknown;
        guidance?: unknown;
        source_coverage?: unknown;
      };
    };

    const execSummary = typeof parsed.executive_summary === "string"
      ? compact(parsed.executive_summary, 400)
      : "";
    const sections: BriefSections = {
      security: typeof parsed.sections?.security === "string"
        ? compact(parsed.sections.security, 600)
        : fallbackSections.security,
      flights: typeof parsed.sections?.flights === "string"
        ? compact(parsed.sections.flights, 600)
        : fallbackSections.flights,
      guidance: typeof parsed.sections?.guidance === "string"
        ? compact(parsed.sections.guidance, 600)
        : fallbackSections.guidance,
      source_coverage: typeof parsed.sections?.source_coverage === "string"
        ? compact(parsed.sections.source_coverage, 400)
        : fallbackSections.source_coverage,
    };

    if (!execSummary || Object.values(sections).some((s) => !s)) {
      const usage = extractClaudeUsage(result);
      logLlmTelemetry("structured_brief_generation", {
        route: "/api/brief/refresh",
        mode: "intelligence_brief",
        model,
        success: false,
        duration_ms: Date.now() - startedAt,
        fallback_reason: "incomplete_model_output",
        ...usage,
      });
      return {
        executive_summary: execSummary || fallbackSummary,
        sections,
        model: null,
        fallback_reason: "incomplete_model_output",
        ...usage,
        duration_ms: Date.now() - startedAt,
      };
    }

    const usage = extractClaudeUsage(result);
    logLlmTelemetry("structured_brief_generation", {
      route: "/api/brief/refresh",
      mode: "intelligence_brief",
      model,
      success: true,
      duration_ms: Date.now() - startedAt,
      ...usage,
      context: {
        freshness_state: context.freshness_state,
        confidence: context.confidence,
        source_rows: context.sources.length,
        social_rows: context.social_signals.length,
      },
    });

    return {
      executive_summary: execSummary,
      sections,
      model,
      fallback_reason: null,
      ...usage,
      duration_ms: Date.now() - startedAt,
    };
  } catch (error) {
    logLlmTelemetry("structured_brief_generation", {
      route: "/api/brief/refresh",
      mode: "intelligence_brief",
      model,
      success: false,
      duration_ms: Date.now() - startedAt,
      fallback_reason: "model_request_failed",
      error: String(error),
    });
    return {
      executive_summary: fallbackSummary,
      sections: fallbackSections,
      model: null,
      fallback_reason: "model_request_failed",
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      duration_ms: Date.now() - startedAt,
    };
  }
}
