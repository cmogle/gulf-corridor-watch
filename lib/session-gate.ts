/**
 * Session-gated cron support.
 *
 * Tracks site activity via Vercel KV so cron handlers can skip work
 * when nobody is using the site. Fail-open: if KV is unavailable,
 * crons run normally.
 */

import { kv } from "@vercel/kv";

const SESSION_KEY = "site:last_active";
const SESSION_TTL_SEC = 3600; // auto-expire after 1 hour of no writes

function kvAvailable(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

/** Diagnostic helper — returns KV availability info (no secrets). */
export function kvStatus(): { available: boolean; url_set: boolean; token_set: boolean } {
  return {
    available: kvAvailable(),
    url_set: Boolean(process.env.KV_REST_API_URL),
    token_set: Boolean(process.env.KV_REST_API_TOKEN),
  };
}

/** Record a heartbeat — sets the current timestamp in KV. */
export async function recordHeartbeat(): Promise<void> {
  if (!kvAvailable()) return;
  try {
    await kv.set(SESSION_KEY, Date.now(), { ex: SESSION_TTL_SEC });
  } catch (err) {
    console.error("KV heartbeat write failed:", err);
  }
}

/**
 * Check whether any user session has been active within `windowMinutes`.
 * Fail-open: returns true if KV is unavailable.
 */
export async function isSessionActive(windowMinutes = 30): Promise<boolean> {
  if (!kvAvailable()) return true;
  try {
    const ts = await kv.get<number>(SESSION_KEY);
    if (ts === null || ts === undefined) return false;
    return Date.now() - ts < windowMinutes * 60_000;
  } catch {
    return true; // fail-open
  }
}

/**
 * Returns minutes since last activity, or null if unknown.
 * Used by catch-up logic to decide whether to trigger bulk ingest.
 */
export async function getInactivityMinutes(): Promise<number | null> {
  if (!kvAvailable()) return null;
  try {
    const ts = await kv.get<number>(SESSION_KEY);
    if (ts === null || ts === undefined) return null;
    return Math.round((Date.now() - ts) / 60_000);
  } catch (err) {
    console.error("KV inactivity read failed:", err);
    return null;
  }
}
