import { NextResponse } from "next/server";
import { queryAirportDetail } from "@/lib/flight-detail";
import { HUBS } from "@/lib/flight-network";

const HUB_SET = new Set(HUBS.map((h) => h.iata));

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const airport = searchParams.get("airport")?.toUpperCase();
  const window = Math.min(Number(searchParams.get("window") ?? 720), 1440);

  if (!airport || !HUB_SET.has(airport)) {
    return NextResponse.json({ ok: false, error: "Invalid airport code" }, { status: 400 });
  }

  try {
    const result = await queryAirportDetail(airport, window);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
