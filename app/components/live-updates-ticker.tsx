"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type LiveUpdatesTickerProps = {
  initialItems: UnifiedUpdateItem[];
};

function validationBadgeClass(state: UnifiedUpdateItem["validation_state"]): string {
  if (state === "validated") return "bg-emerald-100 text-emerald-800";
  if (state === "failed") return "bg-red-100 text-red-700";
  if (state === "skipped") return "bg-zinc-200 text-zinc-700";
  return "bg-amber-100 text-amber-800";
}

function updateTypeClass(type: UnifiedUpdateItem["update_type"]): string {
  return type === "snapshot" ? "bg-sky-100 text-sky-800" : "bg-indigo-100 text-indigo-800";
}

function updateTypeLabel(type: UnifiedUpdateItem["update_type"]): string {
  return type === "snapshot" ? "Official Site" : "Official X";
}

function validationLabel(state: UnifiedUpdateItem["validation_state"]): string {
  if (state === "validated") return "GPT Validated";
  if (state === "failed") return "Validation Failed";
  if (state === "skipped") return "Validation Skipped";
  return "Unvalidated";
}

export function LiveUpdatesTicker({ initialItems }: LiveUpdatesTickerProps) {
  const [items, setItems] = useState<UnifiedUpdateItem[]>(initialItems);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<{ id: string; name: string } | null>(null);
  const [historyItems, setHistoryItems] = useState<UnifiedUpdateItem[]>([]);
  const [historyNextBefore, setHistoryNextBefore] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const sourceOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of items) {
      if (!map.has(row.source_id)) map.set(row.source_id, row.source_name);
    }
    return Array.from(map.entries());
  }, [items]);

  const refreshFeed = useCallback(async () => {
    try {
      const res = await fetch("/api/updates/feed?limit=80", { cache: "no-store" });
      const json = (await res.json()) as FeedResponse;
      if (!json.ok) throw new Error(json.error ?? "Failed to load updates feed");
      setItems(json.items ?? []);
      setLastRefresh(json.fetched_at ?? new Date().toISOString());
      setFeedError(null);
    } catch (error) {
      setFeedError(String(error));
    }
  }, []);

  const loadSourceHistory = useCallback(
    async (sourceId: string, sourceName: string, append = false) => {
      const before = append ? historyNextBefore : null;
      if (!append) {
        setHistoryItems([]);
        setHistoryNextBefore(null);
      }
      setSelectedSource({ id: sourceId, name: sourceName });
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const params = new URLSearchParams({ limit: "25" });
        if (before) params.set("before", before);
        const res = await fetch(`/api/updates/source/${encodeURIComponent(sourceId)}?${params.toString()}`, { cache: "no-store" });
        const json = (await res.json()) as SourceHistoryResponse;
        if (!json.ok) throw new Error(json.error ?? "Failed to load source history");
        const nextItems = json.items ?? [];
        setHistoryItems((prev) => (append ? [...prev, ...nextItems] : nextItems));
        setHistoryNextBefore(json.next_before ?? null);
      } catch (error) {
        setHistoryError(String(error));
      } finally {
        setHistoryLoading(false);
      }
    },
    [historyNextBefore],
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshFeed();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [refreshFeed]);

  useEffect(() => {
    if (!selectedSource) return;
    const latest = items.find((item) => item.source_id === selectedSource.id);
    if (latest && latest.source_name !== selectedSource.name) {
      setSelectedSource({ id: selectedSource.id, name: latest.source_name });
    }
  }, [items, selectedSource]);

  return (
    <section className="rounded-2xl border border-zinc-300 bg-white/85 p-4 md:p-6 shadow-[0_10px_40px_rgba(10,28,42,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Live Official Updates</h2>
          <p className="text-xs text-zinc-600">Rolling ticker across official websites, RSS, and official X posts (newest first).</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void refreshFeed()} className="rounded-md border border-zinc-400 px-2 py-1 text-xs hover:bg-zinc-100">
            Refresh now
          </button>
          <p className="text-[11px] text-zinc-500">Auto-refresh: 60s{lastRefresh ? ` • Last: ${new Date(lastRefresh).toLocaleTimeString()}` : ""}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-2">
          {items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 p-3 text-sm text-zinc-600">No updates available yet.</p>
          ) : (
            items.map((item) => (
              <article key={`${item.update_type}:${item.id}`} className="rounded-xl border border-zinc-300 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{item.source_name}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${updateTypeClass(item.update_type)}`}>{updateTypeLabel(item.update_type)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${validationBadgeClass(item.validation_state)}`}>
                    {validationLabel(item.validation_state)}
                  </span>
                  <span className="text-[11px] text-zinc-500">{new Date(item.event_at).toLocaleString()}</span>
                </div>
                <p className="mt-1 text-sm font-medium">{item.headline}</p>
                <p className="mt-1 line-clamp-3 text-sm text-zinc-700">{item.summary}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-600">
                  <span>Status: {item.status_level}</span>
                  <span>Reliability: {item.reliability}</span>
                  <span>Evidence: {item.evidence_basis}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  <a href={item.original_url} target="_blank" rel="noopener noreferrer" className="underline">
                    Open original ↗
                  </a>
                  <button onClick={() => void loadSourceHistory(item.source_id, item.source_name)} className="underline">
                    View provider history
                  </button>
                </div>
              </article>
            ))
          )}
          {feedError ? <p className="text-xs text-red-700">{feedError}</p> : null}
        </div>

        <aside className="rounded-xl border border-zinc-300 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{selectedSource ? `${selectedSource.name} History` : "Provider History"}</p>
            {selectedSource ? (
              <button
                onClick={() => {
                  setSelectedSource(null);
                  setHistoryItems([]);
                  setHistoryNextBefore(null);
                  setHistoryError(null);
                }}
                className="rounded-md border border-zinc-400 px-2 py-1 text-xs hover:bg-zinc-100"
              >
                Close
              </button>
            ) : null}
          </div>

          {!selectedSource ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-zinc-600">Select any ticker item to drill into one provider timeline.</p>
              <div className="flex flex-wrap gap-1">
                {sourceOptions.slice(0, 12).map(([sourceId, sourceName]) => (
                  <button
                    key={sourceId}
                    onClick={() => void loadSourceHistory(sourceId, sourceName)}
                    className="rounded-full border border-zinc-300 bg-zinc-50 px-2 py-1 text-[11px] hover:bg-zinc-100"
                  >
                    {sourceName}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {historyItems.length === 0 && !historyLoading ? <p className="text-xs text-zinc-600">No timeline items found for this provider.</p> : null}
              {historyItems.map((item) => (
                <article key={`history:${item.update_type}:${item.id}`} className="rounded-lg border border-zinc-300 bg-white p-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${updateTypeClass(item.update_type)}`}>{updateTypeLabel(item.update_type)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${validationBadgeClass(item.validation_state)}`}>{validationLabel(item.validation_state)}</span>
                  </div>
                  <p className="mt-1 text-xs font-medium">{item.headline}</p>
                  <p className="mt-1 line-clamp-3 text-xs text-zinc-700">{item.summary}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">{new Date(item.event_at).toLocaleString()}</p>
                  <a href={item.original_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs underline">
                    Open original ↗
                  </a>
                </article>
              ))}
              {historyError ? <p className="text-xs text-red-700">{historyError}</p> : null}
              {historyLoading ? <p className="text-xs text-zinc-600">Loading history...</p> : null}
              {historyNextBefore && !historyLoading ? (
                <button
                  onClick={() => selectedSource && void loadSourceHistory(selectedSource.id, selectedSource.name, true)}
                  className="w-full rounded-md border border-zinc-400 px-2 py-1 text-xs hover:bg-zinc-100"
                >
                  Load older updates
                </button>
              ) : null}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
