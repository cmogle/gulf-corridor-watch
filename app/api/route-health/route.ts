import { computeRouteHealth, Observation } from "@/lib/route-health";
import { getSupabaseAdmin } from "@/lib/supabase";

const SELECT_COLUMNS =
  "airport,flight_number,callsign,icao24,flight_id,airline,origin_iata,origin_name,destination_iata,destination_name,scheduled_time,estimated_time,actual_time,status,is_delayed,delay_minutes,source_url,raw_payload,fetched_at";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const origin = searchParams.get("origin")?.toUpperCase();
  const destination = searchParams.get("destination")?.toUpperCase();

  if (!origin || !destination) {
    return Response.json({ ok: false, error: "Missing origin or destination" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("flight_observations")
      .select(SELECT_COLUMNS)
      .eq("origin_iata", origin)
      .eq("destination_iata", destination)
      .order("fetched_at", { ascending: false })
      .limit(1200);

    if (error) throw error;

    const observations = (data ?? []) as Observation[];
    const health = computeRouteHealth(observations);

    return Response.json({
      ok: true,
      route: `${origin}-${destination}`,
      samples: observations.length,
      health,
    });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
