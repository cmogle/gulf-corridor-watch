/**
 * Stylized SVG geo-canvas for the Pulse Atlas.
 * Renders hub nodes and route ribbons on a schematic layout.
 */

import { familyLabel } from "@/lib/aircraft-family";
import type { NetworkNode, NetworkEdge } from "./types";

type Props = {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  hoveredEdge: string | null;
  onHoverEdge: (key: string | null) => void;
};

/* ------------------------------------------------------------------ */
/*  Stylized canvas positions (0–100 coordinate space)                 */
/*  Loosely follows relative geography: ME left, India right           */
/* ------------------------------------------------------------------ */

const HUB_POS: Record<string, { cx: number; cy: number }> = {
  // Middle East — left cluster
  KWI: { cx: 14, cy: 22 },
  BAH: { cx: 17, cy: 33 },
  RUH: { cx: 10, cy: 42 },
  DOH: { cx: 20, cy: 40 },
  DXB: { cx: 30, cy: 38 },
  AUH: { cx: 27, cy: 46 },
  MCT: { cx: 36, cy: 52 },
  JED: { cx: 6, cy: 54 },
  // India — right cluster
  DEL: { cx: 70, cy: 18 },
  AMD: { cx: 62, cy: 34 },
  BOM: { cx: 60, cy: 48 },
  HYD: { cx: 72, cy: 50 },
  GOI: { cx: 62, cy: 58 },
  BLR: { cx: 72, cy: 64 },
  MAA: { cx: 80, cy: 58 },
  COK: { cx: 68, cy: 72 },
  CCU: { cx: 84, cy: 26 },
};

/** SVG viewBox dimensions */
const VW = 1000;
const VH = 600;

function toSvg(cx: number, cy: number): { x: number; y: number } {
  return { x: (cx / 100) * VW, y: (cy / 100) * VH };
}

/** Quadratic bezier control point for curved ribbons */
function controlPoint(x1: number, y1: number, x2: number, y2: number): { cx: number; cy: number } {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  // Offset perpendicular to the line for a nice curve
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const offset = Math.min(dist * 0.15, 60);
  return { cx: mx - (dy / dist) * offset, cy: my + (dx / dist) * offset };
}

function nodeRadius(node: NetworkNode): number {
  const activity = node.now_in + node.now_out;
  if (activity === 0) return 12;
  return Math.min(12 + Math.sqrt(activity) * 4, 32);
}

function nodeColor(node: NetworkNode): string {
  if (node.now_in + node.now_out === 0) return "var(--text-secondary)";
  if (node.trend_score >= 60) return "var(--green)";
  if (node.trend_score >= 25) return "var(--amber)";
  return "var(--red)";
}

function ribbonWidth(edge: NetworkEdge): number {
  if (edge.now_count === 0) return 1;
  return Math.min(1.5 + Math.sqrt(edge.now_count) * 1.5, 7);
}

function ribbonOpacity(edge: NetworkEdge): number {
  // Consistency: what fraction of trend bins have activity
  const activeBins = edge.trend_counts_5m.filter((c) => c > 0).length;
  const total = edge.trend_counts_5m.length || 1;
  const consistency = activeBins / total;
  return 0.15 + consistency * 0.65;
}

function edgeKey(edge: NetworkEdge): string {
  return `${edge.from}->${edge.to}`;
}

