import { getSupabaseAdmin } from "@/lib/supabase";

export async function requireUserId(req: Request): Promise<string> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  if (!token) throw new Error("Unauthorized");
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.id) throw new Error("Unauthorized");
  return data.user.id;
}
