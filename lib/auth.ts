import { createClient } from "@supabase/supabase-js";

type AuthUser = {
  id: string;
  email: string | undefined;
};

/**
 * Extract the authenticated Supabase user from a request's Authorization header.
 * Returns null if no valid token is present.
 */
export async function getAuthUser(
  req: Request,
): Promise<AuthUser | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  if (!token) return null;

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) return null;
  return { id: user.id, email: user.email };
}

/**
 * Require authentication — returns the user or throws a Response for 401.
 */
export async function requireAuth(req: Request): Promise<AuthUser> {
  const user = await getAuthUser(req);
  if (!user) {
    throw new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return user;
}

/**
 * Optional authentication — returns the user or null (never throws).
 */
export async function optionalAuth(
  req: Request,
): Promise<AuthUser | null> {
  return getAuthUser(req);
}
