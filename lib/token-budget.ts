/**
 * Global daily token budget tracker.
 *
 * Tracks cumulative Anthropic token usage (input + output) across all callers.
 * When the daily budget is exceeded, LLM calls should be gracefully skipped
 * or degraded to fallback mode.
 *
 * In-memory on Vercel serverless — each lambda tracks independently.
 * This provides a soft cap rather than a precise global limit, but still
 * prevents any single lambda instance from running away.
 *
 * For a hard global cap, use Vercel KV or Upstash Redis.
 */

type BudgetState = {
  /** The UTC date string (YYYY-MM-DD) this budget covers */
  date: string;
  /** Total input tokens consumed today */
  inputTokens: number;
  /** Total output tokens consumed today */
  outputTokens: number;
  /** Number of LLM calls made today */
  callCount: number;
};

let _budget: BudgetState = {
  date: todayUtc(),
  inputTokens: 0,
  outputTokens: 0,
  callCount: 0,
};

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function ensureCurrentDay(): void {
  const today = todayUtc();
  if (_budget.date !== today) {
    _budget = { date: today, inputTokens: 0, outputTokens: 0, callCount: 0 };
  }
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

export type TokenBudgetConfig = {
  /** Max combined (input + output) tokens per day per lambda instance.
   *  Default: 300,000 — roughly $1.35 per instance at Sonnet pricing.
   *  A single Vercel lambda seeing all chat traffic will cap at this. */
  maxDailyTokens: number;
  /** Max output tokens per day (output is 5x more expensive). Default: 50,000 */
  maxDailyOutputTokens: number;
  /** Max LLM calls per day per instance. Default: 200 */
  maxDailyCalls: number;
};

export function getTokenBudgetConfig(): TokenBudgetConfig {
  return {
    maxDailyTokens: parsePositiveInt(process.env.TOKEN_BUDGET_MAX_DAILY, 300_000),
    maxDailyOutputTokens: parsePositiveInt(process.env.TOKEN_BUDGET_MAX_DAILY_OUTPUT, 50_000),
    maxDailyCalls: parsePositiveInt(process.env.TOKEN_BUDGET_MAX_DAILY_CALLS, 200),
  };
}

export type BudgetCheckResult = {
  allowed: boolean;
  reason: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    callCount: number;
  };
};

/**
 * Check whether a new LLM call is within budget.
 * Does NOT consume budget — call `recordTokenUsage()` after the call completes.
 */
export function checkTokenBudget(config?: TokenBudgetConfig): BudgetCheckResult {
  ensureCurrentDay();
  const cfg = config ?? getTokenBudgetConfig();
  const total = _budget.inputTokens + _budget.outputTokens;

  const usage = {
    inputTokens: _budget.inputTokens,
    outputTokens: _budget.outputTokens,
    totalTokens: total,
    callCount: _budget.callCount,
  };

  if (total >= cfg.maxDailyTokens) {
    return { allowed: false, reason: `Daily token budget exhausted (${total.toLocaleString()} / ${cfg.maxDailyTokens.toLocaleString()})`, usage };
  }
  if (_budget.outputTokens >= cfg.maxDailyOutputTokens) {
    return { allowed: false, reason: `Daily output token budget exhausted (${_budget.outputTokens.toLocaleString()} / ${cfg.maxDailyOutputTokens.toLocaleString()})`, usage };
  }
  if (_budget.callCount >= cfg.maxDailyCalls) {
    return { allowed: false, reason: `Daily LLM call limit reached (${_budget.callCount} / ${cfg.maxDailyCalls})`, usage };
  }

  return { allowed: true, reason: null, usage };
}

/**
 * Record token usage after an LLM call completes.
 */
export function recordTokenUsage(input: number, output: number): void {
  ensureCurrentDay();
  _budget.inputTokens += input;
  _budget.outputTokens += output;
  _budget.callCount += 1;
}

/** Get current budget state (for telemetry/debugging). */
export function getBudgetState(): Readonly<BudgetState> {
  ensureCurrentDay();
  return { ..._budget };
}
