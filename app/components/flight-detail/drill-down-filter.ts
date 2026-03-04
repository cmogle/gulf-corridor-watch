import type { AircraftFamily } from "@/lib/aircraft-family";
import type { FlightRecord } from "@/lib/flight-detail";

export type DrillDownFilter =
  | { kind: "hour"; hour: number; binStart: string; binEnd: string }
  | { kind: "airline"; name: string }
  | { kind: "equipment"; family: AircraftFamily }
  | { kind: "delayed" }
  | { kind: "cancelled" }
  | null;

const FAMILY_LABELS: Record<AircraftFamily, string> = {
  widebody: "Widebody",
  narrowbody: "Narrowbody",
  freighter: "Freighter",
  unknown: "Unknown type",
};

export function filterLabel(filter: DrillDownFilter): string {
  if (!filter) return "All flights";
  switch (filter.kind) {
    case "hour":
      return `${filter.hour.toString().padStart(2, "0")}:00 hour`;
    case "airline":
      return filter.name;
    case "equipment":
      return FAMILY_LABELS[filter.family];
    case "delayed":
      return "Delayed flights";
    case "cancelled":
      return "Cancelled flights";
  }
}

export function applyFilter(
  flights: FlightRecord[],
  filter: DrillDownFilter,
): FlightRecord[] {
  if (!filter) return flights;
  switch (filter.kind) {
    case "hour":
      return flights.filter(
        (f) => f.fetched_at >= filter.binStart && f.fetched_at < filter.binEnd,
      );
    case "airline":
      return flights.filter(
        (f) => (f.airline?.trim() || "Unknown") === filter.name,
      );
    case "equipment":
      return flights.filter((f) => f.aircraft_family === filter.family);
    case "delayed":
      return flights.filter((f) => f.is_delayed);
    case "cancelled":
      return flights.filter((f) => /cancel/i.test(f.status));
  }
}
