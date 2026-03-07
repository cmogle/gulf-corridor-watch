"use client";

import { useState, useEffect, useCallback } from "react";
import { FlightCard } from "./flight-card";
import { FlightMap } from "./flight-map";
import { AirportPulse } from "./airport-pulse";
import { FlightDrawer, type DrawerFlight } from "./flight-drawer";

type FlightObservation = {
  flight_number: string;
  callsign: string | null;
  airline: string | null;
  origin_iata: string | null;
  destination_iata: string | null;
  status: string;
  is_delayed: boolean;
  delay_minutes: number | null;
  estimated_time: string | null;
  actual_time: string | null;
  fetched_at: string;
  raw_payload: Record<string, unknown> | null;
};

type DxbStats = {
  total: number;
  airborne: number;
  onGround: number;
};

type FlightsResponse = {
  fzBegFlights: FlightObservation[];
  dxbDepartures: FlightObservation[];
  dxbStats: DxbStats;
  queriedAt: string;
};

type Props = {
  initial: FlightsResponse;
};

export function RouteMonitor({ initial }: Props) {
  const [data, setData] = useState<FlightsResponse>(initial);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [stale, setStale] = useState(false);
  const [selectedFlight, setSelectedFlight] = useState<DrawerFlight | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/flights");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as FlightsResponse;
      setData(json);
      setLastRefresh(new Date());
      setStale(false);
    } catch {
      setStale(true);
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const { fzBegFlights, dxbDepartures, dxbStats } = data;

  // Find airborne FZ→BEG flight with position
  const airborne = fzBegFlights.find(
    (f) => {
      const rp = f.raw_payload as Record<string, unknown> | null;
      return rp?.lat != null &&
        rp?.lon != null &&
        ["airborne", "cruise", "departure"].includes(f.status);
    }
  );

  // Split FZ→BEG into active (currently visible on radar) vs not
  const activeFlights = fzBegFlights.filter(
    (f) => ["airborne", "cruise", "departure", "on_ground", "approach"].includes(f.status)
  );
  const pastFlights = fzBegFlights.filter(
    (f) => !["airborne", "cruise", "departure", "on_ground", "approach"].includes(f.status)
  );

  const airborneCount = activeFlights.filter(
    (f) => ["airborne", "cruise", "departure"].includes(f.status)
  ).length;

  function summaryText(): string {
    if (fzBegFlights.length === 0) return "No FZ flights to BEG observed recently";
    const parts: string[] = [];
    if (activeFlights.length > 0) {
      if (airborneCount > 0) parts.push(`${airborneCount} airborne now`);
      const groundCount = activeFlights.length - airborneCount;
      if (groundCount > 0) parts.push(`${groundCount} on ground`);
    }
    parts.push(`${fzBegFlights.length} seen in last 24hrs`);
    return parts.join(" — ");
  }

  function toDrawerFlight(f: FlightObservation): DrawerFlight {
    return {
      flight_number: f.flight_number,
      callsign: f.callsign,
      airline: f.airline,
      origin_iata: f.origin_iata,
      destination_iata: f.destination_iata,
      status: f.status,
      estimated_time: f.estimated_time,
      actual_time: f.actual_time,
      fetched_at: f.fetched_at,
      raw_payload: f.raw_payload as DrawerFlight["raw_payload"],
    };
  }

  const airborneRp = airborne?.raw_payload as Record<string, unknown> | null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <span className="rounded bg-purple-900/60 px-2 py-0.5 text-xs font-semibold text-purple-300">
            FlyDubai
          </span>
          <h1 className="text-xl font-bold text-white">DXB → BEG</h1>
        </div>
        <p className="mt-2 text-sm text-gray-300">{summaryText()}</p>
        <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
          <span>
            Updated{" "}
            {lastRefresh.toLocaleTimeString("en-GB", {
              timeZone: "Asia/Dubai",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            GST
          </span>
          {stale && (
            <span className="rounded bg-amber-900/40 px-2 py-0.5 text-amber-400">
              Stale data — refresh failed
            </span>
          )}
          {!stale && (
            <span className="text-green-600">●</span>
          )}
        </div>
      </div>

      {/* Airport pulse */}
      <AirportPulse
        stats={dxbStats}
        departures={dxbDepartures}
        onSelectFlight={setSelectedFlight}
      />

      {/* Map (only if airborne FZ→BEG) */}
      {airborne && airborneRp && (
        <div className="mb-4">
          <FlightMap
            lat={airborneRp.lat as number}
            lon={airborneRp.lon as number}
            flightNumber={airborne.flight_number}
          />
        </div>
      )}

      {/* Active FZ→BEG flights */}
      {activeFlights.length > 0 && (
        <div className="space-y-3">
          {activeFlights.map((f) => (
            <div
              key={`${f.flight_number}-${f.fetched_at}`}
              className="cursor-pointer"
              onClick={() => setSelectedFlight(toDrawerFlight(f))}
            >
              <FlightCard
                flightNumber={f.flight_number}
                scheduledTime={f.actual_time ?? f.fetched_at}
                estimatedTime={f.estimated_time}
                actualTime={f.actual_time}
                status={mapObsStatus(f.status)}
                isDelayed={f.is_delayed}
                delayMinutes={f.delay_minutes}
                isCancelled={false}
                gate={null}
                terminal={null}
                isAirborne={["airborne", "cruise", "departure"].includes(f.status)}
                isPast={false}
              />
            </div>
          ))}
        </div>
      )}

      {/* No flights message */}
      {fzBegFlights.length === 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
          <p className="text-lg text-gray-300">
            No FlyDubai flights to Belgrade detected
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Live positions are checked every 5 minutes. A flight will appear
            here once it begins taxiing or is airborne. Check back closer to
            departure time.
          </p>
        </div>
      )}

      {/* Past observations */}
      {pastFlights.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
            Recent history
          </h2>
          <div className="space-y-3">
            {pastFlights.map((f) => (
              <div
                key={`${f.flight_number}-${f.fetched_at}`}
                className="cursor-pointer"
                onClick={() => setSelectedFlight(toDrawerFlight(f))}
              >
                <FlightCard
                  flightNumber={f.flight_number}
                  scheduledTime={f.actual_time ?? f.fetched_at}
                  estimatedTime={f.estimated_time}
                  actualTime={f.actual_time}
                  status={mapObsStatus(f.status)}
                  isDelayed={f.is_delayed}
                  delayMinutes={f.delay_minutes}
                  isCancelled={false}
                  gate={null}
                  terminal={null}
                  isAirborne={false}
                  isPast={true}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-8 border-t border-gray-800 pt-4 text-center text-xs text-gray-600">
        <p>Live positions from Flightradar24. Checked every 5 minutes.</p>
        <p className="mt-1">Times shown in Gulf Standard Time (GST / UTC+4).</p>
        <p className="mt-1 text-gray-700">
          Flights appear once taxiing or airborne — future schedules not available.
        </p>
      </footer>

      {/* Flight detail drawer */}
      <FlightDrawer
        flight={selectedFlight}
        onClose={() => setSelectedFlight(null)}
      />
    </main>
  );
}

/** Map observation status strings to FlightCard status type */
function mapObsStatus(status: string): "scheduled" | "delayed" | "cancelled" | "departed" | "boarding" | "landed" | "diverted" | "unknown" {
  switch (status) {
    case "airborne":
    case "cruise":
    case "departure":
      return "departed";
    case "on_ground":
      return "boarding";
    case "approach":
      return "landed";
    default:
      return "unknown";
  }
}
