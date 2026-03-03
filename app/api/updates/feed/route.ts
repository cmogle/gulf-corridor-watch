import { loadUnifiedFeed } from "@/lib/unified-updates";

function parseLimit(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = parseLimit(url.searchParams.get("limit"));
    const items = await loadUnifiedFeed(limit);
    return Response.json({ ok: true, count: items.length, items, fetched_at: new Date().toISOString() });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
