import { getFeedBackend } from "@/lib/feed-backend";
import { loadTrustedSourceHistory } from "@/lib/trusted-feed-repo";
import { loadUnifiedSourceHistory } from "@/lib/unified-updates";

function parseLimit(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function parseBefore(raw: string | null): string | null {
  if (!raw) return null;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

function parseBool(raw: string | null): boolean {
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export async function GET(req: Request, ctx: { params: Promise<{ sourceId: string }> }) {
  try {
    const { sourceId } = await ctx.params;
    if (!sourceId) return Response.json({ ok: false, error: "Missing sourceId" }, { status: 400 });

    const url = new URL(req.url);
    const limit = parseLimit(url.searchParams.get("limit"));
    const before = parseBefore(url.searchParams.get("before"));
    const backend = getFeedBackend();

    if (backend === "v2") {
      const includeFailures = parseBool(url.searchParams.get("include_failures"));
      const result = await loadTrustedSourceHistory(sourceId, {
        limit,
        before,
        include_failures: includeFailures,
      });

      return Response.json({
        ok: true,
        source_id: sourceId,
        count: result.items.length,
        next_before: result.next_before,
        source_health: result.source_health,
        items: result.items,
        fetched_at: new Date().toISOString(),
      });
    }

    const result = await loadUnifiedSourceHistory(sourceId, { limit, before });

    return Response.json({
      ok: true,
      source_id: sourceId,
      count: result.items.length,
      next_before: result.next_before,
      items: result.items,
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
