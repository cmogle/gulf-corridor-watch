import { getFeedBackend } from "@/lib/feed-backend";
import { runIngestion } from "@/lib/ingest";
import { runTrustedFeedIngestion } from "@/lib/trusted-feed-ingest";
import { TRUSTED_FEED_CORE_SOURCE_IDS } from "@/lib/trusted-feed-core-sources";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ingestAirports, type AirportCode } from "@/lib/flightradar";
import { ingestAirportsOpenSky } from "@/lib/opensky";
import { isCronAuthorized } from "@/lib/cron-auth";
import { detectCrisisEvent } from "@/lib/crisis-detection";

const AIRPORTS: AirportCode[] = ["DXB", "AUH"];

async function ingestFlights(): Promise<{ flights_ingested: number; flight_source: string; flight_error?: string }> {
  const supabase = getSupabaseAdmin();
  let usedSource = "flightradar";
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
    return { flights_ingested: flights.length, flight_source: usedSource };
  } catch (error) {
    return { flights_ingested: 0, flight_source: usedSource, flight_error: String(error) };
  }
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const scope = params.get("scope") === "airline" ? "airline" : "full";
  const sourceId = params.get("sourceId")?.trim() ?? null;

  if (!isCronAuthorized(req)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (getFeedBackend() === "v2") {
      const requestedIds = sourceId
        ? [sourceId]
        : scope === "airline"
          ? TRUSTED_FEED_CORE_SOURCE_IDS.filter((id) =>
              ["emirates_updates", "etihad_advisory", "air_arabia_updates", "flydubai_updates", "oman_air"].includes(id),
            )
          : [...TRUSTED_FEED_CORE_SOURCE_IDS];

      const [feedResult, flightResult] = await Promise.all([
        runTrustedFeedIngestion({ sourceIds: requestedIds }),
        (scope === "airline" || scope === "full") ? ingestFlights() : Promise.resolve(null),
      ]);

      // Post-ingestion: check for crisis conditions
      let crisis_event_created: string | null = null;
      try {
        crisis_event_created = await detectCrisisEvent();
      } catch {
        // Crisis detection is non-critical
      }

      return Response.json({ ...feedResult, ...flightResult, crisis_event_created });
    }

    const result = await runIngestion({ scope });

    // Post-ingestion: check for crisis conditions
    let crisis_event_created: string | null = null;
    try {
      crisis_event_created = await detectCrisisEvent();
    } catch {
      // Crisis detection is non-critical
    }

    return Response.json({ ok: true, ...result, crisis_event_created });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
