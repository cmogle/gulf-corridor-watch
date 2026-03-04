"use client";

import { useCallback, useEffect, useState } from "react";
import type { TrustedSourceHealthItem } from "@/lib/trusted-feed-types";

type HealthResponse = {
  ok: boolean;
  error?: string;
  items?: TrustedSourceHealthItem[];
};

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function badge(state: TrustedSourceHealthItem["health_state"]): string {
  if (state === "healthy") return "bg-emerald-100 text-emerald-800";
  if (state === "degraded") return "bg-amber-100 text-amber-800";
  if (state === "failing") return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-800";
}

export function SourceHealthV2({ initialItems }: { initialItems: TrustedSourceHealthItem[] }) {
  const [items, setItems] = useState(initialItems);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/sources/health", { cache: "no-store" });
      const json = (await res.json()) as HealthResponse;
      if (json.ok) setItems(json.items ?? []);
    } catch {
      // keep existing
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const healthy = items.filter((item) => item.health_state === "healthy").length;

  return (
    <section className="mx-auto max-w-5xl px-4 pb-10 md:px-0">
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">Source Health</p>
            <p className="mt-1 text-sm text-[var(--text-primary)]">{healthy} of {items.length} sources healthy</p>
          </div>
          <button onClick={() => void refresh()} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-gray-50">
            Refresh
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <article key={item.source_id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[var(--text-primary)]">{item.source_name}</p>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${badge(item.health_state)}`}>{item.health_state}</span>
              </div>
              <p className="mt-1 text-[11px] text-[var(--text-secondary)]">Last run: {relativeTime(item.latest_run_at)}</p>
              <p className="text-[11px] text-[var(--text-secondary)]">Last publish: {relativeTime(item.last_publish_at)}</p>
              <p className="text-[11px] text-[var(--text-secondary)]">Consecutive failures: {item.consecutive_failures}</p>
              {item.health_reason && <p className="mt-1 text-[11px] text-[var(--amber)]">Reason: {item.health_reason}</p>}
              <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[11px] text-[var(--primary-blue)] underline">
                Open source
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
