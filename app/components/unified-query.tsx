"use client";

import { useMemo, useState } from "react";
import { parseFlightIntent } from "@/lib/flight-query";
import { addTrackedFlight, addTrackedRoute } from "@/lib/tracking-local";

type FlightResult = {
  ok: boolean;
  mode?: "structured_only" | "explain";
  source?: "cache" | "live" | "none" | "advisory";
  error?: string;
  explanation?: string | null;
  summary?: { total: number; delayed: number; cancelled: number; latest_fetch: string | null };
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

type ChatResult = {
  ok: boolean;
  answer?: string;
  error?: string;
  mode?: string;
  summary?: { total?: number; delayed?: number; cancelled?: number; latest_fetch?: string | null };
  limit_reached?: boolean;
  message?: string;
  remaining?: number;
};

type QueryResult =
  | { type: "flight"; data: FlightResult }
  | { type: "chat"; data: ChatResult }
  | null;

type Props = {
  suggestedPrompts?: string[];
  variant?: "hero" | "standalone";
};

const DEFAULT_PROMPTS = [
  "Can I fly to Dubai?",
  "DXB delays right now",
  "Is it safe in the UAE?",
  "EK511 status",
];

export function UnifiedQuery({ suggestedPrompts = [], variant = "hero" }: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult>(null);
  const [trackNotice, setTrackNotice] = useState<string | null>(null);

  const chips = suggestedPrompts.length > 0
    ? [...new Set([...suggestedPrompts, ...DEFAULT_PROMPTS])].slice(0, 6)
    : DEFAULT_PROMPTS;

  const isOnDark = variant === "hero";

  async function submit() {
    const question = input.trim();
    if (!question || loading) return;
    setLoading(true);
    setResult(null);
    setTrackNotice(null);

    const intent = parseFlightIntent(question);

    if (intent.type !== "unknown") {
      try {
        const res = await fetch("/api/flights/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: question, mode: "structured_only", allowLive: false }),
        });
        const json = (await res.json()) as FlightResult;
        setResult({ type: "flight", data: json });

        if (json.ok && (json.summary?.total ?? 0) === 0) {
          const liveRes = await fetch("/api/flights/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: question, mode: "structured_only", allowLive: true }),
          });
          const liveJson = (await liveRes.json()) as FlightResult;
          setResult({ type: "flight", data: liveJson });
        }
      } catch {
        setResult({ type: "flight", data: { ok: false, error: "Request failed" } });
      }
    } else {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question }),
        });
        const json = (await res.json()) as ChatResult;
        if (json.limit_reached) {
          setResult({ type: "chat", data: { ok: false, limit_reached: true, message: json.message } });
        } else {
          setResult({ type: "chat", data: json });
        }
      } catch {
        setResult({ type: "chat", data: { ok: false, error: "Request failed" } });
      }
    }

    setLoading(false);
  }

  const trackIntent = useMemo(() => {
    if (result?.type !== "flight" || !result.data.ok || !result.data.normalized_intent) return null;
    const ni = result.data.normalized_intent;
    if (ni.type === "flight_number" && ni.flight_number) return { kind: "flight" as const, flight_number: ni.flight_number };
    if (ni.type === "route" && ni.origin_iata && ni.destination_iata) {
      return { kind: "route" as const, origin_iata: ni.origin_iata, destination_iata: ni.destination_iata };
    }
    return null;
  }, [result]);

  function handleTrack() {
    if (!trackIntent) return;
    if (trackIntent.kind === "flight") {
      addTrackedFlight(trackIntent.flight_number);
      setTrackNotice(`Tracking ${trackIntent.flight_number}`);
    } else {
      addTrackedRoute(trackIntent.origin_iata, trackIntent.destination_iata);
      setTrackNotice(`Tracking ${trackIntent.origin_iata} → ${trackIntent.destination_iata}`);
    }
  }

  function clear() {
    setResult(null);
    setInput("");
    setTrackNotice(null);
  }

  const textClass = isOnDark ? "text-[var(--text-on-dark)]" : "text-[var(--text-primary)]";
  const mutedClass = isOnDark ? "text-[var(--text-on-dark-muted)]" : "text-[var(--text-secondary)]";

  return (
    <div className="w-full space-y-3">
      <div className="relative">
        <input
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setResult(null); setTrackNotice(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
          placeholder="Ask anything — flights, routes, safety, advisories..."
          className="w-full rounded-xl border-0 bg-white px-4 py-3.5 text-[15px] text-[var(--text-primary)] shadow-lg outline-none ring-2 ring-transparent placeholder:text-[var(--text-secondary)] focus:ring-[var(--primary-blue)]"
          aria-label="Search flights, routes, or ask a question"
        />
        {input.trim() && (
          <button
            onClick={() => void submit()}
            disabled={loading}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-[var(--surface-dark)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "..." : "Ask"}
          </button>
        )}
      </div>

      {!result && (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip}
              onClick={() => { setInput(chip); setResult(null); }}
              className={`rounded-full border px-3 py-1.5 text-[13px] transition ${
                isOnDark
                  ? "border-white/20 text-white/80 hover:bg-white/10"
                  : "border-gray-300 text-[var(--text-secondary)] hover:bg-gray-100"
              }`}
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {result && (
        <div className="animate-fade-in-up space-y-3">
          {result.type === "flight" && result.data.ok && result.data.insight && (
            <div className={`rounded-xl p-4 ${
              (result.data.insight.score ?? 0) >= 70
                ? "bg-emerald-900/30 border border-emerald-500/30"
                : (result.data.insight.score ?? 0) >= 45
                  ? "bg-amber-900/30 border border-amber-500/30"
                  : "bg-red-900/30 border border-red-500/30"
            }`}>
              <div className="flex items-start justify-between gap-3">
                <p className={`font-medium ${textClass}`}>{result.data.insight.headline}</p>
                {result.data.insight.score != null && (
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-bold ${
                    result.data.insight.score >= 70 ? "bg-emerald-500/20 text-emerald-300"
                    : result.data.insight.score >= 45 ? "bg-amber-500/20 text-amber-300"
                    : "bg-red-500/20 text-red-300"
                  }`}>{result.data.insight.score}/100</span>
                )}
              </div>
              <p className={`mt-1 text-sm ${mutedClass}`}>{result.data.insight.summary}</p>
              <p className={`mt-1 text-xs ${mutedClass}`}>
                Confidence: {result.data.insight.confidence.toUpperCase()} · Horizon: {result.data.insight.horizon_hours}h
              </p>
            </div>
          )}

          {result.type === "flight" && result.data.ok && result.data.summary && (
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-lg px-3 py-1.5 text-xs font-mono ${isOnDark ? "bg-white/10 text-white/80" : "bg-gray-100 text-gray-700"}`}>
                {result.data.summary.total} flights
              </span>
              <span className={`rounded-lg px-3 py-1.5 text-xs font-mono ${isOnDark ? "bg-amber-500/20 text-amber-300" : "bg-amber-50 text-amber-700"}`}>
                {result.data.summary.delayed} delayed
              </span>
              <span className={`rounded-lg px-3 py-1.5 text-xs font-mono ${isOnDark ? "bg-red-500/20 text-red-300" : "bg-red-50 text-red-700"}`}>
                {result.data.summary.cancelled} cancelled
              </span>
              {trackIntent && (
                <button onClick={handleTrack} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${isOnDark ? "bg-white/10 text-white hover:bg-white/20" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                  Track {trackIntent.kind === "flight" ? "flight" : "route"}
                </button>
              )}
            </div>
          )}

          {result.type === "flight" && result.data.ok && result.data.flights && result.data.flights.length > 0 && (
            <ul className="space-y-1">
              {result.data.flights.slice(0, 6).map((f) => (
                <li key={`${f.flight_number}-${f.fetched_at}`} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${isOnDark ? "bg-white/5 text-white/90" : "bg-white border border-gray-200"}`}>
                  <span>
                    <span className="font-mono font-medium">{f.flight_number}</span>{" "}
                    <span className={mutedClass}>{f.origin_iata ?? "?"} → {f.destination_iata ?? "?"}</span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${
                    f.is_delayed ? (isOnDark ? "bg-amber-500/20 text-amber-300" : "bg-amber-100 text-amber-800")
                    : (isOnDark ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-800")
                  }`}>{f.status}</span>
                </li>
              ))}
            </ul>
          )}

          {result.type === "chat" && result.data.ok && result.data.answer && (
            <div className={`rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap ${isOnDark ? "bg-white/10 text-white/90" : "bg-white border border-gray-200 text-[var(--text-primary)]"}`}>
              {result.data.answer}
            </div>
          )}

          {result?.type === "chat" && result.data.limit_reached && (
            <div className={`rounded-xl p-4 text-sm ${isOnDark ? "bg-white/10 text-white/90" : "bg-white border border-gray-200 text-[var(--text-primary)]"}`}>
              <p className="font-medium">{result.data.message ?? "Free message limit reached."}</p>
              <a href="/auth" className="mt-2 inline-block rounded-lg bg-[var(--primary-blue)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                Sign up free
              </a>
            </div>
          )}

          {result && !result.data.ok && !("limit_reached" in result.data && result.data.limit_reached) && (
            <p className="text-sm text-[var(--red)]">{result.data.error ?? "Something went wrong."}</p>
          )}

          {trackNotice && <p className="text-xs text-[var(--green)]">{trackNotice}</p>}

          <button onClick={clear} className={`text-xs underline ${mutedClass}`}>
            Clear & ask another question
          </button>
        </div>
      )}
    </div>
  );
}
