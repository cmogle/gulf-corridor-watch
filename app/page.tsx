import Link from "next/link";
import { PROJECT_NAME } from "@/lib/sources";
import { INDIA_TRANSIT_VISA_LINKS, OFFICIAL_DIRECTORY } from "@/lib/resource-directory";
import { getSupabaseAdmin } from "@/lib/supabase";
import { FlightSearchWidget } from "@/app/components/flight-search-widget";

export const dynamic = "force-dynamic";

type Row = {
  source_id: string;
  source_name: string;
  source_url: string;
  category: string;
  fetched_at: string;
  published_at: string | null;
  title: string;
  summary: string;
  status_level: "normal" | "advisory" | "disrupted" | "unknown";
};

type FlightRow = {
  airport: "DXB" | "AUH";
  origin_iata: string | null;
  destination_iata: string | null;
  status: string;
  is_delayed: boolean;
  fetched_at: string;
};

type FlightPulse = {
  total: number;
  delayed: number;
  cancelled: number;
  byAirport: Record<"DXB" | "AUH", { total: number; delayed: number; cancelled: number; latestFetch: string | null }>;
  topRoutes: Array<{ route: string; count: number }>;
  latestFetch: string | null;
};

async function loadRows(): Promise<Row[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("latest_source_snapshots")
      .select("source_id,source_name,source_url,category,fetched_at,published_at,title,summary,status_level")
      .order("source_name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Row[];
  } catch {
    return [];
  }
}

