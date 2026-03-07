"use client";

import { useState } from "react";

type DxbFlight = {
  flight_number: string;
  airline: string | null;
  destination_iata: string | null;
  status: string;
  actual_time: string | null;
  fetched_at: string;
  raw_payload: {
    alt?: number;
    gspeed?: number;
  } | null;
};

type Props = {
  stats: { total: number; airborne: number; onGround: number };
  departures: DxbFlight[];
};

function formatTimeGST(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Dubai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function statusColor(status: string): string {
  switch (status) {
    case "cruise":
    case "airborne":
      return "text-blue-400";
    case "departure":
      return "text-cyan-400";
    case "approach":
      return "text-amber-400";
    case "on_ground":
      return "text-green-400";
    default:
      return "text-gray-400";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "cruise":
      return "CRZ";
    case "airborne":
      return "AIR";
    case "departure":
      return "DEP";
    case "approach":
      return "APP";
    case "on_ground":
      return "GND";
    default:
      return status.slice(0, 3).toUpperCase();
  }
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
            <span className="text-gray-500">{stats.total} flights tracked</span>
            {stats.airborne > 0 && (
              <span className="text-blue-400">{stats.airborne} airborne</span>
            )}
            {stats.onGround > 0 && (
              <span className="text-green-400">{stats.onGround} on ground</span>
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
                  <th className="px-3 py-2 text-left font-medium">Seen</th>
                  <th className="px-3 py-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {departures.map((dep) => (
                  <tr
                    key={`${dep.flight_number}-${dep.fetched_at}`}
                    className="hover:bg-gray-800/30"
                  >
                    <td className="px-3 py-1.5 text-gray-300 font-mono">
                      {dep.flight_number}
                    </td>
                    <td className="px-3 py-1.5 text-gray-400">
                      {dep.destination_iata ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-gray-400">
                      {formatTimeGST(dep.fetched_at)}
                    </td>
                    <td className={`px-3 py-1.5 text-right font-medium ${statusColor(dep.status)}`}>
                      {statusLabel(dep.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-gray-800 px-3 py-1.5 text-[10px] text-gray-600">
            Live positions of DXB departures (last 30 min)
          </div>
        </div>
      )}
    </div>
  );
}
