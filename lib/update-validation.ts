import { createHash } from "crypto";
import { generateText, hasAnthropicKey } from "./anthropic";

export type ValidationState = "validated" | "unvalidated" | "failed" | "skipped";

export type ValidationMetadata = {
  validation_state: ValidationState;
  validation_score: number | null;
  validation_reason: string | null;
  validation_model: string | null;
  validated_at: string | null;
};

export type ValidateOfficialUpdateInput = {
  source_id: string;
  update_type: "snapshot" | "x";
  headline: string;
  summary: string;
  original_url: string;
  raw_text?: string | null;
};

type ValidationConfig = {
  enabled: boolean;
  model: string;
  timeoutMs: number;
};

function parseBool(raw: string | undefined, defaultValue: boolean): boolean {
  if (!raw) return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

function parsePositiveInt(raw: string | undefined, defaultValue: number): number {
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return Math.round(parsed);
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Math.round(value * 1000) / 1000;
}

function compact(text: string, max = 6000): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Validation response did not include JSON");
  return match[0];
}

function buildSkipped(reason: string): ValidationMetadata {
  return {
    validation_state: "skipped",
    validation_score: null,
    validation_reason: reason.slice(0, 400),
    validation_model: null,
    validated_at: null,
  };
}

export function getUpdateValidationConfig(): ValidationConfig {
  return {
    enabled: parseBool(process.env.LLM_UPDATE_VALIDATION_ENABLED ?? process.env.GPT_UPDATE_VALIDATION_ENABLED, true),
    model: process.env.LLM_UPDATE_VALIDATION_MODEL?.trim() || process.env.GPT_UPDATE_VALIDATION_MODEL?.trim() || "claude-haiku-4-5-20251001",
    timeoutMs: parsePositiveInt(process.env.LLM_UPDATE_VALIDATION_TIMEOUT_MS ?? process.env.GPT_UPDATE_VALIDATION_TIMEOUT_MS, 8000),
  };
}

export function getValidationMaxPerIngest(): number {
  return parsePositiveInt(process.env.LLM_UPDATE_VALIDATION_MAX_PER_INGEST ?? process.env.GPT_UPDATE_VALIDATION_MAX_PER_INGEST, 20);
}

export function computeUpdateContentHash(input: {
  source_id: string;
  headline: string;
  summary: string;
  original_url: string;
  update_type?: "snapshot" | "x";
}): string {
  const payload = JSON.stringify({
    source_id: input.source_id,
    headline: compact(input.headline, 1200),
    summary: compact(input.summary, 4000),
    original_url: input.original_url,
    update_type: input.update_type ?? "snapshot",
  });
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * In-memory validation result cache keyed by content hash.
 * Prevents redundant LLM calls when the same content is re-ingested.
 * Bounded to MAX_VALIDATION_CACHE_SIZE entries.
 */
const _validationCache = new Map<string, ValidationMetadata>();
const MAX_VALIDATION_CACHE_SIZE = 500;

export function getValidationCacheSize(): number {
  return _validationCache.size;
}

export async function validateOfficialUpdate(input: ValidateOfficialUpdateInput): Promise<ValidationMetadata> {
  const cfg = getUpdateValidationConfig();
  if (!cfg.enabled) return buildSkipped("LLM validation disabled by LLM_UPDATE_VALIDATION_ENABLED");
  if (!hasAnthropicKey()) return buildSkipped("ANTHROPIC_API_KEY not set; validation skipped");

  // Check in-memory cache by content hash
  const contentHash = computeUpdateContentHash(input);
  const cached = _validationCache.get(contentHash);
  if (cached) {
    return { ...cached, validation_reason: `${cached.validation_reason} (cached)` };
  }

  const nowIso = new Date().toISOString();

  try {
    const rawContext = compact(
      `${input.headline}\n\n${input.summary}\n\n${input.raw_text ?? ""}`,
      9000,
    );
    const result = await generateText({
      model: cfg.model,
      temperature: 0,
      timeoutMs: cfg.timeoutMs,
      system:
        "You classify official travel/transport updates. Return strict JSON only with keys: validated (boolean), score (0..1), reason (short string). Mark validated=true only when content is a meaningful operational/policy/travel-status update and not generic boilerplate, navigation text, or promotional filler.",
      userMessage: `source_id=${input.source_id}
update_type=${input.update_type}
original_url=${input.original_url}
headline=${compact(input.headline, 800)}
summary=${compact(input.summary, 3000)}
raw_context=${rawContext}`,
    });

    const content = result.text;
    const parsed = JSON.parse(extractJsonObject(content)) as { validated?: unknown; score?: unknown; reason?: unknown };
    const validated = parsed.validated === true;
    const scoreRaw = Number(parsed.score);
    const score = Number.isFinite(scoreRaw) ? clamp01(scoreRaw) : validated ? 0.8 : 0.2;
    const reason = typeof parsed.reason === "string" ? parsed.reason.slice(0, 400) : validated ? "Validated as actionable update" : "Classified as low-signal";

    const metadata: ValidationMetadata = {
      validation_state: validated ? "validated" : "unvalidated",
      validation_score: score,
      validation_reason: reason,
      validation_model: cfg.model,
      validated_at: nowIso,
    };

    // Store in cache (evict oldest if full)
    if (_validationCache.size >= MAX_VALIDATION_CACHE_SIZE) {
      const oldest = _validationCache.keys().next().value;
      if (oldest) _validationCache.delete(oldest);
    }
    _validationCache.set(contentHash, metadata);

    return metadata;
  } catch (error) {
    return {
      validation_state: "failed",
      validation_score: null,
      validation_reason: String(error).slice(0, 400),
      validation_model: cfg.model,
      validated_at: nowIso,
    };
  }
}
