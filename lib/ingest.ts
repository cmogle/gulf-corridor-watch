import { XMLParser } from "fast-xml-parser";
import { OFFICIAL_SOURCES, SourceDef } from "./sources";
import { getSupabaseAdmin } from "./supabase";
import { ingestAirports } from "./flightradar";
import { fetchViaChromeRelay } from "./chrome-relay";
import { pollOfficialXSignals } from "./x-signals";
import { extractHtmlSnapshot } from "./source-extractors";
import {
  computeUpdateContentHash,
  getValidationMaxPerIngest,
  validateOfficialUpdate,
  ValidationMetadata,
} from "./update-validation";

type Snapshot = {
  source_id: string;
  source_name: string;
  source_url: string;
  category: string;
  fetched_at: string;
  published_at: string | null;
  title: string;
  summary: string;
  raw_text: string;
  status_level: "normal" | "advisory" | "disrupted" | "unknown";
  ingest_method: "api" | "official_web" | "rss" | "relay";
  reliability: "reliable" | "degraded" | "blocked";
  block_reason: string | null;
  priority: number;
  freshness_target_minutes: number;
  evidence_basis: "api" | "official_web" | "rss" | "relay" | "x+official";
  confirmation_state: "confirmed" | "unconfirmed_social";
  content_hash: string | null;
  validation_state: ValidationMetadata["validation_state"];
  validation_score: number | null;
  validation_reason: string | null;
  validation_model: string | null;
  validated_at: string | null;
};

const parser = new XMLParser({ ignoreAttributes: false });
const BLOCK_PATTERNS = [/access denied/i, /request rejected/i, /forbidden/i, /captcha/i, /attention required/i, /sorry for the inconvenience/i];
const CRITICAL_SOURCE_IDS = new Set(["emirates_updates", "etihad_advisory", "oman_air", "rta_dubai", "uae_mofa"]);
const AIRPORTS = ["DXB", "AUH"] as const;

type IngestScope = "full" | "airline";

type ExistingSnapshotMeta = {
  source_id: string;
  content_hash: string | null;
  validation_state: ValidationMetadata["validation_state"];
  validation_score: number | null;
  validation_reason: string | null;
  validation_model: string | null;
  validated_at: string | null;
  fetched_at: string;
};

function skippedValidation(reason: string): ValidationMetadata {
  return {
    validation_state: "skipped",
    validation_score: null,
    validation_reason: reason.slice(0, 400),
    validation_model: null,
    validated_at: null,
  };
}

function withValidation(snapshot: Snapshot, hash: string, meta: ValidationMetadata): Snapshot {
  return {
    ...snapshot,
    content_hash: hash,
    validation_state: meta.validation_state,
    validation_score: meta.validation_score,
    validation_reason: meta.validation_reason,
    validation_model: meta.validation_model,
    validated_at: meta.validated_at,
  };
}

