import { getSupabaseAdmin } from "@/lib/supabase";
import { RouteMonitor } from "./components/route-monitor";

export const dynamic = "force-dynamic";

async function loadInitialData() {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const recent30m = new Date(now.getTime() - 30 * 60_000).toISOString();
  const past24h = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();

  const [fzBegResult, dxbResult] = await Promise.all([
    // FZ → BEG observations from last 24h
    supabase
      .from("flight_observations")
      .select("*")
      .like("flight_number", "FZ%")
      .eq("destination_iata", "BEG")
      .gte("fetched_at", past24h)
      .order("fetched_at", { ascending: false }),

    // All DXB departures from last 30min (live airport pulse)
    supabase
      .from("flight_observations")
      .select("*")
      .eq("origin_iata", "DXB")
      .gte("fetched_at", recent30m)
      .order("fetched_at", { ascending: false })
      .limit(300),
  ]);

  const fzBegAll = fzBegResult.data ?? [];
  const dxbAll = dxbResult.data ?? [];

  // Deduplicate: keep latest observation per flight_number
  const fzBegFlights = deduplicateByFlight(fzBegAll);
  const dxbDepartures = deduplicateByFlight(dxbAll);

  const airborneCount = dxbDepartures.filter(
    (d: { status: string }) => ["airborne", "cruise", "departure"].includes(d.status)
  ).length;
  const onGroundCount = dxbDepartures.filter(
    (d: { status: string }) => d.status === "on_ground"
  ).length;

  return {
    fzBegFlights,
    dxbDepartures,
    dxbStats: {
      total: dxbDepartures.length,
      airborne: airborneCount,
      onGround: onGroundCount,
    },
    queriedAt: now.toISOString(),
  };
}

function deduplicateByFlight<T extends { flight_number: string }>(observations: T[]): T[] {
  const seen = new Map<string, T>();
  for (const obs of observations) {
    if (!seen.has(obs.flight_number)) {
      seen.set(obs.flight_number, obs);
    }
  }
  return Array.from(seen.values());
}

export default async function Home() {
  const initial = await loadInitialData();

  return <RouteMonitor initial={initial} />;
}
