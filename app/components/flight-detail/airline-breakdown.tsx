"use client";

type AirlineCount = { name: string; count: number };

type Props = {
  airlines: AirlineCount[];
};

export function AirlineBreakdown({ airlines }: Props) {
  if (airlines.length === 0) return null;

  const max = airlines[0]?.count ?? 1;
  const total = airlines.reduce((sum, a) => sum + a.count, 0);

  return (
    <div className="space-y-1.5">
      {airlines.map((a) => {
        const pct = total > 0 ? Math.round((a.count / total) * 100) : 0;
        const width = max > 0 ? Math.max((a.count / max) * 100, 2) : 2;

        return (
          <div key={a.name} className="flex items-center gap-2">
            <span className="w-20 shrink-0 truncate font-mono text-[11px] text-[var(--text-primary)]">
              {a.name}
            </span>
            <div className="flex-1">
              <div
                className="h-3.5 rounded-sm bg-[var(--primary-blue)] opacity-50"
                style={{ width: `${width}%` }}
              />
            </div>
            <span className="w-14 shrink-0 text-right font-mono text-[10px] text-[var(--text-secondary)]">
              {a.count} ({pct}%)
            </span>
          </div>
        );
      })}
    </div>
  );
}
