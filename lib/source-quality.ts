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
