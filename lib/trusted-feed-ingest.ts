import { randomUUID } from "crypto";
import { OFFICIAL_SOURCES, type SourceDef } from "./sources";
import { pollOfficialXSignals } from "./x-signals";
import { fetchTrustedSourceDocument } from "./trusted-feed-fetch";
import { extractTrustedCandidates } from "./trusted-feed-adapters";
import {
  hasRecentPublishedEvent,
  insertTrustedFetchRun,
  insertTrustedSourceDocument,
  insertTrustedSourceEvent,
  upsertTrustedSourceHealth,
} from "./trusted-feed-repo";
import { computeTrustedEventHash, inferTrustedStatusLevel, qualifyTrustedCandidate, type TrustedCandidateEvent } from "./trusted-feed-quality";
import { isTrustedFeedCoreSource, TRUSTED_FEED_CORE_SOURCE_IDS } from "./trusted-feed-core-sources";

const HEATHROW_X_SOURCE_ID = "heathrow_airport_x";
const HEATHROW_X_SOURCE: SourceDef = {
  id: HEATHROW_X_SOURCE_ID,
  name: "Heathrow Airport (Official X)",
  category: "transport",
  url: "https://x.com/HeathrowAirport",
  parser: "html",
  connector: "api",
  extractor_id: "html_title_text",
  priority: 97,
  freshness_target_minutes: 5,
  region: "UK",
  x_handles: ["HeathrowAirport"],
};

export type TrustedSourceIngestResult = {
  source_id: string;
  run_id: string;
  fetch_status: "success" | "failed";
  fetch_error_code: string | null;
  published_count: number;
  rejected_count: number;
  health_state: "healthy" | "degraded" | "failing" | "unknown";
  skipped?: boolean;
  reason?: string;
};

function logStage(event: string, payload: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      type: "trusted_feed_v2",
      event,
      at: new Date().toISOString(),
      ...payload,
    }),
  );
}

function getSourceById(sourceId: string) {
  return OFFICIAL_SOURCES.find((source) => source.id === sourceId) ?? null;
}

async function persistCandidates(input: {
  source_id: string;
  run_id: string;
  candidates: TrustedCandidateEvent[];
  normalized_text: string;
  parse_threshold: number;
  fallback_url: string;
  fallback_headline: string;
  fallback_time: string;
}): Promise<{ published_count: number; rejected_count: number; first_reject_reason: string | null }> {
  let publishedCount = 0;
  let rejectedCount = 0;
  let firstRejectReason: string | null = null;

  const candidates = input.candidates;
  if (candidates.length === 0) {
    const eventHash = computeTrustedEventHash({
      source_id: input.source_id,
      headline: input.fallback_headline,
      summary: "Adapter produced no candidate events",
      original_url: input.fallback_url,
    });
    await insertTrustedSourceEvent({
      source_id: input.source_id,
      run_id: input.run_id,
      event_time: input.fallback_time,
      headline: input.fallback_headline,
      summary: "Adapter produced no candidate events",
      original_url: input.fallback_url,
      evidence_excerpt: "Adapter produced no candidate events",
      event_hash: eventHash,
      quality_state: "rejected",
      quality_reason: "adapter_no_candidates",
      parse_confidence: 0,
      published_at: null,
      status_level: "unknown",
    });
    return {
      published_count: 0,
      rejected_count: 1,
      first_reject_reason: "adapter_no_candidates",
    };
  }

  for (const candidate of candidates) {
    const eventHash = computeTrustedEventHash({
      source_id: input.source_id,
      headline: candidate.headline,
      summary: candidate.summary,
      original_url: candidate.original_url,
    });
    const duplicateRecent = await hasRecentPublishedEvent(input.source_id, eventHash, 72);
    const decision = qualifyTrustedCandidate({
      source_id: input.source_id,
      candidate,
      normalized_text: input.normalized_text,
      parse_threshold: input.parse_threshold,
      duplicate_recent_event: duplicateRecent,
    });

    const publishedAt = decision.quality_state === "published" ? new Date().toISOString() : null;
    await insertTrustedSourceEvent({
      source_id: input.source_id,
      run_id: input.run_id,
      event_time: candidate.event_time,
      headline: candidate.headline,
      summary: candidate.summary,
      original_url: candidate.original_url,
      evidence_excerpt: candidate.evidence_excerpt,
      event_hash: decision.event_hash,
      quality_state: decision.quality_state,
      quality_reason: decision.quality_reason,
      parse_confidence: candidate.parse_confidence,
      published_at: publishedAt,
      status_level: decision.status_level,
    });

    if (decision.quality_state === "published") {
      publishedCount += 1;
    } else {
      rejectedCount += 1;
      if (!firstRejectReason) firstRejectReason = decision.quality_reason;
    }
  }

  return {
    published_count: publishedCount,
    rejected_count: rejectedCount,
    first_reject_reason: firstRejectReason,
  };
}

