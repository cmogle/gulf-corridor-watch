import OpenAI from "openai";

const NEWS_SUMMARY_MODEL = "gpt-4o-mini";

export type NewsArticleInput = {
  headline: string;
  description: string;
};

export function buildNewsSummaryPrompt(sourceTopic: string, articles: NewsArticleInput[]): string {
  const articleList = articles
    .slice(0, 6)
    .map((a, i) => `${i + 1}. ${a.headline}${a.description ? `\n   ${a.description}` : ""}`)
    .join("\n");

  return `You are summarizing news coverage about "${sourceTopic}" for travellers monitoring the India-UAE Gulf corridor.

Below are ${articles.length} recent news articles on this topic. Write a 2-3 sentence summary that captures the key facts relevant to travellers: what happened, current status, and practical impact on travel/flights.

Do NOT list individual articles. Synthesize into a coherent briefing. If the articles describe an ongoing crisis, lead with current status. Be factual and concise.

Articles:
${articleList}`;
}

export function parseNewsSummaryResponse(response: string): string | null {
  const trimmed = response.trim();
  if (!trimmed || trimmed.toUpperCase() === "EMPTY" || trimmed.length < 20) return null;
  return trimmed;
}

export function buildFallbackNewsSummary(sourceTopic: string, articles: NewsArticleInput[]): string {
  if (articles.length === 0) return `No current news for ${sourceTopic}`;
  if (articles.length === 1) return articles[0].headline;
  return articles.slice(0, 3).map((a) => a.headline).join("; ");
}

export async function summarizeNewsCluster(
  sourceTopic: string,
  articles: NewsArticleInput[],
): Promise<string> {
  if (articles.length === 0) return `No current news for ${sourceTopic}`;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return buildFallbackNewsSummary(sourceTopic, articles);

  try {
    const client = new OpenAI({ apiKey });
    const prompt = buildNewsSummaryPrompt(sourceTopic, articles);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await client.chat.completions.create(
        {
          model: NEWS_SUMMARY_MODEL,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 250,
          temperature: 0.2,
        },
        { signal: controller.signal },
      );

      const text = response.choices?.[0]?.message?.content ?? "";
      return parseNewsSummaryResponse(text) ?? buildFallbackNewsSummary(sourceTopic, articles);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return buildFallbackNewsSummary(sourceTopic, articles);
  }
}
