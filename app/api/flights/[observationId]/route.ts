import { loadFocusedFlightDetail } from "@/lib/focused-monitor-data";

export const dynamic = "force-dynamic";

type Params = {
  observationId: string;
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<Params> },
) {
  const { observationId } = await ctx.params;

  if (!observationId) {
    return Response.json({ ok: false, error: "Missing observationId" }, { status: 400 });
  }

  try {
    const detail = await loadFocusedFlightDetail(observationId);
    if (!detail) {
      return Response.json(
        { ok: false, error: "No recent real observations available for this flight" },
        { status: 404 },
      );
    }

    return Response.json({ ok: true, flight: detail });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
