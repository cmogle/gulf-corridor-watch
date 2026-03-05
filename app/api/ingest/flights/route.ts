import { getSupabaseAdmin } from "@/lib/supabase";
import { ingestAirports, type AirportCode } from "@/lib/flightradar";
import { ingestAirportsOpenSky } from "@/lib/opensky";
import { fetchAllBoards } from "@/lib/flight-schedules";
import { isCronAuthorized } from "@/lib/cron-auth";

const AIRPORTS: AirportCode[] = ["DXB", "AUH", "DWC"];

export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  let usedSource = "flightradar";
  let flightCount = 0;
  let scheduleCount = 0;

  try {
    let flights: Awaited<ReturnType<typeof ingestAirports>> = [];

    if (process.env.FLIGHTRADAR_KEY) {
      try {
        flights = await ingestAirports([...AIRPORTS]);
      } catch (fr24err) {
        const msg = String(fr24err);
        if (/403|401|Forbidden|Unauthorized/i.test(msg)) {
          flights = await ingestAirportsOpenSky();
          usedSource = "opensky";
        } else {
          throw fr24err;
        }
      }
    } else {
      flights = await ingestAirportsOpenSky();
      usedSource = "opensky";
    }

    if (flights.length > 0) {
      const { error: insertError } = await supabase.from("flight_observations").insert(flights);
      if (insertError) throw insertError;
    }
    flightCount = flights.length;

    // Fetch departure/arrival boards for schedule data (FR24 only)
    if (process.env.FLIGHTRADAR_KEY) {
      try {
        const schedules = await fetchAllBoards();
        if (schedules.length > 0) {
          const { error: scheduleError } = await supabase
            .from("flight_schedules")
            .upsert(schedules, { onConflict: "airport,board_type,flight_number,scheduled_time" });
          if (scheduleError) throw scheduleError;
          scheduleCount = schedules.length;
        }
      } catch (scheduleErr) {
        // Schedule fetch is non-critical; log but don't fail the whole ingest
        console.error("Schedule board fetch failed:", scheduleErr);
      }
    }

    return Response.json({
      ok: true,
      source: usedSource,
      flights_ingested: flightCount,
      schedules_ingested: scheduleCount,
    });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
