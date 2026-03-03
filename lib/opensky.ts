/**
 * OpenSky Network - free, no key required for live state vectors.
 * We use the bounding-box endpoint covering UAE + Gulf approach corridors.
 * Then classify aircraft by proximity to DXB / AUH.
 */

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

// Approximate coords
const AIRPORT_COORDS: Record<AirportCode, { lat: number; lon: number }> = {
  DXB: { lat: 25.2528, lon: 55.3644 },
  AUH: { lat: 24.4330, lon: 54.6511 },
};

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

function guessAirline(callsign: string): string | null {
  const prefix = callsign.trim().replace(/\d+$/, "").toUpperCase();
  const map: Record<string, string> = {
    UAE: "Emirates",
    ETD: "Etihad",
    ABY: "Air Arabia",
    FDB: "flydubai",
    EKQ: "Emirates",
    GFA: "Gulf Air",
    WYZ: "Oman Air",
    OAL: "Olympic Air",
    QR:  "Qatar Airways",
    SV:  "Saudia",
    MSR: "EgyptAir",
    THY: "Turkish Airlines",
    AFR: "Air France",
    BAW: "British Airways",
    DLH: "Lufthansa",
    KLM: "KLM",
    SIA: "Singapore Airlines",
    EIN: "Aer Lingus",
  };
  return map[prefix] ?? null;
}

type OpenSkyState = [
  string,   // 0 icao24
  string,   // 1 callsign
  string,   // 2 origin_country
  number | null, // 3 time_position
  number | null, // 4 last_contact
  number | null, // 5 longitude
  number | null, // 6 latitude
  number | null, // 7 baro_altitude
  boolean,  // 8 on_ground
  number | null, // 9 velocity
  number | null, // 10 true_track
  number | null, // 11 vertical_rate
  unknown,  // 12 sensors
  number | null, // 13 geo_altitude
  string | null, // 14 squawk
  boolean,  // 15 spi
  number,   // 16 position_source
];

const OPENSKY_URL =
  "https://opensky-network.org/api/states/all?lamin=23.0&lomin=53.0&lamax=27.0&lomax=57.5";

export async function ingestAirportsOpenSky(): Promise<FlightObservation[]> {
  const res = await fetch(OPENSKY_URL, {
    cache: "no-store",
    headers: { "user-agent": "gulf-corridor-watch/1.0" },
  });
  if (!res.ok) throw new Error(`OpenSky fetch failed (${res.status})`);

  const payload = (await res.json()) as { time: number; states: OpenSkyState[] | null };
  const states = payload.states ?? [];
  const fetched_at = new Date().toISOString();

  const obs: FlightObservation[] = [];

  for (const s of states) {
    const callsign = (s[1] ?? "").trim();
    if (!callsign) continue;

    const lat = s[6];
    const lon = s[5];
    if (lat == null || lon == null) continue;

    const airport = nearestAirport(lat, lon);
    const onGround = s[8];
    const altM = s[7] ?? s[13];
    const velMs = s[9] ?? 0;

    let status = "airborne";
    if (onGround) status = "on_ground";
    else if (altM != null && altM < 1000) status = "approach";
    else if (altM != null && altM > 8000 && velMs > 150) status = "cruise";

    obs.push({
      airport,
      flight_number: callsign,
      callsign,
      icao24: s[0],
      flight_id: null,
      airline: guessAirline(callsign),
      origin_iata: null,
      origin_name: s[2] ?? null,
      destination_iata: null,
      destination_name: null,
      scheduled_time: null,
      estimated_time: null,
      actual_time: null,
      status,
      is_delayed: false,
      delay_minutes: null,
      source_url: OPENSKY_URL,
      raw_payload: s,
      fetched_at,
    });
  }

  return obs;
}
