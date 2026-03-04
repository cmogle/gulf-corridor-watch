"use client";

type AirlineCount = { name: string; count: number };

type Props = {
  airlines: AirlineCount[];
  onClickAirline?: (name: string) => void;
  activeAirline?: string | null;
};

export function AirlineBreakdown({ airlines, onClickAirline, activeAirline }: Props) {
  if (airlines.length === 0) return null;

  const max = airlines[0]?.count ?? 1;
  const total = airlines.reduce((sum, a) => sum + a.count, 0);
  const interactive = !!onClickAirline;

  return (
    <div className="space-y-1.5">
      {airlines.map((a) => {
        const pct = total > 0 ? Math.round((a.count / total) * 100) : 0;
        const width = max > 0 ? Math.max((a.count / max) * 100, 2) : 2;
        const isActive = activeAirline === a.name;
        const dimmed = activeAirline != null && !isActive;

        return (
          <button
            key={a.name}
            type="button"
            onClick={() => onClickAirline?.(a.name)}
            disabled={!interactive}
            className={`flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors ${
              interactive ? "cursor-pointer hover:bg-gray-50" : ""
            } ${isActive ? "bg-blue-50/60 ring-1 ring-blue-200" : ""}`}
          >
            <span
              className={`w-20 shrink-0 truncate font-mono text-[11px] ${
                dimmed ? "text-[var(--text-secondary)] opacity-50" : "text-[var(--text-primary)]"
              }`}
            >
              {a.name}
            </span>
            <div className="flex-1">
              <div
                className="h-3.5 rounded-sm bg-[var(--primary-blue)]"
                style={{
                  width: `${width}%`,
                  opacity: dimmed ? 0.15 : isActive ? 0.7 : 0.5,
                }}
              />
            </div>
            <span
              className={`w-14 shrink-0 text-right font-mono text-[10px] ${
                dimmed ? "text-[var(--text-secondary)] opacity-50" : "text-[var(--text-secondary)]"
              }`}
            >
              {a.count} ({pct}%)
            </span>
          </button>
        );
      })}
    </div>
  );
}
