import OpenAI from "openai";
import { flightsToContextRows, parseFlightIntent, runFlightQuery } from "@/lib/flight-query";
import { getSupabaseAdmin } from "@/lib/supabase";
import { gateSnapshotContext, gateSocialContext, getContextGatingConfig } from "@/lib/context-gating";
import { extractUsage, logLlmTelemetry } from "@/lib/llm-telemetry";

type SocialContextRow = {
  linked_source_id: string;
  handle: string;
  posted_at: string;
  url: string;
  text_original: string | null;
  text_en: string | null;
  language_original: string | null;
  translation_status: "not_needed" | "translated" | "failed";
  text: string | null;
  confidence: number | null;
  validation_state: "validated" | "unvalidated" | "failed" | "skipped";
};

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    const { question } = await req.json();
    if (!question) return Response.json({ ok: false, error: "Missing question" }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logLlmTelemetry("chat_response", {
        route: "/api/chat",
        success: false,
        duration_ms: Date.now() - startedAt,
        error: "Missing OPENAI_API_KEY",
      });
      return Response.json({ ok: false, error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const supabase = getSupabaseAdmin();
    const flightIntent = parseFlightIntent(question);
    const client = new OpenAI({ apiKey });
    const gating = getContextGatingConfig();

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
      const usage = extractUsage(completion.usage);
      await supabase.from("chat_logs").insert({ question, answer });
      logLlmTelemetry("chat_response", {
        route: "/api/chat",
        mode: "flight_query",
        model: "gpt-4o-mini",
        success: true,
        duration_ms: Date.now() - startedAt,
        ...usage,
        context: {
          question_length: question.length,
          flight_rows: result.flights.length,
          delayed: result.summary.delayed,
          cancelled: result.summary.cancelled,
          latest_fetch: result.summary.latest_fetch,
          source: result.source,
        },
      });
      return Response.json({ ok: true, answer, mode: "flight_query", summary: result.summary });
    }

    const snapshotSelect =
      "source_id, source_name, source_url, fetched_at, published_at, title, summary, status_level, reliability, validation_state, freshness_target_minutes, priority";
    const legacySnapshotSelect = "source_id, source_name, source_url, fetched_at, published_at, title, summary, status_level, reliability, freshness_target_minutes, priority";
    let { data, error } = await supabase.from("latest_source_snapshots").select(snapshotSelect).limit(80);
    if (error && /validation_state|content_hash|validated_at/i.test(error.message ?? "")) {
      const legacy = await supabase.from("latest_source_snapshots").select(legacySnapshotSelect).limit(80);
      data = (legacy.data ?? []).map((row) => ({ ...row, validation_state: "unvalidated" }));
      error = legacy.error;
    }
    if (error) throw error;

    const socialSelect =
      "linked_source_id,handle,posted_at,url,text_original,text_en,language_original,translation_status,text,confidence,validation_state";
    const legacySocialSelect = "linked_source_id,handle,posted_at,url,text_original,text_en,language_original,translation_status,text,confidence";
    let { data: socialData, error: socialError } = await supabase
      .from("social_signals")
      .select(socialSelect)
      .eq("provider", "x")
      .order("posted_at", { ascending: false })
      .limit(60);
    if (socialError && /validation_state/i.test(socialError.message ?? "")) {
      const legacy = await supabase.from("social_signals").select(legacySocialSelect).eq("provider", "x").order("posted_at", { ascending: false }).limit(60);
      socialData = (legacy.data ?? []).map((row) => ({ ...row, validation_state: "unvalidated" }));
      socialError = legacy.error;
    }
    if (socialError) throw socialError;

    const latestSocialBySource = new Map<string, SocialContextRow>();
    for (const row of ((socialData ?? []) as SocialContextRow[])) {
      if (!latestSocialBySource.has(row.linked_source_id)) latestSocialBySource.set(row.linked_source_id, row);
    }

    const snapshotGate = gateSnapshotContext(
      ((data ?? []) as Array<{
        source_id: string;
        source_name: string;
        source_url: string;
        fetched_at: string;
        published_at: string | null;
        title: string | null;
        summary: string | null;
        status_level: string;
        reliability: string;
        validation_state: string;
        freshness_target_minutes: number | null;
        priority: number | null;
      }>).map((row) => ({
        source_id: row.source_id,
        source_name: row.source_name,
        title: row.title ?? "",
        summary: row.summary ?? "",
        reliability: row.reliability === "blocked" || row.reliability === "degraded" || row.reliability === "reliable" ? row.reliability : "degraded",
        fetched_at: row.fetched_at,
        freshness_target_minutes: Number(row.freshness_target_minutes ?? 15) || 15,
        validation_state:
          row.validation_state === "validated" || row.validation_state === "unvalidated" || row.validation_state === "failed" || row.validation_state === "skipped"
            ? row.validation_state
            : "unvalidated",
        priority: Number(row.priority ?? 0) || 0,
      })),
      {
        maxAgeMinutes: gating.source_max_age_minutes,
        minFreshMinutes: gating.source_min_fresh_minutes,
        freshnessMultiplier: gating.source_freshness_multiplier,
        maxRows: gating.source_max_rows,
      },
    );

    const snapshotRows = (data ?? []) as Array<{
      source_id: string;
      source_name: string;
      source_url: string;
      fetched_at: string;
      published_at: string | null;
      title: string | null;
      summary: string | null;
      status_level: string;
    }>;
    const snapshotById = new Map(snapshotRows.map((row) => [row.source_id, row]));
    const selectedSnapshots = snapshotGate.selected
      .map((row) => snapshotById.get(row.source_id))
      .filter((row): row is (typeof snapshotRows)[number] => Boolean(row));

    const context = selectedSnapshots
      .map(
        (d) =>
          `[${d.source_name}] status=${d.status_level} fetched=${d.fetched_at} published=${d.published_at ?? "n/a"}\nTitle: ${d.title}\nSummary: ${d.summary}\nURL: ${d.source_url}`
      )
      .join("\n\n");

    const socialGate = gateSocialContext(Array.from(latestSocialBySource.values()), {
      maxAgeMinutes: gating.social_max_age_minutes,
      maxRows: gating.social_max_rows,
    });

    const socialContext = socialGate.selected
      .map((s) => {
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
        {
          role: "user",
          content: `Question: ${question}\n\nOfficial source context:\n${context || "No usable official source context is currently available."}\n\nOfficial X context:\n${socialContext || "No official X posts available."}`,
        },
      ],
    });

    const answer = completion.choices[0]?.message?.content ?? "No answer";
    const usage = extractUsage(completion.usage);

    await supabase.from("chat_logs").insert({ question, answer });
    logLlmTelemetry("chat_response", {
      route: "/api/chat",
      mode: "official_sources",
      model: "gpt-4o-mini",
      success: true,
      duration_ms: Date.now() - startedAt,
      ...usage,
      fallback_reason: snapshotGate.summary.selected === 0 ? "no_usable_snapshot_context" : null,
      context: {
        question_length: question.length,
        source_context_rows: selectedSnapshots.length,
        source_policy: snapshotGate.summary.policy,
        source_total: snapshotGate.summary.total,
        source_usable: snapshotGate.summary.usable,
        source_fresh: snapshotGate.summary.fresh,
        source_validated_or_skipped: snapshotGate.summary.validated_or_skipped,
        source_unvalidated: snapshotGate.summary.unvalidated,
        source_failed: snapshotGate.summary.failed,
        social_context_rows: socialGate.summary.selected,
        social_policy: socialGate.summary.policy,
        social_total: socialGate.summary.total,
        social_fresh: socialGate.summary.fresh,
      },
    });

    return Response.json({ ok: true, answer });
  } catch (error) {
    logLlmTelemetry("chat_response", {
      route: "/api/chat",
      success: false,
      duration_ms: Date.now() - startedAt,
      error: String(error),
    });
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
