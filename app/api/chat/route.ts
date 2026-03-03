import OpenAI from "openai";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const { question } = await req.json();
    if (!question) return Response.json({ ok: false, error: "Missing question" }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("latest_source_snapshots")
      .select("source_id, source_name, source_url, fetched_at, published_at, title, summary, status_level")
      .limit(20);

    if (error) throw error;

    const context = (data ?? [])
      .map(
        (d) =>
          `[${d.source_name}] status=${d.status_level} fetched=${d.fetched_at} published=${d.published_at ?? "n/a"}\nTitle: ${d.title}\nSummary: ${d.summary}\nURL: ${d.source_url}`
      )
      .join("\n\n");

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "You are a travel disruption assistant. Answer only from provided official-source context. If unknown or stale, say so clearly. Always include source citations with URLs and fetched timestamps.",
        },
        { role: "user", content: `Question: ${question}\n\nOfficial source context:\n${context}` },
      ],
    });

    const answer = completion.choices[0]?.message?.content ?? "No answer";

    await supabase.from("chat_logs").insert({ question, answer });

    return Response.json({ ok: true, answer });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
