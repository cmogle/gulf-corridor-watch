import { refreshCurrentStateBrief } from "@/lib/current-state-brief";
import { logLlmTelemetry } from "@/lib/llm-telemetry";
import { isCronAuthorized } from "@/lib/cron-auth";
import { isSessionActive } from "@/lib/session-gate";
import { buildSituationContext, invalidateSituationContextCache } from "@/lib/chat-context";
import { refreshPrecomputedAnswers } from "@/lib/precomputed-answers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const startedAt = Date.now();

  if (!isCronAuthorized(req)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isSessionActive())) {
    return Response.json({ ok: true, skipped: "no_active_session" });
  }

  try {
    const result = await refreshCurrentStateBrief();

    // Invalidate the situation context cache so next chat picks up fresh data
    invalidateSituationContextCache();

    // When the brief was regenerated, refresh precomputed answers in the background.
    // This runs after the brief response is assembled so it doesn't block the cron.
    let precomputedResult: { generated: number; skipped: number; errors: number } | null = null;
    if (result.regenerated) {
      try {
        const situationContext = await buildSituationContext();
        precomputedResult = await refreshPrecomputedAnswers(situationContext, result.input_hash);
      } catch (err) {
        console.error("Precomputed answers refresh failed:", err);
      }
    }

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
        precomputed_answers: precomputedResult,
      },
    });
    return Response.json({
      ok: true,
      regenerated: result.regenerated,
      reason: result.reason,
      item: result.item,
      precomputed_answers: precomputedResult,
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    const errorDetail = error instanceof Error ? error.message : JSON.stringify(error);
    console.error("Brief refresh failed:", errorDetail, error);
    logLlmTelemetry("brief_refresh_request", {
      route: "/api/brief/refresh",
      mode: "http",
      success: false,
      duration_ms: Date.now() - startedAt,
      error: errorDetail,
    });
    return Response.json({ ok: false, error: errorDetail }, { status: 500 });
  }
}
