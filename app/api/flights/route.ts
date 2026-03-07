import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const past24h = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
  const future48h = new Date(now.getTime() + 48 * 60 * 60_000).toISOString();
  const recent10m = new Date(now.getTime() - 10 * 60_000).toISOString();

  const [schedResult, obsResult] = await Promise.all([
    supabase
      .from("flight_schedules")
      .select("*")
      .eq("airport", "DXB")
      .eq("board_type", "departure")
      .like("flight_number", "FZ%")
      .eq("destination_iata", "BEG")
      .gte("scheduled_time", past24h)
      .lte("scheduled_time", future48h)
      .order("scheduled_time", { ascending: true }),

    supabase
      .from("flight_observations")
      .select("*")
      .like("flight_number", "FZ%")
      .eq("destination_iata", "BEG")
      .gte("fetched_at", recent10m)
      .order("fetched_at", { ascending: false }),
  ]);

  if (schedResult.error) {
    return Response.json(
      { error: String(schedResult.error) },
      { status: 500 }
    );
  }

  return Response.json({
    schedules: schedResult.data ?? [],
    livePositions: obsResult.data ?? [],
    queriedAt: now.toISOString(),
  });
}
