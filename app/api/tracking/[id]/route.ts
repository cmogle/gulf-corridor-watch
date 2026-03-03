import { requireUserId } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, { params }: Params) {
  try {
    const userId = await requireUserId(req);
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("user_tracking_items").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 401 });
  }
}
