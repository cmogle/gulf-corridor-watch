"use client";

import { useState, useEffect, useCallback } from "react";
import { HourlyVolumeChart } from "./hourly-volume-chart";
import { AirlineBreakdown } from "./airline-breakdown";
import { EquipmentMixChart } from "./equipment-mix-chart";
import { FlightList } from "./flight-list";
import type { RouteDetailResult } from "@/lib/flight-detail";
import { familyLabel, classifyAircraftType } from "@/lib/aircraft-family";
import type { DrillDownFilter } from "./drill-down-filter";
import { applyFilter } from "./drill-down-filter";

type Props = { from: string; to: string };

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function statusBadge(status: string): { bg: string; text: string } {
  switch (status) {
    case "cruise": return { bg: "bg-emerald-50", text: "text-emerald-700" };
    case "approach": return { bg: "bg-blue-50", text: "text-blue-700" };
    case "departure": return { bg: "bg-purple-50", text: "text-purple-700" };
    case "on_ground": return { bg: "bg-gray-100", text: "text-gray-600" };
    default: return { bg: "bg-gray-100", text: "text-gray-600" };
  }
}

function TrendArrow({ trend }: { trend: "up" | "flat" | "down" }) {
  if (trend === "up") return <span className="text-[var(--green)]" aria-label="trending up">&#x25B2;</span>;
  if (trend === "down") return <span className="text-[var(--red)]" aria-label="trending down">&#x25BC;</span>;
  return <span className="text-[var(--amber)]" aria-label="stable">&#x25AC;</span>;
}