function toHealthState(publishedCount: number, rejectedCount: number): "healthy" | "degraded" | "failing" | "unknown" {
  if (publishedCount > 0) return "healthy";
  if (rejectedCount > 0) return "degraded";
  return "unknown";
}

async function ingestTrustedHeathrowX(): Promise<TrustedSourceIngestResult> {
  const sourceId = HEATHROW_X_SOURCE_ID;
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  logStage("source_ingest_started", { source_id: sourceId, run_id: runId, channel: "x" });

  try {
    const signals = await pollOfficialXSignals([HEATHROW_X_SOURCE], { translateLimitPerHandle: 2 });
    const completedAt = new Date().toISOString();

    await insertTrustedFetchRun({
      run_id: runId,
      source_id: sourceId,
      started_at: startedAt,
      completed_at: completedAt,
      http_status: null,
      fetch_status: "success",
      error_code: null,
      error_detail: null,
      artifact_url: HEATHROW_X_SOURCE.url,
      duration_ms: Math.max(1, new Date(completedAt).getTime() - new Date(startedAt).getTime()),
    });

    const normalizedBundle = signals
      .map((signal) => signal.text_en ?? signal.text_original ?? signal.text)
      .join("\n\n")
      .slice(0, 50000);

    await insertTrustedSourceDocument({
      run_id: runId,
      source_id: sourceId,
      content_type: "text",
      raw_text: normalizedBundle,
      normalized_text: normalizedBundle,
      fetched_at: completedAt,
      source_url: HEATHROW_X_SOURCE.url,
    });

    const candidates: TrustedCandidateEvent[] = signals
      .sort((a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime())
      .slice(0, 3)
      .map((signal) => {
        const text = (signal.text_en ?? signal.text_original ?? signal.text).replace(/\s+/g, " ").trim();
        const evidence = text.slice(0, 220);
        return {
          event_time: signal.posted_at,
          headline: `@${signal.handle} operational update`,
          summary: text.slice(0, 1200),
          original_url: signal.url,
          evidence_excerpt: evidence,
          parse_confidence: signal.keywords.length > 0 ? Math.max(0.7, signal.confidence) : Math.max(0.55, signal.confidence),
          status_level: inferTrustedStatusLevel(text),
        };
      });

    const persisted = await persistCandidates({
      source_id: sourceId,
      run_id: runId,
      candidates,
      normalized_text: normalizedBundle,
      parse_threshold: 0.55,
      fallback_url: HEATHROW_X_SOURCE.url,
      fallback_headline: "@HeathrowAirport operational update",
      fallback_time: completedAt,
    });

    const healthState = toHealthState(persisted.published_count, persisted.rejected_count);
    await upsertTrustedSourceHealth({
      source_id: sourceId,
      latest_run_at: completedAt,
      latest_success_at: completedAt,
      last_publish_at: persisted.published_count > 0 ? new Date().toISOString() : null,
      health_state: healthState,
      health_reason: persisted.published_count > 0 ? null : persisted.first_reject_reason ?? "no_publishable_events",
      run_was_failure: persisted.published_count === 0,
    });

    logStage("source_ingest_completed", {
      source_id: sourceId,
      run_id: runId,
      channel: "x",
      published_count: persisted.published_count,
      rejected_count: persisted.rejected_count,
      health_state: healthState,
    });

    return {
      source_id: sourceId,
      run_id: runId,
      fetch_status: "success",
      fetch_error_code: null,
      published_count: persisted.published_count,
      rejected_count: persisted.rejected_count,
      health_state: healthState,
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const errDetail = String(error).slice(0, 400);

    await insertTrustedFetchRun({
      run_id: runId,
      source_id: sourceId,
      started_at: startedAt,
      completed_at: completedAt,
      http_status: null,
      fetch_status: "failed",
      error_code: "x_poll_failed",
      error_detail: errDetail,
      artifact_url: HEATHROW_X_SOURCE.url,
      duration_ms: Math.max(1, new Date(completedAt).getTime() - new Date(startedAt).getTime()),
    });

    await upsertTrustedSourceHealth({
      source_id: sourceId,
      latest_run_at: completedAt,
      latest_success_at: null,
      last_publish_at: null,
      health_state: "failing",
      health_reason: "x_poll_failed",
      run_was_failure: true,
    });

    return {
      source_id: sourceId,
      run_id: runId,
      fetch_status: "failed",
      fetch_error_code: "x_poll_failed",
      published_count: 0,
      rejected_count: 0,
      health_state: "failing",
      reason: errDetail,
    };
  }
}

async function ingestTrustedOfficialSource(source: SourceDef): Promise<TrustedSourceIngestResult> {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  logStage("source_ingest_started", { source_id: source.id, run_id: runId });

  const fetchResult = await fetchTrustedSourceDocument(source);
  const completedAt = new Date().toISOString();

  await insertTrustedFetchRun({
    run_id: runId,
    source_id: source.id,
    started_at: startedAt,
    completed_at: completedAt,
    http_status: fetchResult.http_status,
    fetch_status: fetchResult.fetch_status,
    error_code: fetchResult.error_code,
    error_detail: fetchResult.error_detail,
    artifact_url: fetchResult.artifact_url,
    duration_ms: fetchResult.duration_ms,
  });

  if (fetchResult.fetch_status === "failed") {
    await upsertTrustedSourceHealth({
      source_id: source.id,
      latest_run_at: completedAt,
      latest_success_at: null,
      last_publish_at: null,
      health_state: "failing",
      health_reason: fetchResult.error_code ?? "fetch_failed",
      run_was_failure: true,
    });

    return {
      source_id: source.id,
      run_id: runId,
      fetch_status: "failed",
      fetch_error_code: fetchResult.error_code,
      published_count: 0,
      rejected_count: 0,
      health_state: "failing",
    };
  }

  await insertTrustedSourceDocument({
    run_id: runId,
    source_id: source.id,
    content_type: fetchResult.content_type,
    raw_text: fetchResult.raw_text,
    normalized_text: fetchResult.normalized_text,
    fetched_at: completedAt,
    source_url: fetchResult.source_url,
  });

  const adapter = extractTrustedCandidates({
    source,
    raw_text: fetchResult.raw_text,
    normalized_text: fetchResult.normalized_text,
    source_url: fetchResult.source_url,
    fetched_at: completedAt,
    content_type: fetchResult.content_type,
  });

  const persisted = await persistCandidates({
    source_id: source.id,
    run_id: runId,
    candidates: adapter.candidates,
    normalized_text: fetchResult.normalized_text,
    parse_threshold: adapter.parse_threshold,
    fallback_url: fetchResult.source_url,
    fallback_headline: source.name,
    fallback_time: completedAt,
  });

  const healthState = toHealthState(persisted.published_count, persisted.rejected_count);
  await upsertTrustedSourceHealth({
    source_id: source.id,
    latest_run_at: completedAt,
    latest_success_at: completedAt,
    last_publish_at: persisted.published_count > 0 ? new Date().toISOString() : null,
    health_state: healthState,
    health_reason: persisted.published_count > 0 ? null : persisted.first_reject_reason ?? "no_publishable_events",
    run_was_failure: persisted.published_count === 0,
  });

  logStage("source_ingest_completed", {
    source_id: source.id,
    run_id: runId,
    published_count: persisted.published_count,
    rejected_count: persisted.rejected_count,
    health_state: healthState,
  });

  return {
    source_id: source.id,
    run_id: runId,
    fetch_status: "success",
    fetch_error_code: null,
    published_count: persisted.published_count,
    rejected_count: persisted.rejected_count,
    health_state: healthState,
  };
}

export async function ingestTrustedSourceById(sourceId: string): Promise<TrustedSourceIngestResult> {
  if (!isTrustedFeedCoreSource(sourceId)) {
    return {
      source_id: sourceId,
      run_id: randomUUID(),
      fetch_status: "success",
      fetch_error_code: null,
      published_count: 0,
      rejected_count: 0,
      health_state: "unknown",
      skipped: true,
      reason: "Source disabled for trusted-feed core set",
    };
  }

  if (sourceId === HEATHROW_X_SOURCE_ID) {
    return ingestTrustedHeathrowX();
  }

  const source = getSourceById(sourceId);
  if (!source) {
    return {
      source_id: sourceId,
      run_id: randomUUID(),
      fetch_status: "failed",
      fetch_error_code: "unknown_source",
      published_count: 0,
      rejected_count: 0,
      health_state: "unknown",
      skipped: true,
      reason: `Unknown source: ${sourceId}`,
    };
  }

  return ingestTrustedOfficialSource(source);
}

export async function runTrustedFeedIngestion(opts?: { sourceIds?: string[] }) {
  const sourceIds = opts?.sourceIds?.length
    ? opts.sourceIds.filter((sourceId) => isTrustedFeedCoreSource(sourceId))
    : [...TRUSTED_FEED_CORE_SOURCE_IDS];

  const results: TrustedSourceIngestResult[] = [];
  for (const sourceId of sourceIds) {
    try {
      const result = await ingestTrustedSourceById(sourceId);
      results.push(result);
    } catch (error) {
      results.push({
        source_id: sourceId,
        run_id: randomUUID(),
        fetch_status: "failed",
        fetch_error_code: "ingest_exception",
        published_count: 0,
        rejected_count: 0,
        health_state: "failing",
        reason: String(error),
      });
    }
  }

  const published = results.reduce((sum, row) => sum + row.published_count, 0);
  const rejected = results.reduce((sum, row) => sum + row.rejected_count, 0);
  const failed = results.filter((row) => row.fetch_status === "failed").length;

  return {
    ok: true,
    source_count: sourceIds.length,
    published_count: published,
    rejected_count: rejected,
    failed_count: failed,
    results,
    fetched_at: new Date().toISOString(),
  };
}
