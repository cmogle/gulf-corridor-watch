const UNUSABLE_PATTERNS = [
  /access denied/i,
  /request rejected/i,
  /forbidden/i,
  /captcha/i,
  /attention required/i,
  /sorry for the inconvenience/i,
  /support id is:/i,
  /typeerror:\s*fetch failed/i,
  /\bfetch error\b/i,
  /\bsource fetch failed\b/i,
  /\bfailed during ingestion\b/i,
  /maximum nested tags exceeded/i,
  /you don't have permission to access/i,
  /challenge-platform/i,
  /cloudflare/i,
  /akamai/i,
  /bot detection/i,
  /show submenu for services/i,
  /services for individuals/i,
  /my flightradar24 rating/i,
  /get the best flight tracking experience using our app/i,
  /personalized ads/i,
  /sorry, we don't have any information about flights for this airport/i,
  /gold star logo search home services/i,
  /loading\.\.\./i,
  /file not found/i,
  /page not found/i,
  /404 not found/i,
  /page you requested was not found/i,
  /this page (is|has been) (removed|unavailable)/i,
];

const LOW_SIGNAL_PATTERNS = [/^\s*$/, /^(no|none|n\/a)$/i];

export function sanitizeSourceText(input: string): string {
  return input
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function isUnusableSourceText(text: string): boolean {
  const cleaned = sanitizeSourceText(text);
  if (LOW_SIGNAL_PATTERNS.some((pattern) => pattern.test(cleaned))) return true;
  if (cleaned.length < 20) return true;
  return UNUSABLE_PATTERNS.some((pattern) => pattern.test(cleaned));
}

export type SnapshotLike = {
  title: string;
  summary: string;
  reliability: "reliable" | "degraded" | "blocked";
};

export function isUsableSnapshot(snapshot: SnapshotLike): boolean {
  if (snapshot.reliability === "blocked") return false;
  const merged = `${snapshot.title} ${snapshot.summary}`;
  return !isUnusableSourceText(merged);
}

export type FeedItemLike = {
  headline: string;
  summary: string;
  reliability: "reliable" | "degraded" | "blocked";
  update_type: "snapshot" | "x";
};

export function isUsableFeedItem(item: FeedItemLike): boolean {
  if (item.update_type === "x") return true;
  if (item.reliability === "degraded" || item.reliability === "blocked") return false;
  if (!item.summary.trim()) return false;
  const merged = `${item.headline} ${item.summary}`;
  return !isUnusableSourceText(merged);
}

/**
 * Detect low-confidence extractions that pass unusability checks
 * but are still too poor to display as reliable content.
 * Used to trigger LLM fallback extraction.
 */
export function isLowConfidenceExtraction(summary: string, sourceName: string): boolean {
  const cleaned = sanitizeSourceText(summary);

  // Too short to be meaningful
  if (cleaned.length < 50) return true;

  // Mostly non-alphabetic (nav chrome, symbols, formatting artifacts)
  const alphaChars = cleaned.replace(/[^a-zA-Z]/g, "").length;
  if (alphaChars / Math.max(cleaned.length, 1) < 0.2) return true;

  // Summary word overlap with source name > 90%
  const summaryWords = new Set(cleaned.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const nameWords = new Set(sourceName.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (summaryWords.size > 0 && nameWords.size > 0) {
    const overlap = [...summaryWords].filter(w => nameWords.has(w)).length;
    if (overlap / summaryWords.size > 0.9) return true;
  }

  return false;
}
