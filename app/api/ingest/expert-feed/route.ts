import { runExpertFeedIngestion } from "@/lib/expert-feed-ingest";
import { isCronAuthorized } from "@/lib/cron-auth";
import { isSessionActive } from "@/lib/session-gate";

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isSessionActive())) {
    return Response.json({ ok: true, skipped: "no_active_session" });
  }

  try {
    const result = await runExpertFeedIngestion();
    return Response.json(result);
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
