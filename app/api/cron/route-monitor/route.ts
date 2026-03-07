import { getSupabaseAdmin } from "@/lib/supabase";
import { fetchAirportBoard } from "@/lib/flight-schedules";
import { ingestAirports } from "@/lib/flightradar";
import { isCronAuthorized } from "@/lib/cron-auth";

export const maxDuration = 30;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  let scheduleCount = 0;
  let observationCount = 0;

  try {
    // 1. Fetch DXB departure board and filter to FZ → BEG
    const departures = await fetchAirportBoard("DXB", "departure");
    const fzBeg = departures.filter(
      (f) =>
        f.flight_number.startsWith("FZ") &&
        f.destination_iata === "BEG"
    );

    if (fzBeg.length > 0) {
      const { error } = await supabase
        .from("flight_schedules")
        .upsert(fzBeg, {
          onConflict: "airport,board_type,flight_number,scheduled_time",
        });
      if (error) throw error;
      scheduleCount = fzBeg.length;
    }

    // 2. Fetch live positions and filter to FZ → BEG
    if (process.env.FLIGHTRADAR_KEY) {
      try {
        const allObs = await ingestAirports(["DXB"]);
        const fzBegObs = allObs.filter(
          (o) =>
            o.flight_number.startsWith("FZ") &&
            o.destination_iata === "BEG"
        );

        if (fzBegObs.length > 0) {
          const { error } = await supabase
            .from("flight_observations")
            .insert(fzBegObs);
          if (error) throw error;
          observationCount = fzBegObs.length;
        }
      } catch (err) {
        console.error("Live position fetch failed:", err);
      }
    }

    return Response.json({
      ok: true,
      schedules: scheduleCount,
      observations: observationCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Route monitor cron failed:", error);
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
