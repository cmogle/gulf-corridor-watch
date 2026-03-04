import { getFeedBackend } from "@/lib/feed-backend";
import { OFFICIAL_SOURCES } from "@/lib/sources";
import { ingestSingleSource } from "@/lib/ingest";
import { ingestTrustedSourceById, isXSourceId } from "@/lib/trusted-feed-ingest";
import { isCronAuthorized } from "@/lib/cron-auth";

export const maxDuration = 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  const { sourceId } = await params;

  if (!isCronAuthorized(req)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    // X sources always go through V2 trusted feed (they don't exist in OFFICIAL_SOURCES)
    if (getFeedBackend() === "v2" || isXSourceId(sourceId)) {
      const result = await ingestTrustedSourceById(sourceId);
      if (result.fetch_error_code === "unknown_source") {
        return Response.json({ ok: false, error: `Unknown source: ${sourceId}` }, { status: 404 });
      }
      return Response.json({
        ok: true,
        source_id: sourceId,
        run_id: result.run_id,
        fetch_status: result.fetch_status,
        fetch_error_code: result.fetch_error_code,
        published_count: result.published_count,
        rejected_count: result.rejected_count,
        health_state: result.health_state,
        skipped: result.skipped ?? false,
        reason: result.reason ?? null,
      });
    }

    const source = OFFICIAL_SOURCES.find((s) => s.id === sourceId);
    if (!source) {
      return Response.json({ ok: false, error: `Unknown source: ${sourceId}` }, { status: 404 });
    }

    const result = await ingestSingleSource(source);
    return Response.json({
      ok: true,
      source_id: source.id,
      reliability: result.snapshot.reliability,
      llm_fallback_used: result.llm_fallback_used,
      summary_preview: result.snapshot.summary.slice(0, 200),
    });
  } catch (error) {
    return Response.json({ ok: false, source_id: sourceId, error: String(error) }, { status: 500 });
  }
}
