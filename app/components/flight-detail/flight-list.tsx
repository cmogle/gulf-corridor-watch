"use client";

import type { FlightRecord } from "@/lib/flight-detail";
import { familyLabel, classifyAircraftType } from "@/lib/aircraft-family";
import type { DrillDownFilter } from "./drill-down-filter";
import { filterLabel } from "./drill-down-filter";

type Props = {
  flights: FlightRecord[];
  filter: DrillDownFilter;
  onClearFilter: () => void;
  contextType: "airport" | "route";
};

const MAX_DISPLAY = 50;

function statusBadge(status: string): { bg: string; text: string } {
  switch (status) {
    case "cruise":    return { bg: "bg-emerald-50", text: "text-emerald-700" };
    case "approach":  return { bg: "bg-blue-50",    text: "text-blue-700" };
    case "departure": return { bg: "bg-purple-50",  text: "text-purple-700" };
    case "on_ground": return { bg: "bg-gray-100",   text: "text-gray-600" };
    default:          return { bg: "bg-gray-100",    text: "text-gray-600" };
  }
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

export function FlightList({ flights, filter, onClearFilter, contextType }: Props) {
  const displayed = flights.slice(0, MAX_DISPLAY);
  const truncated = flights.length > MAX_DISPLAY;

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={onClearFilter}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-gray-100 hover:text-[var(--text-primary)]"
          aria-label="Clear filter"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M11 3L3 11M3 3l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">
          {filterLabel(filter)}
        </p>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-[10px] font-medium text-[var(--text-secondary)]">
          {flights.length}
        </span>
      </div>

      {/* Empty state */}
      {flights.length === 0 && (
        <p className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-[var(--text-secondary)]">
          No flights match this filter
        </p>
      )}

      {/* Table */}
      {flights.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                <th className="py-2 pr-2 font-medium">Flight</th>
                {contextType === "airport" && (
                  <th className="py-2 pr-2 font-medium">Route</th>
                )}
                <th className="hidden py-2 pr-2 font-medium sm:table-cell">Airline</th>
                <th className="py-2 pr-2 font-medium">Type</th>
                <th className="py-2 pr-2 font-medium">Status</th>
                <th className="py-2 pr-2 font-medium">Delay</th>
                <th className="hidden py-2 font-medium sm:table-cell">Seen</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((f, i) => {
                const badge = statusBadge(f.status);
                return (
                  <tr key={`${f.flight_number}-${i}`} className="border-b border-gray-100">
                    <td className="py-2 pr-2 font-mono font-medium">{f.flight_number}</td>
                    {contextType === "airport" && (
                      <td className="py-2 pr-2 font-mono text-[var(--text-secondary)]">
                        {f.origin_iata ?? "?"}<span className="mx-0.5">→</span>{f.destination_iata ?? "?"}
                      </td>
                    )}
                    <td className="hidden truncate py-2 pr-2 sm:table-cell" style={{ maxWidth: 100 }}>
                      {f.airline ?? "—"}
                    </td>
                    <td className="py-2 pr-2">
                      <span className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[10px] font-medium text-[var(--text-secondary)]">
                        {familyLabel(f.aircraft_family)}
                      </span>
                    </td>
                    <td className="py-2 pr-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.bg} ${badge.text}`}>
                        {f.status}
                      </span>
                    </td>
                    <td className="py-2 pr-2">
                      {f.is_delayed ? (
                        <span className="font-mono text-[var(--amber)]">{f.delay_minutes ?? "?"}m</span>
                      ) : (
                        <span className="text-[var(--text-secondary)]">—</span>
                      )}
                    </td>
                    <td className="hidden py-2 text-[var(--text-secondary)] sm:table-cell">
                      {relativeTime(f.fetched_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {truncated && (
            <p className="mt-2 text-center text-[10px] text-[var(--text-secondary)]">
              Showing {MAX_DISPLAY} of {flights.length} flights
            </p>
          )}
        </div>
      )}
    </div>
  );
}
