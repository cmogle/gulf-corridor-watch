import { requireUserId } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase";

type ImportItem = {
  kind?: "flight" | "route";
  flight_number?: string | null;
  origin_iata?: string | null;
  destination_iata?: string | null;
  label?: string | null;
};

export async function POST(req: Request) {
  try {
    const userId = await requireUserId(req);
    const body = await req.json();
    const items = (Array.isArray(body?.items) ? body.items : []) as ImportItem[];
    const rows = items
      .map((item) => {
        const kind = item?.kind === "route" ? "route" : "flight";
        return {
          user_id: userId,
          kind,
          flight_number: kind === "flight" ? String(item?.flight_number ?? "").toUpperCase().trim() : null,
          origin_iata: kind === "route" ? String(item?.origin_iata ?? "").toUpperCase().trim() : null,
          destination_iata: kind === "route" ? String(item?.destination_iata ?? "").toUpperCase().trim() : null,
          label: String(item?.label ?? "").trim(),
        };
      })
      .filter((row) => row.label && (row.kind === "flight" ? row.flight_number : row.origin_iata && row.destination_iata));

    if (rows.length === 0) return Response.json({ ok: true, imported: 0 });

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("user_tracking_items")
      .upsert(rows, { onConflict: "user_id,kind,flight_number,origin_iata,destination_iata" });
    if (error) throw error;
    return Response.json({ ok: true, imported: rows.length });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 401 });
  }
}
