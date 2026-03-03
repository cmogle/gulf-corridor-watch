import type { SourceDef } from "./sources.ts";
import { isUnusableSourceText, sanitizeSourceText } from "./source-quality.ts";

type HtmlExtractResult = {
  title: string;
  summary: string;
  raw_text: string;
  published_at: string | null;
  unusable: boolean;
};

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x2F;|&#47;/gi, "/")
    .replace(/&lt;|&#60;/gi, "<")
    .replace(/&gt;|&#62;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}


/**
 * Strip the structured prefix that Jina reader (r.jina.ai) prepends to markdown output.
 * Only strips when these lines appear at the very start of the text.
 */
export function stripJinaPrefix(text: string): string {
  if (!text.startsWith("Title: ")) return text;
  const stripped = text
    .replace(/^Title:\s*[^\n]*\n?/, "")
    .replace(/^URL Source:\s*[^\n]*\n?/, "")
    .replace(/^Markdown Content:\s*\n?/, "");
  return stripped;
}

function stripHtml(input: string): string {
  const stripped = input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return sanitizeSourceText(decodeEntities(stripped));
}

function readTitleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) return null;
  return sanitizeSourceText(decodeEntities(match[1]));
}

function readMeta(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]*(?:name|property)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return sanitizeSourceText(decodeEntities(match[1]));
  }
  return null;
}

function readJsonLdTextCandidates(html: string): string[] {
  const candidates: string[] = [];
  const scripts = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of scripts) {
    const match = block.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    if (!match?.[1]) continue;
    const raw = match[1].trim();
    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        const headline = typeof record.headline === "string" ? sanitizeSourceText(record.headline) : null;
        const name = typeof record.name === "string" ? sanitizeSourceText(record.name) : null;
        const description = typeof record.description === "string" ? sanitizeSourceText(record.description) : null;
        const text = headline ?? name ?? description;
        if (text) candidates.push(text);
      }
    } catch {
      continue;
    }
  }
  return candidates;
}

/**
 * Extract heading text from Jina reader markdown output.
 * Handles both ATX headings (`#### Title`) and setext headings (underlined with --- or ===).
 * Used for SPA sites where Jina converts rendered DOM → readable markdown.
 */
function readJinaHeadings(text: string, limit = 12): string[] {
  const SKIP = /^(home|menu|search|skip|navigation|news center|about|contact|sitemap|feedback|login|language)/i;
  const out: string[] = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length && out.length < limit; i++) {
    const line = lines[i];
    const next = lines[i + 1] ?? "";

    // ATX-style: `### Heading Text`
    const atxMatch = line.match(/^#{1,4}\s+(.+)/);
    if (atxMatch) {
      const cleaned = sanitizeSourceText(decodeEntities(atxMatch[1].trim()));
      if (cleaned.length >= 16 && !SKIP.test(cleaned)) {
        out.push(cleaned);
        continue;
      }
    }

    // Setext-style: heading followed by `---` or `===` underline (MOFA uses this)
    if (/^[-=]{4,}\s*$/.test(next) && line.trim().length >= 20) {
      const cleaned = sanitizeSourceText(decodeEntities(line.trim()));
      if (!SKIP.test(cleaned)) {
        out.push(cleaned);
        i++; // skip the underline line
        continue;
      }
    }
  }
  return out;
}

function readTagTexts(html: string, tag: "h1" | "h2" | "h3" | "p", limit = 12): string[] {
  const out: string[] = [];
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) && out.length < limit) {
    const cleaned = sanitizeSourceText(decodeEntities(match[1].replace(/<[^>]+>/g, " ")));
    if (cleaned.length >= 16) out.push(cleaned);
  }
  return out;
}

function readAnchorsWithKeywords(html: string, keywords: string[], limit = 10): string[] {
  const out: string[] = [];
  const pattern = /<a[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) && out.length < limit) {
    const cleaned = sanitizeSourceText(decodeEntities(match[1].replace(/<[^>]+>/g, " ")));
    if (cleaned.length < 18) continue;
    const lower = cleaned.toLowerCase();
    if (keywords.some((k) => lower.includes(k))) out.push(cleaned);
  }
  return out;
}

