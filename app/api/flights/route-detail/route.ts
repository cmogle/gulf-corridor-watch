import { NextResponse } from "next/server";
import { queryRouteDetail } from "@/lib/flight-detail";
import { HUBS } from "@/lib/flight-network";

const HUB_SET = new Set(HUBS.map((h) => h.iata));

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from")?.toUpperCase();
  const to = searchParams.get("to")?.toUpperCase();
  const window = Math.min(Number(searchParams.get("window") ?? 720), 1440);

  const iataRe = /^[A-Z]{3}$/;
  if (!from || !to || !iataRe.test(from) || !iataRe.test(to) || (!HUB_SET.has(from) && !HUB_SET.has(to))) {
    return NextResponse.json({ ok: false, error: "Invalid route" }, { status: 400 });
  }

  try {
    const result = await queryRouteDetail(from, to, window);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
