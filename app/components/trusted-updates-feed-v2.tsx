"use client";

import { useCallback, useEffect, useState } from "react";
import type { TrustedFeedItem } from "@/lib/trusted-feed-types";

type FeedResponse = {
  ok: boolean;
  error?: string;
  fetched_at?: string;
  items?: TrustedFeedItem[];
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function statusDot(level: TrustedFeedItem["status_level"]): string {
  if (level === "disrupted") return "bg-[var(--red)]";
  if (level === "advisory") return "bg-[var(--amber)]";
  if (level === "normal") return "bg-[var(--green)]";
  return "bg-gray-400";
}

export function TrustedUpdatesFeedV2({ initialItems }: { initialItems: TrustedFeedItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/updates/feed?limit=80", { cache: "no-store" });
      const json = (await res.json()) as FeedResponse;
      if (json.ok) {
        setItems(json.items ?? []);
        setLastRefresh(json.fetched_at ?? new Date().toISOString());
      }
    } catch {
      // keep previous data
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <section className="mx-auto max-w-5xl px-4 py-8 md:px-0">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">Trusted Feed</p>
          <h2 className="mt-1 text-2xl font-serif text-[var(--text-primary)]">Published Official Updates</h2>
        </div>
        <p className="text-xs text-[var(--text-secondary)]">Auto-refresh 60s{lastRefresh ? ` · ${relativeTime(lastRefresh)}` : ""}</p>
      </div>

      <div className="mt-5 space-y-3">
        {items.length === 0 && (
          <p className="rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm text-[var(--text-secondary)]">
            No published events yet. Source health below shows current connector status.
          </p>
        )}

        {items.map((item) => (
          <article key={item.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${statusDot(item.status_level)}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{item.source_name}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{relativeTime(item.event_at)}</p>
                </div>

                <p className="mt-1 text-[15px] font-medium leading-snug">{item.headline}</p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">{item.summary}</p>

                <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Evidence</p>
                  <p className="mt-1 text-xs text-[var(--text-primary)]">{item.evidence_excerpt}</p>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-800">Published</span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5">run {item.run_id.slice(0, 8)}</span>
                  <a href={item.original_url} target="_blank" rel="noopener noreferrer" className="text-[var(--primary-blue)] underline">
                    Source
                  </a>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
