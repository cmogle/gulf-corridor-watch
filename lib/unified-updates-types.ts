export type UnifiedUpdateType = "snapshot" | "x" | "news";
export type UnifiedValidationState = "validated" | "unvalidated" | "failed" | "skipped";

export type UnifiedUpdateItem = {
  id: string;
  source_id: string;
  source_name: string;
  update_type: UnifiedUpdateType;
  event_at: string;
  fetched_at: string;
  headline: string;
  summary: string;
  original_url: string;
  validation_state: UnifiedValidationState;
  validation_score: number | null;
  confirmation_state: "confirmed" | "unconfirmed_social";
  evidence_basis: "api" | "official_web" | "rss" | "relay" | "x+official";
  status_level: "normal" | "advisory" | "disrupted" | "unknown";
  reliability: "reliable" | "degraded" | "blocked";
  priority: number;
};

export type UnifiedUpdateRow = Omit<UnifiedUpdateItem, "priority"> & {
  priority: number | null;
};

const VALIDATION_RANK: Record<UnifiedValidationState, number> = {
  validated: 3,
  unvalidated: 2,
  skipped: 1,
  failed: 0,
};

function toMillis(value: string): number {
  const millis = new Date(value).getTime();
  return Number.isFinite(millis) ? millis : 0;
}

export function compareUnifiedUpdates(a: UnifiedUpdateItem, b: UnifiedUpdateItem): number {
  const eventDiff = toMillis(b.event_at) - toMillis(a.event_at);
  if (eventDiff !== 0) return eventDiff;

  const validationDiff = (VALIDATION_RANK[b.validation_state] ?? 0) - (VALIDATION_RANK[a.validation_state] ?? 0);
  if (validationDiff !== 0) return validationDiff;

  if (b.priority !== a.priority) return b.priority - a.priority;

  const fetchedDiff = toMillis(b.fetched_at) - toMillis(a.fetched_at);
  if (fetchedDiff !== 0) return fetchedDiff;

  return a.source_name.localeCompare(b.source_name);
}

export function sortUnifiedUpdates(items: UnifiedUpdateItem[]): UnifiedUpdateItem[] {
  return [...items].sort(compareUnifiedUpdates);
}

export function normalizeUnifiedUpdateRow(row: UnifiedUpdateRow): UnifiedUpdateItem {
  return {
    ...row,
    priority: row.priority ?? 0,
    validation_state: row.validation_state ?? "unvalidated",
    validation_score: row.validation_score ?? null,
    summary: row.summary ?? "",
    headline: row.headline ?? "",
  };
}
