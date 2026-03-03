import { requireUserId } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: Request) {
  try {
    const userId = await requireUserId(req);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("user_tracking_items")
      .select("id,kind,flight_number,origin_iata,destination_iata,label,created_at,updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return Response.json({ ok: true, items: data ?? [] });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId(req);
    const body = await req.json();
    const kind = body?.kind === "route" ? "route" : "flight";
    const payload = {
      user_id: userId,
      kind,
      flight_number: kind === "flight" ? String(body?.flight_number ?? "").toUpperCase().trim() : null,
      origin_iata: kind === "route" ? String(body?.origin_iata ?? "").toUpperCase().trim() : null,
      destination_iata: kind === "route" ? String(body?.destination_iata ?? "").toUpperCase().trim() : null,
      label: String(body?.label ?? "").trim(),
    };
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("user_tracking_items")
      .upsert(payload, { onConflict: "user_id,kind,flight_number,origin_iata,destination_iata" })
      .select("id,kind,flight_number,origin_iata,destination_iata,label,created_at,updated_at")
      .single();
    if (error) throw error;
    return Response.json({ ok: true, item: data });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 401 });
  }
}
