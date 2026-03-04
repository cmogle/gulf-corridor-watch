/**
 * Hub-and-spoke SVG geo-canvas for the Pulse Atlas.
 * DXB/AUH at the center, with corridors radiating outward to
 * Americas, UK, Europe (left), Gulf neighbours (inner ring),
 * India (right), and Asia-Pacific (far right).
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
/*  Hub-and-spoke positions (0-100 coordinate space)                   */
/*  DXB/AUH at center, corridors radiate outward                       */
/* ------------------------------------------------------------------ */

const HUB_POS: Record<string, { cx: number; cy: number }> = {
  // ── Americas (far left) ──
  JFK: { cx: 4, cy: 30 },
  ORD: { cx: 6, cy: 20 },
  LAX: { cx: 4, cy: 44 },

  // ── UK & Ireland ──
  LHR: { cx: 16, cy: 26 },
  MAN: { cx: 14, cy: 16 },
  DUB: { cx: 12, cy: 22 },

  // ── Europe ──
  AMS: { cx: 20, cy: 18 },
  FRA: { cx: 22, cy: 26 },
  CDG: { cx: 18, cy: 34 },
  FCO: { cx: 24, cy: 40 },
  IST: { cx: 28, cy: 30 },

  // ── Gulf Core (center) ──
  KWI: { cx: 40, cy: 18 },
  BAH: { cx: 42, cy: 30 },
  RUH: { cx: 36, cy: 40 },
  DOH: { cx: 44, cy: 38 },
  DXB: { cx: 52, cy: 36 },
  AUH: { cx: 49, cy: 44 },
  DWC: { cx: 54, cy: 44 },
  MCT: { cx: 60, cy: 48 },
  JED: { cx: 34, cy: 54 },

  // ── India (right cluster) ──
  DEL: { cx: 74, cy: 16 },
  AMD: { cx: 68, cy: 30 },
  CCU: { cx: 84, cy: 22 },
  BOM: { cx: 68, cy: 44 },
  HYD: { cx: 76, cy: 46 },
  GOI: { cx: 68, cy: 56 },
  BLR: { cx: 76, cy: 60 },
  MAA: { cx: 82, cy: 54 },
  COK: { cx: 74, cy: 68 },

  // ── Asia-Pacific (far right) ──
  SIN: { cx: 94, cy: 60 },
};

/** Region divider positions (x% of viewbox) */
const REGION_DIVIDERS = [
  { x: 10, label: "" },   // Americas | UK/Europe
  { x: 32, label: "" },   // UK/Europe | Gulf
  { x: 64, label: "" },   // Gulf | India
  { x: 88, label: "" },   // India | Asia-Pac
];

/** Region labels */
const REGION_LABELS: { x: number; label: string }[] = [
  { x: 5, label: "Americas" },
  { x: 20, label: "UK & Europe" },
  { x: 48, label: "Gulf" },
  { x: 76, label: "India" },
  { x: 94, label: "Asia-Pac" },
];

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
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const offset = Math.min(dist * 0.12, 50);
  return { cx: mx - (dy / dist) * offset, cy: my + (dx / dist) * offset };
}

function nodeRadius(node: NetworkNode): number {
  const activity = node.now_in + node.now_out;
  if (activity === 0) return 10;
  return Math.min(10 + Math.sqrt(activity) * 3.5, 28);
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
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between px-2 pt-2">
        {REGION_LABELS.map((r) => (
          <span
            key={r.label}
            className="text-[9px] font-medium uppercase tracking-[0.15em] text-[var(--text-secondary)] opacity-40"
            style={{ position: "absolute", left: `${r.x}%`, transform: "translateX(-50%)" }}
          >
            {r.label}
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        className="h-auto w-full"
        style={{ minHeight: 280 }}
        aria-label="Pulse Atlas: hub-and-spoke corridor network"
        role="img"
      >
        <defs>
          <radialGradient id="atlas-bg" cx="52%" cy="40%" r="35%">
            <stop offset="0%" stopColor="var(--primary-blue)" stopOpacity="0.04" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>

          <filter id="node-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" />
          </filter>
        </defs>

        {/* Background atmosphere — centered on Gulf core */}
        <rect width={VW} height={VH} fill="url(#atlas-bg)" />

        {/* Region divider lines */}
        {REGION_DIVIDERS.map((d, i) => (
          <line
            key={i}
            x1={(d.x / 100) * VW} y1={20}
            x2={(d.x / 100) * VW} y2={VH - 20}
            stroke="var(--text-secondary)" strokeWidth="0.5" strokeDasharray="4 8" opacity="0.12"
          />
        ))}

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
                    cx={x} cy={y} r={r + 5}
                    fill="none"
                    stroke={color}
                    strokeWidth={1}
                    opacity={0.25}
                    className="animate-atlas-node-pulse"
                    style={{ "--node-r": `${r + 5}` } as React.CSSProperties}
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
                {!isInactive && r > 14 && (
                  <text
                    x={x} y={y + 4}
                    textAnchor="middle"
                    className="fill-white"
                    style={{ fontSize: r > 20 ? 11 : 9, fontFamily: "var(--font-mono)", fontWeight: 700 }}
                  >
                    {activity}
                  </text>
                )}

                {/* IATA label */}
                <text
                  x={x} y={y + r + 13}
                  textAnchor="middle"
                  style={{
                    fontSize: 10,
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
