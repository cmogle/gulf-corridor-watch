"use client";

type HourlyBin = {
  hour: number;
  label: string;
  arrivals: number;
  departures: number;
  total: number;
  bin_start: string;
  bin_end: string;
};

type BaselineBin = {
  hour: number;
  avg_total: number;
};

type Props = {
  bins: HourlyBin[];
  baseline: BaselineBin[] | null;
  onClickBin?: (bin: HourlyBin) => void;
  activeHour?: number | null;
};

const W = 420;
const H = 180;
const PAD_L = 32;
const PAD_R = 8;
const PAD_T = 24;
const PAD_B = 28;
const CHART_W = W - PAD_L - PAD_R;
const CHART_H = H - PAD_T - PAD_B;

export function HourlyVolumeChart({ bins, baseline, onClickBin, activeHour }: Props) {
  if (bins.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-[var(--text-secondary)]">
        No volume data available
      </div>
    );
  }

  // Build baseline lookup
  const baselineMap = new Map<number, number>();
  if (baseline) {
    for (const b of baseline) baselineMap.set(b.hour, b.avg_total);
  }

  // Compute max for Y scale
  const maxActual = Math.max(...bins.map((b) => b.total), 1);
  const maxBaseline = baseline ? Math.max(...baseline.map((b) => b.avg_total), 0) : 0;
  const yMax = Math.max(maxActual, maxBaseline, 1);

  const barGap = 2;
  const barWidth = Math.max((CHART_W - barGap * bins.length) / bins.length, 4);

  function yScale(val: number): number {
    return CHART_H - (val / yMax) * CHART_H;
  }

  // Build baseline stepped line
  let baselinePath = "";
  if (baseline && baseline.length > 0) {
    const points: string[] = [];
    for (let i = 0; i < bins.length; i++) {
      const bVal = baselineMap.get(bins[i].hour) ?? 0;
      const x1 = PAD_L + i * (barWidth + barGap);
      const x2 = x1 + barWidth;
      const y = PAD_T + yScale(bVal);
      points.push(`${i === 0 ? "M" : "L"}${x1},${y} L${x2},${y}`);
    }
    baselinePath = points.join(" ");
  }

  const interactive = !!onClickBin;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Hourly flight volume chart"
      >
        {/* Y-axis gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const y = PAD_T + CHART_H * (1 - frac);
          const val = Math.round(yMax * frac);
          return (
            <g key={frac}>
              <line
                x1={PAD_L} y1={y} x2={W - PAD_R} y2={y}
                stroke="var(--text-secondary)" strokeWidth="0.5" opacity="0.15"
              />
              <text
                x={PAD_L - 4} y={y + 3}
                textAnchor="end"
                style={{ fontSize: 8, fontFamily: "var(--font-mono)", fill: "var(--text-secondary)" }}
              >
                {val}
              </text>
            </g>
          );
        })}

        {/* Stacked bars */}
        {bins.map((bin, i) => {
          const x = PAD_L + i * (barWidth + barGap);
          const arrH = (bin.arrivals / yMax) * CHART_H;
          const depH = (bin.departures / yMax) * CHART_H;
          const isActive = activeHour === bin.hour;
          const dimmed = activeHour != null && !isActive;

          return (
            <g
              key={i}
              onClick={() => onClickBin?.(bin)}
              className={interactive ? "cursor-pointer" : undefined}
              role={interactive ? "button" : undefined}
              tabIndex={interactive ? 0 : undefined}
              aria-label={interactive ? `${bin.label}: ${bin.total} flights` : undefined}
              onKeyDown={interactive ? (e) => { if (e.key === "Enter") onClickBin?.(bin); } : undefined}
            >
              {/* Hit area — invisible rect for easier clicking */}
              {interactive && (
                <rect
                  x={x} y={PAD_T}
                  width={barWidth} height={CHART_H}
                  fill="transparent"
                />
              )}

              {/* Active highlight background */}
              {isActive && (
                <rect
                  x={x - 1} y={PAD_T}
                  width={barWidth + 2} height={CHART_H}
                  fill="var(--primary-blue)" opacity="0.08" rx="2"
                />
              )}

              {/* Departures (bottom) */}
              <rect
                x={x} y={PAD_T + CHART_H - depH}
                width={barWidth} height={Math.max(depH, 0)}
                fill="var(--primary-blue)" opacity={dimmed ? 0.12 : 0.35} rx="1"
              />
              {/* Arrivals (stacked on top) */}
              <rect
                x={x} y={PAD_T + CHART_H - depH - arrH}
                width={barWidth} height={Math.max(arrH, 0)}
                fill="var(--primary-blue)" opacity={dimmed ? 0.25 : 0.7} rx="1"
              />

              {/* Total label */}
              {bin.total > 0 && (
                <text
                  x={x + barWidth / 2}
                  y={PAD_T + CHART_H - depH - arrH - 4}
                  textAnchor="middle"
                  style={{
                    fontSize: 7,
                    fontFamily: "var(--font-mono)",
                    fontWeight: 600,
                    fill: dimmed ? "var(--text-secondary)" : "var(--text-primary)",
                    opacity: dimmed ? 0.4 : 1,
                  }}
                >
                  {bin.total}
                </text>
              )}

              {/* X-axis hour label */}
              <text
                x={x + barWidth / 2}
                y={H - 6}
                textAnchor="middle"
                style={{
                  fontSize: 7,
                  fontFamily: "var(--font-mono)",
                  fill: isActive ? "var(--primary-blue)" : "var(--text-secondary)",
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {bin.label}
              </text>
            </g>
          );
        })}

        {/* Baseline overlay */}
        {baselinePath && (
          <path
            d={baselinePath}
            fill="none"
            stroke="var(--amber)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            opacity="0.7"
          />
        )}
      </svg>

      {/* Legend */}
      <div className="mt-1 flex items-center gap-4 px-1 text-[10px] text-[var(--text-secondary)]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-[var(--primary-blue)] opacity-70" />
          Arrivals
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-[var(--primary-blue)] opacity-35" />
          Departures
        </span>
        {baseline && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-3 border-t border-dashed border-[var(--amber)]" />
            Baseline
          </span>
        )}
      </div>

      {/* Accessible data table */}
      <table className="sr-only">
        <caption>Hourly flight volumes</caption>
        <thead>
          <tr>
            <th>Hour</th>
            <th>Arrivals</th>
            <th>Departures</th>
            <th>Total</th>
            {baseline && <th>Baseline</th>}
          </tr>
        </thead>
        <tbody>
          {bins.map((bin, i) => (
            <tr key={i}>
              <td>{bin.label}</td>
              <td>{bin.arrivals}</td>
              <td>{bin.departures}</td>
              <td>{bin.total}</td>
              {baseline && <td>{baselineMap.get(bin.hour) ?? 0}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
