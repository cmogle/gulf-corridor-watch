import type { SourceDef } from "./sources";
import { fetchViaChromeRelay } from "./chrome-relay";
import { isScrapingServiceAvailable, fetchViaScrapingService } from "./scraping-service";
import { stripJinaPrefix, stripMarkdown } from "./source-extractors";
import { sanitizeSourceText } from "./source-quality";

export type FetchStageResult = {
  fetch_status: "success" | "failed";
  http_status: number | null;
  source_url: string;
  artifact_url: string | null;
  content_type: "html" | "rss";
  raw_text: string;
  normalized_text: string;
  error_code: string | null;
  error_detail: string | null;
  duration_ms: number;
};

const BROWSERISH_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "cache-control": "no-cache",
  pragma: "no-cache",
};
const FETCH_TIMEOUT_MS = Number(process.env.TRUSTED_FEED_FETCH_TIMEOUT_MS ?? 20_000);

const JINA_FIRST_SOURCES = new Set(["uae_mofa", "gcaa_uae"]);

// Airline SPAs return shell HTML via Jina (false positive) — use ScrapingBee as primary
const SCRAPING_PRIMARY_SOURCES = new Set(["emirates_updates", "etihad_advisory", "flydubai_updates"]);

function asJinaMirror(url: string): string {
  return `https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`;
}

function normalizeText(input: string): string {
  return sanitizeSourceText(input).slice(0, 50000);
}

function getFallbackUrls(source: SourceDef): string[] {
  const map: Record<string, string[]> = {
    us_state_dept_travel: ["https://travel.state.gov/_res/rss/TAsTWs.xml"],
    etihad_advisory: ["https://www.etihad.com/en-ae/help/travel-updates"],
  };
  return map[source.id] ?? [];
}

function getCandidateUrls(source: SourceDef): string[] {
  const primary: string[] = [];
  if (source.parser === "html" && JINA_FIRST_SOURCES.has(source.id)) {
    primary.push(asJinaMirror(source.url));
    primary.push(source.url);
  } else {
    primary.push(source.url);
  }

  for (const fallback of getFallbackUrls(source)) {
    if (!primary.includes(fallback)) primary.push(fallback);
  }

  const withMirror = [...primary];
  for (const url of primary) {
    const mirror = asJinaMirror(url);
    if (!withMirror.includes(mirror)) withMirror.push(mirror);
  }
  return withMirror;
}

function classifyError(errorText: string): string {
  if (/403|401|429|forbidden|unauthorized|denied|captcha|blocked/i.test(errorText)) return "source_blocked";
  if (/not rss content/i.test(errorText)) return "unexpected_content_type";
  if (/timed out|timeout|abort/i.test(errorText)) return "fetch_timeout";
  return "fetch_failed";
}

export async function fetchTrustedSourceDocument(source: SourceDef): Promise<FetchStageResult> {
  const startedAt = Date.now();
  const mode = source.parser;
  let lastError: unknown = null;

  // Airline SPAs: try ScrapingBee first (Jina returns page shell without dynamic content)
  if (SCRAPING_PRIMARY_SOURCES.has(source.id) && isScrapingServiceAvailable()) {
    const remainingMs = 55_000 - (Date.now() - startedAt);
    if (remainingMs > 8_000) {
      try {
        const scraped = await fetchViaScrapingService(source.url, { timeoutMs: Math.min(25_000, remainingMs - 3_000) });
        return {
          fetch_status: "success",
          http_status: 200,
          source_url: scraped.sourceUrl,
          artifact_url: `scrapingbee:${source.url}`,
          content_type: "html",
          raw_text: scraped.html.slice(0, 120000),
          normalized_text: normalizeText(scraped.html),
          error_code: null,
          error_detail: null,
          duration_ms: Date.now() - startedAt,
        };
      } catch (error) {
        lastError = error;
      }
    }
  }

  const urls = getCandidateUrls(source);

  for (const candidate of urls) {
    const fromMirror = candidate.startsWith("https://r.jina.ai/");
    try {
      const timeout = Number.isFinite(FETCH_TIMEOUT_MS) ? Math.max(2_000, Math.min(60_000, FETCH_TIMEOUT_MS)) : 20_000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(candidate, {
        cache: "no-store",
        headers: BROWSERISH_HEADERS,
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
      const raw = await response.text();
      const body = fromMirror ? stripMarkdown(stripJinaPrefix(raw)) : raw;
      const looksRss = /<rss[\s>]|<feed[\s>]/i.test(body);
      if (mode === "rss" && !looksRss) {
        throw new Error(`Not RSS content (${response.status})`);
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return {
        fetch_status: "success",
        http_status: response.status,
        source_url: response.url || candidate,
        artifact_url: candidate,
        content_type: mode,
        raw_text: body.slice(0, 120000),
        normalized_text: normalizeText(body),
        error_code: null,
        error_detail: null,
        duration_ms: Date.now() - startedAt,
      };
    } catch (error) {
      lastError = error;
    }
  }

  if (source.parser === "html" && source.fallback_connector === "chrome_relay") {
    try {
      const relayed = await fetchViaChromeRelay(source.url);
      const html = relayed.html;
      return {
        fetch_status: "success",
        http_status: 200,
        source_url: relayed.sourceUrl,
        artifact_url: source.url,
        content_type: "html",
        raw_text: html.slice(0, 120000),
        normalized_text: normalizeText(html),
        error_code: null,
        error_detail: null,
        duration_ms: Date.now() - startedAt,
      };
    } catch (error) {
      lastError = error;
    }
  }

  const detail = String(lastError ?? "unknown fetch error").slice(0, 500);
  return {
    fetch_status: "failed",
    http_status: null,
    source_url: source.url,
    artifact_url: null,
    content_type: mode,
    raw_text: "",
    normalized_text: "",
    error_code: classifyError(detail),
    error_detail: detail,
    duration_ms: Date.now() - startedAt,
  };
}
