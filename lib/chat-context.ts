/**
 * Chat context assembly (T-016)
 *
 * Gathers situation-grounded context for chat conversations:
 * - Current intelligence brief (executive summary + sections)
 * - Relevant source snapshots
 * - Flight data for route-specific queries
 * - User profile context (tracked routes, home airport)
 */

import { getSupabaseAdmin } from "./supabase";
import { gateSnapshotContext, gateSocialContext, getContextGatingConfig, type SocialContextRow } from "./context-gating";
import { loadCurrentStateBrief } from "./current-state-brief";
import type { FlightIntent } from "./flight-query";

const MAX_HISTORY_MESSAGES = 20;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatContextResult = {
  system_prompt: string;
  situation_context: string;
  history: ChatMessage[];
  session_id: string | null;
};

/**
 * Load conversation history from chat_messages for a session.
 * Keeps the most recent MAX_HISTORY_MESSAGES messages.
 */
export async function loadConversationHistory(sessionId: string): Promise<ChatMessage[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("role,content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(MAX_HISTORY_MESSAGES + 10); // fetch slightly more for truncation window

  if (error || !data) return [];

  const messages = (data as Array<{ role: string; content: string }>)
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  // Keep last MAX_HISTORY_MESSAGES
  if (messages.length > MAX_HISTORY_MESSAGES) {
    return messages.slice(messages.length - MAX_HISTORY_MESSAGES);
  }
  return messages;
}

/**
 * Create a new chat session (optionally tied to a user).
 */
export async function createChatSession(userId: string | null): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({ user_id: userId, title: null })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Failed to create chat session: ${error?.message}`);
  return data.id;
}

/**
 * Store a message in the conversation.
 */
export async function storeChatMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("chat_messages")
    .insert({ session_id: sessionId, role, content });
  if (error) {
    // Non-critical: don't throw, just log
    console.error("Failed to store chat message:", error.message);
  }

  // Update last_message_at on the session
  await supabase
    .from("chat_sessions")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", sessionId);
}

/**
 * Build the situation context block injected into every chat turn.
 * Includes: current brief, source snapshots, social signals.
 */
export async function buildSituationContext(): Promise<string> {
  const parts: string[] = [];
  const supabase = getSupabaseAdmin();
  const gating = getContextGatingConfig();

  // Run all context queries in parallel
  const [briefResult, snapshotResult, socialResult, scheduleResult] = await Promise.allSettled([
    // 1. Current intelligence brief
    loadCurrentStateBrief({ allowTransient: true }),

    // 2. Source snapshots
    supabase
      .from("latest_source_snapshots")
      .select("source_id,source_name,source_url,fetched_at,published_at,title,summary,status_level,reliability,freshness_target_minutes,priority")
      .limit(80),

    // 3. Social signals
    supabase
      .from("social_signals")
      .select("linked_source_id,handle,posted_at,url,text_en,text_original,translation_status,language_original")
      .eq("provider", "x")
      .order("posted_at", { ascending: false })
      .limit(30),

    // 4. Airport schedule stats
    supabase
      .from("flight_schedule_stats")
      .select("*"),
  ]);

  // Process brief
  if (briefResult.status === "fulfilled" && briefResult.value) {
    const brief = briefResult.value;
    parts.push("=== CURRENT INTELLIGENCE BRIEF ===");
    parts.push(`Executive Summary: ${brief.paragraph}`);
    parts.push(`Confidence: ${brief.confidence} | Freshness: ${brief.freshness_state}`);
    const flightParts = [`${brief.flight.total} tracked`];
    if (brief.flight.delayed > 0) flightParts.push(`${brief.flight.delayed} delayed`);
    if (brief.flight.cancelled > 0) flightParts.push(`${brief.flight.cancelled} cancelled`);
    parts.push(`Flights: ${flightParts.join(", ")}`);
    if (brief.sections) {
      if (brief.sections.security) parts.push(`Security: ${brief.sections.security}`);
      if (brief.sections.flights) parts.push(`Airspace & Flights: ${brief.sections.flights}`);
      if (brief.sections.guidance) parts.push(`Guidance: ${brief.sections.guidance}`);
    }
    parts.push(`Last updated: ${brief.refreshed_at}`);
  }

  // Process snapshots
  if (snapshotResult.status === "fulfilled" && snapshotResult.value.data) {
    const data = snapshotResult.value.data;
    if (data.length > 0) {
      const gated = gateSnapshotContext(
        data.map((row: Record<string, unknown>) => ({
          source_id: String(row.source_id ?? ""),
          source_name: String(row.source_name ?? ""),
          title: String(row.title ?? ""),
          summary: String(row.summary ?? ""),
          reliability: ["reliable", "degraded", "blocked"].includes(String(row.reliability)) ? String(row.reliability) as "reliable" | "degraded" | "blocked" : "degraded",
          fetched_at: String(row.fetched_at ?? ""),
          freshness_target_minutes: Number(row.freshness_target_minutes ?? 15) || 15,
          validation_state: "unvalidated" as const,
          priority: Number(row.priority ?? 0) || 0,
        })),
        {
          maxAgeMinutes: gating.source_max_age_minutes,
          minFreshMinutes: gating.source_min_fresh_minutes,
          freshnessMultiplier: gating.source_freshness_multiplier,
          maxRows: gating.source_max_rows,
        },
      );

      if (gated.selected.length > 0) {
        parts.push("\n=== SOURCE SNAPSHOTS ===");
        const snapshotById = new Map(data.map((row: Record<string, unknown>) => [String(row.source_id), row]));
        for (const selected of gated.selected.slice(0, 20)) {
          const row = snapshotById.get(selected.source_id);
          if (!row) continue;
          parts.push(
            `[${row.source_name}] status=${row.status_level} fetched=${row.fetched_at}\n  Title: ${row.title}\n  Summary: ${String(row.summary ?? "").slice(0, 200)}\n  URL: ${row.source_url}`,
          );
        }
      }
    }
  }

  // Process social signals
  if (socialResult.status === "fulfilled" && socialResult.value.data) {
    const socialData = socialResult.value.data;
    if (socialData.length > 0) {
      const typedSocial: SocialContextRow[] = socialData.map((row: Record<string, unknown>) => ({
        linked_source_id: String(row.linked_source_id ?? ""),
        handle: String(row.handle ?? ""),
        posted_at: String(row.posted_at ?? ""),
        text_en: row.text_en != null ? String(row.text_en) : null,
        text_original: row.text_original != null ? String(row.text_original) : null,
        url: row.url != null ? String(row.url) : null,
        language_original: row.language_original != null ? String(row.language_original) : null,
      }));

      const socialGate = gateSocialContext(typedSocial, {
        maxAgeMinutes: gating.social_max_age_minutes,
        maxRows: gating.social_max_rows,
      });

      if (socialGate.selected.length > 0) {
        parts.push("\n=== SOCIAL SIGNALS (X) ===");
        for (const s of socialGate.selected.slice(0, 10)) {
          const display = s.text_en ?? s.text_original ?? "";
          parts.push(`[X @${s.handle}] posted=${s.posted_at}\n  ${display.slice(0, 200)}`);
        }
      }
    }
  }

  // Process schedule stats
  if (scheduleResult.status === "fulfilled" && scheduleResult.value.data) {
    const scheduleStats = scheduleResult.value.data;
    if (scheduleStats.length > 0) {
      parts.push("\n=== AIRPORT DEPARTURE BOARD STATS ===");
      for (const row of scheduleStats as Array<Record<string, unknown>>) {
        const airport = row.airport;
        const boardType = row.board_type;
        const total = Number(row.total ?? 0);
        const delayed = Number(row.delayed ?? 0);
        const cancelled = Number(row.cancelled ?? 0);
        const avgDelay = row.avg_delay_minutes != null ? Math.round(Number(row.avg_delay_minutes)) : null;
        const statParts = [`${total} flights`];
        if (delayed > 0) statParts.push(`${delayed} delayed`);
        if (cancelled > 0) statParts.push(`${cancelled} cancelled`);
        if (avgDelay) statParts.push(`avg delay ${avgDelay}min`);
        parts.push(`[${airport} ${boardType}s] ${statParts.join(", ")}`);
      }
    }
  }

  return parts.join("\n");
}

/**
 * Build user profile context if authenticated.
 */
export async function buildUserContext(userId: string | null): Promise<string> {
  if (!userId) return "";

  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("user_profiles")
      .select("home_airport,tracked_routes,tracked_flights,detail_preference")
      .eq("id", userId)
      .single();

    if (!data) return "";

    const parts: string[] = ["=== USER PROFILE ==="];
    if (data.home_airport) parts.push(`Home airport: ${data.home_airport}`);
    if (data.detail_preference) parts.push(`Detail preference: ${data.detail_preference}`);
    const routes = data.tracked_routes as Array<{ origin: string; destination: string }> | null;
    const flights = data.tracked_flights as string[] | null;
    if (routes && routes.length > 0) {
      parts.push(`Tracked routes (user's "my routes"):`);
      for (const r of routes) {
        parts.push(`  - ${r.origin} → ${r.destination}`);
      }
    }
    if (flights && flights.length > 0) {
      parts.push(`Tracked flights (user's "my flights"): ${flights.join(", ")}`);
    }
    return parts.join("\n");
  } catch {
    return "";
  }
}

