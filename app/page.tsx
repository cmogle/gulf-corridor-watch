import { OFFICIAL_SOURCES, PROJECT_NAME } from "@/lib/sources";
import { INDIA_TRANSIT_VISA_LINKS, OFFICIAL_DIRECTORY } from "@/lib/resource-directory";
import { getSupabaseAdmin } from "@/lib/supabase";
import { FlightSearchWidget } from "@/app/components/flight-search-widget";
import { OmnipresentChat } from "@/app/components/omnipresent-chat";
import { MyTrackingPanel } from "@/app/components/my-tracking-panel";
import { isUsableSnapshot } from "@/lib/source-quality";
import { LiveUpdatesTicker } from "@/app/components/live-updates-ticker";
import { XEmbed } from "@/app/components/x-embed";
import { loadUnifiedFeed } from "@/lib/unified-updates";
import { loadCurrentStateBrief } from "@/lib/current-state-brief";

export const dynamic = "force-dynamic";
type HomeProps = {
  searchParams?: Promise<{ q?: string }>;
};

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

type SocialSignalRow = {
  source_id: string;
  source_name: string;
  handle: string;
  post_id: string | null;
  posted_at: string | null;
  text: string | null;
  text_display: string | null;
  text_original: string | null;
  language_original: string | null;
  translation_status: "not_needed" | "translated" | "failed";
  translated: boolean;
  url: string | null;
  keywords: string[];
  confidence: number;
  fetched_at: string | null;
  confirmation_state: "confirmed" | "unconfirmed_social";
  evidence_basis: "official_web" | "x+official";
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

function buildFlightPromptSuggestions(pulse: FlightPulse): string[] {
  if (!pulse.latestFetch || pulse.topRoutes.length === 0) return [];

  const prompts: string[] = [];
  for (const item of pulse.topRoutes.slice(0, 3)) {
    prompts.push(`${item.route} delayed now`);
    const routeMatch = item.route.match(/^([A-Z]{3}) -> ([A-Z]{3})$/);
    if (routeMatch) {
      const origin = routeMatch[1];
      const destination = routeMatch[2];
      prompts.push(`What is the likelihood of getting from ${origin} to ${destination} in the next 24 hours?`);
    }
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

async function loadSocialSignals(): Promise<SocialSignalRow[]> {
  try {
    const supabase = getSupabaseAdmin();
    const [{ data: signals, error: signalsError }, { data: snapshots, error: snapshotsError }] = await Promise.all([
      supabase
        .from("social_signals")
        .select("linked_source_id,handle,post_id,posted_at,text,text_original,text_en,language_original,translation_status,url,keywords,confidence,fetched_at")
        .eq("provider", "x")
        .order("posted_at", { ascending: false })
        .limit(300),
      supabase.from("latest_source_snapshots").select("source_id,source_name,status_level"),
    ]);
    if (signalsError) throw signalsError;
    if (snapshotsError) throw snapshotsError;

    const latestBySource = new Map<string, (typeof signals)[number]>();
    for (const row of signals ?? []) {
      if (!latestBySource.has(row.linked_source_id)) latestBySource.set(row.linked_source_id, row);
    }
    const snapshotMap = new Map((snapshots ?? []).map((s) => [s.source_id, s]));

    const handleSources = OFFICIAL_SOURCES.filter((s) => (s.x_handles?.length ?? 0) > 0).map((s) => ({
      source_id: s.id,
      source_name: s.name,
      handle: (s.x_handles ?? [])[0] ?? "",
    }));
    return handleSources
      .map((sourceMeta) => {
        const signal = latestBySource.get(sourceMeta.source_id);
        const source = snapshotMap.get(sourceMeta.source_id);
        const authoritative =
          Boolean(signal) && (source?.status_level === "advisory" || source?.status_level === "disrupted") && (signal?.keywords?.length ?? 0) > 0;
        const confirmation_state: SocialSignalRow["confirmation_state"] = authoritative ? "confirmed" : "unconfirmed_social";
        const evidence_basis: SocialSignalRow["evidence_basis"] = authoritative ? "x+official" : "official_web";
        return {
          source_id: sourceMeta.source_id,
          source_name: source?.source_name ?? sourceMeta.source_name,
          handle: signal?.handle ?? sourceMeta.handle,
          post_id: signal?.post_id ?? null,
          posted_at: signal?.posted_at ?? null,
          text: signal?.text ?? null,
          text_display: signal?.text_en ?? signal?.text_original ?? signal?.text ?? null,
          text_original: signal?.text_original ?? signal?.text ?? null,
          language_original: signal?.language_original ?? null,
          translation_status: signal?.translation_status ?? "not_needed",
          translated: signal?.translation_status === "translated",
          url: signal?.url ?? null,
          keywords: signal?.keywords ?? [],
          confidence: signal?.confidence ?? 0,
          fetched_at: signal?.fetched_at ?? null,
          confirmation_state,
          evidence_basis,
        };
      })
      .sort((a, b) => {
        const at = a.posted_at ? new Date(a.posted_at).getTime() : 0;
        const bt = b.posted_at ? new Date(b.posted_at).getTime() : 0;
        return bt - at;
      });
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

function suppressionReason(row: Row) {
  if (row.reliability === "blocked") return "blocked/challenge page";
  if (/fetch error/i.test(row.title)) return "fetch failed";
  if (!row.summary?.trim()) return "empty summary";
  return "low-signal source content";
}

export default async function Home({ searchParams }: HomeProps) {
  const params = (await searchParams) ?? {};
  const initialQuery = params.q?.trim() ?? "";
  const currentBrief = await loadCurrentStateBrief({ allowTransient: true }).catch(() => null);
  const rows = await loadRows();
  const usableRows = rows.filter((row) => isUsableSnapshot({ title: row.title, summary: row.summary, reliability: row.reliability }));
  const suppressedRows = rows.filter((row) => !isUsableSnapshot({ title: row.title, summary: row.summary, reliability: row.reliability }));
  const pulse = await loadFlightPulse();
  const suggestedFlightPrompts = buildFlightPromptSuggestions(pulse);
  const socialSignals = await loadSocialSignals();
  const initialUpdates = await loadUnifiedFeed(80).catch(() => []);
  const advisories = usableRows.filter((r) => r.status_level === "advisory" || r.status_level === "disrupted").length;
  const unknown = usableRows.filter((r) => r.status_level === "unknown").length;

  return (
    <main className="mx-auto max-w-[1400px] overflow-x-hidden p-4 md:p-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_390px]">
        <div className="min-w-0 space-y-6">
          {currentBrief ? (
            <section className="rounded-2xl border border-zinc-300 bg-white/90 p-4 md:p-6 shadow-[0_10px_40px_rgba(10,28,42,0.08)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Current State Briefing</p>
                <p className="text-[11px] text-zinc-500">Auto-refreshed from ingest updates</p>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-zinc-800">{currentBrief.paragraph}</p>
              <p className="mt-2 text-[11px] text-zinc-600">
                Updated {new Date(currentBrief.refreshed_at).toLocaleString()} • Flights {currentBrief.flight.total} (delayed {currentBrief.flight.delayed}, cancelled{" "}
                {currentBrief.flight.cancelled})
              </p>
            </section>
          ) : null}

          <div className="rounded-2xl border border-zinc-300 bg-white/85 p-4 md:p-6 shadow-[0_10px_40px_rgba(10,28,42,0.08)]">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Operational Control</p>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{PROJECT_NAME}</h1>
              <p className="text-sm text-zinc-700">Fastest path to relevant travel status: query flights first, then use official-source cards for policy and advisory context.</p>
            </div>
          </div>

          <section className="relative overflow-hidden rounded-2xl border border-zinc-300 p-4 md:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(200,235,255,0.55),transparent_45%),radial-gradient(circle_at_85%_80%,rgba(255,232,200,0.6),transparent_50%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(20,20,20,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(20,20,20,0.06)_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className="relative space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold tracking-tight">Flight-First Query</h2>
              <p className="text-sm text-zinc-700">Query by flight, route, or scenario.</p>
            </div>
            <p className="shrink-0 text-xs text-zinc-600">Fetched: {pulse.latestFetch ? new Date(pulse.latestFetch).toLocaleString() : "n/a"}</p>
          </div>

          <FlightSearchWidget suggestedPrompts={suggestedFlightPrompts} latestFetch={pulse.latestFetch} />

          <div className="rounded-xl border border-zinc-300 bg-white/80 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wide text-zinc-600">Official X Signals</p>
              <p className="text-[11px] text-zinc-500">{socialSignals.length} active source feeds</p>
            </div>
            {socialSignals.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {socialSignals.map((signal) => (
                  <article key={`${signal.source_id}:${signal.post_id ?? "none"}`} className="rounded-lg border border-zinc-300 bg-white p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{signal.source_name}</p>
                        <p className="text-xs text-zinc-600">
                          @{signal.handle} • {signal.posted_at ? new Date(signal.posted_at).toLocaleString() : "no recent post fetched"}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] ${
                          signal.confirmation_state === "confirmed" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {signal.confirmation_state === "confirmed" ? "Confirmed" : "Unconfirmed"}
                      </span>
                    </div>
                    <p className="line-clamp-3 text-sm text-zinc-700">{signal.text_display ?? "No post captured yet for this official source."}</p>
                    {signal.translated ? (
                      <span className="inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-[10px] text-sky-800">Translated from Arabic</span>
                    ) : null}
                    {signal.translation_status === "failed" ? (
                      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">Translation unavailable</span>
                    ) : null}
                    <p className="text-[11px] text-zinc-600">
                      {signal.keywords.length > 0 ? `Possible disruption mention: ${signal.keywords.join(", ")}` : "General official update (no disruption keywords)"}
                    </p>
                    {signal.text_original && signal.translated ? (
                      <details className="rounded-md border border-zinc-200 bg-zinc-50 p-2">
                        <summary className="cursor-pointer text-[11px] font-medium text-zinc-700">Show original Arabic</summary>
                        <p className="mt-2 text-sm leading-relaxed text-zinc-700" dir={signal.language_original === "ar" ? "rtl" : "ltr"}>
                          {signal.text_original}
                        </p>
                      </details>
                    ) : null}
                    {signal.url ? (
                      <XEmbed url={signal.url} postId={signal.post_id ?? "post"} />
                    ) : null}
                    <div className="flex items-center justify-between text-[11px] text-zinc-600">
                      <span>Confidence: {(signal.confidence * 100).toFixed(0)}%</span>
                      {signal.url ? (
                        <a href={signal.url} target="_blank" className="underline">
                          Open X post ↗
                        </a>
                      ) : (
                        <span>No URL yet</span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-600">No recent official X disruption signals yet.</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <article className="rounded-xl border border-zinc-300 bg-white/80 p-3">
              <p className="text-[10px] uppercase tracking-wide text-zinc-600">Tracked</p>
              <p className="text-xl font-semibold">{pulse.total}</p>
            </article>
            <article className="rounded-xl border border-zinc-300 bg-white/80 p-3">
              <p className="text-[10px] uppercase tracking-wide text-zinc-600">Delayed</p>
              <p className="text-xl font-semibold text-amber-700">{pulse.delayed}</p>
            </article>
            <article className="rounded-xl border border-zinc-300 bg-white/80 p-3">
              <p className="text-[10px] uppercase tracking-wide text-zinc-600">Cancelled</p>
              <p className="text-xl font-semibold text-red-700">{pulse.cancelled}</p>
            </article>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <article className="rounded-xl border border-zinc-300 bg-white/80 p-3">
              <p className="text-[10px] uppercase tracking-wide text-zinc-600">Sources</p>
              <p className="text-xl font-semibold">{usableRows.length}</p>
              <p className="text-[10px] text-zinc-500">{suppressedRows.length} hidden</p>
            </article>
            <article className="rounded-xl border border-zinc-300 bg-white/80 p-3">
              <p className="text-[10px] uppercase tracking-wide text-zinc-600">Advisory</p>
              <p className="text-xl font-semibold text-amber-700">{advisories}</p>
            </article>
            <article className="rounded-xl border border-zinc-300 bg-white/80 p-3">
              <p className="text-[10px] uppercase tracking-wide text-zinc-600">Unknown</p>
              <p className="text-xl font-semibold text-zinc-700">{unknown}</p>
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

          <MyTrackingPanel />

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

          <LiveUpdatesTicker initialItems={initialUpdates} />

          {suppressedRows.length > 0 && (
            <section className="rounded-xl border border-amber-300 bg-amber-50/70 p-4">
              <p className="text-sm font-medium text-amber-900">Temporarily unavailable sources</p>
              <p className="mt-1 text-xs text-amber-800">These sources returned blocked/error/low-signal content and were hidden from advisory cards.</p>
              <ul className="mt-3 grid gap-2 md:grid-cols-2">
                {suppressedRows.map((row) => (
                  <li key={`suppressed-${row.source_id}`} className="rounded-lg border border-amber-200 bg-white/80 p-2 text-xs text-zinc-700">
                    <p className="font-medium">{row.source_name}</p>
                    <p className="text-zinc-600">{suppressionReason(row)}</p>
                    <a href={row.source_url} target="_blank" className="underline">
                      Open official source ↗
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {usableRows.length === 0 && (
            <div className="rounded-xl border border-dashed p-6 text-sm text-zinc-600">
              {rows.length === 0
                ? <>No data yet. Configure Supabase env vars, run SQL in <code>supabase/schema.sql</code>, then hit <code>/api/ingest?key=YOUR_SECRET</code>.</>
                : "No usable source summaries are currently available. Use the official links above while source ingestion is degraded."}
            </div>
          )}
        </div>
        <OmnipresentChat initialQuery={initialQuery} />
      </div>
    </main>
  );
}
