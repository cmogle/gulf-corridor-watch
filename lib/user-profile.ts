import { getSupabaseAdmin } from "./supabase";

export type UserProfile = {
  id: string;
  display_name: string | null;
  home_airport: string | null;
  tracked_routes: { origin: string; destination: string }[];
  tracked_flights: string[];
  detail_preference: "concise" | "standard" | "comprehensive";
  created_at: string;
  updated_at: string;
};

/**
 * Fetch or auto-create a user profile on first authenticated access.
 */
export async function getOrCreateProfile(userId: string): Promise<UserProfile> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch profile: ${error.message}`);

  if (data) return data as UserProfile;

  const { data: created, error: insertError } = await supabase
    .from("user_profiles")
    .insert({ id: userId })
    .select("*")
    .single();

  if (insertError) throw new Error(`Failed to create profile: ${insertError.message}`);
  return created as UserProfile;
}

/**
 * Partial update of user profile fields.
 */
export async function updateProfile(
  userId: string,
  updates: Partial<Pick<UserProfile, "display_name" | "home_airport" | "tracked_routes" | "tracked_flights" | "detail_preference">>,
): Promise<UserProfile> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("user_profiles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to update profile: ${error.message}`);
  return data as UserProfile;
}
