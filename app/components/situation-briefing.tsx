type Props = {
  paragraph: string;
  refreshedAt: string;
  confidence: "high" | "medium" | "low";
  sourceCount: number;
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return "1 hour ago";
  return `${hours} hours ago`;
}

function confidenceBadge(confidence: Props["confidence"]) {
  const cls =
    confidence === "high"
      ? "bg-emerald-100 text-emerald-800"
      : confidence === "medium"
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-800";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {confidence} confidence
    </span>
  );
}

export function SituationBriefing({ paragraph, refreshedAt, confidence, sourceCount }: Props) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-8 md:px-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">
        Situation Briefing
      </p>
      {confidence !== "high" && (
        <div className="mt-3 h-px bg-[var(--amber)] opacity-40" />
      )}
      <p className="mt-4 text-base leading-[1.65] text-[var(--text-primary)]">
        {paragraph}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
        <span>Updated {relativeTime(refreshedAt)}</span>
        {confidenceBadge(confidence)}
        <span>{sourceCount} sources</span>
      </div>
    </section>
  );
}
