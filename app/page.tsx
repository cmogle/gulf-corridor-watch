import Link from "next/link";
import { PROJECT_NAME } from "@/lib/sources";
import { INDIA_TRANSIT_VISA_LINKS, OFFICIAL_DIRECTORY } from "@/lib/resource-directory";
import { getSupabaseAdmin } from "@/lib/supabase";

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

  return (
    <main className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">{PROJECT_NAME} (MVP)</h1>
          <p className="text-sm text-zinc-600">Official + operational-source monitor for family + team decision support (incl. India transit/visa context).</p>
        </div>
        <div className="flex gap-2">
          <Link href="/ask" className="rounded-lg bg-black px-3 py-2 text-sm text-white">Ask AI</Link>
          <a href="/api/ingest" className="rounded-lg border px-3 py-2 text-sm">Run Ingestion</a>
        </div>
      </div>

      <section className="rounded-2xl border p-4 space-y-3">
        <h2 className="text-lg font-semibold">India Transit & Visa Quick Links</h2>
        <p className="text-sm text-zinc-600">For Indian nationals and families dealing with reroutes, transit changes, or return-to-India planning.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {INDIA_TRANSIT_VISA_LINKS.map((item) => (
            <a key={item.url} href={item.url} target="_blank" className="rounded-xl border p-3 hover:bg-zinc-50">
              <p className="font-medium text-sm">{item.label}</p>
              <p className="text-xs text-zinc-600">{item.note}</p>
            </a>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border p-4 space-y-3">
        <h2 className="text-lg font-semibold">Official Contacts, Hotlines & Channels</h2>
        <p className="text-sm text-zinc-600">Directory for fast escalation by travellers, teams, and family members following UAE-related disruptions.</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {OFFICIAL_DIRECTORY.map((entry) => (
            <article key={entry.name} className="rounded-xl border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-sm leading-tight">{entry.name}</p>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] uppercase text-zinc-700">{entry.type}</span>
              </div>
              <p className="text-xs text-zinc-500">{entry.region}</p>
              {entry.phone && <p className="text-xs"><span className="font-medium">Phone:</span> {entry.phone}</p>}
              {entry.whatsapp && <p className="text-xs"><span className="font-medium">WhatsApp:</span> {entry.whatsapp}</p>}
              <a href={entry.contactPage} target="_blank" className="text-xs underline">Official contact page ↗</a>
              {entry.socials && entry.socials.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {entry.socials.map((s) => (
                    <a key={s.url} href={s.url} target="_blank" className="text-xs underline">{s.label}</a>
                  ))}
                </div>
              )}
              {entry.note && <p className="text-[11px] text-zinc-500">{entry.note}</p>}
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <article key={r.source_id} className="rounded-2xl border p-4 space-y-3">
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
