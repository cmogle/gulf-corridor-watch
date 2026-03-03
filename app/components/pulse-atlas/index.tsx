"use client";

import { useState, useEffect, useCallback } from "react";
import type { FlightNetworkResponse, AtlasFilter, NetworkEdge } from "./types";
import { filterEdges } from "./types";
import { OperabilityBar } from "./operability-bar";
import { AtlasCanvas } from "./atlas-canvas";
import { RouteLadder } from "./route-ladder";

const FILTERS: { key: AtlasFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "uae_outbound", label: "UAE Outbound" },
  { key: "uae_inbound", label: "UAE Inbound" },
  { key: "india_linked", label: "India-linked" },
];

export function AirspacePulseAtlas() {
  const [network, setNetwork] = useState<FlightNetworkResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<AtlasFilter>("all");

  const fetchNetwork = useCallback(async () => {
    try {
      const res = await fetch("/api/flights/network", { cache: "no-store" });
      const json = (await res.json()) as FlightNetworkResponse;
      if (json.ok) {
        setNetwork(json);
        setError(null);
      }
    } catch {
      setError("Unable to load corridor data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    void fetchNetwork();
  }, [fetchNetwork]);

  // Auto-refresh every 60s when visible
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void fetchNetwork();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [fetchNetwork]);

  // Filtered edges
  const filteredEdges: NetworkEdge[] = network ? filterEdges(network.edges, activeFilter) : [];

  return (
    <section className="mx-auto max-w-4xl px-4 py-8 md:px-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">
        Pulse Atlas
      </p>

      {/* Loading skeleton */}
      {loading && !network && (
        <div className="mt-4 space-y-4 animate-pulse">
          <div className="h-14 rounded-xl bg-gray-100" />
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="h-64 flex-[1.8] rounded-xl bg-gray-100" />
            <div className="h-64 flex-1 rounded-xl bg-gray-100" />
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !network && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-[var(--text-secondary)]">{error}</p>
        </div>
      )}

      {/* Loaded state */}
      {network && (
        <div className="mt-4 space-y-4 animate-fade-in-up">
          <OperabilityBar summary={network.summary} />

          {/* Filter tabs */}
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => { setActiveFilter(f.key); setHoveredEdge(null); }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeFilter === f.key
                    ? "bg-[var(--surface-dark)] text-white"
                    : "bg-gray-100 text-[var(--text-secondary)] hover:bg-gray-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Main content: Canvas + Ladder */}
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="w-full md:w-[63%]">
              <AtlasCanvas
                nodes={network.nodes}
                edges={filteredEdges}
                hoveredEdge={hoveredEdge}
                onHoverEdge={setHoveredEdge}
              />
            </div>
            <div className="w-full md:w-[37%]">
              <RouteLadder
                edges={filteredEdges}
                hoveredEdge={hoveredEdge}
                onHoverEdge={setHoveredEdge}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
