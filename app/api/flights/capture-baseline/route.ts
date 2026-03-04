import { NextResponse } from "next/server";
import { captureBaseline } from "@/lib/flight-detail";

export const maxDuration = 60;

export async function POST(req: Request) {
  const secret = process.env.BASELINE_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "BASELINE_SECRET not configured" }, { status: 500 });
  }

  const auth = req.headers.get("authorization");
  if (!auth || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Invalid or missing authorization" }, { status: 401 });
  }

  try {
    const result = await captureBaseline();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message.includes("Insufficient") ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
