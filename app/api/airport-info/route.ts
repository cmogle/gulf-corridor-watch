import { airportIntel, getAirportIntel } from "@/lib/airport-intel";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = (searchParams.get("code") ?? "").toUpperCase();

  if (!code) {
    return Response.json({ ok: false, error: "Missing code" }, { status: 400 });
  }

  if (code === "ALL") {
    return Response.json({ ok: true, airports: airportIntel });
  }

  const intel = getAirportIntel(code);
  if (!intel) {
    return Response.json({ ok: false, error: `No intel for code ${code}` }, { status: 404 });
  }

  return Response.json({ ok: true, airport: intel });
}
