import { getSupabaseAdmin } from "@/lib/supabase";
import { ingestAirports, type AirportCode } from "@/lib/flightradar";
import { ingestAirportsOpenSky } from "@/lib/opensky";
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

    return Response.json({
      ok: true,
      source: usedSource,
      flights_ingested: flightCount,
    });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