async function loadLatestSnapshotValidationBySource(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  sourceIds: string[],
): Promise<Map<string, ExistingSnapshotMeta>> {
  if (sourceIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("source_snapshots")
    .select("source_id,content_hash,validation_state,validation_score,validation_reason,validation_model,validated_at,fetched_at")
    .in("source_id", sourceIds)
    .order("fetched_at", { ascending: false })
    .limit(Math.max(200, sourceIds.length * 15));
  if (error) return new Map();

  const latest = new Map<string, ExistingSnapshotMeta>();
  for (const row of (data ?? []) as ExistingSnapshotMeta[]) {
    if (!latest.has(row.source_id)) latest.set(row.source_id, row);
  }
  return latest;
}

function getXPollIntervalMinutes(): number {
  const raw = process.env.X_MIN_POLL_MINUTES ?? process.env.X_POLL_INTERVAL_MINUTES;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
  return process.env.NODE_ENV === "development" ? 120 : 15;
}

async function shouldPollX(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<{ poll: boolean; reason: string | null }> {
  const intervalMins = getXPollIntervalMinutes();
  const cutoff = new Date(Date.now() - intervalMins * 60_000).toISOString();
  const { data, error } = await supabase
    .from("social_signals")
    .select("fetched_at")
    .eq("provider", "x")
    .gte("fetched_at", cutoff)
    .order("fetched_at", { ascending: false })
    .limit(1);
  if (error) return { poll: true, reason: null };
  if ((data ?? []).length === 0) return { poll: true, reason: null };
  return { poll: false, reason: `X polling throttled by X_MIN_POLL_MINUTES=${intervalMins}` };
}

function inferLevel(text: string): Snapshot["status_level"] {
  const t = text.toLowerCase();
  if (/(outage|grounded|shutdown|severe|evacuat)/.test(t)) return "disrupted";
  if (/(cancel|suspend|closed|disrupt|delay|incident|warning|advisory)/.test(t)) return "advisory";
  if (!text.trim()) return "unknown";
  return "normal";
}

function inferReliability(text: string, status = 200): Snapshot["reliability"] {
  if (status >= 500) return "degraded";
  if (status === 401 || status === 403 || status === 429) return "blocked";
  if (BLOCK_PATTERNS.some((r) => r.test(text))) return "blocked";
  return "reliable";
}

async function fetchRss(source: SourceDef): Promise<Snapshot> {
  const res = await fetch(source.url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`RSS fetch failed (${res.status})`);
  }
  const xml = await res.text();
  const parsed = parser.parse(xml);
  const item = parsed?.rss?.channel?.item?.[0] ?? parsed?.rss?.channel?.item;

  const title = item?.title ?? source.name;
  const summary = item?.description?.toString().slice(0, 1000) ?? "";
  const published = item?.pubDate ? new Date(item.pubDate).toISOString() : null;

  return {
    source_id: source.id,
    source_name: source.name,
    source_url: source.url,
    category: source.category,
    fetched_at: new Date().toISOString(),
    published_at: published,
    title: String(title),
    summary,
    raw_text: xml.slice(0, 10000),
    status_level: inferLevel(`${title} ${summary}`),
    ingest_method: "rss",
    reliability: inferReliability(xml, res.status),
    block_reason: null,
    priority: source.priority,
    freshness_target_minutes: source.freshness_target_minutes,
    evidence_basis: "rss",
    confirmation_state: "confirmed",
    content_hash: null,
    validation_state: "unvalidated",
    validation_score: null,
    validation_reason: null,
    validation_model: null,
    validated_at: null,
  };
}

async function fetchHtml(source: SourceDef): Promise<Snapshot> {
  let html = "";
  let sourceUrl = source.url;
  let method: Snapshot["ingest_method"] = "official_web";
  let httpStatus = 200;
  try {
    const res = await fetch(source.url, { cache: "no-store" });
    httpStatus = res.status;
    html = await res.text();
    sourceUrl = res.url || source.url;
    const reliability = inferReliability(html, res.status);
    if (!res.ok || reliability === "blocked") {
      throw new Error(`Direct HTML fetch ${res.status} (${reliability})`);
    }
  } catch (error) {
    if (source.fallback_connector === "chrome_relay") {
      const relayed = await fetchViaChromeRelay(source.url);
      html = relayed.html;
      sourceUrl = relayed.sourceUrl;
      method = "relay";
      httpStatus = 200;
    } else {
      throw error;
    }
  }

  const extracted = extractHtmlSnapshot(source, html);
  let reliability = inferReliability(extracted.raw_text, httpStatus);
  if (extracted.unusable && reliability === "reliable") reliability = "degraded";
  const blockReason =
    reliability === "blocked"
      ? "Source indicates anti-bot or access block"
      : extracted.unusable
        ? "Unusable content extracted from source page"
        : null;
  const summary = extracted.unusable
    ? "Source page content was unavailable or non-usable in this fetch. Open Official source for live details."
    : extracted.summary;
  const statusLevel = extracted.unusable ? "unknown" : inferLevel(`${extracted.title} ${summary}`);

  return {
    source_id: source.id,
    source_name: source.name,
    source_url: sourceUrl,
    category: source.category,
    fetched_at: new Date().toISOString(),
    published_at: extracted.published_at,
    title: extracted.title,
    summary,
    raw_text: extracted.raw_text,
    status_level: statusLevel,
    ingest_method: method,
    reliability,
    block_reason: blockReason,
    priority: source.priority,
    freshness_target_minutes: source.freshness_target_minutes,
    evidence_basis: method === "relay" ? "relay" : "official_web",
    confirmation_state: "confirmed",
    content_hash: null,
    validation_state: "unvalidated",
    validation_score: null,
    validation_reason: null,
    validation_model: null,
    validated_at: null,
  };
}

function getSourcesForScope(scope: IngestScope): SourceDef[] {
  if (scope === "airline") {
    return OFFICIAL_SOURCES.filter((source) => CRITICAL_SOURCE_IDS.has(source.id) || source.priority >= 90);
  }
  return OFFICIAL_SOURCES;
}

export async function runIngestion(opts?: { scope?: IngestScope }) {
  const scope = opts?.scope ?? "full";
  const supabase = getSupabaseAdmin();
  const snapshots: Snapshot[] = [];
  const sources = getSourcesForScope(scope);
  const latestSnapshotValidation = await loadLatestSnapshotValidationBySource(
    supabase,
    sources.map((source) => source.id),
  );
  const validationBudget = getValidationMaxPerIngest();
  let validationRuns = 0;
  let flightCount = 0;
  let flightError: string | null = null;
  let signalCount = 0;
  let signalError: string | null = null;
  let signalSkipped = false;
  let signalSkipReason: string | null = null;

  async function validateSnapshot(snapshot: Snapshot): Promise<Snapshot> {
    const contentHash = computeUpdateContentHash({
      source_id: snapshot.source_id,
      update_type: "snapshot",
      headline: snapshot.title,
      summary: snapshot.summary,
      original_url: snapshot.source_url,
    });
    const previous = latestSnapshotValidation.get(snapshot.source_id);
    if (previous?.content_hash && previous.content_hash === contentHash) {
      return withValidation(snapshot, contentHash, {
        validation_state: previous.validation_state,
        validation_score: previous.validation_score,
        validation_reason: previous.validation_reason,
        validation_model: previous.validation_model,
        validated_at: previous.validated_at,
      });
    }

    if (/fetch error/i.test(snapshot.title)) {
      return withValidation(snapshot, contentHash, skippedValidation("Skipped GPT validation for fetch-error snapshot"));
    }
    if (validationRuns >= validationBudget) {
      return withValidation(snapshot, contentHash, skippedValidation(`Validation budget reached (${validationBudget} items)`));
    }

    validationRuns += 1;
    const validation = await validateOfficialUpdate({
      source_id: snapshot.source_id,
      update_type: "snapshot",
      headline: snapshot.title,
      summary: snapshot.summary,
      original_url: snapshot.source_url,
      raw_text: snapshot.raw_text,
    });
    return withValidation(snapshot, contentHash, validation);
  }

  for (const source of sources) {
    try {
      const snap = source.parser === "rss" ? await fetchRss(source) : await fetchHtml(source);
      const validated = await validateSnapshot(snap);
      snapshots.push(validated);
      latestSnapshotValidation.set(source.id, {
        source_id: source.id,
        content_hash: validated.content_hash,
        validation_state: validated.validation_state,
        validation_score: validated.validation_score,
        validation_reason: validated.validation_reason,
        validation_model: validated.validation_model,
        validated_at: validated.validated_at,
        fetched_at: validated.fetched_at,
      });
    } catch (error) {
      const errorText = String(error);
      const blocked = /403|401|429|denied|rejected|forbidden|captcha/i.test(errorText);
      const failureSnapshot: Snapshot = {
        source_id: source.id,
        source_name: source.name,
        source_url: source.url,
        category: source.category,
        fetched_at: new Date().toISOString(),
        published_at: null,
        title: `${source.name} fetch error`,
        summary: blocked
          ? "Source currently blocked or challenge-protected. Open Official source for live details."
          : "Source fetch failed during ingestion. Open Official source for live details.",
        raw_text: "",
        status_level: "unknown",
        ingest_method: source.parser === "rss" ? "rss" : "official_web",
        reliability: blocked ? "blocked" : "degraded",
        block_reason: blocked ? errorText.slice(0, 200) : null,
        priority: source.priority,
        freshness_target_minutes: source.freshness_target_minutes,
        evidence_basis: source.parser === "rss" ? "rss" : "official_web",
        confirmation_state: "confirmed",
        content_hash: null,
        validation_state: "unvalidated",
        validation_score: null,
        validation_reason: null,
        validation_model: null,
        validated_at: null,
      };
      const validated = await validateSnapshot(failureSnapshot);
      snapshots.push(validated);
      latestSnapshotValidation.set(source.id, {
        source_id: source.id,
        content_hash: validated.content_hash,
        validation_state: validated.validation_state,
        validation_score: validated.validation_score,
        validation_reason: validated.validation_reason,
        validation_model: validated.validation_model,
        validated_at: validated.validated_at,
        fetched_at: validated.fetched_at,
      });
    }
  }

  const { error } = await supabase.from("source_snapshots").insert(snapshots);
  if (error) throw error;

  if (process.env.FLIGHTRADAR_KEY && (scope === "airline" || scope === "full")) {
    try {
      const flights = await ingestAirports([...AIRPORTS]);
      if (flights.length > 0) {
        const { error: flightInsertError } = await supabase.from("flight_observations").insert(flights);
        if (flightInsertError) throw flightInsertError;
      }
      flightCount = flights.length;
    } catch (error) {
      flightError = String(error);
    }
  }

  if (scope === "airline") {
    try {
      const pollDecision = await shouldPollX(supabase);
      if (!pollDecision.poll) {
        signalSkipped = true;
        signalSkipReason = pollDecision.reason;
      } else {
      const handles = Array.from(
        new Set(
          sources
            .flatMap((source) => source.x_handles ?? [])
            .map((h) => h.replace(/^@+/, "").toLowerCase().trim())
            .filter(Boolean),
        ),
      );
      const knownPostIds = new Set<string>();
      if (handles.length > 0) {
        const { data: existingRows } = await supabase
          .from("social_signals")
          .select("handle,post_id")
          .eq("provider", "x")
          .in("handle", handles)
          .order("posted_at", { ascending: false })
          .limit(500);
        for (const row of existingRows ?? []) {
          knownPostIds.add(`${row.handle}:${row.post_id}`);
        }
      }

      const socialSignals = await pollOfficialXSignals(sources, { knownPostIds, translateLimitPerHandle: 3 });
      const freshSignals = socialSignals.filter((signal) => !knownPostIds.has(`${signal.handle}:${signal.post_id}`));
      type SocialSignalInsert = (typeof freshSignals)[number] & {
        content_hash: string | null;
        validation_state: ValidationMetadata["validation_state"];
        validation_score: number | null;
        validation_reason: string | null;
        validation_model: string | null;
        validated_at: string | null;
      };
      const validatedSignals: SocialSignalInsert[] = [];
      for (const signal of freshSignals) {
        const text = signal.text_en ?? signal.text_original ?? signal.text;
        const contentHash = computeUpdateContentHash({
          source_id: signal.linked_source_id,
          update_type: "x",
          headline: `@${signal.handle} on X`,
          summary: text,
          original_url: signal.url,
        });
        let validation: ValidationMetadata;
        if (validationRuns >= validationBudget) {
          validation = skippedValidation(`Validation budget reached (${validationBudget} items)`);
        } else {
          validationRuns += 1;
          validation = await validateOfficialUpdate({
            source_id: signal.linked_source_id,
            update_type: "x",
            headline: `@${signal.handle} on X`,
            summary: text,
            original_url: signal.url,
            raw_text: signal.text_original ?? signal.text,
          });
        }
        validatedSignals.push({
          ...signal,
          content_hash: contentHash,
          validation_state: validation.validation_state,
          validation_score: validation.validation_score,
          validation_reason: validation.validation_reason,
          validation_model: validation.validation_model,
          validated_at: validation.validated_at,
        });
      }

      if (validatedSignals.length > 0) {
        const { error: socialErr } = await supabase
          .from("social_signals")
          .upsert(validatedSignals, { onConflict: "provider,handle,post_id", ignoreDuplicates: true });
        if (socialErr) throw socialErr;
      }
      signalCount = validatedSignals.length;
      }
    } catch (error) {
      signalError = String(error);
    }
  }

  return {
    scope,
    count: snapshots.length,
    snapshots,
    flight_count: flightCount,
    flight_error: flightError,
    signal_count: signalCount,
    signal_error: signalError,
    signal_skipped: signalSkipped,
    signal_skip_reason: signalSkipReason,
    x_min_poll_minutes: getXPollIntervalMinutes(),
    validation_runs: validationRuns,
    validation_budget: validationBudget,
  };
}
