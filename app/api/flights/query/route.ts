import { runFlightQuery } from "@/lib/flight-query";
import OpenAI from "openai";

function normalizedIntent(intent: Awaited<ReturnType<typeof runFlightQuery>>["intent"]) {
  if (intent.type === "flight_number") {
    return { type: "flight_number" as const, flight_number: intent.flightNumber };
  }
  if (intent.type === "route") {
    return {
      type: "route" as const,
      origin_iata: intent.originCodes[0] ?? null,
      destination_iata: intent.destinationCodes[0] ?? null,
      origin_codes: intent.originCodes,
      destination_codes: intent.destinationCodes,
    };
  }
  return { type: "unknown" as const };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const query = String(body?.query ?? "").trim();
    const mode = body?.mode === "explain" ? "explain" : "structured_only";
    const allowLive = body?.allowLive === true;
    if (!query) return Response.json({ ok: false, error: "Missing query" }, { status: 400 });

    const result = await runFlightQuery(query, { allowLive });
    if (mode !== "explain") {
      return Response.json({ ok: true, mode, normalized_intent: normalizedIntent(result.intent), ...result });
    }

    if (!process.env.OPENAI_API_KEY) {
      return Response.json({
        ok: true,
        mode,
        ...result,
        explanation: "AI explanation unavailable (missing OPENAI_API_KEY). Structured results are shown above.",
      });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const contextRows = result.flights
      .slice(0, 20)
      .map(
        (f) =>
          `${f.flight_number} ${f.origin_iata ?? "???"}->${f.destination_iata ?? "???"} status=${f.status} delayed=${f.is_delayed ? "yes" : "no"} delay=${f.delay_minutes ?? "n/a"} fetched=${f.fetched_at}`
      )
      .join("\n");

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "You are a flight operations assistant. Use only the provided cached dataset summary and rows. Keep response concise, explicit about uncertainty, and include latest fetch timestamp.",
        },
        {
          role: "user",
          content: `Question: ${query}
Data source: ${result.source}
Summary: total=${result.summary.total}, delayed=${result.summary.delayed}, cancelled=${result.summary.cancelled}, latest_fetch=${result.summary.latest_fetch ?? "n/a"}
Insight: ${result.insight ? `${result.insight.headline} | ${result.insight.summary} | confidence=${result.insight.confidence}` : "n/a"}
Rows:
${contextRows || "none"}`,
        },
      ],
    });

    const explanation = completion.choices[0]?.message?.content ?? null;
    return Response.json({ ok: true, mode, normalized_intent: normalizedIntent(result.intent), ...result, explanation });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
