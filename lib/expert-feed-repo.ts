import { getSupabaseAdmin } from "./supabase";
import type { ExpertSignal, ExpertDigest, ExpertFeedResponse } from "./expert-feed";

export async function loadKnownPostIds(handles: string[]): Promise<Set<string>> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("expert_signals")
    .select("handle, post_id")
    .in("handle", handles)
    .order("posted_at", { ascending: false })
    .limit(500);
  const ids = new Set<string>();
  for (const row of data ?? []) {
    ids.add(`${row.handle}:${row.post_id}`);
  }
  return ids;
}

export async function upsertExpertSignals(signals: ExpertSignal[]): Promise<{ inserted: number; error: string | null }> {
  if (signals.length === 0) return { inserted: 0, error: null };
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("expert_signals")
    .upsert(signals, { onConflict: "handle,post_id", ignoreDuplicates: true });
  if (error) return { inserted: 0, error: error.message };
  return { inserted: signals.length, error: null };
}

export async function countUndigestedSignals(): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from("expert_signals")
    .select("*", { count: "exact", head: true })
    .eq("included_in_digest", false)
    .gte("relevance_score", 0.4);
  return count ?? 0;
}

export async function getUndigestedSignals(): Promise<ExpertSignal[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("expert_signals")
    .select("*")
    .eq("included_in_digest", false)
    .gte("relevance_score", 0.4)
    .order("posted_at", { ascending: false })
    .limit(20);
  return (data ?? []) as ExpertSignal[];
}

export async function markSignalsDigested(signalIds: string[]): Promise<void> {
  if (signalIds.length === 0) return;
  const supabase = getSupabaseAdmin();
  await supabase
    .from("expert_signals")
    .update({ included_in_digest: true })
    .in("id", signalIds);
}

export async function insertDigest(digest: { digest_text: string; signal_ids: string[]; signal_count: number }): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("expert_digests")
    .insert(digest)
    .select("id")
    .single();
  if (error) return null;
  return data?.id ?? null;
}

export async function loadExpertFeed(): Promise<ExpertFeedResponse> {
  const supabase = getSupabaseAdmin();

  // Latest digest
  const { data: digestRows } = await supabase
    .from("expert_digests")
    .select("*")
    .order("generated_at", { ascending: false })
    .limit(1);
  const latestDigest = digestRows?.[0] ?? null;

  // Recent signals (last 24h, relevance >= 0.4)
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { data: signalRows } = await supabase
    .from("expert_signals")
    .select("*")
    .gte("relevance_score", 0.4)
    .gte("posted_at", cutoff)
    .order("posted_at", { ascending: false })
    .limit(50);

  const signals = (signalRows ?? []) as ExpertSignal[];

  // Last poll time
  const { data: lastPollRow } = await supabase
    .from("expert_signals")
    .select("fetched_at")
    .order("fetched_at", { ascending: false })
    .limit(1);

  return {
    ok: true,
    digest: latestDigest
      ? {
          id: latestDigest.id,
          digest_text: latestDigest.digest_text,
          signal_ids: latestDigest.signal_ids ?? [],
          signal_count: latestDigest.signal_count ?? 0,
          generated_at: latestDigest.generated_at,
        }
      : null,
    signals,
    meta: {
      total_accounts: 28,
      active_signals_24h: signals.length,
      last_poll: lastPollRow?.[0]?.fetched_at ?? null,
    },
  };
}
