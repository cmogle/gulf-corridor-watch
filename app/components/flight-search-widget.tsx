"use client";

import { useState } from "react";

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
};

const SUGGESTED_PROMPTS = [
  "Status of EK511",
  "DXB -> DEL delayed now",
  "AUH -> BOM delayed now",
  "What is the likelihood of getting back to Dubai from Dublin in the next 48 hours?",
];

export function FlightSearchWidget() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<QueryResponse | null>(null);
  const [allowLive, setAllowLive] = useState(false);

  async function submit(mode: "structured_only" | "explain") {
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true);
    setData(null);

    const res = await fetch("/api/flights/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: trimmed, mode, allowLive }),
    });
    const json = (await res.json()) as QueryResponse;
    setData(json);
    setLoading(false);
  }

  return (
    <section className="rounded-xl border border-zinc-300 bg-white/90 p-4 space-y-3 shadow-[0_8px_30px_rgba(16,38,54,0.08)]">
      <div className="space-y-2">
        <h3 className="text-base font-semibold tracking-tight">Ask Flight Agent</h3>
        <p className="text-xs text-zinc-600">Cache-first responses from Supabase for speed and low API cost.</p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => setQuery(prompt)}
              className="rounded-full border border-zinc-300 bg-zinc-50 px-3 py-1 text-xs text-zinc-700 transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-700"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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
          <button
            onClick={() => void submit("explain")}
            disabled={loading || !query.trim()}
            className="rounded-lg border border-zinc-500 bg-white px-4 py-2 text-sm font-medium text-zinc-900 outline-none ring-offset-2 transition hover:bg-zinc-100 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-zinc-700"
          >
            Explain with AI
          </button>
          <label className="ml-auto flex items-center gap-2 text-xs text-zinc-600">
            <input
              type="checkbox"
              checked={allowLive}
              onChange={(e) => setAllowLive(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-400"
            />
            Allow live fallback
          </label>
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
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-zinc-300 bg-white p-2 text-xs">Flights: {data.summary.total}</div>
          <div className="rounded-lg border border-zinc-300 bg-white p-2 text-xs text-amber-700">Delayed: {data.summary.delayed}</div>
          <div className="rounded-lg border border-zinc-300 bg-white p-2 text-xs text-red-700">Cancelled: {data.summary.cancelled}</div>
          <div className="rounded-lg border border-zinc-300 bg-white p-2 text-xs text-zinc-700">Source: {data.source ?? "n/a"}</div>
        </div>
      )}

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

      {data && !data.ok && <p className="text-xs text-red-700">{data.error ?? "Failed to run flight query."}</p>}
    </section>
  );
}
