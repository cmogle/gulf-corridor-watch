/**
 * Cross-source correlation logic (T-006)
 *
 * Detects corroborating signals, contradictions, and coverage gaps
 * across sources, feeding results into the intelligence brief context.
 */

import type { BriefInputContext } from "./current-state-brief";
import { OFFICIAL_SOURCES } from "./sources";

export type CorrelationSignal = {
  type: "corroboration" | "contradiction" | "gap";
  summary: string;
  sources: string[];
};

export type CorrelationResult = {
  signals: CorrelationSignal[];
  context_text: string;
};

// Keywords for topic clustering
const TOPIC_CLUSTERS: Record<string, string[]> = {
  airspace: ["airspace", "air traffic", "fir", "notam", "restricted", "closure", "closed", "open"],
  flights: ["flight", "cancel", "suspend", "delay", "divert", "reroute", "ground", "resume"],
  military: ["missile", "drone", "intercept", "strike", "military", "defense", "attack", "retaliation"],
  airport: ["airport", "terminal", "runway", "dxb", "auh", "dwc", "departure", "arrival"],
  advisory: ["advisory", "warning", "alert", "caution", "travel advisory", "level"],
};

// Sources expected to report during crisis — silence is notable
const EXPECTED_CRISIS_SOURCES = new Set([
  "emirates_updates",
  "etihad_advisory",
  "flydubai_updates",
  "gcaa_uae",
  "uae_mofa",
]);

function getTopicsForText(text: string): string[] {
  const lower = text.toLowerCase();
  const topics: string[] = [];
  for (const [topic, keywords] of Object.entries(TOPIC_CLUSTERS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      topics.push(topic);
    }
  }
  return topics;
}

function detectCorroborations(context: BriefInputContext): CorrelationSignal[] {
  const signals: CorrelationSignal[] = [];

  // Group sources by topic
  const topicSources = new Map<string, Array<{ source_id: string; source_name: string; status_level: string; text: string }>>();

  for (const source of context.sources) {
    const text = `${source.title} ${source.summary}`;
    const topics = getTopicsForText(text);
    for (const topic of topics) {
      if (!topicSources.has(topic)) topicSources.set(topic, []);
      topicSources.get(topic)!.push({
        source_id: source.source_id,
        source_name: source.source_name,
        status_level: source.status_level,
        text,
      });
    }
  }

  // Find topics with 2+ non-normal sources (corroboration of disruption)
  for (const [topic, sources] of topicSources) {
    const elevated = sources.filter((s) => s.status_level === "advisory" || s.status_level === "disrupted");
    if (elevated.length >= 2) {
      const uniqueSources = [...new Set(elevated.map((s) => s.source_name))];
      if (uniqueSources.length >= 2) {
        signals.push({
          type: "corroboration",
          summary: `${uniqueSources.join(" and ")} both report ${topic}-related disruption`,
          sources: uniqueSources,
        });
      }
    }
  }

  // Social corroboration: social signals echoing official sources
  const officialAdvisory = context.sources.filter(
    (s) => s.status_level === "advisory" || s.status_level === "disrupted",
  );
  if (officialAdvisory.length > 0 && context.social_signals.length > 0) {
    const matchingSocial = context.social_signals.filter(
      (sig) => officialAdvisory.some((src) => src.source_id === sig.source_id),
    );
    if (matchingSocial.length > 0) {
      signals.push({
        type: "corroboration",
        summary: `${matchingSocial.length} X signal(s) corroborate official source advisories`,
        sources: matchingSocial.map((s) => `@${s.handle}`),
      });
    }
  }

  return signals;
}