/** Known carriers for common UAE routes */
const ROUTE_CARRIERS: Record<string, Array<{ airline: string; iata: string; flightPattern: string }>> = {
  "DUB-DXB": [
    { airline: "Emirates", iata: "EK", flightPattern: "EK16" },
    { airline: "flydubai", iata: "FZ", flightPattern: "FZ4" },
  ],
  "LHR-DXB": [
    { airline: "Emirates", iata: "EK", flightPattern: "EK" },
    { airline: "British Airways", iata: "BA", flightPattern: "BA10" },
  ],
  "DEL-DXB": [
    { airline: "Emirates", iata: "EK", flightPattern: "EK51" },
    { airline: "flydubai", iata: "FZ", flightPattern: "FZ43" },
    { airline: "Air India", iata: "AI", flightPattern: "AI99" },
  ],
  "BOM-DXB": [
    { airline: "Emirates", iata: "EK", flightPattern: "EK50" },
    { airline: "flydubai", iata: "FZ", flightPattern: "FZ44" },
  ],
  "DOH-DXB": [
    { airline: "Qatar Airways", iata: "QR", flightPattern: "QR10" },
  ],
  "LHR-AUH": [
    { airline: "Etihad", iata: "EY", flightPattern: "EY1" },
  ],
  "JFK-DXB": [
    { airline: "Emirates", iata: "EK", flightPattern: "EK20" },
  ],
};

