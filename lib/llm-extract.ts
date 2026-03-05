import { generateText, hasAnthropicKey } from "./anthropic";

export const LLM_EXTRACT_MAX_PER_CYCLE = 5;

const EXTRACTION_MODEL = "claude-sonnet-4-6";

export function buildExtractionPrompt(sourceName: string, pageText: string): string {
  const truncated = pageText.slice(0, 4000);
  return `You are extracting news content from the "${sourceName}" web page.

The page text below may contain navigation menus, cookie banners, and other boilerplate mixed with actual content.

Extract the key news, travel updates, or advisories from this page. Return a 1-3 sentence summary of actionable information relevant to travellers or aviation.

If there is no meaningful news or travel content on this page, respond with exactly: EMPTY

Page text:
${truncated}`;
}

export function parseExtractionResponse(response: string): string | null {
  const trimmed = response.trim();
  if (!trimmed || trimmed.toUpperCase() === "EMPTY" || trimmed.length < 10) return null;
  return trimmed;
}

export async function llmExtractSummary(
  sourceName: string,
  pageText: string,
): Promise<string | null> {
  if (!hasAnthropicKey()) return null;

  const prompt = buildExtractionPrompt(sourceName, pageText);

  const result = await generateText({
    model: EXTRACTION_MODEL,
    temperature: 0.2,
    maxTokens: 300,
    system: "You extract actionable travel news from web pages. Follow the user instructions exactly.",
    userMessage: prompt,
  });

  return parseExtractionResponse(result.text);
}
