"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  FocusedFlightDetailPayload,
  FocusedMonitorPayload,
} from "@/lib/focused-monitor-data";

type LivePayload = FocusedMonitorPayload & {
  ok?: boolean;
  error?: string;
};

function formatDateTimeGst(iso: string | null): string {
  if (!iso) return "Not reported";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "Not reported";
  return dt.toLocaleString("en-GB", {
    timeZone: "Asia/Dubai",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatTimeGst(iso: string | null): string {
  if (!iso) return "Not reported";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "Not reported";
  return dt.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Dubai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function freshnessLabel(minutes: number | null): string {
  if (minutes === null) return "No recent real observations available";
  if (minutes < 1) return "Updated just now";
  if (minutes === 1) return "Updated 1 minute ago";
  return `Updated ${minutes} minutes ago`;
}

function delayText(delayMinutes: number | null, isDelayed: boolean): string {
  if (!isDelayed) return "No delay reported";
  if (typeof delayMinutes === "number") return `${delayMinutes}m delay`;
  return "Delayed";
}

type Props = {
  initial: FocusedMonitorPayload;
};

export function MainRouteMonitor({ initial }: Props) {
  const [data, setData] = useState<FocusedMonitorPayload>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FocusedFlightDetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/flights?limit=48", { cache: "no-store" });
      const json = (await res.json()) as LivePayload;
      if (!res.ok || !json) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      setData({
        queriedAt: json.queriedAt,
        summaries: json.summaries ?? [],
        flights: json.flights ?? [],
      });
    } catch (refreshError) {
      setError(String(refreshError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const selectedSummary = useMemo(
    () => data.flights.find((flight) => flight.id === selectedId),
    [data.flights, selectedId],
  );

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError(null);
      return;
    }

    let cancelled = false;
    async function loadDetail() {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const res = await fetch(`/api/flights/${selectedId}`, { cache: "no-store" });
        const json = (await res.json()) as {
          ok: boolean;
          error?: string;
          flight?: FocusedFlightDetailPayload;
        };
        if (!res.ok || !json.ok || !json.flight) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        if (!cancelled) setDetail(json.flight);
      } catch (loadError) {
        if (!cancelled) {
          setDetail(null);
          setDetailError(String(loadError));
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
        <h1 className="text-2xl font-semibold text-white">Live Route Monitor</h1>
        <p className="mt-1 text-sm text-gray-300">
          Focused corridors: DXB &lt;-&gt; BOM, DXB &lt;-&gt; LHR, DXB &lt;-&gt; LGW
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-400">
          <span>Last refresh: {formatDateTimeGst(data.queriedAt)} GST</span>
          <span>{loading ? "Refreshing live observations..." : "Auto-refresh every 60s"}</span>
          {error && <span className="text-amber-300">Refresh issue: {error}</span>}
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        {data.summaries.map((summary) => (
          <article
            key={summary.route}
            className="rounded-xl border border-gray-800 bg-gray-900/50 p-4"
          >
            <h2 className="text-sm font-semibold text-gray-100">{summary.label}</h2>
            {summary.trackedFlights === 0 ? (
              <p className="mt-3 text-sm text-gray-400">
                No recent real observations available
              </p>
            ) : (
              <div className="mt-3 space-y-1.5 text-sm text-gray-300">
                <p>
                  Flights tracked: <span className="font-semibold text-white">{summary.trackedFlights}</span>
                </p>
                <p>
                  Delayed: <span className="font-semibold text-white">{summary.delayedFlights}</span>
                  {summary.delayPercent !== null ? (
                    <span className="text-gray-400"> ({summary.delayPercent}%)</span>
                  ) : null}
                </p>
                <p className="text-gray-400">{freshnessLabel(summary.freshnessMinutes)}</p>
              </div>
            )}
          </article>
        ))}
      </section>

      <section className="mt-6 rounded-2xl border border-gray-800 bg-gray-900/50">
        <div className="border-b border-gray-800 px-4 py-3">
          <h2 className="text-lg font-semibold text-white">Recent Flights</h2>
          <p className="text-sm text-gray-400">Only live/stored observations on the focused routes.</p>
        </div>

        {data.flights.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400">
            No recent real observations available
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-gray-800 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Flight</th>
                  <th className="px-4 py-3">Route</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Delay</th>
                  <th className="px-4 py-3">Scheduled</th>
                  <th className="px-4 py-3">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {data.flights.map((flight) => (
                  <tr
                    key={flight.id}
                    className={`cursor-pointer border-b border-gray-800/70 hover:bg-gray-800/40 ${
                      selectedId === flight.id ? "bg-gray-800/60" : ""
                    }`}
                    onClick={() => setSelectedId(flight.id)}
                  >
                    <td className="px-4 py-3 text-gray-100">
                      <div className="font-semibold">{flight.flightNumber}</div>
                      <div className="text-xs text-gray-500">
                        {flight.airline ?? flight.callsign ?? "Airline not reported"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{flight.routeLabel}</td>
                    <td className="px-4 py-3 text-gray-200">{flight.statusLabel}</td>
                    <td className="px-4 py-3 text-gray-300">
                      {delayText(flight.delayMinutes, flight.isDelayed)}
                    </td>
                    <td className="px-4 py-3 text-gray-300">{formatTimeGst(flight.scheduledTime)}</td>
                    <td className="px-4 py-3 text-gray-400">
                      {formatTimeGst(flight.fetchedAt)} ({freshnessLabel(flight.freshnessMinutes)})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-gray-800 bg-gray-900/50 p-4">
        <h2 className="text-lg font-semibold text-white">Flight Detail</h2>
        {!selectedId && (
          <p className="mt-2 text-sm text-gray-400">Select a flight above to view drill-down details.</p>
        )}
        {selectedId && detailLoading && (
          <p className="mt-2 text-sm text-gray-400">Loading flight detail...</p>
        )}
        {selectedId && detailError && (
          <p className="mt-2 text-sm text-amber-300">{detailError}</p>
        )}

        {selectedId && !detailLoading && !detailError && detail && (
          <div className="mt-3 space-y-4">
            <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-3 text-sm text-gray-300">
              <p className="text-base font-semibold text-white">
                {detail.flightNumber} ({detail.routeLabel})
              </p>
              <p className="mt-1">
                Status: <span className="font-medium text-white">{detail.statusLabel}</span>
              </p>
              <p className="mt-1">
                Delay: <span className="font-medium text-white">{delayText(detail.delayMinutes, detail.isDelayed)}</span>
              </p>
              <p className="mt-1">
                Scheduled: <span className="font-medium text-white">{formatDateTimeGst(detail.scheduledTime)} GST</span>
              </p>
              <p className="mt-1">
                Estimated: <span className="font-medium text-white">{formatDateTimeGst(detail.estimatedTime)} GST</span>
              </p>
              <p className="mt-1">
                Actual: <span className="font-medium text-white">{formatDateTimeGst(detail.actualTime)} GST</span>
              </p>
              <p className="mt-1 text-gray-400">
                Last seen: {formatDateTimeGst(detail.fetchedAt)} GST
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">
                Observation Timeline
              </h3>
              {detail.timeline.length === 0 ? (
                <p className="text-sm text-gray-400">No recent real observations available</p>
              ) : (
                <div className="space-y-2">
                  {detail.timeline.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-2 text-sm text-gray-300"
                    >
                      <p className="font-medium text-gray-100">
                        {item.statusLabel}
                        <span className="ml-2 text-gray-500">({item.statusCode || "unknown"})</span>
                      </p>
                      <p className="text-xs text-gray-400">
                        Seen {formatDateTimeGst(item.fetchedAt)} GST • {delayText(item.delayMinutes, item.isDelayed)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {selectedId && !detailLoading && !detailError && !detail && selectedSummary && (
          <p className="mt-2 text-sm text-gray-400">
            No recent real observations available for {selectedSummary.flightNumber}.
          </p>
        )}
      </section>
    </main>
  );
}
