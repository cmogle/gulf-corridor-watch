import { UnifiedQuery } from "./unified-query";

type AirspacePosture = "normal" | "heightened" | "unclear";

type StatusHeroProps = {
  posture: AirspacePosture;
  briefingSummary: string;
  flightTotal: number;
  flightDelayed: number;
  flightCancelled: number;
  updatedAt: string | null;
  sourceCount: number;
  suggestedPrompts: string[];
};

function PostureDot({ posture }: { posture: AirspacePosture }) {
  const color =
    posture === "normal"
      ? "bg-[var(--green)]"
      : posture === "heightened"
        ? "bg-[var(--amber)]"
        : "bg-[var(--text-secondary)]";
  return (
    <span className={`inline-block h-3 w-3 rounded-full ${color} ${posture !== "normal" ? "animate-pulse-dot" : ""}`} />
  );
}

function postureHeadline(posture: AirspacePosture): string {
  if (posture === "normal") return "UAE Airspace Open";
  if (posture === "heightened") return "Disruptions Reported";
  return "Status Unclear — Data Limited";
}

function postureSubtitle(posture: AirspacePosture): string {
  if (posture === "normal") return "Commercial flights operating from DXB and AUH";
  if (posture === "heightened") return "Delays or advisories detected — check details below";
  return "Some sources are not reporting. Verify official channels directly.";
}

function heroBackground(posture: AirspacePosture): string {
  if (posture === "heightened") return "bg-gradient-to-br from-[var(--surface-dark)] to-[#7C2D12]";
  if (posture === "unclear") return "bg-gradient-to-br from-[var(--surface-dark)] to-[var(--surface-dark-unclear)]";
  return "bg-[var(--surface-dark)]";
}

function relativeTime(iso: string | null): string {
  if (!iso) return "unknown";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return "1 hour ago";
  return `${hours} hours ago`;
}

export function StatusHero({
  posture,
  flightTotal,
  flightDelayed,
  flightCancelled,
  updatedAt,
  sourceCount,
  suggestedPrompts,
}: StatusHeroProps) {
  return (
    <section className={`${heroBackground(posture)} px-4 py-8 md:px-8 md:py-12`}>
      <div className="mx-auto max-w-3xl space-y-6">
        <p className="text-[13px] font-medium uppercase tracking-[0.15em] text-[var(--text-on-dark-muted)]">
          keep calm &amp; carry on
        </p>

        <div className="space-y-2">
          <h1 className="flex items-center gap-3 font-serif text-3xl text-[var(--text-on-dark)] md:text-4xl">
            <PostureDot posture={posture} />
            {postureHeadline(posture)}
          </h1>
          <p className="text-[15px] text-[var(--text-on-dark-muted)]">
            {postureSubtitle(posture)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-sm text-[var(--text-on-dark-muted)]">
          <span>{flightTotal} tracked</span>
          <span className={flightDelayed > 0 ? "text-[var(--amber)]" : ""}>
            {flightDelayed} delayed
          </span>
          <span className={flightCancelled > 0 ? "text-[var(--red)]" : ""}>
            {flightCancelled} cancelled
          </span>
        </div>

        <UnifiedQuery suggestedPrompts={suggestedPrompts} variant="hero" />

        <p className="text-xs text-[var(--text-on-dark-muted)]">
          Updated {relativeTime(updatedAt)} · {sourceCount} sources reporting
        </p>
      </div>
    </section>
  );
}
