import { familyLabel } from "@/lib/aircraft-family";
import type { NetworkEdge, Confidence } from "./types";
import { Sparkline } from "./sparkline";

type Props = {
  edges: NetworkEdge[];
  hoveredEdge: string | null;
  onHoverEdge: (key: string | null) => void;
};

function edgeKey(e: NetworkEdge): string {
  return `${e.from}->${e.to}`;
}

function confidenceStyle(c: Confidence): { bg: string; text: string; label: string } {
  switch (c) {
    case "high":   return { bg: "bg-emerald-50", text: "text-emerald-700", label: "HIGH" };
    case "medium": return { bg: "bg-amber-50",   text: "text-amber-700",   label: "MED" };
    case "low":    return { bg: "bg-gray-100",    text: "text-gray-500",    label: "LOW" };
  }
}

export function RouteLadder({ edges, hoveredEdge, onHoverEdge }: Props) {
  if (edges.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-center text-sm text-[var(--text-secondary)]">
          No corridor data in the current window
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-gray-100 px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">
          Route Viability
        </p>
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        {edges.map((edge) => {
          const key = edgeKey(edge);
          const isHovered = hoveredEdge === key;
          const dominant = edge.equipment_mix[0];
          const badge = dominant ? familyLabel(dominant.family) : "?";
          const conf = confidenceStyle(edge.confidence);
          const isActive = edge.now_count > 0;

          return (
            <div
              key={key}
              className={`flex items-center gap-2 border-b border-gray-50 px-3 py-2.5 transition-colors cursor-pointer ${
                isHovered ? "bg-blue-50/60" : "hover:bg-gray-50/60"
              }`}
              onMouseEnter={() => onHoverEdge(key)}
              onMouseLeave={() => onHoverEdge(null)}
            >
              {/* Active indicator dot */}
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  isActive ? "bg-[var(--green)]" : "bg-gray-200"
                }`}
              />

              {/* Route pair */}
              <span className="min-w-0 shrink-0 font-mono text-[13px] font-medium">
                {edge.from}
                <span className="mx-0.5 text-[var(--text-secondary)]">→</span>
                {edge.to}
              </span>

              {/* Sparkline (hidden below lg to save space in the side-by-side layout) */}
              <span className="hidden shrink-0 lg:inline-block">
                <Sparkline
                  data={edge.trend_counts_5m}
                  width={52}
                  height={16}
                  color={isActive ? "var(--primary-blue)" : "var(--text-secondary)"}
                />
              </span>

              {/* Equipment badge */}
              <span
                className="shrink-0 rounded bg-gray-100 px-1 py-0.5 font-mono text-[10px] font-medium text-[var(--text-secondary)]"
              >
                {badge}
              </span>

              {/* Now count */}
              <span className="shrink-0 font-mono text-[13px] tabular-nums">
                <span className="font-medium">{edge.now_count}</span>
                <span className="ml-0.5 text-[10px] text-[var(--text-secondary)]">now</span>
              </span>

              {/* Confidence */}
              <span
                className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${conf.bg} ${conf.text}`}
              >
                {conf.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
