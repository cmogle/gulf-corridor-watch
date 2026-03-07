"use client";

import { useState } from "react";

type DxbDeparture = {
  flight_number: string;
  airline: string | null;
  destination_iata: string | null;
  scheduled_time: string;
  estimated_time: string | null;
  actual_time: string | null;
  status: string;
  is_delayed: boolean;
  delay_minutes: number | null;
  is_cancelled: boolean;
  gate: string | null;
  terminal: string | null;
};

type Props = {
  stats: { total: number; delayed: number; cancelled: number };
  departures: DxbDeparture[];
};

function formatTimeGST(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Dubai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function statusColor(dep: DxbDeparture): string {
  if (dep.is_cancelled) return "text-red-400";
  if (dep.is_delayed) return "text-amber-400";
  if (dep.status === "departed" || dep.status === "landed") return "text-blue-400";
  return "text-green-400";
}

function statusLabel(dep: DxbDeparture): string {
  if (dep.is_cancelled) return "CXL";
  if (dep.is_delayed && dep.delay_minutes) return `+${dep.delay_minutes}m`;
  if (dep.is_delayed) return "DLY";
  if (dep.status === "departed") return "DEP";
  if (dep.status === "boarding") return "BRD";
  return "OK";
}

export function AirportPulse({ stats, departures }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (stats.total === 0) return null;

  return (
    <div className="mb-4">
      {/* Pulse strip */}
      <div className="rounded-lg border border-gray-800 bg-gray-900/60 px-4 py-2.5 text-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-300">DXB</span>
            <span className="text-gray-500">{stats.total} departures</span>
            {stats.delayed > 0 && (
              <span className="text-amber-400">{stats.delayed} delayed</span>
            )}
            {stats.cancelled > 0 && (
              <span className="text-red-400">{stats.cancelled} cancelled</span>
            )}
            {stats.delayed === 0 && stats.cancelled === 0 && (
              <span className="text-green-500">all on time</span>
            )}
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            {expanded ? "Hide" : "Show flights"}
          </button>
        </div>
      </div>

      {/* Expandable departures list */}
      {expanded && (
        <div className="mt-2 rounded-lg border border-gray-800 bg-gray-900/40 overflow-hidden">
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-900 border-b border-gray-800">
                <tr className="text-gray-500">
                  <th className="px-3 py-2 text-left font-medium">Flight</th>
                  <th className="px-3 py-2 text-left font-medium">To</th>
                  <th className="px-3 py-2 text-left font-medium">Sched</th>
                  <th className="px-3 py-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {departures.map((dep) => (
                  <tr
                    key={`${dep.flight_number}-${dep.scheduled_time}`}
                    className="hover:bg-gray-800/30"
                  >
                    <td className="px-3 py-1.5 text-gray-300 font-mono">
                      {dep.flight_number}
                    </td>
                    <td className="px-3 py-1.5 text-gray-400">
                      {dep.destination_iata ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-gray-400">
                      {formatTimeGST(dep.scheduled_time)}
                    </td>
                    <td className={`px-3 py-1.5 text-right font-medium ${statusColor(dep)}`}>
                      {statusLabel(dep)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-gray-800 px-3 py-1.5 text-[10px] text-gray-600">
            Last 6 hours of DXB departures
          </div>
        </div>
      )}
    </div>
  );
}
