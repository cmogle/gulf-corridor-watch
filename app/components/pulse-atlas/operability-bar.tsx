import type { NetworkSummary } from "./types";

type Props = {
  summary: NetworkSummary;
};

function relativeTime(iso: string | null): string {
  if (!iso) return "n/a";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

type OpState = "normal" | "thinned" | "critical" | "shutdown";

function isFreshData(latest_fetch: string | null): boolean {
  if (!latest_fetch) return false;
  const ageMs = Date.now() - new Date(latest_fetch).getTime();
  return ageMs < 30 * 60_000;
}

function deriveState(summary: NetworkSummary): OpState {
  // Shutdown: zero flights with either fresh confirmation OR total cessation (0% stability = no activity over 6h window)
  if (summary.active_flights_now === 0 && (isFreshData(summary.latest_fetch) || summary.route_stability_6h === 0)) return "shutdown";
  if (summary.route_stability_6h >= 70) return "normal";
  if (summary.route_stability_6h >= 30) return "thinned";
  return "critical";
}

const STATE_STYLES: Record<OpState, { border: string; dot: string; label: string }> = {
  normal:   { border: "border-l-[var(--green)]", dot: "bg-[var(--green)]", label: "Corridors Normal" },
  thinned:  { border: "border-l-[var(--amber)]", dot: "bg-[var(--amber)]", label: "Traffic Thinned" },
  critical: { border: "border-l-[var(--red)]",   dot: "bg-[var(--red)]",   label: "Traffic Critical" },
  shutdown: { border: "border-l-[var(--red)]",   dot: "bg-[var(--red)]",   label: "No Aircraft Detected" },
};

export function OperabilityBar({ summary }: Props) {
  const state = deriveState(summary);
  const styles = STATE_STYLES[state];

  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm border-l-[3px] ${styles.border}`}
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {/* State indicator */}
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${styles.dot} ${state !== "normal" ? "animate-pulse-dot" : ""}`}
          />
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
            {styles.label}
          </span>
        </div>

        {/* Metrics */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-sm">
          <Metric label="flights now" value={summary.active_flights_now} />
          <Metric label="routes active" value={summary.active_routes_now} />
          <Metric
            label="stability"
            value={`${summary.route_stability_6h}%`}
            warn={summary.route_stability_6h < 50}
          />
          <span className="text-xs text-[var(--text-secondary)]">
            Updated {relativeTime(summary.latest_fetch)}
          </span>
        </div>
      </div>

      {state === "shutdown" && (
        <p className="mt-2 text-xs text-[var(--red)]">
          No aircraft detected in monitored airspace. This may indicate airspace closure or major disruption.
        </p>
      )}
    </div>
  );
}

function Metric({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <span>
      <span className={`font-medium ${warn ? "text-[var(--amber)]" : ""}`}>{value}</span>
      {" "}
      <span className="text-[var(--text-secondary)]">{label}</span>
    </span>
  );
}
