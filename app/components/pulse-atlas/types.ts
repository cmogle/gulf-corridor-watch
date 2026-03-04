/** Shared types for the Pulse Atlas UI layer, mirroring the API response. */

export type AircraftFamily = "widebody" | "narrowbody" | "freighter" | "unknown";
export type HubRegion = "me" | "india" | "uk" | "europe" | "americas" | "asia_pac";
export type Confidence = "high" | "medium" | "low";

export type EquipmentShare = { family: AircraftFamily; count: number };

export type NetworkNode = {
  iata: string;
  label: string;
  lat: number;
  lon: number;
  region: HubRegion;
  now_in: number;
  now_out: number;
  trend_score: number;
};

export type NetworkEdge = {
  from: string;
  to: string;
  now_count: number;
  trend_counts_5m: number[];
  delayed_ratio: number;
  cancelled_ratio: number;
  equipment_mix: EquipmentShare[];
  confidence: Confidence;
};

export type NetworkSummary = {
  active_flights_now: number;
  active_routes_now: number;
  route_stability_6h: number;
  latest_fetch: string | null;
};

export type FlightNetworkResponse = {
  ok: boolean;
  as_of: string;
  summary: NetworkSummary;
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  equipment_mix: EquipmentShare[];
};

export type AtlasFilter =
  | "all"
  | "longhaul_inbound"
  | "uae_outbound"
  | "uae_inbound"
  | "uk_linked"
  | "europe_linked"
  | "americas_linked"
  | "india_linked";

export const ME_HUBS = new Set(["DXB", "AUH", "DWC", "DOH", "BAH", "KWI", "MCT", "RUH", "JED"]);
export const UAE_HUBS = new Set(["DXB", "AUH", "DWC"]);
export const INDIA_HUBS = new Set(["DEL", "BOM", "BLR", "HYD", "MAA", "COK"]);
export const UK_HUBS = new Set(["LHR", "MAN", "DUB"]);
export const EUROPE_HUBS = new Set(["CDG", "FRA", "AMS", "FCO", "IST"]);
export const AMERICAS_HUBS = new Set(["JFK", "LAX", "ORD"]);
export const ASIA_PAC_HUBS = new Set(["SIN"]);
export const LONGHAUL_ORIGINS = new Set([...UK_HUBS, ...EUROPE_HUBS, ...AMERICAS_HUBS, ...ASIA_PAC_HUBS]);

export function filterEdges(edges: NetworkEdge[], filter: AtlasFilter): NetworkEdge[] {
  switch (filter) {
    case "longhaul_inbound":
      return edges.filter(
        (e) =>
          (LONGHAUL_ORIGINS.has(e.from) && ME_HUBS.has(e.to)) ||
          (LONGHAUL_ORIGINS.has(e.to) && ME_HUBS.has(e.from)),
      );
    case "uae_outbound":
      return edges.filter((e) => UAE_HUBS.has(e.from));
    case "uae_inbound":
      return edges.filter((e) => UAE_HUBS.has(e.to));
    case "uk_linked":
      return edges.filter((e) => UK_HUBS.has(e.from) || UK_HUBS.has(e.to));
    case "europe_linked":
      return edges.filter((e) => EUROPE_HUBS.has(e.from) || EUROPE_HUBS.has(e.to));
    case "americas_linked":
      return edges.filter((e) => AMERICAS_HUBS.has(e.from) || AMERICAS_HUBS.has(e.to));
    case "india_linked":
      return edges.filter((e) => INDIA_HUBS.has(e.from) || INDIA_HUBS.has(e.to));
    default:
      return edges;
  }
}
