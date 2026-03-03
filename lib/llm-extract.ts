import OpenAI from "openai";

export const LLM_EXTRACT_MAX_PER_CYCLE = 5;

const EXTRACTION_MODEL = "gpt-4o-mini";

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
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const client = new OpenAI({ apiKey });
  const prompt = buildExtractionPrompt(sourceName, pageText);

  const response = await client.chat.completions.create({
    model: EXTRACTION_MODEL,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 300,
    temperature: 0.2,
  });

  const text = response.choices?.[0]?.message?.content ?? "";
  return parseExtractionResponse(text);
}
