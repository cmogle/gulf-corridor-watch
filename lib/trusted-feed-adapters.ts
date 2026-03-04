import { XMLParser } from "fast-xml-parser";
import type { SourceDef } from "./sources";
import { extractHtmlSnapshot } from "./source-extractors";
import { sanitizeSourceText } from "./source-quality";
import { inferTrustedStatusLevel, type TrustedCandidateEvent } from "./trusted-feed-quality";

const parser = new XMLParser({ ignoreAttributes: false });

const SOURCE_PARSE_THRESHOLDS: Record<string, number> = {
  emirates_updates: 0.7,
  etihad_advisory: 0.7,
  air_arabia_updates: 0.7,
  oman_air: 0.72,
  us_state_dept_travel: 0.8,
  uk_fcdo_uae: 0.8,
  flydubai_updates: 0.72,
};
const STRICT_EVENT_BLOCK_SOURCES = new Set([
  "emirates_updates",
  "etihad_advisory",
  "air_arabia_updates",
  "oman_air",
  "flydubai_updates",
]);
const OPERATIONAL_CONTEXT_TERMS = [
  "flight",
  "flights",
  "airline",
  "airport",
  "airspace",
  "terminal",
  "departure",
  "arrival",
  "passenger",
  "route",
  "travel",
];
const IMPACT_TERMS = [
  "delay",
  "delayed",
  "cancel",
  "cancelled",
  "suspend",
  "suspended",
  "disruption",
  "disrupted",
  "closure",
  "closed",
  "reroute",
  "diversion",
  "rebook",
  "refund",
  "waiver",
];
const NOISE_TERMS = [
  "what are you looking for",
  "manage booking",
  "book now",
  "book a flight",
  "frequently asked questions",
  "faq",
  "children travelling alone",
  "the extraordinary challenge",
  "oops",
  "page does not exist",
  "page doesn't exist",
  "english",
  "arabic",
  "russian",
];

type AdapterInput = {
  source: SourceDef;
  raw_text: string;
  normalized_text: string;
  source_url: string;
  fetched_at: string;
  content_type: "html" | "rss";
};

export type AdapterOutput = {
  parse_threshold: number;
  candidates: TrustedCandidateEvent[];
};

function toIsoOrFallback(input: string | null | undefined, fallbackIso: string): string {
  if (!input) return fallbackIso;
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return fallbackIso;
  return parsed.toISOString();
}

function compact(text: string, max = 1000): string {
  return sanitizeSourceText(text).slice(0, max);
}