/**
 * Build route-specific intelligence context for flight queries.
 * Returns carrier identification, suspension status, and flight observations.
 */
export async function buildRouteIntelligence(intent: FlightIntent): Promise<string> {
  if (intent.type === "unknown") return "";

  const parts: string[] = ["=== ROUTE INTELLIGENCE ==="];

  if (intent.type === "flight_number") {
    parts.push(`Query: Flight ${intent.flightNumber}`);
  } else {
    parts.push(`Route: ${intent.originLabel} (${intent.originCodes.join("/")}) → ${intent.destinationLabel} (${intent.destinationCodes.join("/")})`);

    // Carrier identification
    for (const origin of intent.originCodes) {
      for (const dest of intent.destinationCodes) {
        const key = `${origin}-${dest}`;
        const reverseKey = `${dest}-${origin}`;
        const carriers = ROUTE_CARRIERS[key] ?? ROUTE_CARRIERS[reverseKey];
        if (carriers) {
          parts.push(`Known carriers: ${carriers.map((c) => `${c.airline} (${c.iata})`).join(", ")}`);
        }
      }
    }
  }

  const supabase = getSupabaseAdmin();

  // Check airline suspension status from source snapshots
  try {
    const airlineSources = [
      "emirates_updates", "etihad_advisory", "flydubai_updates",
      "air_arabia_updates", "qatar_airways_updates", "oman_air",
    ];
    const { data: airlineSnapshots } = await supabase
      .from("latest_source_snapshots")
      .select("source_id,source_name,title,summary,status_level,fetched_at")
      .in("source_id", airlineSources);

    if (airlineSnapshots && airlineSnapshots.length > 0) {
      parts.push("\nAirline status:");
      for (const snap of airlineSnapshots) {
        const statusTag = snap.status_level === "normal" ? "OPERATING" :
          snap.status_level === "advisory" ? "ADVISORY" : "DISRUPTED";
        parts.push(`  [${snap.source_name}] ${statusTag}: ${String(snap.title ?? "").slice(0, 120)} (fetched: ${snap.fetched_at})`);
      }
    }
  } catch {
    // Non-critical
  }

  // Check recent flight observations for this route
  try {
    const cutoff = new Date(Date.now() - 12 * 60 * 60_000).toISOString();
    let flightQuery = supabase
      .from("flight_observations")
      .select("flight_number,origin_iata,destination_iata,status,is_delayed,delay_minutes,scheduled_time,fetched_at")
      .gte("fetched_at", cutoff)
      .order("fetched_at", { ascending: false })
      .limit(20);

    if (intent.type === "flight_number") {
      flightQuery = flightQuery.eq("flight_number", intent.flightNumber);
    } else {
      flightQuery = flightQuery.in("origin_iata", intent.originCodes).in("destination_iata", intent.destinationCodes);
    }

    const { data: flightData } = await flightQuery;

    if (flightData && flightData.length > 0) {
      const delayed = flightData.filter((f) => f.is_delayed).length;
      const cancelled = flightData.filter((f) => /cancel/i.test(f.status)).length;
      const fParts = [`${flightData.length} observed`];
      if (delayed > 0) fParts.push(`${delayed} delayed`);
      if (cancelled > 0) fParts.push(`${cancelled} cancelled`);
      parts.push(`\nRecent flights: ${fParts.join(", ")}`);
      for (const f of flightData.slice(0, 8)) {
        parts.push(`  [${f.flight_number}] ${f.origin_iata}→${f.destination_iata} status=${f.status} delayed=${f.is_delayed ? "yes" : "no"} delay=${f.delay_minutes ?? "n/a"}min sched=${f.scheduled_time ?? "n/a"}`);
      }
    } else {
      parts.push("\nNo recent flight observations for this route in the last 12 hours.");
    }
  } catch {
    // Non-critical
  }

  // Check airspace status from GCAA
  try {
    const { data: gcaa } = await supabase
      .from("latest_source_snapshots")
      .select("title,summary,status_level,fetched_at")
      .eq("source_id", "gcaa_uae")
      .single();

    if (gcaa) {
      const statusTag = gcaa.status_level === "normal" ? "OPEN" : "RESTRICTED/DISRUPTED";
      parts.push(`\nUAE airspace (GCAA): ${statusTag} — ${String(gcaa.title ?? "").slice(0, 120)} (fetched: ${gcaa.fetched_at})`);
    }
  } catch {
    // Non-critical
  }

  return parts.join("\n");
}

export const CHAT_SYSTEM_PROMPT = `You are a situational intelligence assistant for UAE residents and travelers during a period of regional instability.

STYLE:
- Lead with the direct answer. No preamble, no "Based on the information available..."
- If the answer is "No" or "Yes", say that first, then explain
- Use specific data: airline names, flight numbers, timestamps, source names
- Cite sources inline: (source: Emirates Travel Updates, fetched 10:30 GST)
- Be honest about uncertainty: "I don't have data on that" is better than hedging

RULES:
- Only cite sources from the provided situation context
- Never invent flight numbers, statistics, or source data
- Acknowledge when data is stale or incomplete
- For route-specific questions, include: carrier identification, suspension status, and alternatives
- For safety questions, prioritize official government advisories
- Use Markdown formatting for readability

USER CONTEXT:
- If user profile data is provided, use it to personalize responses
- When the user asks about "my route" or "my flights", resolve from their tracked routes/flights in the profile
- Respect the user's detail preference: "concise" = bullet points, "standard" = 2-3 paragraphs, "comprehensive" = detailed analysis
- If the user has a home airport, prioritize departures/arrivals from that airport

IMPORTANT: You have access to real-time source data injected before each response. Always check this data before answering.`;
