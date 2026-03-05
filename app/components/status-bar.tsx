"use client";

import { SessionIndicator } from "./session-indicator";
import type { AirspacePosture, CrisisTrend } from "./layout-types";

type StatusBarProps = {
  posture: AirspacePosture;
  flightTotal: number;
  flightDelayed: number;
  flightCancelled: number;
  updatedAt: string | null;
  trend: CrisisTrend;
  onToggleDrawer: () => void;
  isDrawerOpen: boolean;
};

function PostureDot({ posture }: { posture: AirspacePosture }) {
  const color =
    posture === "normal"
      ? "bg-[var(--green)]"
      : posture === "heightened"
        ? "bg-[var(--amber)]"
        : "bg-[var(--text-secondary)]";
  return (
    <span className={`inline-block h-2.5 w-2.5 rounded-full ${color} ${posture !== "normal" ? "animate-pulse-dot" : ""}`} />
  );
}

function postureHeadline(posture: AirspacePosture): string {
  if (posture === "normal") return "UAE Airspace Open";
  if (posture === "heightened") return "Disruptions Reported";
  return "Status Unclear";
}

function TrendBadge({ trend }: { trend: CrisisTrend }) {
  if (!trend) return null;
  const config = {
    improving: { arrow: "\u2193", label: "Improving", color: "text-[var(--green)]" },
    worsening: { arrow: "\u2191", label: "Worsening", color: "text-[var(--red)]" },
    stable: { arrow: "\u2014", label: "Stable", color: "text-[var(--text-on-dark-muted)]" },
  } as const;
  const { arrow, label, color } = config[trend];
  return (
    <span className={`hidden items-center gap-0.5 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-medium sm:inline-flex ${color}`}>
      <span className="text-xs">{arrow}</span>
      {label}
    </span>
  );
}

function heroBackground(posture: AirspacePosture): string {
  if (posture === "heightened") return "bg-gradient-to-r from-[var(--surface-dark)] to-[#7C2D12]";
  if (posture === "unclear") return "bg-gradient-to-r from-[var(--surface-dark)] to-[var(--surface-dark-unclear)]";
  return "bg-[var(--surface-dark)]";
}

export function StatusBar({
  posture,
  flightTotal,
  flightDelayed,
  flightCancelled,
  trend,
  onToggleDrawer,
  isDrawerOpen,
}: StatusBarProps) {
  return (
    <header className={`fixed top-0 left-0 right-0 z-30 h-12 ${heroBackground(posture)}`}>
      <div className="flex h-full items-center justify-between px-4">
        {/* Left: brand + posture */}
        <div className="flex items-center gap-3 min-w-0">
          <p className="hidden text-[11px] font-medium uppercase tracking-[0.15em] text-[var(--text-on-dark-muted)] sm:block">
            keep calm &amp; carry on
          </p>
          <div className="flex items-center gap-2 min-w-0">
            <PostureDot posture={posture} />
            <span className="truncate font-serif text-sm text-[var(--text-on-dark)] md:text-base">
              {postureHeadline(posture)}
            </span>
            <TrendBadge trend={trend} />
          </div>
        </div>

        {/* Center: flight stats (desktop only) */}
        <div className="hidden items-center gap-3 font-mono text-xs text-[var(--text-on-dark-muted)] lg:flex">
          <span>{flightTotal} tracked</span>
          <span className={flightDelayed > 0 ? "text-[var(--amber)]" : ""}>
            {flightDelayed} delayed
          </span>
          <span className={flightCancelled > 0 ? "text-[var(--red)]" : ""}>
            {flightCancelled} cancelled
          </span>
        </div>

        {/* Right: session + drawer toggle */}
        <div className="flex items-center gap-3">
          <SessionIndicator />
          <button
            onClick={onToggleDrawer}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-on-dark-muted)] transition-colors hover:bg-white/10 hover:text-[var(--text-on-dark)]"
            aria-label={isDrawerOpen ? "Close dashboard" : "Open dashboard"}
            title={isDrawerOpen ? "Close dashboard" : "Open dashboard"}
          >
            {isDrawerOpen ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="4" y1="4" x2="12" y2="12" />
                <line x1="12" y1="4" x2="4" y2="12" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <rect x="1" y="2" width="14" height="12" rx="2" />
                <line x1="10" y1="2" x2="10" y2="14" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
