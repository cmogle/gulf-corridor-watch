import OpenAI from "openai";
import { EXPERT_ACCOUNTS, findGulfKeywords, scoreRelevance } from "./expert-feed";
import type { ExpertSignal, ExpertCategory } from "./expert-feed";
import {
  loadKnownPostIds,
  upsertExpertSignals,
  countUndigestedSignals,
  getUndigestedSignals,
  markSignalsDigested,
  insertDigest,
} from "./expert-feed-repo";

// --- X API helpers (mirrored from lib/x-signals.ts) ---

type XPost = { id: string; text: string; created_at: string };

function getXConfig() {
  const bearer = process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN;
  const baseUrl = (process.env.X_API_BASE_URL || "https://api.x.com/2").replace(/\/+$/, "");
  if (!bearer) throw new Error("Missing X_BEARER_TOKEN");
  return { bearer, baseUrl };
}

async function xFetch(path: string, params: URLSearchParams): Promise<Record<string, unknown>> {
  const { bearer, baseUrl } = getXConfig();
  const url = `${baseUrl}${path}?${params.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { authorization: `Bearer ${bearer}`, accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`X API error (${res.status}) ${url} ${body.slice(0, 240)}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

async function resolveUserId(username: string): Promise<string> {
  const payload = await xFetch(`/users/by/username/${encodeURIComponent(username)}`, new URLSearchParams({ "user.fields": "id" }));
  const id = (payload?.data as { id?: string } | undefined)?.id;
  if (!id) throw new Error(`X user lookup failed for @${username}`);
  return id;
}

async function fetchRecentTweets(userId: string, maxResults = 5): Promise<XPost[]> {
  const payload = await xFetch(
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
    .filter((row): row is { id: string; text: string; created_at: string } =>
      Boolean(row && typeof row === "object" && typeof (row as { id?: unknown }).id === "string"),
    )
    .map((row) => ({ id: row.id, text: row.text, created_at: row.created_at }));
}

// --- Relevance scoring ---

export function buildRelevanceResult(text: string): {
  method: "keyword" | "needs_llm";
  score: number;
  keywords: string[];
  passesGate: boolean;
} {
  const keywords = findGulfKeywords(text);
  const score = scoreRelevance(keywords);
  if (keywords.length > 0) {
    return { method: "keyword", score, keywords, passesGate: true };
  }
  return { method: "needs_llm", score, keywords, passesGate: false };
}

async function llmScoreRelevance(text: string): Promise<number> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return 0;
  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 10,
      messages: [
        {
          role: "system",
          content:
            "Rate the relevance of this tweet to the Iran conflict, Gulf shipping/aviation disruption, or UAE travel safety. Reply with ONLY a number between 0.0 and 1.0.",
        },
        { role: "user", content: text.slice(0, 500) },
      ],
    });
    const raw = completion.choices[0]?.message?.content?.trim() ?? "0";
    const score = parseFloat(raw);
    return Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0;
  } catch {
    return 0;
  }
}

// --- Digest generation ---

async function generateDigest(signals: ExpertSignal[]): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || signals.length === 0) return "";

  const signalTexts = signals
    .slice(0, 15)
    .map((s) => `@${s.handle} [${s.category}]: ${(s.text_en ?? s.text_original).slice(0, 280)}`)
    .join("\n");

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content:
            "You are a crisis monitoring analyst. Summarize the following expert commentary tweets into a concise 2-4 sentence digest for UAE travelers/residents monitoring the Iran situation. Group by theme (maritime, defense, energy, aviation) if signals span multiple domains. Cite authors by @handle. Focus on actionable intelligence and emerging developments. Do not editorialize.",
        },
        { role: "user", content: signalTexts },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() ?? "";
  } catch {
    return "";
  }
}

// --- Main ingestion entry point ---

export type ExpertFeedIngestResult = {
  ok: boolean;
  accounts_polled: number;
  signals_found: number;
  signals_relevant: number;
  signals_inserted: number;
  digest_generated: boolean;
  errors: string[];
};

export async function runExpertFeedIngestion(): Promise<ExpertFeedIngestResult> {
  const errors: string[] = [];
  const handles = EXPERT_ACCOUNTS.map((a) => a.handle);
  const categoryMap = new Map(EXPERT_ACCOUNTS.map((a) => [a.handle, a.category]));

  // 1. Load known post IDs for dedup
  const knownPostIds = await loadKnownPostIds(handles);

  // 2. Fetch tweets for each handle
  const fetchedAt = new Date().toISOString();
  const allSignals: ExpertSignal[] = [];
  let accountsPolled = 0;

  for (const handle of handles) {
    try {
      const userId = await resolveUserId(handle);
      const tweets = await fetchRecentTweets(userId, 5);
      accountsPolled += 1;

      for (const tweet of tweets) {
        const dedupeKey = `${handle}:${tweet.id}`;
        if (knownPostIds.has(dedupeKey)) continue;

        const text = tweet.text;
        const relevance = buildRelevanceResult(text);

        let finalScore = relevance.score;
        let finalMethod: "keyword" | "llm" = relevance.method === "keyword" ? "keyword" : "llm";

        // LLM scoring for tweets that didn't match keywords
        if (!relevance.passesGate) {
          const llmScore = await llmScoreRelevance(text);
          finalScore = llmScore;
          finalMethod = "llm";
          if (llmScore < 0.4) continue; // Below threshold, skip
        }

        allSignals.push({
          handle,
          post_id: tweet.id,
          posted_at: new Date(tweet.created_at).toISOString(),
          text_original: text.slice(0, 1500),
          text_en: null, // Most expert accounts post in English
          url: `https://x.com/${handle}/status/${tweet.id}`,
          category: categoryMap.get(handle) ?? ("osint" as ExpertCategory),
          relevance_score: finalScore,
          relevance_method: finalMethod,
          keyword_matches: relevance.keywords,
          included_in_digest: false,
          fetched_at: fetchedAt,
        });
      }
    } catch (err) {
      errors.push(`@${handle}: ${String(err).slice(0, 100)}`);
    }
  }

  // 3. Upsert qualifying signals
  const { inserted, error: upsertError } = await upsertExpertSignals(allSignals);
  if (upsertError) errors.push(`upsert: ${upsertError}`);

  // 4. Generate digest if enough new signals
  let digestGenerated = false;
  const undigestedCount = await countUndigestedSignals();
  if (undigestedCount >= 3) {
    const undigested = await getUndigestedSignals();
    const digestText = await generateDigest(undigested);
    if (digestText) {
      const signalIds = undigested.map((s) => (s as unknown as { id: string }).id).filter(Boolean);
      await insertDigest({ digest_text: digestText, signal_ids: signalIds, signal_count: signalIds.length });
      await markSignalsDigested(signalIds);
      digestGenerated = true;
    }
  }

  return {
    ok: errors.length === 0,
    accounts_polled: accountsPolled,
    signals_found: allSignals.length,
    signals_relevant: allSignals.length,
    signals_inserted: inserted,
    digest_generated: digestGenerated,
    errors,
  };
}