export function RouteDetail({ from, to }: Props) {
  const [data, setData] = useState<RouteDetailResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drillFilter, setDrillFilter] = useState<DrillDownFilter>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/flights/route-detail?from=${from}&to=${to}`, { cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        setData(json as RouteDetailResult);
        setError(null);
      } else {
        setError(json.error ?? "Failed to load");
      }
    } catch {
      setError("Unable to load route details");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    setLoading(true);
    setData(null);
    setDrillFilter(null);
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void fetchData();
    }, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="animate-pulse space-y-4 p-5">
        <div className="h-8 w-48 rounded bg-gray-100" />
        <div className="h-40 rounded-lg bg-gray-100" />
        <div className="h-32 rounded-lg bg-gray-100" />
        <div className="h-20 rounded-lg bg-gray-100" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-5 text-center">
        <p className="text-sm text-[var(--text-secondary)]">{error}</p>
        <button
          onClick={() => { setLoading(true); void fetchData(); }}
          className="mt-3 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-gray-200"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const filteredFlights = applyFilter(data.flights ?? [], drillFilter);

  return (
    <div className="space-y-5 p-5 animate-fade-in-up">
      {/* Header */}
      <div>
        <h2 className="font-serif text-2xl text-[var(--text-primary)]">
          {data.route.label}
        </h2>

        {data.recovery ? (
          <div className="mt-2 flex items-center gap-2">
            <span className={`rounded-lg px-3 py-1 font-mono text-sm font-medium ${
              data.recovery.percent >= 80 ? "bg-emerald-50 text-emerald-700" :
              data.recovery.percent >= 50 ? "bg-amber-50 text-amber-700" :
              "bg-red-50 text-red-700"
            }`}>
              {data.recovery.percent}% of normal
            </span>
            <TrendArrow trend={data.recovery.trend} />
          </div>
        ) : (
          <p className="mt-2 text-xs text-[var(--text-secondary)]">No baseline captured yet</p>
        )}
      </div>

      {/* Volume chart */}
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">
          12-Hour Volume
        </p>
        <HourlyVolumeChart
          bins={data.hourly_bins}
          baseline={data.baseline_bins}
          onClickBin={(bin) =>
            setDrillFilter((prev) =>
              prev?.kind === "hour" && prev.hour === bin.hour
                ? null
                : { kind: "hour", hour: bin.hour, binStart: bin.bin_start, binEnd: bin.bin_end },
            )
          }
          activeHour={drillFilter?.kind === "hour" ? drillFilter.hour : null}
        />
      </div>

      {/* Active flights (last 30m — always shown) */}
      {data.active_flights.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">
            Active Flights
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                  <th className="py-2 pr-2 font-medium">Flight</th>
                  <th className="py-2 pr-2 font-medium">Airline</th>
                  <th className="py-2 pr-2 font-medium">Status</th>
                  <th className="py-2 pr-2 font-medium">Type</th>
                  <th className="py-2 font-medium">Delay</th>
                </tr>
              </thead>
              <tbody>
                {data.active_flights.map((f, i) => {
                  const badge = statusBadge(f.status);
                  return (
                    <tr key={`${f.flight_number}-${i}`} className="border-b border-gray-100">
                      <td className="py-2 pr-2 font-mono font-medium">{f.flight_number}</td>
                      <td className="py-2 pr-2 truncate max-w-[100px]">{f.airline ?? "—"}</td>
                      <td className="py-2 pr-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.bg} ${badge.text}`}>
                          {f.status}
                        </span>
                      </td>
                      <td className="py-2 pr-2 font-mono">
                        {f.aircraft_type ? familyLabel(classifyAircraftType(f.aircraft_type)) : "—"}
                      </td>
                      <td className="py-2">
                        {f.is_delayed ? (
                          <span className="text-[var(--amber)]">{f.delay_minutes ?? "?"}m</span>
                        ) : (
                          <span className="text-[var(--text-secondary)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Airline breakdown */}
      {data.airlines.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">
            Airlines (12h)
          </p>
          <AirlineBreakdown
            airlines={data.airlines}
            onClickAirline={(name) =>
              setDrillFilter((prev) =>
                prev?.kind === "airline" && prev.name === name ? null : { kind: "airline", name },
              )
            }
            activeAirline={drillFilter?.kind === "airline" ? drillFilter.name : null}
          />
        </div>
      )}

      {/* Equipment mix */}
      {data.equipment.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">
            Aircraft Types (12h)
          </p>
          <EquipmentMixChart
            equipment={data.equipment}
            onClickFamily={(family) =>
              setDrillFilter((prev) =>
                prev?.kind === "equipment" && prev.family === family
                  ? null
                  : { kind: "equipment", family },
              )
            }
            activeFamily={drillFilter?.kind === "equipment" ? drillFilter.family : null}
          />
        </div>
      )}

      {/* Delay stats */}
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">
          Delays & Cancellations (12h)
        </p>
        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() =>
              setDrillFilter((prev) => (prev?.kind === "delayed" ? null : { kind: "delayed" }))
            }
            className={`rounded-lg p-3 text-center transition-colors hover:bg-gray-100 ${
              drillFilter?.kind === "delayed" ? "bg-blue-50/60 ring-1 ring-blue-200" : "bg-gray-50"
            }`}
          >
            <p className="font-mono text-lg font-medium">{data.delays.delayed_pct}%</p>
            <p className="text-[10px] text-[var(--text-secondary)]">Delayed</p>
          </button>
          <div className="rounded-lg bg-gray-50 p-3 text-center">
            <p className="font-mono text-lg font-medium">{data.delays.avg_delay_min}m</p>
            <p className="text-[10px] text-[var(--text-secondary)]">Avg Delay</p>
          </div>
          <button
            type="button"
            onClick={() =>
              setDrillFilter((prev) => (prev?.kind === "cancelled" ? null : { kind: "cancelled" }))
            }
            className={`rounded-lg p-3 text-center transition-colors hover:bg-gray-100 ${
              drillFilter?.kind === "cancelled" ? "bg-blue-50/60 ring-1 ring-blue-200" : "bg-gray-50"
            }`}
          >
            <p className={`font-mono text-lg font-medium ${data.delays.cancelled > 0 ? "text-[var(--red)]" : ""}`}>
              {data.delays.cancelled}
            </p>
            <p className="text-[10px] text-[var(--text-secondary)]">Cancelled</p>
          </button>
        </div>
      </div>

      {/* Drill-down flight list */}
      {drillFilter && (
        <FlightList
          flights={filteredFlights}
          filter={drillFilter}
          onClearFilter={() => setDrillFilter(null)}
          contextType="route"
        />
      )}

      {/* Freshness */}
      <p className="text-xs text-[var(--text-secondary)]">
        Last updated {relativeTime(data.as_of)} · {data.delays.total} observations
      </p>
    </div>
  );
}
