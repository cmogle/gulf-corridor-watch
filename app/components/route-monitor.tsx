"use client";

import { useState, useEffect, useCallback } from "react";
import { FlightCard } from "./flight-card";
import { FlightMap } from "./flight-map";

type Schedule = {
  flight_number: string;
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

type LivePosition = {
  flight_number: string;
  status: string;
  raw_payload: {
    lat: number;
    lon: number;
  } | null;
};

type FlightsResponse = {
  schedules: Schedule[];
  livePositions: LivePosition[];
  queriedAt: string;
};

type Props = {
  initial: FlightsResponse;
};

export function RouteMonitor({ initial }: Props) {
  const [data, setData] = useState<FlightsResponse>(initial);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [stale, setStale] = useState(false);

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

  const now = new Date();
  const upcoming = data.schedules.filter(
    (s) => new Date(s.scheduled_time) > now || ["boarding", "departed"].includes(s.status)
  );
  const past = data.schedules.filter(
    (s) => new Date(s.scheduled_time) <= now && !["boarding", "departed"].includes(s.status)
  );

  // Find airborne flight with position
  const airborne = data.livePositions.find(
    (p) =>
      p.raw_payload?.lat != null &&
      p.raw_payload?.lon != null &&
      ["airborne", "cruise", "departure"].includes(p.status)
  );

  const onTimeCount = upcoming.filter(
    (s) => !s.is_delayed && !s.is_cancelled
  ).length;
  const delayedCount = upcoming.filter((s) => s.is_delayed).length;
  const cancelledCount = upcoming.filter((s) => s.is_cancelled).length;

  function summaryText(): string {
    const parts: string[] = [];
    if (upcoming.length === 0) return "No upcoming flights found";
    parts.push(`${upcoming.length} flight${upcoming.length !== 1 ? "s" : ""} in next 48hrs`);
    const details: string[] = [];
    if (onTimeCount > 0) details.push(`${onTimeCount} on time`);
    if (delayedCount > 0) details.push(`${delayedCount} delayed`);
    if (cancelledCount > 0) details.push(`${cancelledCount} cancelled`);
    if (details.length > 0) parts.push(details.join(", "));
    return parts.join(" — ");
  }

  const airborneFlights = data.livePositions.filter(
    (p) => ["airborne", "cruise", "departure"].includes(p.status)
  );

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

      {/* Map (only if airborne) */}
      {airborne?.raw_payload && (
        <div className="mb-4">
          <FlightMap
            lat={airborne.raw_payload.lat}
            lon={airborne.raw_payload.lon}
            flightNumber={airborne.flight_number}
          />
        </div>
      )}

      {/* Upcoming flights */}
      {upcoming.length > 0 && (
        <div className="space-y-3">
          {upcoming.map((s) => (
            <FlightCard
              key={`${s.flight_number}-${s.scheduled_time}`}
              flightNumber={s.flight_number}
              scheduledTime={s.scheduled_time}
              estimatedTime={s.estimated_time}
              actualTime={s.actual_time}
              status={s.status as Parameters<typeof FlightCard>[0]["status"]}
              isDelayed={s.is_delayed}
              delayMinutes={s.delay_minutes}
              isCancelled={s.is_cancelled}
              gate={s.gate}
              terminal={s.terminal}
              isAirborne={airborneFlights.some(
                (a) => a.flight_number === s.flight_number
              )}
              isPast={false}
            />
          ))}
        </div>
      )}

      {/* No flights message */}
      {upcoming.length === 0 && past.length === 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
          <p className="text-lg text-gray-300">
            No FlyDubai flights to Belgrade found
          </p>
          <p className="mt-2 text-sm text-gray-500">
            This could mean the route isn&apos;t currently scheduled, or data
            hasn&apos;t been collected yet. The cron runs every 5 minutes.
          </p>
        </div>
      )}

      {/* Past flights (history) */}
      {past.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
            Recent history
          </h2>
          <div className="space-y-3">
            {past.map((s) => (
              <FlightCard
                key={`${s.flight_number}-${s.scheduled_time}`}
                flightNumber={s.flight_number}
                scheduledTime={s.scheduled_time}
                estimatedTime={s.estimated_time}
                actualTime={s.actual_time}
                status={s.status as Parameters<typeof FlightCard>[0]["status"]}
                isDelayed={s.is_delayed}
                delayMinutes={s.delay_minutes}
                isCancelled={s.is_cancelled}
                gate={s.gate}
                terminal={s.terminal}
                isAirborne={false}
                isPast={true}
              />
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-8 border-t border-gray-800 pt-4 text-center text-xs text-gray-600">
        <p>Data from Flightradar24. Refreshes every 5 minutes.</p>
        <p className="mt-1">Times shown in Gulf Standard Time (GST / UTC+4).</p>
      </footer>
    </main>
  );
}
