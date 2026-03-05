import { generateText, streamText, hasAnthropicKey, extractClaudeUsage } from "@/lib/anthropic";
import { flightsToContextRows, parseFlightIntent, runFlightQuery } from "@/lib/flight-query";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logLlmTelemetry } from "@/lib/llm-telemetry";
import { optionalAuth } from "@/lib/auth";
import {
  CHAT_SYSTEM_PROMPT,
  buildSituationContext,
  buildUserContext,
  buildRouteIntelligence,
  loadConversationHistory,
  createChatSession,
  storeChatMessage,
} from "@/lib/chat-context";

const CHAT_MODEL = "claude-sonnet-4-6";
const ANON_RATE_LIMIT = 5;
const ANON_COOKIE_NAME = "gcw_anon_chat_count";

function getAnonCount(req: Request): number {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`${ANON_COOKIE_NAME}=(\\d+)`));
  return match ? parseInt(match[1], 10) : 0;
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    const body = await req.json();
    const { question, session_id: requestedSessionId, stream: useStreaming } = body as {
      question?: string;
      session_id?: string;
      stream?: boolean;
    };

    if (!question) return Response.json({ ok: false, error: "Missing question" }, { status: 400 });

    if (!hasAnthropicKey()) {
      logLlmTelemetry("chat_response", {
        route: "/api/chat",
        success: false,
        duration_ms: Date.now() - startedAt,
        error: "Missing ANTHROPIC_API_KEY",
      });
      return Response.json({ ok: false, error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });
    }

    // Optional auth — get user if token present
    const user = await optionalAuth(req);
    const userId = user?.id ?? null;

    // Anonymous rate limiting
    if (!userId) {
      const anonCount = getAnonCount(req);
      if (anonCount >= ANON_RATE_LIMIT) {
        return Response.json(
          {
            ok: false,
            limit_reached: true,
            message: "You've reached the free message limit. Sign up for unlimited chat.",
            remaining: 0,
          },
          {
            status: 429,
            headers: { "Set-Cookie": `${ANON_COOKIE_NAME}=${anonCount}; Path=/; SameSite=Lax; Max-Age=86400` },
          },
        );
      }
    }

    // Track anonymous usage for rate limiting
    const anonCount = userId ? 0 : getAnonCount(req);
    const newAnonCount = anonCount + 1;
    const anonCookieHeader: Record<string, string> = !userId
      ? { "Set-Cookie": `${ANON_COOKIE_NAME}=${newAnonCount}; Path=/; SameSite=Lax; Max-Age=86400` }
      : {};
    const remaining = userId ? null : Math.max(0, ANON_RATE_LIMIT - newAnonCount);

    const supabase = getSupabaseAdmin();
    const flightIntent = parseFlightIntent(question);

    // Flight intent shortcut (stateless, fast path)
    if (flightIntent.type !== "unknown") {
      const [result, routeIntel, situationContext] = await Promise.all([
        runFlightQuery(question, { allowLive: false }),
        buildRouteIntelligence(flightIntent),
        buildSituationContext(),
      ]);
      const context = flightsToContextRows(result.flights).join("\n\n");

      const flightSystemPrompt = `${CHAT_SYSTEM_PROMPT}

You are also a flight operations specialist. For this query, you have flight-specific data and route intelligence below. Synthesize carrier status, suspension information, airspace status, and flight observations into a direct, comprehensive answer. Include alternatives if the primary carrier is suspended.`;

      const llmResult = await generateText({
        model: CHAT_MODEL,
        temperature: 0.1,
        system: flightSystemPrompt,
        userMessage: `${situationContext}

${routeIntel}

=== FLIGHT DATA ===
Summary: total=${result.summary.total}, delayed=${result.summary.delayed}, cancelled=${result.summary.cancelled}, latest_fetch=${result.summary.latest_fetch ?? "n/a"}
Insight: ${result.insight ? `${result.insight.headline} | ${result.insight.summary} | confidence=${result.insight.confidence} | score=${result.insight.score ?? "n/a"}` : "n/a"}

Flight data:
${context || "No matching flights found."}

Question: ${question}`,
      });

      const answer = llmResult.text || "No answer";
      const usage = extractClaudeUsage(llmResult);

      // Store in session if one exists
      if (requestedSessionId) {
        await storeChatMessage(requestedSessionId, "user", question);
        await storeChatMessage(requestedSessionId, "assistant", answer);
      }

      await supabase.from("chat_logs").insert({ question, answer });
      logLlmTelemetry("chat_response", {
        route: "/api/chat",
        mode: "flight_query",
        model: CHAT_MODEL,
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
          session_id: requestedSessionId,
          authenticated: !!userId,
        },
      });
      return Response.json(
        {
          ok: true,
          answer,
          mode: "flight_query",
          summary: result.summary,
          session_id: requestedSessionId,
          ...(remaining != null ? { remaining } : {}),
        },
        { headers: anonCookieHeader },
      );
    }

    // Multi-turn conversation path
    // 1. Session management
    let sessionId = requestedSessionId ?? null;
    if (!sessionId && userId) {
      // Create a new session for authenticated users
      sessionId = await createChatSession(userId);
    }

    // 2. Load conversation history
    const history = sessionId ? await loadConversationHistory(sessionId) : [];

    // 3. Build situation context
    const [situationContext, userContext] = await Promise.all([
      buildSituationContext(),
      buildUserContext(userId),
    ]);

    const fullContext = [situationContext, userContext].filter(Boolean).join("\n\n");

    // 4. Build message array for Claude
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

    // Add conversation history
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Add current question with situation context
    const userMessage = `${fullContext}

Question: ${question}`;
    messages.push({ role: "user", content: userMessage });

    // 5. Store user message
    if (sessionId) {
      await storeChatMessage(sessionId, "user", question);
    }

    // 6. Generate response (streaming or non-streaming)
    if (useStreaming) {
      const { stream, response: responsePromise } = streamText({
        model: CHAT_MODEL,
        temperature: 0.1,
        system: CHAT_SYSTEM_PROMPT,
        messages,
        maxTokens: 2048,
      });

      // Store the response async after streaming completes
      responsePromise.then(async (result) => {
        if (sessionId && result.text) {
          await storeChatMessage(sessionId, "assistant", result.text);
        }
        await supabase.from("chat_logs").insert({ question, answer: result.text });
        const usage = extractClaudeUsage(result);
        logLlmTelemetry("chat_response", {
          route: "/api/chat",
          mode: "multi_turn_stream",
          model: CHAT_MODEL,
          success: true,
          duration_ms: Date.now() - startedAt,
          ...usage,
          context: {
            question_length: question.length,
            history_messages: history.length,
            session_id: sessionId,
            authenticated: !!userId,
          },
        });
      }).catch(() => {});

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Session-Id": sessionId ?? "",
          ...(remaining != null ? { "X-Remaining": String(remaining) } : {}),
          ...anonCookieHeader,
        },
      });
    }

    // Non-streaming fallback
    const llmResult = await generateText({
      model: CHAT_MODEL,
      temperature: 0.1,
      maxTokens: 2048,
      system: CHAT_SYSTEM_PROMPT,
      userMessage: messages.map((m) => `${m.role}: ${m.content}`).join("\n\n"),
    });

    const answer = llmResult.text || "No answer";
    const usage = extractClaudeUsage(llmResult);

    // Store assistant response
    if (sessionId) {
      await storeChatMessage(sessionId, "assistant", answer);
    }

    await supabase.from("chat_logs").insert({ question, answer });
    logLlmTelemetry("chat_response", {
      route: "/api/chat",
      mode: "multi_turn",
      model: CHAT_MODEL,
      success: true,
      duration_ms: Date.now() - startedAt,
      ...usage,
      context: {
        question_length: question.length,
        history_messages: history.length,
        session_id: sessionId,
        authenticated: !!userId,
      },
    });

    return Response.json(
      {
        ok: true,
        answer,
        session_id: sessionId,
        ...(remaining != null ? { remaining } : {}),
      },
      { headers: anonCookieHeader },
    );
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
