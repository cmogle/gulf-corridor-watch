"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { evaluateTrackingItem } from "@/lib/tracking-eval";
import { loadTracking, removeTrackedItem } from "@/lib/tracking-local";
import { TrackingEvaluation, TrackingItem } from "@/lib/tracking-types";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type QueryResponse = {
  ok: boolean;
  flights?: Array<{
    status: string;
    is_delayed: boolean;
    fetched_at: string;
  }>;
};

function stateBadge(state: TrackingEvaluation["state"]) {
  const cls =
    state === "normal"
      ? "bg-emerald-100 text-emerald-800"
      : state === "advisory"
        ? "bg-amber-100 text-amber-800"
        : state === "disrupted"
          ? "bg-red-100 text-red-800"
          : "bg-zinc-200 text-zinc-700";
  return <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${cls}`}>{state.toUpperCase()}</span>;
}

async function refreshOne(item: TrackingItem): Promise<TrackingEvaluation> {
  const query = item.kind === "flight" ? item.flight_number ?? "" : `${item.origin_iata ?? "???"} -> ${item.destination_iata ?? "???"}`;
  const res = await fetch("/api/flights/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, mode: "structured_only", allowLive: false }),
  });
  const json = (await res.json()) as QueryResponse;
  const rows = json.ok ? (json.flights ?? []) : [];
  return evaluateTrackingItem(item, rows);
}

export function MyTrackingPanel() {
  const [items, setItems] = useState<TrackingItem[]>([]);
  const [rows, setRows] = useState<TrackingEvaluation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const loadFromStorage = useCallback(() => {
    const current = loadTracking();
    setItems(current);
  }, []);

  const refreshStatuses = useCallback(async () => {
    const current = loadTracking();
    setItems(current);
    if (current.length === 0) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const evaluations = await Promise.all(current.map((item) => refreshOne(item)));
      setRows(evaluations);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFromStorage();
    void refreshStatuses();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshStatuses();
    }, 90_000);
    const onStorage = () => loadFromStorage();
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", onStorage);
    };
  }, [loadFromStorage, refreshStatuses]);

  const rowMap = useMemo(() => new Map(rows.map((r) => [r.item.id, r])), [rows]);

  function untrack(id: string) {
    const next = removeTrackedItem(id);
    setItems(next);
    setRows((prev) => prev.filter((r) => r.item.id !== id));
  }

  async function signInForSync() {
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setAuthMessage("Supabase browser auth is not configured (set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY).");
      return;
    }
    setAuthLoading(true);
    setAuthMessage(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href },
    });
    if (oauthError) setAuthMessage(oauthError.message);
    setAuthLoading(false);
  }

  async function importLocalToCloud() {
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setAuthMessage("Supabase browser auth is not configured.");
      return;
    }
    setAuthLoading(true);
    setAuthMessage(null);
    const session = (await supabase.auth.getSession()).data.session;
    if (!session?.access_token) {
      setAuthMessage("Sign in first, then run import.");
      setAuthLoading(false);
      return;
    }
    const res = await fetch("/api/tracking/import-local", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ items }),
    });
    const json = (await res.json()) as { ok?: boolean; imported?: number; error?: string };
    if (json.ok) setAuthMessage(`Imported ${json.imported ?? 0} tracked items to cloud sync.`);
    else setAuthMessage(json.error ?? "Import failed.");
    setAuthLoading(false);
  }

  return (
    <section className="rounded-2xl border border-zinc-300 bg-white/85 p-4 md:p-6 shadow-[0_10px_40px_rgba(10,28,42,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold tracking-tight">My Tracking</h3>
        <button onClick={() => void refreshStatuses()} className="rounded-md border border-zinc-400 px-2 py-1 text-xs hover:bg-zinc-100">
          Refresh
        </button>
      </div>
      <p className="mt-1 text-xs text-zinc-600">Saved on this device. Sign in later for cross-device sync, alerts, and history.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button onClick={() => void signInForSync()} disabled={authLoading} className="rounded-md border border-zinc-400 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50">
          {authLoading ? "Working..." : "Sign in for sync/alerts/history"}
        </button>
        <button onClick={() => void importLocalToCloud()} disabled={authLoading || items.length === 0} className="rounded-md border border-zinc-400 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50">
          Import local to cloud
        </button>
      </div>
      {authMessage ? <p className="mt-2 text-xs text-zinc-700">{authMessage}</p> : null}

      {items.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-zinc-300 p-3 text-sm text-zinc-600">
          No tracked flights/routes yet. Use “Track this flight/route” in Flight Agent results.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => {
            const row = rowMap.get(item.id);
            return (
              <li key={item.id} className="rounded-xl border border-zinc-300 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{item.label}</p>
                  {stateBadge(row?.state ?? "unknown")}
                </div>
                <div className="mt-1 text-xs text-zinc-600">
                  <p>
                    Flights: {row?.total ?? 0} | Delayed: {row?.delayed ?? 0} | Cancelled: {row?.cancelled ?? 0}
                  </p>
                  <p>Latest fetch: {row?.latest_fetch ? new Date(row.latest_fetch).toLocaleString() : "n/a"}</p>
                </div>
                <button onClick={() => untrack(item.id)} className="mt-2 rounded-md border border-zinc-400 px-2 py-1 text-xs hover:bg-zinc-100">
                  Untrack
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {loading ? <p className="mt-2 text-xs text-zinc-600">Refreshing tracked statuses...</p> : null}
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </section>
  );
}
