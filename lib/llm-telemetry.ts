type UsageLike = {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
};

type LlmTelemetryPayload = {
  route: string;
  mode?: string;
  model?: string | null;
  success: boolean;
  duration_ms: number;
  fallback_reason?: string | null;
  error?: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  context?: Record<string, unknown>;
};

export function extractUsage(usage?: UsageLike | null) {
  return {
    prompt_tokens: usage?.prompt_tokens ?? null,
    completion_tokens: usage?.completion_tokens ?? null,
    total_tokens: usage?.total_tokens ?? null,
  };
}

export function logLlmTelemetry(event: string, payload: LlmTelemetryPayload) {
  const row = {
    type: "llm.telemetry",
    event,
    at: new Date().toISOString(),
    ...payload,
  };
  try {
    console.info(JSON.stringify(row));
  } catch {
    // no-op: logging must never break request flow
  }
}

