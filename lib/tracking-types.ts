export type TrackingKind = "flight" | "route";

export type TrackingItem = {
  id: string;
  kind: TrackingKind;
  flight_number?: string;
  origin_iata?: string;
  destination_iata?: string;
  label: string;
  created_at: string;
  last_seen_status?: string | null;
  muted_until?: string | null;
};

export type TrackingSnapshot = {
  items: TrackingItem[];
  updated_at: string;
};

export type TrackingState = "normal" | "advisory" | "disrupted" | "unknown";

export type TrackingEvaluation = {
  item: TrackingItem;
  state: TrackingState;
  total: number;
  delayed: number;
  cancelled: number;
  latest_fetch: string | null;
};
