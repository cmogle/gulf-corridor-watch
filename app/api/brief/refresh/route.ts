import { refreshCurrentStateBrief } from "@/lib/current-state-brief";
import { logLlmTelemetry } from "@/lib/llm-telemetry";
import { isCronAuthorized } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const startedAt = Date.now();

  if (!isCronAuthorized(req)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshCurrentStateBrief();
    logLlmTelemetry("brief_refresh_request", {
      route: "/api/brief/refresh",
      mode: "http",
      model: result.item.model,
      success: true,
      duration_ms: Date.now() - startedAt,
      fallback_reason: result.reason,
      context: {
        regenerated: result.regenerated,
        freshness_state: result.item.freshness_state,
        confidence: result.item.confidence,
      },
    });
    return Response.json({
      ok: true,
      regenerated: result.regenerated,
      reason: result.reason,
      item: result.item,
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    logLlmTelemetry("brief_refresh_request", {
      route: "/api/brief/refresh",
      mode: "http",
      success: false,
      duration_ms: Date.now() - startedAt,
      error: String(error),
    });
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
