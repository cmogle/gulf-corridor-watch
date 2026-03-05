import { getFeedBackend } from "@/lib/feed-backend";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isUsableSnapshot } from "@/lib/source-quality";
import { loadTrustedFeed, loadTrustedSourceHealth } from "@/lib/trusted-feed-repo";
import { loadUnifiedFeed } from "@/lib/unified-updates";
import { loadCurrentStateBrief } from "@/lib/current-state-brief";
import { TrustedUpdatesFeedV2 } from "@/app/components/trusted-updates-feed-v2";
import { SourceHealthV2 } from "@/app/components/source-health-v2";
import { ChatFirstLayout } from "@/app/components/chat-first-layout";
import { getActiveEventsWithStats } from "@/lib/crisis-stats";
import { getCrisisTimeline } from "@/lib/crisis-timeline";
import type { AirportCode, FlightPulseData } from "@/app/components/layout-types";

export const dynamic = "force-dynamic";

type Row = {
  source_id: string;
  source_name: string;
  source_url: string;
  category: string;
  ingest_method: "api" | "official_web" | "rss" | "relay";
  reliability: "reliable" | "degraded" | "blocked";
  block_reason: string | null;
  priority: number;
  freshness_target_minutes: number;
  evidence_basis: "api" | "official_web" | "rss" | "relay" | "x+official";
  confirmation_state: "confirmed" | "unconfirmed_social";
  fetched_at: string;
  published_at: string | null;
  title: string;
  summary: string;
  status_level: "normal" | "advisory" | "disrupted" | "unknown";
};

type FlightRow = {
  airport: "DXB" | "AUH" | "DWC";
  origin_iata: string | null;
  destination_iata: string | null;
  status: string;
  is_delayed: boolean;
  fetched_at: string;
};

function buildFlightPromptSuggestions(pulse: FlightPulseData): string[] {
  if (!pulse.latestFetch || pulse.topRoutes.length === 0) return [];

  // Only use routes with valid IATA codes on both ends
  const validRoutes = pulse.topRoutes.filter((item) => /^[A-Z]{3} -> [A-Z]{3}$/.test(item.route));

  const prompts: string[] = [];
  for (const item of validRoutes.slice(0, 3)) {
    const [origin, destination] = item.route.split(" -> ");
    prompts.push(`${item.route} delayed now`);
    prompts.push(`What is the likelihood of getting from ${origin} to ${destination} in the next 24 hours?`);
  }

  return Array.from(new Set(prompts)).slice(0, 4);
}

async function loadRows(): Promise<Row[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("latest_source_snapshots")
      .select(
        "source_id,source_name,source_url,category,ingest_method,reliability,block_reason,priority,freshness_target_minutes,evidence_basis,confirmation_state,fetched_at,published_at,title,summary,status_level",
      );
    if (error) throw error;
    return ((data ?? []) as Row[]).sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      const relRank = { reliable: 2, degraded: 1, blocked: 0 } as const;
      if (relRank[b.reliability] !== relRank[a.reliability]) return relRank[b.reliability] - relRank[a.reliability];
      return a.source_name.localeCompare(b.source_name);
    });
  } catch {
    return [];
  }
}

async function loadFlightPulse(): Promise<FlightPulseData> {
  const empty: FlightPulseData = {
    total: 0,
    delayed: 0,
    cancelled: 0,
    byAirport: {
      DXB: { total: 0, delayed: 0, cancelled: 0, latestFetch: null },
      AUH: { total: 0, delayed: 0, cancelled: 0, latestFetch: null },
      DWC: { total: 0, delayed: 0, cancelled: 0, latestFetch: null },
    },
    topRoutes: [],
    latestFetch: null,
  };

  try {
    const supabase = getSupabaseAdmin();
    const cutoff = new Date(Date.now() - 45 * 60_000).toISOString();
    const { data, error } = await supabase
      .from("flight_observations")
      .select("airport,origin_iata,destination_iata,status,is_delayed,fetched_at")
      .gte("fetched_at", cutoff)
      .order("fetched_at", { ascending: false })
      .limit(2000);
    if (error) throw error;

    const rows = (data ?? []) as FlightRow[];
    if (rows.length === 0) return empty;

    const routeCounts = new Map<string, number>();
    let delayed = 0;
    let cancelled = 0;
    let latestFetch = rows[0].fetched_at;

    for (const row of rows) {
      if (row.is_delayed) delayed += 1;
      if (/cancel/.test(row.status)) cancelled += 1;
      if (new Date(row.fetched_at).getTime() > new Date(latestFetch).getTime()) latestFetch = row.fetched_at;

      const airportBucket = empty.byAirport[row.airport as AirportCode];
      if (!airportBucket) continue;
      airportBucket.total += 1;
      if (row.is_delayed) airportBucket.delayed += 1;
      if (/cancel/.test(row.status)) airportBucket.cancelled += 1;
      if (!airportBucket.latestFetch || new Date(row.fetched_at).getTime() > new Date(airportBucket.latestFetch).getTime()) {
        airportBucket.latestFetch = row.fetched_at;
      }

      const route = `${row.origin_iata ?? "???"} -> ${row.destination_iata ?? "???"}`;
      routeCounts.set(route, (routeCounts.get(route) ?? 0) + 1);
    }

    const topRoutes = Array.from(routeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([route, count]) => ({ route, count }));

    return { ...empty, total: rows.length, delayed, cancelled, topRoutes, latestFetch };
  } catch {
    return empty;
  }
}

