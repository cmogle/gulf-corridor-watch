import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_TIMEOUT_MS = 15_000;

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  if (!_client) {
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type GenerateTextOptions = {
  system: string;
  userMessage: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type GenerateTextResult = {
  text: string;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  model: string;
};

export async function generateText(opts: GenerateTextOptions): Promise<GenerateTextResult> {
  const client = getAnthropicClient();
  const model = opts.model ?? process.env.CURRENT_STATE_BRIEF_MODEL?.trim() ?? DEFAULT_MODEL;
  const maxTokens = opts.maxTokens ?? 1024;

  const response = await client.messages.create(
    {
      model,
      max_tokens: maxTokens,
      temperature: opts.temperature ?? 0.1,
      system: opts.system,
      messages: [{ role: "user", content: opts.userMessage }],
    },
    {
      signal: opts.signal,
      timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    },
  );

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return {
    text,
    input_tokens: response.usage?.input_tokens ?? null,
    output_tokens: response.usage?.output_tokens ?? null,
    total_tokens:
      response.usage ? (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0) : null,
    model,
  };
}

export type StreamTextOptions = {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

/**
 * Stream a multi-turn conversation. Returns a ReadableStream of text chunks
 * and a promise that resolves to the full text + usage.
 */
export function streamText(opts: StreamTextOptions): {
  stream: ReadableStream<Uint8Array>;
  response: Promise<{ text: string; input_tokens: number | null; output_tokens: number | null }>;
} {
  const client = getAnthropicClient();
  const model = opts.model ?? DEFAULT_MODEL;
  const maxTokens = opts.maxTokens ?? 2048;

  let resolveResponse: (value: { text: string; input_tokens: number | null; output_tokens: number | null }) => void;
  const response = new Promise<{ text: string; input_tokens: number | null; output_tokens: number | null }>((resolve) => {
    resolveResponse = resolve;
  });

  const encoder = new TextEncoder();
  let fullText = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const anthropicStream = client.messages.stream(
          {
            model,
            max_tokens: maxTokens,
            temperature: opts.temperature ?? 0.1,
            system: opts.system,
            messages: opts.messages,
          },
          {
            timeout: opts.timeoutMs ?? 45_000,
          },
        );

        for await (const event of anthropicStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const chunk = event.delta.text;
            fullText += chunk;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
          }
        }

        const finalMessage = await anthropicStream.finalMessage();
        const inputTokens = finalMessage.usage?.input_tokens ?? null;
        const outputTokens = finalMessage.usage?.output_tokens ?? null;

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        controller.close();
        resolveResponse!({ text: fullText, input_tokens: inputTokens, output_tokens: outputTokens });
      } catch (error) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(error) })}\n\n`));
        controller.close();
        resolveResponse!({ text: fullText, input_tokens: null, output_tokens: null });
      }
    },
  });

  return { stream, response };
}

export function extractClaudeUsage(usage?: { input_tokens?: number | null; output_tokens?: number | null } | null) {
  const input = usage?.input_tokens ?? null;
  const output = usage?.output_tokens ?? null;
  return {
    prompt_tokens: input,
    completion_tokens: output,
    total_tokens: input != null && output != null ? input + output : null,
  };
}
