/**
 * Origin validation for public LLM-calling API routes.
 * Rejects requests that don't originate from allowed domains,
 * blocking scripted abuse of expensive API endpoints.
 */

const ALLOWED_HOSTS = new Set([
  "keepcalmandcarryon.help",
  "mideast-watch-mvp.vercel.app",
]);

function isAllowedHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  if (ALLOWED_HOSTS.has(hostname)) return true;
  // Vercel preview deployments
  if (hostname.endsWith(".vercel.app")) return true;
  return false;
}

/**
 * Check that the request originates from an allowed domain.
 * Browser POST requests always include an Origin header (CORS spec),
 * so a missing Origin on a POST strongly suggests a non-browser client.
 */
export function checkOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return isAllowedHost(new URL(origin).hostname);
    } catch {
      return false;
    }
  }

  // Fallback: check Referer (some older browsers, GET requests)
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return isAllowedHost(new URL(referer).hostname);
    } catch {
      return false;
    }
  }

  // No Origin or Referer — non-browser client
  return false;
}
