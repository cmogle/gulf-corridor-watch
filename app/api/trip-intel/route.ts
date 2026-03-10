import { Observation } from "@/lib/route-health";
import { generateTripBrief } from "@/lib/trip-intelligence";
import { getSupabaseAdmin } from "@/lib/supabase";

const SELECT_COLUMNS =
  "airport,flight_number,callsign,icao24,flight_id,airline,origin_iata,origin_name,destination_iata,destination_name,scheduled_time,estimated_time,actual_time,status,is_delayed,delay_minutes,source_url,raw_payload,fetched_at";

function parseRouteParam(raw: string | null): { origin: string; destination: string } | null {
  if (!raw) return null;
  const normalized = raw.toUpperCase().replace(/→|>/g, "-");
  const parts = normalized.split("-").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2 && /^[A-Z]{3}$/.test(parts[0]) && /^[A-Z]{3}$/.test(parts[1])) {
    return { origin: parts[0], destination: parts[1] };
  }
  const match = normalized.match(/([A-Z]{3}).*([A-Z]{3})/);
  if (match) return { origin: match[1], destination: match[2] };
  return null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = parseRouteParam(searchParams.get("route"));

  if (!parsed) {
    return Response.json({ ok: false, error: "Missing or invalid route (expected DXB-BOM)" }, { status: 400 });
  }

  const { origin, destination } = parsed;

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
    const routeLabel = `${origin}-${destination}`;
    const brief = generateTripBrief(routeLabel, observations);

    return Response.json({
      ok: true,
      route: routeLabel,
      samples: observations.length,
      brief,
    });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
