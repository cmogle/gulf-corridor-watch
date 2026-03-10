import { ObservationLike, enrichWithObservations, getSchedule } from "@/lib/emirates-schedule";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const origin = (searchParams.get("origin") ?? "").toUpperCase();
    const destination = (searchParams.get("destination") ?? "").toUpperCase();

    if (!origin || !destination) {
      return Response.json({ ok: false, error: "Missing origin or destination" }, { status: 400 });
    }

    const baseSchedule = getSchedule(origin, destination);
    if (baseSchedule.length === 0) {
      return Response.json({ ok: true, origin, destination, schedule: [], observations_used: 0 });
    }

    let observations: ObservationLike[] = [];
    try {
      const supabase = getSupabaseAdmin();
      const lookbackHours = 24 * 7;
      const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("flight_observations")
        .select(
          "flight_number,origin_iata,destination_iata,status,is_delayed,delay_minutes,scheduled_time,estimated_time,actual_time,fetched_at",
        )
        .eq("origin_iata", origin)
        .eq("destination_iata", destination)
        .gte("fetched_at", cutoff)
        .order("fetched_at", { ascending: false })
        .limit(750);
      if (error) throw error;
      observations = (data ?? []) as ObservationLike[];
    } catch (dbError) {
      // Soft fail: return schedule without enrichment
      return Response.json({
        ok: true,
        origin,
        destination,
        schedule: baseSchedule,
        warning: `Could not load observations: ${String(dbError)}`,
      });
    }

    const schedule = enrichWithObservations(baseSchedule, observations);
    return Response.json({ ok: true, origin, destination, schedule, observations_used: observations.length });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
