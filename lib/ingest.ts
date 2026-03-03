import { XMLParser } from "fast-xml-parser";
import { OFFICIAL_SOURCES, SourceDef } from "./sources";
import { getSupabaseAdmin } from "./supabase";
import { ingestAirports } from "./flightradar";
import { fetchViaChromeRelay } from "./chrome-relay";
import { pollOfficialXSignals } from "./x-signals";

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
};

const parser = new XMLParser({ ignoreAttributes: false });
const BLOCK_PATTERNS = [/access denied/i, /request rejected/i, /forbidden/i, /captcha/i, /attention required/i, /sorry for the inconvenience/i];
const CRITICAL_SOURCE_IDS = new Set(["emirates_updates", "etihad_advisory", "oman_air", "rta_dubai", "uae_mofa"]);
const AIRPORTS = ["DXB", "AUH"] as const;

type IngestScope = "full" | "airline";

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

function extractTitleAndSummary(source: SourceDef, html: string): { title: string; summary: string; raw_text: string } {
  const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.trim() ?? source.name;
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const signalMatch = stripped.match(/(travel updates?|alerts?|advisories?|service updates?|news)[^.?!]{0,260}[.?!]?/i);
  const summary = (signalMatch?.[0] ?? stripped).slice(0, 1000);
  return { title, summary, raw_text: stripped.slice(0, 10000) };
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

  const extracted = extractTitleAndSummary(source, html);
  const reliability = inferReliability(extracted.raw_text, httpStatus);
  const blockReason = reliability === "blocked" ? "Source indicates anti-bot or access block" : null;

  return {
    source_id: source.id,
    source_name: source.name,
    source_url: sourceUrl,
    category: source.category,
    fetched_at: new Date().toISOString(),
    published_at: null,
    title: extracted.title,
    summary: extracted.summary,
    raw_text: extracted.raw_text,
    status_level: inferLevel(`${extracted.title} ${extracted.summary}`),
    ingest_method: method,
    reliability,
    block_reason: blockReason,
    priority: source.priority,
    freshness_target_minutes: source.freshness_target_minutes,
    evidence_basis: method === "relay" ? "relay" : "official_web",
    confirmation_state: "confirmed",
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
  let flightCount = 0;
  let flightError: string | null = null;
  let signalCount = 0;
  let signalError: string | null = null;

  for (const source of sources) {
    try {
      const snap = source.parser === "rss" ? await fetchRss(source) : await fetchHtml(source);
      snapshots.push(snap);
    } catch (error) {
      snapshots.push({
        source_id: source.id,
        source_name: source.name,
        source_url: source.url,
        category: source.category,
        fetched_at: new Date().toISOString(),
        published_at: null,
        title: `${source.name} fetch error`,
        summary: String(error),
        raw_text: "",
        status_level: "unknown",
        ingest_method: source.parser === "rss" ? "rss" : "official_web",
        reliability: /403|401|429|denied|rejected|forbidden/i.test(String(error)) ? "blocked" : "degraded",
        block_reason: /denied|rejected|forbidden|captcha/i.test(String(error)) ? String(error).slice(0, 200) : null,
        priority: source.priority,
        freshness_target_minutes: source.freshness_target_minutes,
        evidence_basis: source.parser === "rss" ? "rss" : "official_web",
        confirmation_state: "confirmed",
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
      if (socialSignals.length > 0) {
        const { error: socialErr } = await supabase
          .from("social_signals")
          .upsert(socialSignals, { onConflict: "provider,handle,post_id", ignoreDuplicates: true });
        if (socialErr) throw socialErr;
      }
      signalCount = socialSignals.length;
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
  };
}
