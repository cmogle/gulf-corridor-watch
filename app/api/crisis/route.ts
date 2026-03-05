import { getActiveEventsWithStats } from "@/lib/crisis-stats";
import { getCrisisTimeline } from "@/lib/crisis-timeline";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = await getActiveEventsWithStats();

    if (events.length === 0) {
      return Response.json({ ok: true, active: false, events: [] });
    }

    // Get timeline and trend for the most recent active event
    const primary = events[0];
    const timeline = await getCrisisTimeline(primary);

    return Response.json({
      ok: true,
      active: true,
      primary: {
        event: primary,
        timeline: timeline.entries.slice(0, 30),
        trend: timeline.trend,
      },
      events: events.map((e) => ({
        id: e.id,
        name: e.name,
        category: e.category,
        started_at: e.started_at,
        is_active: e.is_active,
        stats: e.stats,
      })),
    });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
