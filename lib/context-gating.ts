import { isUsableSnapshot } from "./source-quality";

export type ValidationState = "validated" | "unvalidated" | "failed" | "skipped";

export type SnapshotContextRow = {
  source_id: string;
  source_name?: string;
  title: string;
  summary: string;
  reliability: "reliable" | "degraded" | "blocked";
  fetched_at: string;
  freshness_target_minutes: number;
  validation_state: ValidationState;
  priority?: number;
};

export type SocialContextRow = {
  linked_source_id: string;
  handle: string;
  posted_at: string;
  text_original?: string | null;
  text_en?: string | null;
  text?: string | null;
  language_original?: string | null;
  url?: string | null;
  translation_status?: "not_needed" | "translated" | "failed";
  confidence?: number | null;
  validation_state?: ValidationState;
};

export type ContextGateSummary = {
  total: number;
  usable: number;
  fresh: number;
  selected: number;
  validated_or_skipped: number;
  unvalidated: number;
  failed: number;
  policy: string;
};

export type SnapshotGateResult = {
  selected: SnapshotContextRow[];
  summary: ContextGateSummary;
};

export type SocialGateResult = {
  selected: SocialContextRow[];
  summary: ContextGateSummary;
};

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

function toMillis(iso: string | null | undefined): number {
  if (!iso) return 0;
  const parsed = new Date(iso).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function ageMinutes(iso: string | null | undefined, nowMs: number): number {
  const ms = toMillis(iso);
  if (ms <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, (nowMs - ms) / 60_000);
}

function isValidatedOrSkipped(state: ValidationState | undefined): boolean {
  return state === "validated" || state === "skipped";
}

function snapshotFreshCutoffMinutes(row: SnapshotContextRow, minFreshMinutes: number, multiplier: number): number {
  return Math.max(row.freshness_target_minutes * multiplier, minFreshMinutes);
}

export function getContextGatingConfig() {
  return {
    source_max_age_minutes: parsePositiveInt(process.env.GPT_CONTEXT_MAX_SOURCE_AGE_MINUTES, 180),
    source_min_fresh_minutes: parsePositiveInt(process.env.GPT_CONTEXT_MIN_FRESHNESS_MINUTES, 30),
    source_freshness_multiplier: parsePositiveInt(process.env.GPT_CONTEXT_FRESHNESS_MULTIPLIER, 3),
    source_max_rows: parsePositiveInt(process.env.GPT_CONTEXT_MAX_SOURCES, 24),
    social_max_age_minutes: parsePositiveInt(process.env.GPT_CONTEXT_MAX_SOCIAL_AGE_MINUTES, 240),
    social_max_rows: parsePositiveInt(process.env.GPT_CONTEXT_MAX_SOCIAL, 16),
  };
}

export function gateSnapshotContext(
  rows: SnapshotContextRow[],
  opts: {
    nowMs?: number;
    maxAgeMinutes: number;
    minFreshMinutes: number;
    freshnessMultiplier: number;
    maxRows: number;
  },
): SnapshotGateResult {
  const nowMs = opts.nowMs ?? Date.now();
  const classified = rows.map((row) => {
    const age = ageMinutes(row.fetched_at, nowMs);
    const usable = isUsableSnapshot({
      title: row.title ?? "",
      summary: row.summary ?? "",
      reliability: row.reliability,
    });
    const fresh = age <= opts.maxAgeMinutes && age <= snapshotFreshCutoffMinutes(row, opts.minFreshMinutes, opts.freshnessMultiplier);
    return { row, age, usable, fresh };
  });

  const sortByPriorityAndRecency = (a: typeof classified[number], b: typeof classified[number]) => {
    const priorityDiff = (b.row.priority ?? 0) - (a.row.priority ?? 0);
    if (priorityDiff !== 0) return priorityDiff;
    return toMillis(b.row.fetched_at) - toMillis(a.row.fetched_at);
  };

  let pool = classified.filter((item) => item.usable && item.fresh && item.row.validation_state !== "failed");
  let policy = "validated_or_skipped_fresh";
  let selected = pool.filter((item) => isValidatedOrSkipped(item.row.validation_state));

  if (selected.length === 0) {
    selected = pool;
    policy = "unvalidated_allowed_due_to_no_validated";
  }
  if (selected.length === 0) {
    pool = classified.filter((item) => item.usable && item.row.validation_state !== "failed" && item.age <= opts.maxAgeMinutes);
    selected = pool.filter((item) => isValidatedOrSkipped(item.row.validation_state));
    policy = "stale_allowed_due_to_no_fresh";
  }
  if (selected.length === 0) {
    selected = classified.filter((item) => item.usable && item.row.validation_state !== "failed");
    policy = "usable_only_last_resort";
  }
  if (selected.length === 0) {
    selected = classified.filter((item) => item.usable);
    policy = "failed_validation_last_resort";
  }

  const finalRows = selected.sort(sortByPriorityAndRecency).slice(0, opts.maxRows).map((item) => item.row);
  const validatedOrSkipped = classified.filter((item) => isValidatedOrSkipped(item.row.validation_state)).length;
  const unvalidated = classified.filter((item) => item.row.validation_state === "unvalidated").length;
  const failed = classified.filter((item) => item.row.validation_state === "failed").length;

  return {
    selected: finalRows,
    summary: {
      total: rows.length,
      usable: classified.filter((item) => item.usable).length,
      fresh: classified.filter((item) => item.fresh).length,
      selected: finalRows.length,
      validated_or_skipped: validatedOrSkipped,
      unvalidated,
      failed,
      policy,
    },
  };
}

export function gateSocialContext(
  rows: SocialContextRow[],
  opts: {
    nowMs?: number;
    maxAgeMinutes: number;
    maxRows: number;
  },
): SocialGateResult {
  const nowMs = opts.nowMs ?? Date.now();
  const classified = rows.map((row) => {
    const age = ageMinutes(row.posted_at, nowMs);
    const fresh = age <= opts.maxAgeMinutes;
    const display = row.text_en ?? row.text_original ?? row.text ?? "";
    const usable = display.trim().length >= 10;
    const state = row.validation_state ?? "unvalidated";
    return { row, age, fresh, usable, validation_state: state as ValidationState };
  });

  let pool = classified.filter((item) => item.usable && item.fresh && item.validation_state !== "failed");
  let policy = "validated_or_skipped_fresh";
  let selected = pool.filter((item) => isValidatedOrSkipped(item.validation_state));

  if (selected.length === 0) {
    selected = pool;
    policy = "unvalidated_allowed_due_to_no_validated";
  }
  if (selected.length === 0) {
    pool = classified.filter((item) => item.usable && item.validation_state !== "failed");
    selected = pool.filter((item) => isValidatedOrSkipped(item.validation_state));
    policy = "stale_allowed_due_to_no_fresh";
  }
  if (selected.length === 0) {
    selected = classified.filter((item) => item.usable);
    policy = "usable_only_last_resort";
  }

  const finalRows = selected
    .sort((a, b) => {
      const confDiff = Number(b.row.confidence ?? 0) - Number(a.row.confidence ?? 0);
      if (confDiff !== 0) return confDiff;
      return toMillis(b.row.posted_at) - toMillis(a.row.posted_at);
    })
    .slice(0, opts.maxRows)
    .map((item) => item.row);

  return {
    selected: finalRows,
    summary: {
      total: rows.length,
      usable: classified.filter((item) => item.usable).length,
      fresh: classified.filter((item) => item.fresh).length,
      selected: finalRows.length,
      validated_or_skipped: classified.filter((item) => isValidatedOrSkipped(item.validation_state)).length,
      unvalidated: classified.filter((item) => item.validation_state === "unvalidated").length,
      failed: classified.filter((item) => item.validation_state === "failed").length,
      policy,
    },
  };
}