function readDate(html: string): string | null {
  const patterns = [
    /(?:datePublished|dateModified)["']?\s*[:=]\s*["']([^"']{10,40})["']/i,
    /(?:published|updated|modified)\s*[:\-]\s*([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})/i,
    /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) continue;
    const parsed = new Date(match[1]);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

function uniqueNonEmpty(items: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const value = item ? sanitizeSourceText(item) : "";
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function selectSummary(candidates: Array<string | null | undefined>, fallbackText: string): string {
  const picks = uniqueNonEmpty(candidates)
    .filter((text) => text.length >= 20)
    .slice(0, 3);
  if (picks.length === 0) return fallbackText.slice(0, 1000);
  return sanitizeSourceText(picks.join(" | ")).slice(0, 1000);
}

function extractBase(source: SourceDef, html: string): { pageTitle: string; rawText: string; publishedAt: string | null } {
  const pageTitle = readTitleTag(html) ?? source.name;
  const rawText = stripHtml(html).slice(0, 10000);
  const publishedAt = readDate(html);
  return { pageTitle, rawText, publishedAt };
}

function extractBySource(source: SourceDef, html: string): { title: string; summary: string; publishedAt: string | null; rawText: string } {
  const base = extractBase(source, html);

  if (source.extractor_id === "emirates_updates") {
    const title = readMeta(html, "og:title") ?? readMeta(html, "section") ?? base.pageTitle;
    const summary = selectSummary(
      [
        readMeta(html, "description"),
        readMeta(html, "og:description"),
        ...readTagTexts(html, "h1", 2),
        ...readTagTexts(html, "h2", 4),
      ],
      base.rawText,
    );
    return { title, summary, publishedAt: base.publishedAt, rawText: base.rawText };
  }

  if (source.extractor_id === "etihad_updates") {
    const title = readMeta(html, "og:title") ?? readMeta(html, "twitter:title") ?? base.pageTitle;
    const summary = selectSummary(
      [
        readMeta(html, "description"),
        readMeta(html, "og:description"),
        ...readJsonLdTextCandidates(html),
        ...readTagTexts(html, "h2", 4),
      ],
      base.rawText,
    );
    return { title, summary, publishedAt: base.publishedAt, rawText: base.rawText };
  }

  if (source.extractor_id === "omanair_updates") {
    const title = readMeta(html, "og:title") ?? base.pageTitle;
    const summary = selectSummary(
      [
        readMeta(html, "description"),
        readMeta(html, "og:description"),
        ...readTagTexts(html, "h2", 4),
        ...readAnchorsWithKeywords(html, ["travel", "advisory", "update", "flight", "service"], 5),
      ],
      base.rawText,
    );
    return { title, summary, publishedAt: base.publishedAt, rawText: base.rawText };
  }

  if (source.extractor_id === "rta_news") {
    const title = readMeta(html, "og:title") ?? "RTA Dubai News";
    const summary = selectSummary(
      [
        readMeta(html, "description"),
        ...readAnchorsWithKeywords(html, ["road", "metro", "transport", "service", "rta", "traffic", "dubai"], 6),
        ...readTagTexts(html, "h3", 6),
      ],
      base.rawText,
    );
    return { title, summary, publishedAt: base.publishedAt, rawText: base.rawText };
  }

  if (source.extractor_id === "mofa_news") {
    // MOFA renders via SPA — Jina reader returns setext-style headings (underlined with ---)
    // Most recent headlines contain breaking news (e.g. ambassador summons, embassy closures)
    const headings = readJinaHeadings(html, 8);
    const latestBreaking = headings.find((h) =>
      /summon|expel|protest|attack|missile|clos|ambassador|condemn|solidarity|evacuat|statement|urgent|crisis/i.test(h)
    ) ?? headings[0] ?? null;
    const title = latestBreaking ?? readMeta(html, "og:title") ?? "UAE Ministry of Foreign Affairs";
    const titleAttrs = Array.from(html.matchAll(/title=["']([^"']{24,220})["']/gi)).map((m) => sanitizeSourceText(decodeEntities(m[1])));
    const summary = selectSummary(
      [
        headings.slice(0, 5).join(" | ") || null,
        readMeta(html, "description"),
        ...titleAttrs.slice(0, 4),
        ...readAnchorsWithKeywords(html, ["uae", "minister", "foreign", "embassy", "statement", "iran", "attack", "condemn", "solidarity"], 6),
      ],
      base.rawText,
    );
    return { title, summary, publishedAt: base.publishedAt, rawText: base.rawText };
  }

  if (source.extractor_id === "visit_dubai_articles") {
    // mediaoffice.ae is a SPA — Jina reader returns markdown with #### headings
    const headings = readJinaHeadings(html, 8);
    const latestHeadline = headings[0] ?? null;
    const title = latestHeadline ?? readMeta(html, "og:title") ?? "Dubai Government Media Office";
    const summary = selectSummary(
      [
        headings.slice(0, 5).join(" | ") || null,
        readMeta(html, "description"),
        ...readJsonLdTextCandidates(html),
        ...readAnchorsWithKeywords(html, ["dubai", "airport", "transport", "rta", "travel", "road", "metro", "flight"], 6),
      ],
      base.rawText,
    );
    return { title, summary, publishedAt: base.publishedAt, rawText: base.rawText };
  }

  if (source.extractor_id === "india_mea_press") {
    // mea.gov.in is JS-rendered — Jina returns markdown; extract headings + relevant link texts
    const headings = readJinaHeadings(html, 6);
    const latestHeadline = headings.find((h) => h.length > 30) ?? null;
    const title = latestHeadline ?? readMeta(html, "og:title") ?? "India MEA Press Releases";
    const summary = selectSummary(
      [
        headings.slice(0, 5).join(" | ") || null,
        readMeta(html, "description"),
        ...readAnchorsWithKeywords(html, ["advisory", "gulf", "iran", "uae", "evacuation", "travel", "operation", "statement", "ministry"], 10),
        ...readTagTexts(html, "h2", 4),
      ],
      base.rawText,
    );
    return { title, summary, publishedAt: base.publishedAt, rawText: base.rawText };
  }

  if (source.extractor_id === "india_boi_home") {
    // boi.gov.in — try headings + relevant links
    const headings = readJinaHeadings(html, 4);
    const title = headings[0] ?? readMeta(html, "og:title") ?? "India Bureau of Immigration";
    const summary = selectSummary(
      [
        headings.slice(0, 4).join(" | ") || null,
        readMeta(html, "description"),
        ...readAnchorsWithKeywords(html, ["notice", "immigration", "advisory", "entry", "exit", "visa", "circular", "suspended", "restricted"], 10),
        ...readTagTexts(html, "h2", 4),
      ],
      base.rawText,
    );
    return { title, summary, publishedAt: base.publishedAt, rawText: base.rawText };
  }

  const title = readMeta(html, "og:title") ?? base.pageTitle;
  const summary = selectSummary(
    [
      readMeta(html, "description"),
      readMeta(html, "og:description"),
      ...readJsonLdTextCandidates(html),
      ...readTagTexts(html, "h2", 4),
      ...readTagTexts(html, "p", 6),
    ],
    base.rawText,
  );
  return { title, summary, publishedAt: base.publishedAt, rawText: base.rawText };
}

export function extractHtmlSnapshot(source: SourceDef, html: string): HtmlExtractResult {
  const extracted = extractBySource(source, html);
  const title = sanitizeSourceText(extracted.title || source.name);
  const summary = sanitizeSourceText(extracted.summary);
  const rawText = sanitizeSourceText(extracted.rawText).slice(0, 10000);
  const unusable = isUnusableSourceText(`${title} ${summary}`);
  return {
    title: title || source.name,
    summary: summary || rawText.slice(0, 1000),
    raw_text: rawText,
    published_at: extracted.publishedAt,
    unusable,
  };
}
