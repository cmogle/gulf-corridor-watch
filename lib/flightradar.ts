/**
 * Flightradar24 API v1
 * Live flight positions endpoint: /api/live/flight-positions/full
 * Bounds format: lat_max,lat_min,lon_min,lon_max
 */

const DEFAULT_BASE_URL = "https://fr24api.flightradar24.com";

export type AirportCode = "DXB" | "AUH";

export type FlightObservation = {
  airport: AirportCode;
  flight_number: string;
  callsign: string | null;
  icao24: string | null;
  flight_id: string | null;
  airline: string | null;
  origin_iata: string | null;
  origin_name: string | null;
  destination_iata: string | null;
  destination_name: string | null;
  scheduled_time: string | null;
  estimated_time: string | null;
  actual_time: string | null;
  status: string;
  is_delayed: boolean;
  delay_minutes: number | null;
  source_url: string;
  raw_payload: unknown;
  fetched_at: string;
};

// Airport coordinates
const AIRPORT_COORDS: Record<AirportCode, { lat: number; lon: number }> = {
  DXB: { lat: 25.2528, lon: 55.3644 },
  AUH: { lat: 24.4330, lon: 54.6511 },
};

// Wide UAE/Gulf airspace bounding box: lat_max,lat_min,lon_min,lon_max
const UAE_GULF_BOUNDS = "27.0,23.0,53.0,57.5";

function distKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestAirport(lat: number, lon: number): AirportCode {
  const dDXB = distKm(lat, lon, AIRPORT_COORDS.DXB.lat, AIRPORT_COORDS.DXB.lon);
  const dAUH = distKm(lat, lon, AIRPORT_COORDS.AUH.lat, AIRPORT_COORDS.AUH.lon);
  return dDXB <= dAUH ? "DXB" : "AUH";
}

type FR24Aircraft = {
  fr24_id: string;
  flight: string | null;
  callsign: string | null;
  lat: number;
  lon: number;
  track: number;
  alt: number;
  gspeed: number;
  vspeed: number;
  squawk: string | null;
  timestamp: string;
  source: string;
  hex: string | null;
  type: string | null;
  reg: string | null;
  painted_as: string | null;
  operating_as: string | null;
  orig_iata: string | null;
  orig_icao: string | null;
  dest_iata: string | null;
  dest_icao: string | null;
  eta: string | null;
};

function deriveStatus(ac: FR24Aircraft): string {
  if (ac.alt === 0 && ac.gspeed < 50) return "on_ground";
  if (ac.alt < 3000 && ac.vspeed < -200) return "approach";
  if (ac.alt < 3000 && ac.vspeed > 200) return "departure";
  if (ac.alt > 20000) return "cruise";
  return "airborne";
}

function getConfig() {
  const apiKey = process.env.FLIGHTRADAR_KEY;
  if (!apiKey) throw new Error("Missing FLIGHTRADAR_KEY");
  const baseUrl = (process.env.FLIGHTRADAR_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  return { apiKey, baseUrl };
}

export async function ingestAirports(_airports: AirportCode[]): Promise<FlightObservation[]> {
  const { apiKey, baseUrl } = getConfig();
  const url = `${baseUrl}/api/live/flight-positions/full?bounds=${UAE_GULF_BOUNDS}&limit=500`;

  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Accept-Version": "v1",
      "User-Agent": "gulf-corridor-watch/1.0",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Flightradar request failed (${res.status}) ${body.slice(0, 200)}`);
  }

  const payload = (await res.json()) as { data: FR24Aircraft[] };
  const aircraft = payload.data ?? [];
  const fetched_at = new Date().toISOString();

  return aircraft
    .filter((ac) => ac.lat != null && ac.lon != null)
    .map((ac) => {
      const airport = nearestAirport(ac.lat, ac.lon);
      const flightNum = (ac.flight ?? ac.callsign ?? "").trim().toUpperCase();

      return {
        airport,
        flight_number: flightNum || ac.fr24_id,
        callsign: ac.callsign,
        icao24: ac.hex,
        flight_id: ac.fr24_id,
        airline: ac.operating_as ?? ac.painted_as ?? null,
        origin_iata: ac.orig_iata,
        origin_name: null,
        destination_iata: ac.dest_iata,
        destination_name: null,
        scheduled_time: null,
        estimated_time: ac.eta,
        actual_time: ac.timestamp,
        status: deriveStatus(ac),
        is_delayed: false,
        delay_minutes: null,
        source_url: url,
        raw_payload: ac,
        fetched_at,
      };
    });
}

// Keep legacy exports for any callers
export async function getAirportBoards(airport: AirportCode): Promise<FlightObservation[]> {
  return ingestAirports([airport]);
}

export async function findFlightByNumber(flightNumber: string): Promise<FlightObservation[]> {
  const all = await ingestAirports(["DXB", "AUH"]);
  const fn = flightNumber.toUpperCase().replace(/\s+/g, "");
  return all.filter((r) => r.flight_number === fn || r.callsign === fn);
}

export async function findRouteFlights(originIata: string, destinationIata: string): Promise<FlightObservation[]> {
  const all = await ingestAirports(["DXB", "AUH"]);
  return all.filter(
    (r) => r.origin_iata === originIata.toUpperCase() && r.destination_iata === destinationIata.toUpperCase()
  );
}
