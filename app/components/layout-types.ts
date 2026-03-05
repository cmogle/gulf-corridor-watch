export type AirspacePosture = "normal" | "heightened" | "unclear";
export type CrisisTrend = "improving" | "worsening" | "stable" | null;
export type ContextDrawerTab = "briefing" | "flights" | "feed" | "resources";

export type AirportCode = "DXB" | "AUH" | "DWC";

export type FlightPulseData = {
  total: number;
  delayed: number;
  cancelled: number;
  byAirport: Record<AirportCode, { total: number; delayed: number; cancelled: number; latestFetch: string | null }>;
  topRoutes: Array<{ route: string; count: number }>;
  latestFetch: string | null;
};

export type SuppressedSource = {
  source_id: string;
  source_name: string;
  source_url: string;
  reason: string;
};
