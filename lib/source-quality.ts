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
  update_type: "snapshot" | "x" | "news";
};

export function isUsableFeedItem(item: FeedItemLike): boolean {
  if (item.update_type === "x" || item.update_type === "news") return true;
  if (item.reliability === "degraded" || item.reliability === "blocked") return false;
  if (!item.summary.trim()) return false;
  const merged = `${item.headline} ${item.summary}`;
  return !isUnusableSourceText(merged);
}

// Common words found in navigation, menus, footers, and UI chrome
const NAV_CHROME_WORDS = new Set([
  "login", "logout", "signin", "signup", "register", "subscribe",
  "search", "menu", "home", "sitemap", "contact", "submit",
  "skip", "accessibility", "cookie", "cookies", "privacy",
  "close", "open", "toggle", "expand", "collapse",
  "previous", "next", "back", "forward",
  "facebook", "twitter", "instagram", "linkedin", "youtube",
  "share", "follow", "download", "upload",
  "select", "language", "country",
  "about", "careers", "terms", "conditions", "disclaimer",
]);

// Patterns that strongly indicate navigation chrome
const NAV_CHROME_PATTERNS = [
  /skip to (main |the )?content/i,
  /select your (country|language|region)/i,
  /\b(en|ar|fr|de|es|it|ru|zh|tr)\s+(en|ar|fr|de|es|it|ru|zh|tr)\s+(en|ar|fr|de|es|it|ru|zh|tr)\b/i,
  /\benglish\b.*\b(deutsch|español|français|italiano|العربية|русский|türkçe)\b/i,
  /\b(book|search|manage|experience)\b.*\b(book|search|manage|experience)\b.*\b(book|search|manage|experience)\b/i,
  /log\s*in\s+air\s*rewards/i,
  /\bA\+\s+A\s+A-/,
];

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

  // Strong nav-chrome pattern match (language selectors, skip links, etc.)
  if (NAV_CHROME_PATTERNS.some((p) => p.test(cleaned))) return true;

  // High density of navigation/UI words in first 300 chars
  const sampleWords = cleaned.slice(0, 300).toLowerCase().split(/\s+/);
  if (sampleWords.length >= 10) {
    const navHits = sampleWords.filter((w) => NAV_CHROME_WORDS.has(w)).length;
    if (navHits / sampleWords.length > 0.15) return true;
  }

  // Consecutive duplicate words (e.g. "Government Government Government")
  const words = cleaned.split(/\s+/);
  let maxConsecutive = 1;
  let consecutive = 1;
  for (let i = 1; i < words.length; i++) {
    if (words[i].toLowerCase() === words[i - 1].toLowerCase()) {
      consecutive++;
      if (consecutive > maxConsecutive) maxConsecutive = consecutive;
    } else {
      consecutive = 1;
    }
  }
  if (maxConsecutive >= 3) return true;

  return false;
}
