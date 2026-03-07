"use client";

import { useEffect, useRef } from "react";

type RawPayload = {
  lat?: number;
  lon?: number;
  alt?: number;
  gspeed?: number;
  vspeed?: number;
  track?: number;
  type?: string | null;
  reg?: string | null;
  squawk?: string | null;
  hex?: string | null;
  fr24_id?: string;
};

export type DrawerFlight = {
  flight_number: string;
  callsign: string | null;
  airline: string | null;
  origin_iata: string | null;
  destination_iata: string | null;
  status: string;
  estimated_time: string | null;
  actual_time: string | null;
  fetched_at: string;
  raw_payload: RawPayload | null;
};

type Props = {
  flight: DrawerFlight | null;
  onClose: () => void;
};

function formatTimeGST(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Dubai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDateTimeGST(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Dubai",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function statusConfig(status: string): { color: string; bg: string; label: string } {
  switch (status) {
    case "cruise":
      return { color: "text-blue-400", bg: "bg-blue-900/40", label: "Cruise" };
    case "airborne":
      return { color: "text-blue-400", bg: "bg-blue-900/40", label: "Airborne" };
    case "departure":
      return { color: "text-cyan-400", bg: "bg-cyan-900/40", label: "Departing" };
    case "approach":
      return { color: "text-amber-400", bg: "bg-amber-900/40", label: "Approach" };
    case "on_ground":
      return { color: "text-green-400", bg: "bg-green-900/40", label: "On Ground" };
    default:
      return { color: "text-gray-400", bg: "bg-gray-800", label: status || "Unknown" };
  }
}

function headingToCompass(deg: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function DataRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-gray-500 text-xs">{label}</span>
      <span className="text-gray-200 text-sm font-mono">{value}</span>
    </div>
  );
}

export function FlightDrawer({ flight, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!flight) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [flight, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (flight) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [flight]);

  if (!flight) return null;

  const raw = flight.raw_payload;
  const sc = statusConfig(flight.status);
  const isAirborne = ["airborne", "cruise", "departure", "approach"].includes(flight.status);
  const origin = flight.origin_iata ?? "???";
  const dest = flight.destination_iata ?? "???";

  const fr24Link = `https://www.flightradar24.com/${flight.flight_number.replace(/\s/g, "")}`;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-gray-800 bg-gray-950 shadow-2xl transition-transform duration-200 animate-slide-in-right"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-800 px-5 py-4">
          <div>
            <h2 className="text-xl font-bold text-white">{flight.flight_number}</h2>
            {flight.airline && (
              <p className="mt-0.5 text-sm text-gray-400">{flight.airline}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-4 mt-1 rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors"
            aria-label="Close drawer"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Route + Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-lg">
              <span className="font-semibold text-white">{origin}</span>
              <svg width="20" height="12" viewBox="0 0 20 12" className="text-gray-600">
                <path d="M0 6h16m0 0l-4-4m4 4l-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="font-semibold text-white">{dest}</span>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${sc.bg} ${sc.color}`}>
              {sc.label}
            </span>
          </div>

          {/* Position data (airborne only) */}
          {isAirborne && raw && (
            <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Live Position
              </h3>
              <div className="grid grid-cols-2 gap-x-4">
                <DataRow label="Altitude" value={raw.alt != null ? `${raw.alt.toLocaleString()} ft` : null} />
                <DataRow label="Ground Speed" value={raw.gspeed != null ? `${raw.gspeed} kts` : null} />
                <DataRow label="Vertical Speed" value={raw.vspeed != null ? `${raw.vspeed > 0 ? "+" : ""}${raw.vspeed} ft/min` : null} />
                <DataRow
                  label="Heading"
                  value={raw.track != null ? `${Math.round(raw.track)}° ${headingToCompass(raw.track)}` : null}
                />
                <DataRow label="Latitude" value={raw.lat != null ? raw.lat.toFixed(4) : null} />
                <DataRow label="Longitude" value={raw.lon != null ? raw.lon.toFixed(4) : null} />
              </div>
            </div>
          )}

          {/* Timings */}
          <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Timings
            </h3>
            <div className="divide-y divide-gray-800/50">
              {flight.estimated_time && (
                <DataRow label="ETA" value={formatTimeGST(flight.estimated_time) + " GST"} />
              )}
              {flight.actual_time && (
                <DataRow label="Actual" value={formatTimeGST(flight.actual_time) + " GST"} />
              )}
              <DataRow label="Last Seen" value={formatDateTimeGST(flight.fetched_at) + " GST"} />
            </div>
          </div>

          {/* Aircraft details */}
          {raw && (raw.type || raw.reg || flight.callsign || raw.hex || raw.squawk) && (
            <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Aircraft
              </h3>
              <div className="divide-y divide-gray-800/50">
                <DataRow label="Aircraft Type" value={raw.type} />
                <DataRow label="Registration" value={raw.reg} />
                <DataRow label="Callsign" value={flight.callsign} />
                <DataRow label="ICAO24" value={raw.hex} />
                <DataRow label="Squawk" value={raw.squawk} />
              </div>
            </div>
          )}

          {/* FR24 external link */}
          <a
            href={fr24Link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-900/40 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3H3v10h10v-3M9 1h6v6M15 1L7 9" />
            </svg>
            View on Flightradar24
          </a>
        </div>
      </div>
    </>
  );
}
