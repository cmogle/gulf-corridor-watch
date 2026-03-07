import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const recent30m = new Date(now.getTime() - 30 * 60_000).toISOString();
  const past24h = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();

  const [fzBegResult, dxbResult] = await Promise.all([
    // FZ → BEG observations from last 24h (shows history of route activity)
    supabase
      .from("flight_observations")
      .select("*")
      .like("flight_number", "FZ%")
      .eq("destination_iata", "BEG")
      .gte("fetched_at", past24h)
      .order("fetched_at", { ascending: false }),

    // All DXB departures from last 30min (live airport pulse)
    // We get the latest observation per flight to deduplicate
    supabase
      .from("flight_observations")
      .select("*")
      .eq("origin_iata", "DXB")
      .gte("fetched_at", recent30m)
      .order("fetched_at", { ascending: false })
      .limit(300),
  ]);

  if (fzBegResult.error) {
    return Response.json(
      { error: String(fzBegResult.error) },
      { status: 500 }
    );
  }

  // Deduplicate FZ→BEG: keep latest observation per flight_number
  const fzBegAll = fzBegResult.data ?? [];
  const fzBegLatest = deduplicateByFlight(fzBegAll);

  // Deduplicate DXB departures: keep latest observation per flight_number
  const dxbAll = dxbResult.data ?? [];
  const dxbDepartures = deduplicateByFlight(dxbAll);

  // Count airborne/departed vs on_ground for DXB stats
  const airborneCount = dxbDepartures.filter(
    (d) => ["airborne", "cruise", "departure"].includes(d.status)
  ).length;
  const onGroundCount = dxbDepartures.filter(
    (d) => d.status === "on_ground"
  ).length;

  return Response.json({
    fzBegFlights: fzBegLatest,
    dxbDepartures,
    dxbStats: {
      total: dxbDepartures.length,
      airborne: airborneCount,
      onGround: onGroundCount,
    },
    queriedAt: now.toISOString(),
  });
}

type Observation = {
  flight_number: string;
  fetched_at: string;
  [key: string]: unknown;
};

/** Keep only the most recent observation per flight_number */
function deduplicateByFlight<T extends Observation>(observations: T[]): T[] {
  const seen = new Map<string, T>();
  for (const obs of observations) {
    if (!seen.has(obs.flight_number)) {
      seen.set(obs.flight_number, obs);
    }
  }
  return Array.from(seen.values());
}
