/**
 * Shared authentication for cron-triggered API routes.
 *
 * Supports two methods:
 *  1. Vercel CRON_SECRET — sent automatically as `Authorization: Bearer <value>`
 *  2. Query-param `?key=<value>` — checked against INGEST_SECRET (manual/legacy use)
 */
export function isCronAuthorized(req: Request): boolean {
  // 1. Vercel CRON_SECRET header (primary — used by Vercel cron jobs)
  const authHeader = req.headers.get("authorization");
  if (authHeader && process.env.CRON_SECRET) {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (token === process.env.CRON_SECRET) return true;
  }

  // 2. Query-param key (fallback — manual invocation / legacy)
  const key = new URL(req.url).searchParams.get("key");
  if (key) {
    if (process.env.INGEST_SECRET && key === process.env.INGEST_SECRET) return true;
    if (process.env.BRIEF_SECRET && key === process.env.BRIEF_SECRET) return true;
  }

  // 3. No secrets configured at all → allow (local dev)
  if (!process.env.CRON_SECRET && !process.env.INGEST_SECRET) return true;

  return false;
}
