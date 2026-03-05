/**
 * Server-side rate limiter for API routes.
 *
 * In-memory sliding-window rate limiting by IP address.
 * On Vercel serverless, state is per-lambda-instance — a determined attacker
 * could hit different instances. For stronger enforcement, use Vercel KV
 * or Upstash Redis. This layer stops casual abuse and runaway loops.
 */

type RateLimitEntry = {
  timestamps: number[];
};

const _buckets = new Map<string, RateLimitEntry>();

/** Evict entries older than maxAgeMs to prevent unbounded memory growth. */
function evictStale(maxAgeMs: number): void {
  const cutoff = Date.now() - maxAgeMs;
  for (const [key, entry] of _buckets) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) _buckets.delete(key);
  }
}

// Periodic cleanup every 5 minutes
let _lastEvict = 0;
const EVICT_INTERVAL_MS = 5 * 60_000;

type RateLimitConfig = {
  /** Max requests allowed in the window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetMs: number;
};

/**
 * Check and consume a rate limit token for the given key (usually IP).
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();

  // Periodic eviction
  if (now - _lastEvict > EVICT_INTERVAL_MS) {
    evictStale(config.windowMs * 2);
    _lastEvict = now;
  }

  const cutoff = now - config.windowMs;
  let entry = _buckets.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    _buckets.set(key, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= config.maxRequests) {
    const oldest = entry.timestamps[0];
    return {
      allowed: false,
      remaining: 0,
      resetMs: oldest + config.windowMs - now,
    };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: config.maxRequests - entry.timestamps.length,
    resetMs: config.windowMs,
  };
}

/**
 * Extract client IP from request headers (Vercel / Cloudflare / fallback).
 */
export function getClientIp(req: Request): string {
  const headers = req.headers;
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

// ---- Default chat rate limit config ----

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

/**
 * Rate limit config for the chat endpoint.
 * Defaults: 15 requests per 15 minutes per IP.
 * Override via CHAT_RATE_LIMIT_MAX and CHAT_RATE_LIMIT_WINDOW_MINUTES.
 */
export function getChatRateLimitConfig(): RateLimitConfig {
  return {
    maxRequests: parsePositiveInt(process.env.CHAT_RATE_LIMIT_MAX, 15),
    windowMs: parsePositiveInt(process.env.CHAT_RATE_LIMIT_WINDOW_MINUTES, 15) * 60_000,
  };
}
