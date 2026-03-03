"use client";

import { useCallback, useEffect, useState } from "react";
import { UnifiedUpdateItem } from "@/lib/unified-updates-types";

type FeedResponse = {
  ok: boolean;
  error?: string;
  fetched_at?: string;
  items?: UnifiedUpdateItem[];
};

type SourceHistoryResponse = {
  ok: boolean;
  error?: string;
  items?: UnifiedUpdateItem[];
  next_before?: string | null;
};

type FilterOption = "all" | "advisories" | "airlines" | "government";

function statusDotColor(level: string): string {
  if (level === "disrupted") return "bg-[var(--red)]";
  if (level === "advisory") return "bg-[var(--amber)]";
  if (level === "normal") return "bg-[var(--green)]";
  return "bg-gray-400";
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function matchesFilter(item: UnifiedUpdateItem, filter: FilterOption): boolean {
  if (filter === "all") return true;
  if (filter === "advisories") return item.status_level === "advisory" || item.status_level === "disrupted";
  if (filter === "airlines") return item.source_name.toLowerCase().includes("emirates") || item.source_name.toLowerCase().includes("etihad") || item.source_name.toLowerCase().includes("oman air") || item.source_name.toLowerCase().includes("flydubai") || item.source_name.toLowerCase().includes("air arabia") || item.source_name.toLowerCase().includes("qatar");
  if (filter === "government") return !matchesFilter(item, "airlines");
  return true;
}

export function UpdatesFeed({ initialItems }: { initialItems: UnifiedUpdateItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState<FilterOption>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<UnifiedUpdateItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyNextBefore, setHistoryNextBefore] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  const refreshFeed = useCallback(async () => {
    try {
      const res = await fetch("/api/updates/feed?limit=80", { cache: "no-store" });
      const json = (await res.json()) as FeedResponse;
      if (json.ok) {
        setItems(json.items ?? []);
        setLastRefresh(json.fetched_at ?? new Date().toISOString());
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshFeed();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [refreshFeed]);

  async function loadHistory(sourceId: string, append = false) {
    const before = append ? historyNextBefore : null;
    if (!append) { setHistoryItems([]); setHistoryNextBefore(null); }
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({ limit: "25" });
      if (before) params.set("before", before);
      const res = await fetch(`/api/updates/source/${encodeURIComponent(sourceId)}?${params}`, { cache: "no-store" });
      const json = (await res.json()) as SourceHistoryResponse;
      if (json.ok) {
        setHistoryItems((prev) => append ? [...prev, ...(json.items ?? [])] : (json.items ?? []));
        setHistoryNextBefore(json.next_before ?? null);
      }
    } catch { /* silent */ }
    setHistoryLoading(false);
  }

  const filtered = items.filter((item) => matchesFilter(item, filter));
  const filters: { label: string; value: FilterOption }[] = [
    { label: "All", value: "all" },
    { label: "Advisories", value: "advisories" },
    { label: "Airlines", value: "airlines" },
    { label: "Government", value: "government" },
  ];

  return (
    <section className="mx-auto max-w-4xl px-4 py-8 md:px-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">
            Latest Updates
          </p>
          <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse-dot" />
            Live
          </span>
        </div>
        <p className="text-xs text-[var(--text-secondary)]">
          Auto-refresh 60s{lastRefresh ? ` · ${relativeTime(lastRefresh)}` : ""}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              filter === f.value
                ? "bg-[var(--surface-dark)] text-white"
                : "bg-gray-100 text-[var(--text-secondary)] hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {filtered.length === 0 && (
          <p className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-[var(--text-secondary)]">
            No updates match this filter.
          </p>
        )}
        {filtered.map((item) => {
          const itemKey = `${item.update_type}:${item.id}`;
          const isExpanded = expandedId === itemKey;
          return (
            <article
              key={itemKey}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${statusDotColor(item.status_level)}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{item.source_name}</p>
                    <p className="shrink-0 text-xs text-[var(--text-secondary)]">{relativeTime(item.event_at)}</p>
                  </div>
                  <p className="mt-1 text-[15px] font-medium leading-snug">{item.headline}</p>
                  <p className={`mt-1 text-sm text-[var(--text-secondary)] leading-relaxed ${isExpanded ? "" : "line-clamp-2"}`}>
                    {item.summary}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 ${
                      item.update_type === "snapshot" ? "bg-blue-100 text-blue-800" : "bg-indigo-100 text-indigo-800"
                    }`}>
                      {item.update_type === "snapshot" ? "Official" : "Official X"}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 ${
                      item.validation_state === "validated" ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"
                    }`}>
                      {item.validation_state === "validated" ? "Verified" : "Unverified"}
                    </span>
                    <a
                      href={item.original_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--primary-blue)] underline"
                    >
                      Source
                    </a>
                    <button
                      onClick={() => { setExpandedId(isExpanded ? null : itemKey); if (!isExpanded) void loadHistory(item.source_id); }}
                      className="text-[var(--primary-blue)] underline"
                    >
                      {isExpanded ? "Collapse" : "History"}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                      {historyLoading && <p className="text-xs text-[var(--text-secondary)]">Loading...</p>}
                      {historyItems.map((h) => (
                        <div key={`h:${h.update_type}:${h.id}`} className="rounded-lg bg-gray-50 p-3">
                          <p className="text-xs font-medium">{h.headline}</p>
                          <p className="mt-1 text-xs text-[var(--text-secondary)] line-clamp-2">{h.summary}</p>
                          <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{relativeTime(h.event_at)}</p>
                        </div>
                      ))}
                      {historyNextBefore && !historyLoading && (
                        <button
                          onClick={() => void loadHistory(item.source_id, true)}
                          className="text-xs text-[var(--primary-blue)] underline"
                        >
                          Load older
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
