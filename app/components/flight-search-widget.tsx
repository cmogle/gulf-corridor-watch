"use client";

import { useMemo, useState } from "react";
import { addTrackedFlight, addTrackedRoute, loadTracking } from "@/lib/tracking-local";

type QueryResponse = {
  ok: boolean;
  mode?: "structured_only" | "explain";
  source?: "cache" | "live" | "none";
  error?: string;
  explanation?: string | null;
  summary?: {
    total: number;
    delayed: number;
    cancelled: number;
    latest_fetch: string | null;
  };
  insight?: {
    type: "likelihood" | "status";
    headline: string;
    summary: string;
    confidence: "low" | "medium" | "high";
    horizon_hours: number;
    score: number | null;
  } | null;
  flights?: Array<{
    flight_number: string;
    airport: string;
    origin_iata: string | null;
    destination_iata: string | null;
    status: string;
    is_delayed: boolean;
    delay_minutes: number | null;
    fetched_at: string;
  }>;
  normalized_intent?: {
    type: "flight_number" | "route" | "unknown";
    flight_number?: string;
    origin_iata?: string | null;
    destination_iata?: string | null;
  };
};

type FlightSearchWidgetProps = {
  suggestedPrompts?: string[];
  latestFetch?: string | null;
};

export function FlightSearchWidget({ suggestedPrompts = [], latestFetch = null }: FlightSearchWidgetProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<QueryResponse | null>(null);
  const [useExpandedLookup, setUseExpandedLookup] = useState(false);
  const [showExpandedLookup, setShowExpandedLookup] = useState(false);
  const [trackNotice, setTrackNotice] = useState<string | null>(null);
  const canSummarize = Boolean(data?.ok && (data.summary?.total ?? 0) > 0);

  async function submit(mode: "structured_only" | "explain", useLiveOverride?: boolean) {
    const trimmed = query.trim();
    if (!trimmed) return;
    const allowLive = useLiveOverride ?? useExpandedLookup;
    setLoading(true);
    setData(null);

    const res = await fetch("/api/flights/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: trimmed, mode, allowLive }),
    });
    const json = (await res.json()) as QueryResponse;
    setData(json);
    if (json.ok && (json.summary?.total ?? 0) === 0 && !allowLive) {
      setShowExpandedLookup(true);
    } else if (json.ok) {
      setShowExpandedLookup(false);
    }
    if (allowLive) setUseExpandedLookup(true);
    setLoading(false);
  }

  const trackIntent = useMemo(() => {
    if (!data?.ok || !data.normalized_intent) return null;
    if (data.normalized_intent.type === "flight_number" && data.normalized_intent.flight_number) {
      return { kind: "flight" as const, flight_number: data.normalized_intent.flight_number };
    }
    if (
      data.normalized_intent.type === "route" &&
      data.normalized_intent.origin_iata &&
      data.normalized_intent.destination_iata
    ) {
      return {
        kind: "route" as const,
        origin_iata: data.normalized_intent.origin_iata,
        destination_iata: data.normalized_intent.destination_iata,
      };
    }
    return null;
  }, [data]);

  function handleTrack() {
    if (!trackIntent) return;
    let items = loadTracking();
    if (trackIntent.kind === "flight") {
      items = addTrackedFlight(trackIntent.flight_number);
    } else {
      items = addTrackedRoute(trackIntent.origin_iata, trackIntent.destination_iata);
    }
    if (items.length >= 20) {
      setTrackNotice("Tracked. Max is 20 items; oldest entries are dropped automatically.");
      return;
    }
    setTrackNotice(`Tracked ${trackIntent.kind === "flight" ? trackIntent.flight_number : `${trackIntent.origin_iata} -> ${trackIntent.destination_iata}`}.`);
  }

  return (
    <section className="rounded-xl border border-zinc-300 bg-white/90 p-4 space-y-3 shadow-[0_8px_30px_rgba(16,38,54,0.08)]">
      <div className="space-y-2">
        <h3 className="text-base font-semibold tracking-tight">Ask Flight Agent</h3>
        <p className="text-xs text-zinc-600">
          Results use the latest available flight data. Last updated:{" "}
          {latestFetch ? new Date(latestFetch).toLocaleString() : "n/a"}
        </p>
        {suggestedPrompts.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {suggestedPrompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => setQuery(prompt)}
                className="rounded-full border border-zinc-300 bg-zinc-50 px-3 py-1 text-xs text-zinc-700 transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-700"
              >
                {prompt}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-600">No route suggestions yet. Run Quick Check to load current activity first.</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <textarea
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setData(null);
            setTrackNotice(null);
            setUseExpandedLookup(false);
            setShowExpandedLookup(false);
          }}
          placeholder="Flight number, route, or question..."
          className="min-h-24 w-full rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-zinc-700"
          aria-label="Flight query"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void submit("structured_only")}
            disabled={loading || !query.trim()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white outline-none ring-offset-2 transition hover:bg-zinc-700 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-zinc-700"
          >
            {loading ? "Checking..." : "Quick Check"}
          </button>
          {canSummarize ? (
            <button
              onClick={() => void submit("explain")}
              disabled={loading || !query.trim()}
              className="rounded-lg border border-zinc-500 bg-white px-4 py-2 text-sm font-medium text-zinc-900 outline-none ring-offset-2 transition hover:bg-zinc-100 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-zinc-700"
            >
              Summarize Data
            </button>
          ) : null}
        </div>
      </div>

      {data?.ok && data.insight && (
        <article className="rounded-lg border border-sky-200 bg-sky-50/70 p-3 text-sm">
          <p className="font-semibold">{data.insight.headline}</p>
          <p className="text-zinc-700">{data.insight.summary}</p>
          <p className="mt-1 text-xs text-zinc-600">
            Confidence: {data.insight.confidence.toUpperCase()} | Horizon: {data.insight.horizon_hours}h | Score: {data.insight.score ?? "n/a"}
          </p>
        </article>
      )}

      {data?.ok && data.summary && (
        <div className="grid gap-2 sm:grid-cols-5">
          <div className="rounded-lg border border-zinc-300 bg-white p-2 text-xs">Flights: {data.summary.total}</div>
          <div className="rounded-lg border border-zinc-300 bg-white p-2 text-xs text-amber-700">Delayed: {data.summary.delayed}</div>
          <div className="rounded-lg border border-zinc-300 bg-white p-2 text-xs text-red-700">Cancelled: {data.summary.cancelled}</div>
          <div className="rounded-lg border border-zinc-300 bg-white p-2 text-xs text-zinc-700">
            Last updated: {data.summary.latest_fetch ? new Date(data.summary.latest_fetch).toLocaleTimeString() : "n/a"}
          </div>
          {trackIntent ? (
            <button onClick={handleTrack} className="rounded-lg border border-zinc-500 bg-white p-2 text-xs font-medium hover:bg-zinc-100">
              {trackIntent.kind === "flight" ? "Track this flight" : "Track this route"}
            </button>
          ) : (
            <div className="rounded-lg border border-zinc-300 bg-zinc-50 p-2 text-xs text-zinc-500">Track unavailable</div>
          )}
        </div>
      )}

      {trackNotice ? <p className="text-xs text-emerald-700">{trackNotice}</p> : null}

      {data?.ok && data.explanation && <pre className="whitespace-pre-wrap rounded-lg bg-zinc-100 p-3 text-xs text-zinc-700">{data.explanation}</pre>}

      {data?.ok && data.flights && data.flights.length > 0 && (
        <ul className="space-y-1">
          {data.flights.slice(0, 6).map((flight) => (
            <li key={`${flight.flight_number}-${flight.fetched_at}`} className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs">
              <span className="font-semibold">{flight.flight_number}</span> {flight.origin_iata ?? "???"} -&gt; {flight.destination_iata ?? "???"} ({flight.status}) @{" "}
              {new Date(flight.fetched_at).toLocaleTimeString()}
            </li>
          ))}
        </ul>
      )}

      {showExpandedLookup ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <p>No recent match found in the current dataset.</p>
          <button
            onClick={() => void submit("structured_only", true)}
            disabled={loading}
            className="mt-2 rounded-md border border-amber-600 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            Try Wider Lookup
          </button>
          <p className="mt-1 text-[11px] text-amber-800">This may take longer and can increase API usage.</p>
        </div>
      ) : null}

      {data && !data.ok && <p className="text-xs text-red-700">{data.error ?? "Failed to run flight query."}</p>}
    </section>
  );
}
