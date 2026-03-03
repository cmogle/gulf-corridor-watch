import { buildFlightNetwork } from "@/lib/flight-network";

function parseIntParam(raw: string | null, fallback: number, max: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const windowNow = parseIntParam(url.searchParams.get("window_now"), 20, 60);
    const windowTrend = parseIntParam(url.searchParams.get("window_trend"), 360, 720);

    const network = await buildFlightNetwork({ window_now: windowNow, window_trend: windowTrend });

    return Response.json(network, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
    });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
