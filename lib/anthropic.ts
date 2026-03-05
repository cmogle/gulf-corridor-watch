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

export type SystemBlock = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };

export type GenerateTextOptions = {
  /** System prompt — string or pre-built content blocks (with cache_control). */
  system: string | SystemBlock[];
  userMessage: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Enable prompt caching on the system prompt (requires >=1024 tokens for Sonnet) */
  cacheSystem?: boolean;
};

export type CacheUsage = {
  cache_creation_input_tokens: number | null;
  cache_read_input_tokens: number | null;
};

export type GenerateTextResult = {
  text: string;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  model: string;
  cache_usage: CacheUsage;
};

export async function generateText(opts: GenerateTextOptions): Promise<GenerateTextResult> {
  const client = getAnthropicClient();
  const model = opts.model ?? process.env.CURRENT_STATE_BRIEF_MODEL?.trim() ?? DEFAULT_MODEL;
  const maxTokens = opts.maxTokens ?? 1024;

  // Build system parameter: if caller passed pre-built blocks, use them directly.
  // Otherwise wrap in a cache_control block when cacheSystem is enabled.
  let systemParam: string | Anthropic.Messages.TextBlockParam[];
  if (Array.isArray(opts.system)) {
    systemParam = opts.system as Anthropic.Messages.TextBlockParam[];
  } else if (opts.cacheSystem) {
    systemParam = [{ type: "text" as const, text: opts.system, cache_control: { type: "ephemeral" as const } }];
  } else {
    systemParam = opts.system;
  }

  const response = await client.messages.create(
    {
      model,
      max_tokens: maxTokens,
      temperature: opts.temperature ?? 0.1,
      system: systemParam,
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

  // Access cache usage fields — these exist on the response but may not be in
  // the SDK type definitions yet. Cast via unknown to access safely.
  const usageAny = response.usage as unknown as Record<string, unknown> | undefined;

  return {
    text,
    input_tokens: response.usage?.input_tokens ?? null,
    output_tokens: response.usage?.output_tokens ?? null,
    total_tokens:
      response.usage ? (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0) : null,
    model,
    cache_usage: {
      cache_creation_input_tokens: (usageAny?.cache_creation_input_tokens as number) ?? null,
      cache_read_input_tokens: (usageAny?.cache_read_input_tokens as number) ?? null,
    },
  };
}

export type StreamTextMessage = {
  role: "user" | "assistant";
  content: string | Anthropic.Messages.ContentBlockParam[];
};

export type StreamTextOptions = {
  /** System prompt — string or pre-built content blocks (with cache_control). */
  system: string | SystemBlock[];
  messages: Array<StreamTextMessage>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** Enable prompt caching on the system prompt */
  cacheSystem?: boolean;
  /** AbortSignal to cancel the stream (e.g., when client disconnects) */
  signal?: AbortSignal;
};

export type StreamTextResult = {
  text: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_usage: CacheUsage;
};

/**
 * Stream a multi-turn conversation. Returns a ReadableStream of text chunks
 * and a promise that resolves to the full text + usage.
 */
export function streamText(opts: StreamTextOptions): {
  stream: ReadableStream<Uint8Array>;
  response: Promise<StreamTextResult>;
} {
  const client = getAnthropicClient();
  const model = opts.model ?? DEFAULT_MODEL;
  const maxTokens = opts.maxTokens ?? 2048;

  let resolveResponse: (value: StreamTextResult) => void;
  const response = new Promise<StreamTextResult>((resolve) => {
    resolveResponse = resolve;
  });

  // Build system parameter: pre-built blocks used directly, else wrap when caching.
  let systemParam: string | Anthropic.Messages.TextBlockParam[];
  if (Array.isArray(opts.system)) {
    systemParam = opts.system as Anthropic.Messages.TextBlockParam[];
  } else if (opts.cacheSystem) {
    systemParam = [{ type: "text" as const, text: opts.system, cache_control: { type: "ephemeral" as const } }];
  } else {
    systemParam = opts.system;
  }

  const encoder = new TextEncoder();
  let fullText = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let anthropicStream: ReturnType<typeof client.messages.stream> | null = null;
      try {
        anthropicStream = client.messages.stream(
          {
            model,
            max_tokens: maxTokens,
            temperature: opts.temperature ?? 0.1,
            system: systemParam,
            messages: opts.messages,
          },
          {
            signal: opts.signal,
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
        const usageAny = finalMessage.usage as unknown as Record<string, unknown> | undefined;

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        controller.close();
        resolveResponse!({
          text: fullText,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cache_usage: {
            cache_creation_input_tokens: (usageAny?.cache_creation_input_tokens as number) ?? null,
            cache_read_input_tokens: (usageAny?.cache_read_input_tokens as number) ?? null,
          },
        });
      } catch (error) {
        // Abort the Anthropic stream if still running (prevents wasted tokens)
        try { anthropicStream?.abort(); } catch { /* ignore */ }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(error) })}\n\n`));
        controller.close();
        resolveResponse!({
          text: fullText,
          input_tokens: null,
          output_tokens: null,
          cache_usage: { cache_creation_input_tokens: null, cache_read_input_tokens: null },
        });
      }
    },
    cancel() {
      // Client disconnected — this is called when the readable stream is cancelled.
      // We can't easily abort the Anthropic stream from here since it's in the start() closure,
      // but the signal passed to the SDK will handle it if provided.
    },
  });

  return { stream, response };
}

export function extractClaudeUsage(result?: {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_usage?: CacheUsage;
} | null) {
  const input = result?.input_tokens ?? null;
  const output = result?.output_tokens ?? null;
  return {
    prompt_tokens: input,
    completion_tokens: output,
    total_tokens: input != null && output != null ? input + output : null,
    cache_creation_input_tokens: result?.cache_usage?.cache_creation_input_tokens ?? null,
    cache_read_input_tokens: result?.cache_usage?.cache_read_input_tokens ?? null,
  };
}
