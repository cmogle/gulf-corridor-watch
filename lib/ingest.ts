import { XMLParser } from "fast-xml-parser";
import { OFFICIAL_SOURCES, SourceDef } from "./sources";
import { getSupabaseAdmin } from "./supabase";
import { ingestAirports } from "./flightradar";

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
};

const parser = new XMLParser({ ignoreAttributes: false });

function inferLevel(text: string): Snapshot["status_level"] {
  const t = text.toLowerCase();
  if (/(cancel|suspend|closed|disrupt|delay|incident|warning|advisory)/.test(t)) return "advisory";
  if (/(outage|grounded|shutdown|severe|evacuat)/.test(t)) return "disrupted";
  if (!text.trim()) return "unknown";
  return "normal";
}

async function fetchRss(source: SourceDef): Promise<Snapshot> {
  const res = await fetch(source.url, { cache: "no-store" });
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
  };
}

async function fetchHtml(source: SourceDef): Promise<Snapshot> {
  const res = await fetch(source.url, { cache: "no-store" });
  const html = await res.text();
  const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.trim() ?? source.name;
  const stripped = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  return {
    source_id: source.id,
    source_name: source.name,
    source_url: source.url,
    category: source.category,
    fetched_at: new Date().toISOString(),
    published_at: null,
    title,
    summary: stripped.slice(0, 1000),
    raw_text: stripped.slice(0, 10000),
    status_level: inferLevel(`${title} ${stripped.slice(0, 1200)}`),
  };
}

export async function runIngestion() {
  const supabase = getSupabaseAdmin();
  const snapshots: Snapshot[] = [];
  let flightCount = 0;
  let flightError: string | null = null;

  for (const source of OFFICIAL_SOURCES) {
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
      });
    }
  }

  const { error } = await supabase.from("source_snapshots").insert(snapshots);
  if (error) throw error;

  if (process.env.FLIGHTRADAR_KEY) {
    try {
      const flights = await ingestAirports(["DXB", "AUH"]);
      if (flights.length > 0) {
        const { error: flightInsertError } = await supabase.from("flight_observations").insert(flights);
        if (flightInsertError) throw flightInsertError;
      }
      flightCount = flights.length;
    } catch (error) {
      flightError = String(error);
    }
  }

  return { count: snapshots.length, snapshots, flight_count: flightCount, flight_error: flightError };
}
