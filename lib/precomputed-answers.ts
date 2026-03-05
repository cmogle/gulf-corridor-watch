/**
 * Precomputed answer system for common chat intents.
 *
 * During the brief refresh cycle, answers for the top ~8 intents are generated
 * using the current situation context and stored in the `precomputed_answers` table.
 * At chat time, questions are classified by a zero-cost regex intent classifier.
 * If a match is found and the context_hash matches the current brief, the cached
 * answer is returned instantly (~0 tokens, <50ms).
 */

import { getSupabaseAdmin } from "./supabase";
import { generateText, hasAnthropicKey, extractClaudeUsage, type SystemBlock } from "./anthropic";
import { logLlmTelemetry } from "./llm-telemetry";
import { CHAT_SYSTEM_PROMPT } from "./chat-context";

export type ChatIntent =
  | "situation_summary"
  | "flight_safety"
  | "overnight_sitrep"
  | "airspace_status"
  | "attack_status"
  | "what_to_do"
  | "airline_status"
  | "general_status";

/** Rule-based intent classifier. Returns null for novel/unmatched questions. */
export function classifyIntent(question: string): ChatIntent | null {
  const q = question.toLowerCase().trim();

  // Situation summary — broadest catch, check last
  const situationRe = /\b(what.{0,15}(happen|going on|situation|update|status|news|latest)|brief me|sitrep|sit.?rep|catch me up|fill me in|any.{0,8}(new|change|develop|update))/i;
  const flightSafetyRe = /\b(safe.{0,8}(fly|travel|go)|should i (fly|travel|go|book)|risk.{0,8}(fly|travel)|danger.{0,8}(fly|travel)|ok to fly|okay to fly)/i;
  const overnightRe = /\b(overnight|last night|while.{0,8}(slept|sleep|asleep)|this morning|morning update|since.{0,8}(yesterday|last))/i;
  const airspaceRe = /\b(airspace.{0,8}(open|close|restrict|status|clear)|notam|air.?traffic.{0,8}(control|restrict)|tfr\b|no.?fly)/i;
  const attackRe = /\b(attack|missile|drone|strike|bomb|intercept|shot down|hit\b|impact|breach|air.?defense|get through|penetrat)/i;
  const whatToDoRe = /\b(what should.{0,8}(i|we) do|should i (cancel|rebook|wait|stay|leave)|advice|recommend|suggest|prepare|precaution)/i;
  const airlineRe = /\b(emirates|etihad|flydubai|air arabia|qatar airways|oman air).{0,15}(operat|fly|running|status|cancel|suspend)/i;
  const generalStatusRe = /\b(how.{0,8}(things|it|everything)|give me.{0,8}(rundown|summary|overview)|what.{0,12}know.{0,8}(so far|right now|now)|tell me.{0,8}(what.{0,8}(happen|going|know)))/i;

  // Order matters: more specific intents first
  if (attackRe.test(q)) return "attack_status";
  if (airspaceRe.test(q)) return "airspace_status";
  if (overnightRe.test(q)) return "overnight_sitrep";
  if (flightSafetyRe.test(q)) return "flight_safety";
  if (whatToDoRe.test(q)) return "what_to_do";
  if (airlineRe.test(q)) return "airline_status";
  if (situationRe.test(q)) return "situation_summary";
  if (generalStatusRe.test(q)) return "general_status";

  return null;
}

/** The prompts used to pre-generate answers for each intent. */
const INTENT_QUESTIONS: Record<ChatIntent, string> = {
  situation_summary: "What's the current situation? Give me a comprehensive overview.",
  flight_safety: "Is it safe to fly to/from the UAE right now?",
  overnight_sitrep: "What happened overnight? Any significant developments?",
  airspace_status: "What's the current status of UAE airspace? Any restrictions?",
  attack_status: "Have there been any recent attacks or military activity in the region?",
  what_to_do: "What should I do right now as a traveler in/to the UAE?",
  airline_status: "Are major UAE airlines (Emirates, Etihad, flydubai) operating normally?",
  general_status: "Give me a quick rundown of the current situation for UAE travelers.",
};

/**
 * Look up a precomputed answer for a classified intent.
 * Returns null if no match or context is stale.
 */
export async function lookupPrecomputedAnswer(
  intent: ChatIntent,
  currentContextHash: string,
): Promise<{ answer: string; intent: ChatIntent } | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("precomputed_answers")
      .select("answer, context_hash")
      .eq("intent", intent)
      .single();

    if (error || !data) return null;
    // Only return if the context hash matches — ensures answer is current
    if (data.context_hash !== currentContextHash) return null;

    return { answer: data.answer, intent };
  } catch {
    return null;
  }
}

/**
 * Generate and store precomputed answers for all known intents.
 * Called during the brief refresh cycle when the brief is regenerated.
 */
export async function refreshPrecomputedAnswers(
  situationContext: string,
  contextHash: string,
): Promise<{ generated: number; skipped: number; errors: number }> {
  if (!hasAnthropicKey()) return { generated: 0, skipped: 0, errors: 0 };

  const startedAt = Date.now();
  const supabase = getSupabaseAdmin();
  const intents = Object.keys(INTENT_QUESTIONS) as ChatIntent[];

  // Check if existing answers already match this context hash
  const { data: existing } = await supabase
    .from("precomputed_answers")
    .select("intent, context_hash")
    .in("intent", intents);

  const existingByIntent = new Map((existing ?? []).map((r) => [r.intent, r.context_hash]));
  const toGenerate = intents.filter((i) => existingByIntent.get(i) !== contextHash);

  if (toGenerate.length === 0) {
    return { generated: 0, skipped: intents.length, errors: 0 };
  }

  let generated = 0;
  let errors = 0;

  // Generate answers in parallel batches of 4 to stay within rate limits
  for (let i = 0; i < toGenerate.length; i += 4) {
    const batch = toGenerate.slice(i, i + 4);
    const results = await Promise.allSettled(
      batch.map(async (intent) => {
        const question = INTENT_QUESTIONS[intent];
        // System blocks: prompt + context combined exceeds 1024-token caching minimum
        const systemBlocks: SystemBlock[] = [
          { type: "text", text: CHAT_SYSTEM_PROMPT },
          { type: "text", text: situationContext, cache_control: { type: "ephemeral" } },
        ];
        const result = await generateText({
          model: "claude-sonnet-4-6",
          temperature: 0.1,
          maxTokens: 1024,
          timeoutMs: 15_000,
          system: systemBlocks,
          userMessage: `Question: ${question}`,
        });

        const usage = extractClaudeUsage(result);
        const totalTokens = (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);

        await supabase.from("precomputed_answers").upsert(
          {
            intent,
            answer: result.text,
            context_hash: contextHash,
            generated_at: new Date().toISOString(),
            tokens_used: totalTokens || null,
            model: "claude-sonnet-4-6",
          },
          { onConflict: "intent" },
        );

        return { intent, tokens: totalTokens };
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled") {
        generated++;
      } else {
        errors++;
      }
    }
  }

  logLlmTelemetry("precomputed_answers_refresh", {
    route: "/api/brief/refresh",
    mode: "precomputed_answers",
    model: "claude-sonnet-4-6",
    success: errors === 0,
    duration_ms: Date.now() - startedAt,
    context: {
      generated,
      skipped: intents.length - toGenerate.length,
      errors,
      total_intents: intents.length,
    },
  });

  return { generated, skipped: intents.length - toGenerate.length, errors };
}