function firstMeaningfulSentence(text: string, minLen = 40): string {
  const segments = compact(text, 2000)
    .split(/(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= minLen);
  return segments[0] ?? compact(text, 200);
}

function stripHtmlTags(input: string): string {
  return compact(input.replace(/<[^>]+>/g, " "), 1500);
}

function splitSegments(text: string): string[] {
  return compact(text, 12000)
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((segment) => compact(segment, 500))
    .filter((segment) => segment.length >= 30);
}

function hasAny(text: string, terms: string[]): boolean {
  const normalized = text.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function isLikelyNoise(segment: string): boolean {
  const normalized = segment.toLowerCase();
  if (normalized.length < 30) return true;
  if (hasAny(normalized, NOISE_TERMS)) return true;
  return false;
}

function extractOperationalBlocks(text: string, maxBlocks = 3): string[] {
  const segments = splitSegments(text);
  const results: string[] = [];
  const seen = new Set<string>();

  for (const segment of segments) {
    const normalized = segment.toLowerCase();
    if (isLikelyNoise(normalized)) continue;
    if (!hasAny(normalized, OPERATIONAL_CONTEXT_TERMS)) continue;
    if (!hasAny(normalized, IMPACT_TERMS)) continue;
    const key = normalized.slice(0, 220);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(segment);
    if (results.length >= maxBlocks) break;
  }

  return results;
}

function parseRssPayload(raw: string): Record<string, unknown> | null {
  try {
    return parser.parse(raw) as Record<string, unknown>;
  } catch {
    const deCdata = raw.replace(/<!\[CDATA\[/gi, "").replace(/\]\]>/gi, "");
    try {
      return parser.parse(deCdata) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function readText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return readText(value[0]);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return (
      readText(record["#text"]) ||
      readText(record["__cdata"]) ||
      readText(record["content"]) ||
      readText(record["value"]) ||
      ""
    );
  }
  return "";
}

function readLink(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => readLink(item)).find(Boolean) ?? "";
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return (
      readText(record["@_href"]) ||
      readText(record["href"]) ||
      readText(record["url"]) ||
      readText(record["#text"]) ||
      ""
    );
  }
  return "";
}

function adaptRss(input: AdapterInput): AdapterOutput {
  const parsed = parseRssPayload(input.raw_text);
  if (!parsed) {
    return {
      parse_threshold: SOURCE_PARSE_THRESHOLDS[input.source.id] ?? 0.75,
      candidates: [
        {
          event_time: input.fetched_at,
          headline: input.source.name,
          summary: "RSS payload parse failed due to malformed XML; event rejected until source recovers.",
          original_url: input.source_url,
          evidence_excerpt: "RSS payload parse failed due to malformed XML",
          parse_confidence: 0.1,
          status_level: "unknown",
        },
      ],
    };
  }

  const rss = parsed["rss"] as Record<string, unknown> | undefined;
  const feed = parsed["feed"] as Record<string, unknown> | undefined;
  const channel = (rss?.["channel"] as Record<string, unknown> | undefined) ?? feed;
  const rawItems = channel?.["item"] ?? channel?.["entry"];
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

  if (items.length === 0) {
    return {
      parse_threshold: SOURCE_PARSE_THRESHOLDS[input.source.id] ?? 0.75,
      candidates: [
        {
          event_time: input.fetched_at,
          headline: input.source.name,
          summary: "No parsable RSS items found in latest source fetch.",
          original_url: input.source_url,
          evidence_excerpt: "No parsable RSS items found",
          parse_confidence: 0.2,
          status_level: "unknown",
        },
      ],
    };
  }

  const top = items[0] as Record<string, unknown>;
  const title = compact(readText(top.title ?? top["atom:title"]) || input.source.name, 220);
  const descRaw = readText(top.description ?? top.summary ?? top.content ?? top["content:encoded"]);
  const summary = compact(stripHtmlTags(descRaw), 900);
  const link = compact(readLink(top.link) || input.source_url, 1000);
  const pub = readText(top.pubDate ?? top.published ?? top.updated ?? top["dc:date"]);

  const parseConfidence = summary.length >= 100 ? 0.92 : summary.length >= 60 ? 0.82 : 0.6;
  const evidence = firstMeaningfulSentence(summary, 30);

  return {
    parse_threshold: SOURCE_PARSE_THRESHOLDS[input.source.id] ?? 0.75,
    candidates: [
      {
        event_time: toIsoOrFallback(pub, input.fetched_at),
        headline: title,
        summary,
        original_url: /^https?:\/\//i.test(link) ? link : input.source_url,
        evidence_excerpt: evidence,
        parse_confidence: parseConfidence,
        status_level: inferTrustedStatusLevel(`${title} ${summary}`),
      },
    ],
  };
}

function adaptHtml(input: AdapterInput): AdapterOutput {
  const looksLikeHtml = /<html|<head|<body|<div|<p|<h1|<h2/i.test(input.raw_text);

  if (!looksLikeHtml) {
    const lines = input.raw_text
      .split("\n")
      .map((line) => compact(line, 300))
      .filter((line) => line.length > 20);
    const headline = lines[0] ? compact(lines[0], 200) : input.source.name;
    const summary = compact(lines.slice(0, 6).join(" "), 1000);

    return {
      parse_threshold: SOURCE_PARSE_THRESHOLDS[input.source.id] ?? 0.72,
      candidates: [
        {
          event_time: input.fetched_at,
          headline,
          summary,
          original_url: input.source_url,
          evidence_excerpt: firstMeaningfulSentence(summary, 25),
          parse_confidence: summary.length >= 120 ? 0.78 : summary.length >= 80 ? 0.7 : 0.45,
          status_level: inferTrustedStatusLevel(`${headline} ${summary}`),
        },
      ],
    };
  }

  const extracted = extractHtmlSnapshot(input.source, input.raw_text);
  const headline = compact(extracted.title || input.source.name, 220);
  const fallbackSummary = compact(extracted.summary || "", 1000);
  const blocks = extractOperationalBlocks(`${fallbackSummary}\n${input.normalized_text}`, 3);
  const summary = blocks.length > 0 ? compact(blocks.join(" "), 1000) : fallbackSummary;
  const evidence = blocks[0] ? compact(blocks[0], 220) : firstMeaningfulSentence(extracted.raw_text || summary, 30);

  let parseConfidence = extracted.unusable ? 0.25 : summary.length >= 140 ? 0.9 : summary.length >= 90 ? 0.8 : 0.6;
  if (blocks.length > 0) {
    parseConfidence = Math.max(parseConfidence, 0.86);
  } else if (STRICT_EVENT_BLOCK_SOURCES.has(input.source.id)) {
    parseConfidence = Math.min(parseConfidence, 0.45);
  }

  return {
    parse_threshold: SOURCE_PARSE_THRESHOLDS[input.source.id] ?? 0.72,
    candidates: [
      {
        event_time: toIsoOrFallback(extracted.published_at, input.fetched_at),
        headline,
        summary,
        original_url: input.source_url,
        evidence_excerpt: compact(evidence || summary, 220),
        parse_confidence: parseConfidence,
        status_level: inferTrustedStatusLevel(`${headline} ${summary}`),
      },
    ],
  };
}

export function extractTrustedCandidates(input: AdapterInput): AdapterOutput {
  if (input.content_type === "rss") {
    return adaptRss(input);
  }
  return adaptHtml(input);
}
