import { getSupabaseAdmin } from "./supabase.ts";
import {
  normalizeUnifiedUpdateRow,
  sortUnifiedUpdates,
} from "./unified-updates-types.ts";
import type {
  UnifiedUpdateItem,
  UnifiedUpdateRow,
} from "./unified-updates-types.ts";

type LoadSourceHistoryOptions = {
  limit?: number;
  before?: string | null;
};

const SELECT_COLUMNS =
  "id,source_id,source_name,update_type,event_at,fetched_at,headline,summary,original_url,validation_state,validation_score,confirmation_state,evidence_basis,status_level,reliability,priority";

function clampLimit(limit?: number): number {
  if (!Number.isFinite(limit) || !limit) return 40;
  return Math.max(1, Math.min(200, Math.round(limit)));
}

export function deduplicateFeedItems(items: UnifiedUpdateItem[]): UnifiedUpdateItem[] {
  const seen = new Set<string>();
  const out: UnifiedUpdateItem[] = [];
  for (const item of items) {
    const key = `${item.source_id}:${item.summary.trim().toLowerCase().slice(0, 200)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export async function loadUnifiedFeed(limit?: number): Promise<UnifiedUpdateItem[]> {
  const pageSize = clampLimit(limit);
  const supabase = getSupabaseAdmin();
  const fetchSize = Math.max(pageSize * 4, pageSize);

  const { data, error } = await supabase.from("unified_updates").select(SELECT_COLUMNS).order("event_at", { ascending: false }).limit(fetchSize);
  if (error) throw error;

  const mapped = ((data ?? []) as UnifiedUpdateRow[]).map(normalizeUnifiedUpdateRow);
  return sortUnifiedUpdates(mapped).slice(0, pageSize);
}

export async function loadUnifiedSourceHistory(
  sourceId: string,
  opts?: LoadSourceHistoryOptions,
): Promise<{ items: UnifiedUpdateItem[]; next_before: string | null }> {
  const pageSize = clampLimit(opts?.limit);
  const supabase = getSupabaseAdmin();

  let query = supabase.from("unified_updates").select(SELECT_COLUMNS).eq("source_id", sourceId).order("event_at", { ascending: false }).limit(pageSize + 20);
  if (opts?.before) {
    query = query.lt("event_at", opts.before);
  }

  const { data, error } = await query;
  if (error) throw error;

  const sorted = sortUnifiedUpdates(((data ?? []) as UnifiedUpdateRow[]).map(normalizeUnifiedUpdateRow));
  const items = sorted.slice(0, pageSize);
  const next_before = sorted.length > pageSize ? items[items.length - 1]?.event_at ?? null : null;

  return { items, next_before };
}
