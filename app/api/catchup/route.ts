import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  // Max 1 catch-up per 10 minutes globally
  const rl = await checkRateLimit("catchup:global", {
    maxRequests: 1,
    windowMs: 10 * 60_000,
  });
  if (!rl.allowed) {
    return Response.json({ ok: true, skipped: "rate_limited" });
  }

  const baseUrl = new URL(req.url).origin;
  const headers: Record<string, string> = {};
  if (process.env.CRON_SECRET) {
    headers["Authorization"] = `Bearer ${process.env.CRON_SECRET}`;
  } else if (process.env.INGEST_SECRET) {
    // fallback for environments without CRON_SECRET
  }

  const results: Record<string, unknown> = {};

  // 1. Bulk ingest (sources)
  try {
    const key = process.env.INGEST_SECRET ? `?key=${process.env.INGEST_SECRET}` : "";
    const res = await fetch(`${baseUrl}/api/ingest${key}`, { headers });
    results.ingest = await res.json();
  } catch (e) {
    results.ingest = { error: String(e) };
  }

  // 2. Flights ingest
  try {
    const key = process.env.INGEST_SECRET ? `?key=${process.env.INGEST_SECRET}` : "";
    const res = await fetch(`${baseUrl}/api/ingest/flights${key}`, { headers });
    results.flights = await res.json();
  } catch (e) {
    results.flights = { error: String(e) };
  }

  // 3. Brief refresh
  try {
    const key = process.env.INGEST_SECRET ? `?key=${process.env.INGEST_SECRET}` : "";
    const res = await fetch(`${baseUrl}/api/brief/refresh${key}`, { headers });
    results.brief = await res.json();
  } catch (e) {
    results.brief = { error: String(e) };
  }

  return Response.json({ ok: true, catchup: true, results });
}
