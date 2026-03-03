"use client";

import { useCallback, useEffect, useState } from "react";
import type { ExpertFeedResponse, ExpertCategory } from "@/lib/expert-feed";

const CATEGORY_STYLES: Record<ExpertCategory, { bg: string; text: string; label: string }> = {
  maritime: { bg: "bg-blue-100", text: "text-blue-800", label: "Maritime" },
  defense: { bg: "bg-red-100", text: "text-red-800", label: "Defense" },
  energy: { bg: "bg-amber-100", text: "text-amber-800", label: "Energy" },
  geopolitical: { bg: "bg-purple-100", text: "text-purple-800", label: "Geopolitical" },
  osint: { bg: "bg-emerald-100", text: "text-emerald-800", label: "OSINT" },
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function ExpertAnalysisPanel() {
  const [feed, setFeed] = useState<ExpertFeedResponse | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<ExpertCategory | "all">("all");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/expert-feed", { cache: "no-store" });
      const json = (await res.json()) as ExpertFeedResponse;
      if (json.ok) setFeed(json);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 5 * 60_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  if (!feed) return null;

  const filteredSignals = feed.signals.filter(
    (s) => categoryFilter === "all" || s.category === categoryFilter,
  );

  const categories: { label: string; value: ExpertCategory | "all" }[] = [
    { label: "All", value: "all" },
    { label: "Maritime", value: "maritime" },
    { label: "Defense", value: "defense" },
    { label: "Energy", value: "energy" },
    { label: "Geopolitical", value: "geopolitical" },
    { label: "OSINT", value: "osint" },
  ];

  return (
    <section className="mx-auto max-w-4xl px-4 py-8 md:px-0">
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">
          Expert Analysis
        </p>
        <span
          className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-[var(--text-secondary)] cursor-help"
          title="AI-curated digest from ~25 expert commentators covering maritime, defense, energy, and geopolitical developments related to the Gulf region."
        >
          ?
        </span>
      </div>

      {/* Digest card */}
      {feed.digest ? (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-[15px] leading-relaxed text-[var(--text-primary)]">
            {feed.digest.digest_text}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
            <span>{relativeTime(feed.digest.generated_at)}</span>
            <span>{feed.digest.signal_count} signals</span>
            <span>{feed.meta.active_signals_24h} active (24h)</span>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-gray-300 p-4 text-sm text-[var(--text-secondary)]">
          No relevant expert commentary in the last 24 hours.
        </div>
      )}

      {/* Expand toggle */}
      {feed.signals.length > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-xs text-[var(--primary-blue)] underline"
        >
          {expanded ? "Hide" : `View ${feed.signals.length}`} individual signals
        </button>
      )}

      {/* Expanded signals */}
      {expanded && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c.value}
                onClick={() => setCategoryFilter(c.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  categoryFilter === c.value
                    ? "bg-[var(--surface-dark)] text-white"
                    : "bg-gray-100 text-[var(--text-secondary)] hover:bg-gray-200"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="mt-3 space-y-2">
            {filteredSignals.map((signal) => {
              const style = CATEGORY_STYLES[signal.category];
              return (
                <div
                  key={`${signal.handle}:${signal.post_id}`}
                  className="rounded-lg border border-gray-100 bg-gray-50 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[var(--text-primary)]">
                      @{signal.handle}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${style.bg} ${style.text}`}>
                      {style.label}
                    </span>
                    <span
                      className={`h-2 w-2 rounded-full ${
                        signal.relevance_score >= 0.7 ? "bg-[var(--green)]" :
                        signal.relevance_score >= 0.4 ? "bg-[var(--amber)]" :
                        "bg-gray-400"
                      }`}
                      title={`Relevance: ${signal.relevance_score.toFixed(2)}`}
                    />
                    <span className="ml-auto text-[11px] text-[var(--text-secondary)]">
                      {relativeTime(signal.posted_at)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-3">
                    {signal.text_en ?? signal.text_original}
                  </p>
                  <a
                    href={signal.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-block text-xs text-[var(--primary-blue)] underline"
                  >
                    View on X
                  </a>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