function suppressionReason(row: Row) {
  if (row.reliability === "blocked") return "blocked/challenge page";
  if (/fetch error/i.test(row.title)) return "fetch failed";
  if (!row.summary?.trim()) return "empty summary";
  return "low-signal source content";
}

export default async function Home() {
  if (getFeedBackend() === "v2") {
    const [initialUpdates, initialHealth] = await Promise.all([
      loadTrustedFeed(80).catch(() => []),
      loadTrustedSourceHealth().catch(() => []),
    ]);

    return (
      <main className="min-h-screen bg-[var(--surface-light)]">
        <section className="bg-[var(--surface-dark)] px-4 py-10 md:px-8">
          <div className="mx-auto max-w-5xl">
            <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-[var(--text-on-dark-muted)]">Trusted Feed v2</p>
            <h1 className="mt-2 font-serif text-4xl text-[var(--text-on-dark)]">Gulf Corridor Watch</h1>
            <p className="mt-3 max-w-3xl text-sm text-[var(--text-on-dark-muted)]">
              Strict publish mode is active. Only machine-qualified official updates are shown. Degraded or failed source runs are visible in Source Health.
            </p>
          </div>
        </section>

        <TrustedUpdatesFeedV2 initialItems={initialUpdates} />
        <SourceHealthV2 initialItems={initialHealth} />
      </main>
    );
  }

  const currentBrief = await loadCurrentStateBrief({ allowTransient: true }).catch(() => null);
  const rows = await loadRows();
  const usableRows = rows.filter((row) => isUsableSnapshot({ title: row.title, summary: row.summary, reliability: row.reliability }));
  const suppressedRows = rows.filter((row) => !isUsableSnapshot({ title: row.title, summary: row.summary, reliability: row.reliability }));
  const pulse = await loadFlightPulse();
  const suggestedFlightPrompts = buildFlightPromptSuggestions(pulse);
  const initialUpdates = await loadUnifiedFeed(80).catch(() => []);

  // Load crisis trend for status bar indicator
  let crisisTrend: "improving" | "worsening" | "stable" | null = null;
  try {
    const events = await getActiveEventsWithStats();
    if (events.length > 0) {
      const timeline = await getCrisisTimeline(events[0]);
      if (timeline.trend.trajectory === "getting_better") crisisTrend = "improving";
      else if (timeline.trend.trajectory === "getting_worse") crisisTrend = "worsening";
      else crisisTrend = "stable";
    }
  } catch {
    // Crisis data unavailable
  }

  const posture: "normal" | "heightened" | "unclear" =
    currentBrief?.confidence === "low" || currentBrief?.freshness_state === "stale"
      ? "unclear"
      : (currentBrief?.flight.delayed ?? 0) > 0 || (currentBrief?.flight.cancelled ?? 0) > 0 ||
        usableRows.some((r) => r.status_level === "advisory" || r.status_level === "disrupted")
        ? "heightened"
        : "normal";

  return (
    <ChatFirstLayout
      posture={posture}
      flightTotal={pulse.total}
      flightDelayed={pulse.delayed}
      flightCancelled={pulse.cancelled}
      updatedAt={pulse.latestFetch}
      trend={crisisTrend}
      sourceCount={usableRows.length}
      briefingSummary={currentBrief?.paragraph ?? "Checking sources..."}
      suggestedPrompts={suggestedFlightPrompts}
      currentBrief={currentBrief}
      pulse={pulse}
      initialUpdates={initialUpdates}
      totalSources={rows.length}
      healthySources={usableRows.length}
      suppressedSources={suppressedRows.map((row) => ({
        source_id: row.source_id,
        source_name: row.source_name,
        source_url: row.source_url,
        reason: suppressionReason(row),
      }))}
    />
  );
}
