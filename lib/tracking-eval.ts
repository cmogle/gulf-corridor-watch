import { TrackingEvaluation, TrackingItem, TrackingState } from "@/lib/tracking-types";

type FlightLike = {
  status: string;
  is_delayed: boolean;
  fetched_at: string;
};

function toState(total: number, delayed: number, cancelled: number): TrackingState {
  if (total === 0) return "unknown";
  if (cancelled > 0) return "disrupted";
  if (delayed > 0) return "advisory";
  return "normal";
}

export function evaluateTrackingItem(item: TrackingItem, rows: FlightLike[]): TrackingEvaluation {
  const total = rows.length;
  const delayed = rows.filter((r) => r.is_delayed).length;
  const cancelled = rows.filter((r) => /cancel/i.test(r.status)).length;
  const latest_fetch =
    rows
      .map((r) => r.fetched_at)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
      .at(0) ?? null;

  return {
    item,
    state: toState(total, delayed, cancelled),
    total,
    delayed,
    cancelled,
    latest_fetch,
  };
}