export function AtlasCanvas({ nodes, edges, hoveredEdge, onHoverEdge }: Props) {
  const nodeMap = new Map(nodes.map((n) => [n.iata, n]));

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Region labels */}
      <div className="pointer-events-none absolute inset-0 flex justify-between px-6 pt-3">
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)] opacity-50">
          Middle East
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)] opacity-50">
          India
        </span>
      </div>

      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        className="h-auto w-full"
        style={{ minHeight: 280 }}
        aria-label="Pulse Atlas: corridor network visualization"
        role="img"
      >
        <defs>
          {/* Subtle gradient for the background */}
          <radialGradient id="atlas-bg" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="var(--primary-blue)" stopOpacity="0.02" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>

          {/* Glow filter for active nodes */}
          <filter id="node-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" />
          </filter>
        </defs>

        {/* Background atmosphere */}
        <rect width={VW} height={VH} fill="url(#atlas-bg)" />

        {/* Dividing region line */}
        <line
          x1={VW * 0.46} y1={20} x2={VW * 0.46} y2={VH - 20}
          stroke="var(--text-secondary)" strokeWidth="0.5" strokeDasharray="4 8" opacity="0.15"
        />

        {/* ── Edges (ribbons) ── */}
        <g className="atlas-edges">
          {edges.map((edge) => {
            const fromPos = HUB_POS[edge.from];
            const toPos = HUB_POS[edge.to];
            if (!fromPos || !toPos) return null;

            const p1 = toSvg(fromPos.cx, fromPos.cy);
            const p2 = toSvg(toPos.cx, toPos.cy);
            const cp = controlPoint(p1.x, p1.y, p2.x, p2.y);
            const key = edgeKey(edge);
            const isHovered = hoveredEdge === key;
            const isDimmed = hoveredEdge !== null && !isHovered;
            const w = ribbonWidth(edge);
            const baseOpacity = ribbonOpacity(edge);
            const opacity = isDimmed ? 0.06 : isHovered ? 0.95 : baseOpacity;
            const pathD = `M${p1.x},${p1.y} Q${cp.cx},${cp.cy} ${p2.x},${p2.y}`;

            // Midpoint for equipment badge
            const mx = (p1.x + 2 * cp.cx + p2.x) / 4;
            const my = (p1.y + 2 * cp.cy + p2.y) / 4;
            const dominant = edge.equipment_mix[0];
            const badge = dominant ? familyLabel(dominant.family) : "?";

            return (
              <g
                key={key}
                className="cursor-pointer"
                onMouseEnter={() => onHoverEdge(key)}
                onMouseLeave={() => onHoverEdge(null)}
                style={{ transition: "opacity 0.2s ease" }}
              >
                {/* Shadow/glow on hover */}
                {isHovered && (
                  <path
                    d={pathD}
                    fill="none"
                    stroke="var(--primary-blue)"
                    strokeWidth={w + 6}
                    opacity={0.12}
                    filter="url(#node-glow)"
                  />
                )}

                {/* Main ribbon */}
                <path
                  d={pathD}
                  fill="none"
                  stroke="var(--primary-blue)"
                  strokeWidth={isHovered ? w + 1.5 : w}
                  opacity={opacity}
                  strokeDasharray={edge.now_count > 0 ? "8 4" : "3 6"}
                  className={edge.now_count > 0 ? "animate-atlas-ribbon-flow" : ""}
                  strokeLinecap="round"
                />

                {/* Hit area (wider invisible path for easier hover) */}
                <path
                  d={pathD}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={Math.max(w + 12, 18)}
                />

                {/* Equipment badge */}
                {!isDimmed && edge.now_count > 0 && (
                  <g transform={`translate(${mx},${my})`} style={{ transition: "opacity 0.2s" }}>
                    <rect
                      x={-13} y={-9} width={26} height={18} rx={4}
                      fill="var(--surface-dark)" opacity={isHovered ? 0.9 : 0.7}
                    />
                    <text
                      x={0} y={4}
                      textAnchor="middle"
                      className="fill-white"
                      style={{ fontSize: 9, fontFamily: "var(--font-mono)" }}
                    >
                      {badge}
                    </text>
                  </g>
                )}

                {/* Route label on hover */}
                {isHovered && (
                  <g transform={`translate(${mx},${my - 18})`}>
                    <rect
                      x={-40} y={-12} width={80} height={20} rx={4}
                      fill="var(--surface-dark)" opacity={0.9}
                    />
                    <text
                      x={0} y={2}
                      textAnchor="middle"
                      className="fill-white"
                      style={{ fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 500 }}
                    >
                      {edge.from} → {edge.to} ({edge.now_count})
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {/* ── Nodes (hubs) ── */}
        <g className="atlas-nodes">
          {nodes.map((node) => {
            const pos = HUB_POS[node.iata];
            if (!pos) return null;

            const { x, y } = toSvg(pos.cx, pos.cy);
            const r = nodeRadius(node);
            const color = nodeColor(node);
            const activity = node.now_in + node.now_out;
            const isInactive = activity === 0;

            return (
              <g key={node.iata}>
                {/* Outer pulse ring for active hubs */}
                {!isInactive && (
                  <circle
                    cx={x} cy={y} r={r + 6}
                    fill="none"
                    stroke={color}
                    strokeWidth={1}
                    opacity={0.25}
                    className="animate-atlas-node-pulse"
                    style={{ "--node-r": `${r + 6}` } as React.CSSProperties}
                  />
                )}

                {/* Main circle */}
                <circle
                  cx={x} cy={y} r={r}
                  fill={isInactive ? "transparent" : color}
                  stroke={color}
                  strokeWidth={isInactive ? 1 : 0}
                  opacity={isInactive ? 0.25 : 0.85}
                />

                {/* Activity count */}
                {!isInactive && (
                  <text
                    x={x} y={y + 4}
                    textAnchor="middle"
                    className="fill-white"
                    style={{ fontSize: r > 20 ? 12 : 10, fontFamily: "var(--font-mono)", fontWeight: 700 }}
                  >
                    {activity}
                  </text>
                )}

                {/* IATA label */}
                <text
                  x={x} y={y + r + 14}
                  textAnchor="middle"
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    fontWeight: 500,
                    fill: isInactive ? "var(--text-secondary)" : "var(--text-primary)",
                    opacity: isInactive ? 0.4 : 0.8,
                  }}
                >
                  {node.iata}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
