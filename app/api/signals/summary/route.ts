import { getSupabaseAdmin } from "@/lib/supabase";

type SignalRow = {
  linked_source_id: string;
  handle: string;
  post_id: string;
  posted_at: string;
  text: string;
  text_original: string;
  language_original: string | null;
  text_en: string | null;
  translation_status: "not_needed" | "translated" | "failed";
  url: string;
  keywords: string[];
  confidence: number;
  fetched_at: string;
};

type SnapshotRow = {
  source_id: string;
  source_name: string;
  status_level: "normal" | "advisory" | "disrupted" | "unknown";
  fetched_at: string;
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const lang = (url.searchParams.get("lang") ?? "en").toLowerCase();
    const includeOriginal = url.searchParams.get("include_original") === "true";
    const supabase = getSupabaseAdmin();
    const [{ data: signals, error: signalError }, { data: snapshots, error: snapshotError }] = await Promise.all([
      supabase
        .from("social_signals")
        .select("linked_source_id,handle,post_id,posted_at,text,text_original,language_original,text_en,translation_status,url,keywords,confidence,fetched_at")
        .eq("provider", "x")
        .order("posted_at", { ascending: false })
        .limit(400),
      supabase.from("latest_source_snapshots").select("source_id,source_name,status_level,fetched_at"),
    ]);

    if (signalError) throw signalError;
    if (snapshotError) throw snapshotError;

    const latestBySource = new Map<string, SignalRow>();
    for (const row of (signals ?? []) as SignalRow[]) {
      if (!latestBySource.has(row.linked_source_id)) {
        latestBySource.set(row.linked_source_id, row);
      }
    }

    const snapshotMap = new Map<string, SnapshotRow>();
    for (const row of (snapshots ?? []) as SnapshotRow[]) {
      snapshotMap.set(row.source_id, row);
    }

    const items = Array.from(latestBySource.values()).map((signal) => {
      const source = snapshotMap.get(signal.linked_source_id);
      const authoritative = (source?.status_level === "advisory" || source?.status_level === "disrupted") && signal.keywords.length > 0;
      return {
        source_id: signal.linked_source_id,
        source_name: source?.source_name ?? signal.linked_source_id,
        handle: signal.handle,
        post_id: signal.post_id,
        posted_at: signal.posted_at,
        text_display: lang === "en" ? signal.text_en ?? signal.text_original ?? signal.text : signal.text_original ?? signal.text,
        text_original: includeOriginal ? signal.text_original ?? signal.text : undefined,
        language_original: signal.language_original,
        translation_status: signal.translation_status,
        translated: signal.translation_status === "translated",
        text: signal.text,
        url: signal.url,
        keywords: signal.keywords,
        confidence: signal.confidence,
        fetched_at: signal.fetched_at,
        confirmation_state: authoritative ? "confirmed" : "unconfirmed_social",
        evidence_basis: authoritative ? "x+official" : "official_web",
      };
    });

    return Response.json({ ok: true, count: items.length, items });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
