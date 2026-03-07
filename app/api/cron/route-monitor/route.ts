import { getSupabaseAdmin } from "@/lib/supabase";
import { ingestAirports } from "@/lib/flightradar";
import { isCronAuthorized } from "@/lib/cron-auth";

export const maxDuration = 30;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  try {
    if (!process.env.FLIGHTRADAR_KEY) {
      return Response.json({
        ok: false,
        error: "FLIGHTRADAR_KEY not configured",
      }, { status: 500 });
    }

    // Fetch ALL live positions in UAE/Gulf airspace
    const allObs = await ingestAirports(["DXB"]);

    // Filter to only DXB-related flights (departing from or arriving to DXB)
    const dxbObs = allObs.filter(
      (o) => o.origin_iata === "DXB" || o.destination_iata === "DXB" || o.airport === "DXB"
    );

    let insertedCount = 0;

    if (dxbObs.length > 0) {
      const { error, count } = await supabase
        .from("flight_observations")
        .insert(dxbObs);
      if (error) throw error;
      insertedCount = count ?? dxbObs.length;
    }

    const fzBegCount = dxbObs.filter(
      (o) => o.flight_number.startsWith("FZ") && o.destination_iata === "BEG"
    ).length;

    return Response.json({
      ok: true,
      total_positions: allObs.length,
      dxb_stored: insertedCount,
      fz_beg: fzBegCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Route monitor cron failed:", error);
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
