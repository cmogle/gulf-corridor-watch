import { SourceDef } from "./sources";
import { generateText, hasAnthropicKey } from "./anthropic";

type XPost = {
  id: string;
  text: string;
  created_at: string;
};

export type SocialSignal = {
  provider: "x";
  handle: string;
  post_id: string;
  posted_at: string;
  text_original: string;
  language_original: string | null;
  text_en: string | null;
  translation_provider: "anthropic" | "openai" | null;
  translation_confidence: number | null;
  translation_status: "not_needed" | "translated" | "failed";
  text: string;
  url: string;
  keywords: string[];
  fetched_at: string;
  confidence: number;
  linked_source_id: string;
};

const DISRUPTION_TERMS = [
  "delay",
  "delayed",
  "cancel",
  "cancelled",
  "suspend",
  "disrupt",
  "closed",
  "advisory",
  "incident",
  "weather",
  "operational",
  "diversion",
  "reroute",
  "rescheduled",
];

const ARABIC_DISRUPTION_TERMS = [
  "تأخير",
  "ملغي",
  "إلغاء",
  "تعليق",
  "اضطراب",
  "إغلاق",
  "تحذير",
  "تنبيه",
  "حادث",
  "الطقس",
  "تشغيلي",
  "تحويل",
  "إعادة جدولة",
];

function normalizeHandle(raw: string): string {
  return raw.replace(/^@+/, "").trim().toLowerCase();
}

function findKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  const english = DISRUPTION_TERMS.filter((term) => lower.includes(term));
  const arabic = ARABIC_DISRUPTION_TERMS.filter((term) => text.includes(term));
  return [...new Set([...english, ...arabic])];
}

function scoreSignal(keywords: string[]): number {
  if (keywords.length === 0) return 0.2;
  if (keywords.length === 1) return 0.45;
  if (keywords.length === 2) return 0.65;
  if (keywords.length === 3) return 0.8;
  return 0.92;
}

function getXConfig() {
  const bearer = process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN;
  const baseUrl = (process.env.X_API_BASE_URL || "https://api.x.com/2").replace(/\/+$/, "");
  if (!bearer) throw new Error("Missing X_BEARER_TOKEN (or TWITTER_BEARER_TOKEN)");
  return { bearer, baseUrl };
}

async function fetchJson(path: string, params: URLSearchParams) {
  const { bearer, baseUrl } = getXConfig();
  const url = `${baseUrl}${path}?${params.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${bearer}`,
      accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`X API error (${res.status}) ${url} ${body.slice(0, 240)}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

async function resolveUserId(username: string): Promise<string> {
  const payload = await fetchJson(`/users/by/username/${encodeURIComponent(username)}`, new URLSearchParams({ "user.fields": "id" }));
  const id = (payload?.data as { id?: string } | undefined)?.id;
  if (!id) throw new Error(`X user lookup failed for @${username}`);
  return id;
}

async function fetchRecentTweets(userId: string, maxResults = 5): Promise<XPost[]> {
  const payload = await fetchJson(
    `/users/${encodeURIComponent(userId)}/tweets`,
    new URLSearchParams({
      max_results: String(Math.max(5, Math.min(25, maxResults))),
      exclude: "retweets,replies",
      "tweet.fields": "created_at,text",
    }),
  );
  const data = payload?.data;
  if (!Array.isArray(data)) return [];
  return data
    .filter((row): row is { id: string; text: string; created_at: string } => {
      return Boolean(row && typeof row === "object" && typeof (row as { id?: unknown }).id === "string");
    })
    .map((row) => ({ id: row.id, text: row.text, created_at: row.created_at }));
}

function detectLanguage(text: string): string {
  if (/[\u0600-\u06FF]/.test(text)) return "ar";
  if (/[A-Za-z]/.test(text)) return "en";
  return "unknown";
}

async function translateWithTimeout(text: string, timeoutMs = 8000): Promise<string> {
  const result = await generateText({
    model: "claude-sonnet-4-6",
    temperature: 0,
    timeoutMs,
    system:
      "Translate to concise operational English. Preserve named entities, flight numbers, timestamps, and warning tone. Return only the translated text.",
    userMessage: text,
  });
  return result.text.trim();
}

async function maybeTranslate(text: string): Promise<{
  text_en: string | null;
  language_original: string | null;
  translation_status: SocialSignal["translation_status"];
  translation_provider: SocialSignal["translation_provider"];
  translation_confidence: number | null;
}> {
  const language = detectLanguage(text);
  if (language === "en") {
    return {
      text_en: text,
      language_original: language,
      translation_status: "not_needed",
      translation_provider: null,
      translation_confidence: null,
    };
  }

  if (!hasAnthropicKey()) {
    return {
      text_en: null,
      language_original: language,
      translation_status: "failed",
      translation_provider: null,
      translation_confidence: null,
    };
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const translated = await translateWithTimeout(text);
      if (translated) {
        return {
          text_en: translated,
          language_original: language,
          translation_status: "translated",
          translation_provider: "anthropic",
          translation_confidence: 0.9,
        };
      }
    } catch {
      // retry once for transient timeouts/failures
    }
  }

  return {
    text_en: null,
    language_original: language,
    translation_status: "failed",
    translation_provider: "anthropic",
    translation_confidence: null,
  };
}

export async function pollOfficialXSignals(
  sources: SourceDef[],
  opts?: { knownPostIds?: Set<string>; translateLimitPerHandle?: number },
): Promise<SocialSignal[]> {
  const handleToSource = new Map<string, string>();
  for (const source of sources) {
    for (const handle of source.x_handles ?? []) {
      handleToSource.set(normalizeHandle(handle), source.id);
    }
  }

  if (handleToSource.size === 0) return [];

  const fetchedAt = new Date().toISOString();
  const results: SocialSignal[] = [];
  const knownPostIds = opts?.knownPostIds ?? new Set<string>();
  const translateLimitPerHandle = Math.max(1, opts?.translateLimitPerHandle ?? 3);
  for (const [handle, sourceId] of handleToSource.entries()) {
    const userId = await resolveUserId(handle);
    const tweets = await fetchRecentTweets(userId, 8);
    let translatedCount = 0;
    for (const tweet of tweets.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())) {
      const dedupeKey = `${handle}:${tweet.id}`;
      const shouldTranslate = !knownPostIds.has(dedupeKey) && translatedCount < translateLimitPerHandle;
      const translation = shouldTranslate
        ? await maybeTranslate(tweet.text)
        : {
            text_en: null,
            language_original: detectLanguage(tweet.text),
            translation_status: "not_needed" as const,
            translation_provider: null,
            translation_confidence: null,
          };
      if (shouldTranslate) translatedCount += 1;
      const textDisplay = translation.text_en ?? tweet.text;
      const keywords = findKeywords(textDisplay);
      results.push({
        provider: "x",
        handle,
        post_id: tweet.id,
        posted_at: new Date(tweet.created_at).toISOString(),
        text_original: tweet.text.slice(0, 1500),
        language_original: translation.language_original,
        text_en: translation.text_en?.slice(0, 1500) ?? null,
        translation_provider: translation.translation_provider,
        translation_confidence: translation.translation_confidence,
        translation_status: translation.translation_status,
        text: tweet.text.slice(0, 1500),
        url: `https://x.com/${handle}/status/${tweet.id}`,
        keywords,
        fetched_at: fetchedAt,
        confidence: scoreSignal(keywords),
        linked_source_id: sourceId,
      });
    }
  }
  return results;
}
