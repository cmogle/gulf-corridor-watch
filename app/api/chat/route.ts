import OpenAI from "openai";
import { flightsToContextRows, parseFlightIntent, runFlightQuery } from "@/lib/flight-query";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isUsableSnapshot } from "@/lib/source-quality";

type SocialContextRow = {
  linked_source_id: string;
  handle: string;
  posted_at: string;
  url: string;
  text_original: string | null;
  text_en: string | null;
  language_original: string | null;
  translation_status: "not_needed" | "translated" | "failed";
};

export async function POST(req: Request) {
  try {
    const { question } = await req.json();
    if (!question) return Response.json({ ok: false, error: "Missing question" }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const flightIntent = parseFlightIntent(question);
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    if (flightIntent.type !== "unknown") {
      const result = await runFlightQuery(question, { allowLive: false });
      const context = flightsToContextRows(result.flights).join("\n\n");
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content:
              "You are a flight operations assistant. Answer only from provided flight data and insight summary. If data is missing or stale, say so clearly. Always include the latest fetched timestamp.",
          },
          {
            role: "user",
            content: `Question: ${question}

Summary: total=${result.summary.total}, delayed=${result.summary.delayed}, cancelled=${result.summary.cancelled}, latest_fetch=${result.summary.latest_fetch ?? "n/a"}
Insight: ${result.insight ? `${result.insight.headline} | ${result.insight.summary} | confidence=${result.insight.confidence} | score=${result.insight.score ?? "n/a"}` : "n/a"}

Flight data context:
${context || "No matching flights found."}`,
          },
        ],
      });

      const answer = completion.choices[0]?.message?.content ?? "No answer";
      await supabase.from("chat_logs").insert({ question, answer });
      return Response.json({ ok: true, answer, mode: "flight_query", summary: result.summary });
    }

    const { data, error } = await supabase
      .from("latest_source_snapshots")
      .select("source_id, source_name, source_url, fetched_at, published_at, title, summary, status_level, reliability")
      .limit(20);

    if (error) throw error;

    const { data: socialData } = await supabase
      .from("social_signals")
      .select("linked_source_id,handle,posted_at,url,text_original,text_en,language_original,translation_status")
      .eq("provider", "x")
      .order("posted_at", { ascending: false })
      .limit(30);

    const latestSocialBySource = new Map<string, SocialContextRow>();
    for (const row of ((socialData ?? []) as SocialContextRow[])) {
      if (!latestSocialBySource.has(row.linked_source_id)) latestSocialBySource.set(row.linked_source_id, row);
    }

    const usableSnapshots = (data ?? []).filter((d) =>
      isUsableSnapshot({
        title: d.title ?? "",
        summary: d.summary ?? "",
        reliability: d.reliability === "blocked" || d.reliability === "degraded" || d.reliability === "reliable" ? d.reliability : "degraded",
      }),
    );

    const context = usableSnapshots
      .map(
        (d) =>
          `[${d.source_name}] status=${d.status_level} fetched=${d.fetched_at} published=${d.published_at ?? "n/a"}\nTitle: ${d.title}\nSummary: ${d.summary}\nURL: ${d.source_url}`
      )
      .join("\n\n");

    const socialContext = Array.from(latestSocialBySource.entries())
      .map(([, s]) => {
        const display = s.text_en ?? s.text_original ?? "";
        const original = s.translation_status === "translated" ? `\nOriginal (${s.language_original ?? "unknown"}): ${s.text_original}` : "";
        return `[X @${s.handle}] posted=${s.posted_at} status=${s.translation_status}\nText: ${display}${original}\nURL: ${s.url}`;
      })
      .join("\n\n");

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "You are a travel disruption assistant. Answer only from provided official-source and official-X context. If unknown or stale, say so clearly. Always include source citations with URLs and fetched timestamps. Treat X posts as supplementary signal, not sole authority.",
        },
        { role: "user", content: `Question: ${question}\n\nOfficial source context:\n${context}\n\nOfficial X context:\n${socialContext || "No official X posts available."}` },
      ],
    });

    const answer = completion.choices[0]?.message?.content ?? "No answer";

    await supabase.from("chat_logs").insert({ question, answer });

    return Response.json({ ok: true, answer });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
