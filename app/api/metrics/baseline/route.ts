import { getSupabaseAdmin } from "@/lib/supabase";
import { isCronAuthorized } from "@/lib/cron-auth";
import { isSessionActive } from "@/lib/session-gate";
import { loadTrustedFeed, loadTrustedSourceHealth, recordFeedBaselineMetric } from "@/lib/trusted-feed-repo";
import { loadUnifiedFeed } from "@/lib/unified-updates";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isSessionActive())) {
    return Response.json({ ok: true, skipped: "no_active_session" });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: latestSnapshots, error: snapshotErr } = await supabase
      .from("latest_source_snapshots")
      .select("source_id,reliability");
    if (snapshotErr) throw snapshotErr;

    const v1Feed = await loadUnifiedFeed(80);
    const v1TotalSources = (latestSnapshots ?? []).length;
    const v1Healthy = (latestSnapshots ?? []).filter((row) => row.reliability === "reliable").length;
    const v1Degraded = Math.max(0, v1TotalSources - v1Healthy);

    await recordFeedBaselineMetric({
      backend: "v1",
      sources_total: v1TotalSources,
      sources_healthy: v1Healthy,
      sources_degraded: v1Degraded,
      feed_item_count: v1Feed.length,
      published_count: v1Feed.length,
      notes: { sample_limit: 80 },
    });

    const v2Health = await loadTrustedSourceHealth();
    const v2Feed = await loadTrustedFeed(80);

    const { count: v2Published24h, error: v2CountErr } = await supabase
      .from("source_events_v2")
      .select("event_id", { count: "exact", head: true })
      .eq("quality_state", "published")
      .gte("event_time", new Date(Date.now() - 24 * 60 * 60_000).toISOString());
    if (v2CountErr) throw v2CountErr;

    const v2TotalSources = v2Health.length;
    const v2Healthy = v2Health.filter((row) => row.health_state === "healthy").length;
    const v2Degraded = Math.max(0, v2TotalSources - v2Healthy);

    await recordFeedBaselineMetric({
      backend: "v2",
      sources_total: v2TotalSources,
      sources_healthy: v2Healthy,
      sources_degraded: v2Degraded,
      feed_item_count: v2Feed.length,
      published_count: v2Published24h ?? 0,
      notes: { sample_limit: 80, window_hours: 24 },
    });

    return Response.json({
      ok: true,
      captured_at: new Date().toISOString(),
      metrics: {
        v1: {
          sources_total: v1TotalSources,
          sources_healthy: v1Healthy,
          sources_degraded: v1Degraded,
          feed_item_count: v1Feed.length,
        },
        v2: {
          sources_total: v2TotalSources,
          sources_healthy: v2Healthy,
          sources_degraded: v2Degraded,
          feed_item_count: v2Feed.length,
          published_24h: v2Published24h ?? 0,
        },
      },
    });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
