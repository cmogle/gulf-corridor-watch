"use client";

import { useState, useEffect, useCallback } from "react";
import { useFlightDetail } from "./context";
import { HourlyVolumeChart } from "./hourly-volume-chart";
import { AirlineBreakdown } from "./airline-breakdown";
import { EquipmentMixChart } from "./equipment-mix-chart";
import { FlightList } from "./flight-list";
import type { AirportDetailResult } from "@/lib/flight-detail";
import type { DrillDownFilter } from "./drill-down-filter";
import { applyFilter } from "./drill-down-filter";

type Props = { airport: string };

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function TrendArrow({ trend }: { trend: "up" | "flat" | "down" }) {
  if (trend === "up") return <span className="text-[var(--green)]" aria-label="trending up">&#x25B2;</span>;
  if (trend === "down") return <span className="text-[var(--red)]" aria-label="trending down">&#x25BC;</span>;
  return <span className="text-[var(--amber)]" aria-label="stable">&#x25AC;</span>;
}

export function AirportDetail({ airport }: Props) {
  const { openRoute } = useFlightDetail();
  const [data, setData] = useState<AirportDetailResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drillFilter, setDrillFilter] = useState<DrillDownFilter>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/flights/airport-detail?airport=${airport}`, { cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        setData(json as AirportDetailResult);
        setError(null);
      } else {
        setError(json.error ?? "Failed to load");
      }
    } catch {
      setError("Unable to load flight details");
    } finally {
      setLoading(false);
    }
  }, [airport]);

  // Fetch on mount and when airport changes
  useEffect(() => {
    setLoading(true);
    setData(null);
    setDrillFilter(null);
    void fetchData();
  }, [fetchData]);

  // Auto-refresh every 60s
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void fetchData();
    }, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Loading skeleton
  if (loading && !data) {
    return (
      <div className="animate-pulse space-y-4 p-5">
        <div className="h-8 w-48 rounded bg-gray-100" />
        <div className="h-6 w-32 rounded bg-gray-100" />
        <div className="h-40 rounded-lg bg-gray-100" />
        <div className="h-24 rounded-lg bg-gray-100" />
        <div className="h-20 rounded-lg bg-gray-100" />
      </div>
    );
  }

  // Error state
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
          {data.airport.label}
          <span className="ml-2 font-mono text-base font-normal text-[var(--text-secondary)]">
            {data.airport.iata}
          </span>
        </h2>

        {/* Recovery badge */}
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

      {/* Top routes */}
      {data.top_routes.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">
            Top Routes (1h)
          </p>
          <div className="space-y-1">
            {data.top_routes.map((r) => {
              const parts = r.route.match(/^([A-Z]{3}) -> ([A-Z]{3})$/);
              return (
                <button
                  key={r.route}
                  onClick={() => {
                    if (parts) openRoute(parts[1], parts[2]);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left font-mono text-sm transition-colors hover:bg-gray-50"
                >
                  <span className="font-medium">{r.route}</span>
                  <span className="text-[var(--text-secondary)]">{r.count}</span>
                </button>
              );
            })}
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
          contextType="airport"
        />
      )}

      {/* Freshness */}
      <p className="text-xs text-[var(--text-secondary)]">
        Last updated {relativeTime(data.as_of)} · {data.delays.total} observations
      </p>
    </div>
  );
}