async function loadFlightPulse(): Promise<FlightPulse> {
  const empty: FlightPulse = {
    total: 0,
    delayed: 0,
    cancelled: 0,
    byAirport: {
      DXB: { total: 0, delayed: 0, cancelled: 0, latestFetch: null },
      AUH: { total: 0, delayed: 0, cancelled: 0, latestFetch: null },
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

      const airportBucket = empty.byAirport[row.airport];
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

function badge(level: Row["status_level"]) {
  const map = {
    normal: "bg-emerald-100 text-emerald-800",
    advisory: "bg-amber-100 text-amber-800",
    disrupted: "bg-red-100 text-red-800",
    unknown: "bg-zinc-200 text-zinc-700",
  } as const;
  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${map[level]}`}>{level.toUpperCase()}</span>;
}

export default async function Home() {
  const rows = await loadRows();
  const pulse = await loadFlightPulse();
  const advisories = rows.filter((r) => r.status_level === "advisory" || r.status_level === "disrupted").length;
  const unknown = rows.filter((r) => r.status_level === "unknown").length;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="rounded-2xl border border-zinc-300 bg-white/85 p-4 md:p-6 shadow-[0_10px_40px_rgba(10,28,42,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Operational Control</p>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{PROJECT_NAME}</h1>
            <p className="max-w-2xl text-sm text-zinc-700">Fastest path to relevant travel status: query flights first, then use official-source cards for policy and advisory context.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/ask" className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white">
              Open Chat
            </Link>
            <a href="/api/ingest" className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm">
              Run Ingestion
            </a>
          </div>
        </div>
      </div>

      <section className="relative overflow-hidden rounded-2xl border border-zinc-300 p-4 md:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(200,235,255,0.55),transparent_45%),radial-gradient(circle_at_85%_80%,rgba(255,232,200,0.6),transparent_50%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(20,20,20,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(20,20,20,0.06)_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className="relative space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Flight-First Query</h2>
              <p className="text-sm text-zinc-700">Ask by flight, route, or scenario. Default response path is Supabase cache for speed and low cost.</p>
            </div>
            <p className="text-xs text-zinc-600">Latest fetch: {pulse.latestFetch ? new Date(pulse.latestFetch).toLocaleString() : "n/a"}</p>
          </div>

          <FlightSearchWidget />

          <div className="grid gap-3 sm:grid-cols-3">
            <article className="rounded-xl border border-zinc-300 bg-white/80 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-600">Flights Tracked (45m)</p>
              <p className="text-2xl font-semibold">{pulse.total}</p>
            </article>
            <article className="rounded-xl border border-zinc-300 bg-white/80 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-600">Delayed</p>
              <p className="text-2xl font-semibold text-amber-700">{pulse.delayed}</p>
            </article>
            <article className="rounded-xl border border-zinc-300 bg-white/80 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-600">Cancelled</p>
              <p className="text-2xl font-semibold text-red-700">{pulse.cancelled}</p>
            </article>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <article className="rounded-xl border border-zinc-300 bg-white/80 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-600">Official Sources</p>
              <p className="text-2xl font-semibold">{rows.length}</p>
            </article>
            <article className="rounded-xl border border-zinc-300 bg-white/80 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-600">Advisory/Disrupted</p>
              <p className="text-2xl font-semibold text-amber-700">{advisories}</p>
            </article>
            <article className="rounded-xl border border-zinc-300 bg-white/80 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-600">Unknown Status</p>
              <p className="text-2xl font-semibold text-zinc-700">{unknown}</p>
            </article>
          </div>

          <div className="grid gap-3 md:grid-cols-[1.25fr_1fr]">
            <div className="rounded-xl border border-zinc-300 bg-white/80 p-3 space-y-2">
              <p className="text-xs uppercase tracking-wide text-zinc-600">Airport Breakdown</p>
              <div className="grid grid-cols-2 gap-2">
                {(["DXB", "AUH"] as const).map((airport) => (
                  <article key={airport} className="rounded-lg border border-zinc-300 bg-white p-3">
                    <p className="text-sm font-semibold">{airport}</p>
                    <p className="text-xs text-zinc-600">Flights: {pulse.byAirport[airport].total}</p>
                    <p className="text-xs text-amber-700">Delayed: {pulse.byAirport[airport].delayed}</p>
                    <p className="text-xs text-red-700">Cancelled: {pulse.byAirport[airport].cancelled}</p>
                  </article>
                ))}
              </div>
              <p className="text-[11px] text-zinc-500">Window: last 45 minutes of fetched observations.</p>
            </div>
            <div className="rounded-xl border border-zinc-300 bg-white/80 p-3 space-y-2">
              <p className="text-xs uppercase tracking-wide text-zinc-600">Top Active Routes</p>
              {pulse.topRoutes.length > 0 ? (
                <ul className="space-y-1">
                  {pulse.topRoutes.map((route) => (
                    <li key={route.route} className="flex items-center justify-between rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm">
                      <span>{route.route}</span>
                      <span className="text-zinc-600">{route.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-600">No recent route data yet.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <details className="group rounded-2xl border border-zinc-300 bg-white/80 p-4">
        <summary className="cursor-pointer list-none text-lg font-semibold">Quick Links & Contacts</summary>
        <p className="mt-2 text-sm text-zinc-600">Secondary resources are available on demand to keep first open uncluttered.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-600">India Transit & Visa</h2>
            <div className="grid gap-2">
              {INDIA_TRANSIT_VISA_LINKS.map((item) => (
                <a key={item.url} href={item.url} target="_blank" className="rounded-xl border border-zinc-300 bg-white p-3 hover:bg-zinc-50">
                  <p className="font-medium text-sm">{item.label}</p>
                  <p className="text-xs text-zinc-600">{item.note}</p>
                </a>
              ))}
            </div>
          </section>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-600">Official Contacts</h2>
            <div className="grid gap-2">
              {OFFICIAL_DIRECTORY.map((entry) => (
                <article key={entry.name} className="rounded-xl border border-zinc-300 bg-white p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm leading-tight">{entry.name}</p>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] uppercase text-zinc-700">{entry.type}</span>
                  </div>
                  <p className="text-xs text-zinc-500">{entry.region}</p>
                  {entry.phone && (
                    <p className="text-xs">
                      <span className="font-medium">Phone:</span> {entry.phone}
                    </p>
                  )}
                  {entry.whatsapp && (
                    <p className="text-xs">
                      <span className="font-medium">WhatsApp:</span> {entry.whatsapp}
                    </p>
                  )}
                  <a href={entry.contactPage} target="_blank" className="text-xs underline">
                    Official contact page ↗
                  </a>
                </article>
              ))}
            </div>
          </section>
        </div>
      </details>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <article key={r.source_id} className="rounded-2xl border border-zinc-300 bg-white/80 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-medium leading-tight">{r.source_name}</h2>
              {badge(r.status_level)}
            </div>
            <p className="text-xs text-zinc-500">{r.category.toUpperCase()}</p>
            <p className="text-sm font-medium">{r.title}</p>
            <p className="text-sm text-zinc-700 line-clamp-4">{r.summary}</p>
            <div className="text-xs text-zinc-500 space-y-1">
              <p>Fetched: {new Date(r.fetched_at).toLocaleString()}</p>
              <p>Published: {r.published_at ? new Date(r.published_at).toLocaleString() : "n/a"}</p>
            </div>
            <a href={r.source_url} target="_blank" className="text-sm underline">Official source ↗</a>
          </article>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="rounded-xl border border-dashed p-6 text-sm text-zinc-600">
          No data yet. Configure Supabase env vars, run SQL in <code>supabase/schema.sql</code>, then hit <code>/api/ingest?key=YOUR_SECRET</code>.
        </div>
      )}
    </main>
  );
}
