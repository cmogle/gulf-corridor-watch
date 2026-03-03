/** Shared types for the Pulse Atlas UI layer, mirroring the API response. */

export type AircraftFamily = "widebody" | "narrowbody" | "freighter" | "unknown";
export type HubRegion = "me" | "india";
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

export type AtlasFilter = "all" | "uae_outbound" | "uae_inbound" | "india_linked";

export const ME_HUBS = new Set(["DXB", "AUH", "DOH", "BAH", "KWI", "MCT", "RUH", "JED"]);
export const INDIA_HUBS = new Set(["DEL", "BOM", "BLR", "HYD", "MAA", "COK"]);

export function filterEdges(edges: NetworkEdge[], filter: AtlasFilter): NetworkEdge[] {
  switch (filter) {
    case "uae_outbound":
      return edges.filter((e) => ME_HUBS.has(e.from));
    case "uae_inbound":
      return edges.filter((e) => ME_HUBS.has(e.to));
    case "india_linked":
      return edges.filter((e) => INDIA_HUBS.has(e.from) || INDIA_HUBS.has(e.to));
    default:
      return edges;
  }
}
