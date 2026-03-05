import { generateText, hasAnthropicKey } from "./anthropic";

const NEWS_SUMMARY_MODEL = "claude-sonnet-4-6";

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

  if (!hasAnthropicKey()) return buildFallbackNewsSummary(sourceTopic, articles);

  try {
    const prompt = buildNewsSummaryPrompt(sourceTopic, articles);

    const result = await generateText({
      model: NEWS_SUMMARY_MODEL,
      temperature: 0.2,
      maxTokens: 250,
      timeoutMs: 10_000,
      system: "You synthesize news articles into concise travel briefings. Follow the user instructions exactly.",
      userMessage: prompt,
    });

    return parseNewsSummaryResponse(result.text) ?? buildFallbackNewsSummary(sourceTopic, articles);
  } catch {
    return buildFallbackNewsSummary(sourceTopic, articles);
  }
}