function detectContradictions(context: BriefInputContext): CorrelationSignal[] {
  const signals: CorrelationSignal[] = [];

  // Group sources by topic and check for conflicting status levels
  const topicSources = new Map<string, Array<{ source_name: string; status_level: string }>>();

  for (const source of context.sources) {
    const text = `${source.title} ${source.summary}`;
    const topics = getTopicsForText(text);
    for (const topic of topics) {
      if (!topicSources.has(topic)) topicSources.set(topic, []);
      topicSources.get(topic)!.push({
        source_name: source.source_name,
        status_level: source.status_level,
      });
    }
  }

  for (const [topic, sources] of topicSources) {
    const hasNormal = sources.some((s) => s.status_level === "normal");
    const hasDisrupted = sources.some((s) => s.status_level === "disrupted" || s.status_level === "advisory");

    if (hasNormal && hasDisrupted) {
      const normalSources = [...new Set(sources.filter((s) => s.status_level === "normal").map((s) => s.source_name))];
      const disruptedSources = [...new Set(
        sources.filter((s) => s.status_level === "disrupted" || s.status_level === "advisory").map((s) => s.source_name),
      )];
      signals.push({
        type: "contradiction",
        summary: `${disruptedSources.join(", ")} report ${topic} disruption while ${normalSources.join(", ")} report normal operations`,
        sources: [...disruptedSources, ...normalSources],
      });
    }
  }

  return signals;
}

function detectGaps(context: BriefInputContext): CorrelationSignal[] {
  const signals: CorrelationSignal[] = [];
  const nowMs = Date.now();

  // Check for expected sources that are stale or missing during elevated situations
  const hasElevatedStatus = context.sources.some(
    (s) => s.status_level === "advisory" || s.status_level === "disrupted",
  );

  if (!hasElevatedStatus) return signals;

  const presentSourceIds = new Set(context.sources.map((s) => s.source_id));
  const registeredSourceIds = new Set(OFFICIAL_SOURCES.map((s) => s.id));

  // Check for expected crisis sources that are missing
  for (const expectedId of EXPECTED_CRISIS_SOURCES) {
    if (!registeredSourceIds.has(expectedId)) continue;

    const source = context.sources.find((s) => s.source_id === expectedId);
    const sourceDef = OFFICIAL_SOURCES.find((s) => s.id === expectedId);
    if (!sourceDef) continue;

    if (!source) {
      signals.push({
        type: "gap",
        summary: `No data from ${sourceDef.name} during active crisis`,
        sources: [sourceDef.name],
      });
    } else if (source.stale) {
      const ageMinutes = Math.round((nowMs - new Date(source.fetched_at).getTime()) / 60_000);
      signals.push({
        type: "gap",
        summary: `${sourceDef.name} data is ${ageMinutes} minutes old during active crisis`,
        sources: [sourceDef.name],
      });
    }
  }

  // Check for stale sources generally
  const staleSources = context.coverage.stale_sources;
  if (staleSources.length > 3) {
    signals.push({
      type: "gap",
      summary: `${staleSources.length} sources have stale data, limiting assessment confidence`,
      sources: staleSources,
    });
  }

  // Check for missing expected sources
  const missing = context.coverage.missing_expected;
  if (missing.length > 0) {
    signals.push({
      type: "gap",
      summary: `Expected sources not yet available: ${missing.join(", ")}`,
      sources: missing,
    });
  }

  return signals;
}

export function detectCorrelations(context: BriefInputContext): CorrelationResult {
  const corroborations = detectCorroborations(context);
  const contradictions = detectContradictions(context);
  const gaps = detectGaps(context);

  const signals = [...corroborations, ...contradictions, ...gaps];

  // Build text summary for injection into LLM context
  const lines: string[] = [];

  if (corroborations.length > 0) {
    lines.push("CORROBORATED:");
    for (const s of corroborations) lines.push(`  - ${s.summary}`);
  }

  if (contradictions.length > 0) {
    lines.push("CONTRADICTIONS:");
    for (const s of contradictions) lines.push(`  - ${s.summary}`);
  }

  if (gaps.length > 0) {
    lines.push("COVERAGE GAPS:");
    for (const s of gaps) lines.push(`  - ${s.summary}`);
  }

  return {
    signals,
    context_text: lines.length > 0 ? lines.join("\n") : "",
  };
}
