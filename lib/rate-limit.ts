/**
 * Server-side rate limiter for API routes.
 *
 * Uses Vercel KV (Redis) when KV_REST_API_URL + KV_REST_API_TOKEN are set,
 * providing a **global** rate limit across all lambda instances.
 * Falls back to in-memory sliding-window per-instance when KV is unavailable.
 */

import { kv } from "@vercel/kv";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// KV availability check
// ---------------------------------------------------------------------------

function kvAvailable(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

// ---------------------------------------------------------------------------
// KV-backed rate limiter (global across all lambda instances)
// ---------------------------------------------------------------------------

async function checkRateLimitKV(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const windowSec = Math.ceil(config.windowMs / 1000);
  const kvKey = `rl:${key}`;

  try {
    // INCR + EXPIRE is atomic enough for rate limiting.
    // The key auto-expires after the window, so no cleanup needed.
    const count = await kv.incr(kvKey);

    // Set TTL only on the first request in the window
    if (count === 1) {
      await kv.expire(kvKey, windowSec);
    }

    if (count > config.maxRequests) {
      const ttl = await kv.ttl(kvKey);
      return {
        allowed: false,
        remaining: 0,
        resetMs: (ttl > 0 ? ttl : windowSec) * 1000,
      };
    }

    return {
      allowed: true,
      remaining: config.maxRequests - count,
      resetMs: config.windowMs,
    };
  } catch {
    // KV failure → fall through to in-memory (fail open)
    return checkRateLimitMemory(key, config);
  }
}

// ---------------------------------------------------------------------------
// In-memory fallback (per-instance)
// ---------------------------------------------------------------------------

type RateLimitEntry = { timestamps: number[] };
const _buckets = new Map<string, RateLimitEntry>();
let _lastEvict = 0;
const EVICT_INTERVAL_MS = 5 * 60_000;

function evictStale(maxAgeMs: number): void {
  const cutoff = Date.now() - maxAgeMs;
  for (const [k, entry] of _buckets) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) _buckets.delete(k);
  }
}

function checkRateLimitMemory(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
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
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetMs: entry.timestamps[0] + config.windowMs - now };
  }

  entry.timestamps.push(now);
  return { allowed: true, remaining: config.maxRequests - entry.timestamps.length, resetMs: config.windowMs };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check and consume a rate limit token for the given key (usually IP).
 * Uses KV when available, in-memory otherwise.
 */
export async function checkRateLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
  if (kvAvailable()) {
    return checkRateLimitKV(key, config);
  }
  return checkRateLimitMemory(key, config);
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

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

/**
 * Rate limit config for the chat endpoint.
 * Defaults: 15 requests per 15 minutes per IP.
 */
export function getChatRateLimitConfig(): RateLimitConfig {
  return {
    maxRequests: parsePositiveInt(process.env.CHAT_RATE_LIMIT_MAX, 15),
    windowMs: parsePositiveInt(process.env.CHAT_RATE_LIMIT_WINDOW_MINUTES, 15) * 60_000,
  };
}

/**
 * Daily limit for anonymous (unauthenticated) users, keyed by IP.
 * Defaults: 5 requests per 24 hours.
 * Override with ANON_DAILY_LIMIT_MAX env var.
 */
export function getAnonDailyLimitConfig(): RateLimitConfig {
  return {
    maxRequests: parsePositiveInt(process.env.ANON_DAILY_LIMIT_MAX, 5),
    windowMs: 24 * 60 * 60_000,
  };
}
