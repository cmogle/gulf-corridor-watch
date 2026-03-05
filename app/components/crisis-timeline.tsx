"use client";

import { useCallback, useEffect, useState } from "react";

type TimelineEntry = {
  timestamp: string;
  source_id: string;
  source_name: string;
  status_level: "normal" | "advisory" | "disrupted" | "unknown";
  headline: string;
  detail: string;
  severity: "low" | "medium" | "high";
};

type CrisisStat = {
  stat_key: string;
  stat_value: number;
  unit: string;
  last_source: string | null;
};

type TrendResult = {
  trajectory: "getting_better" | "getting_worse" | "stable";
  confidence: "low" | "medium" | "high";
  escalation_count: number;
  deescalation_count: number;
  summary: string;
};

type CrisisEvent = {
  id: string;
  name: string;
  category: string;
  started_at: string;
  is_active: boolean;
  stats: CrisisStat[];
};

type CrisisData = {
  ok: boolean;
  active: boolean;
  primary?: {
    event: CrisisEvent;
    timeline: TimelineEntry[];
    trend: TrendResult;
  };
  events: CrisisEvent[];
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Dubai",
    });
  } catch {
    return "";
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      month: "short",
      day: "numeric",
      timeZone: "Asia/Dubai",
    });
  } catch {
    return "";
  }
}

function severityColor(severity: TimelineEntry["severity"]): string {
  if (severity === "high") return "border-red-500 bg-red-50";
  if (severity === "medium") return "border-amber-500 bg-amber-50";
  return "border-gray-300 bg-gray-50";
}

function severityDot(severity: TimelineEntry["severity"]): string {
  if (severity === "high") return "bg-red-500";
  if (severity === "medium") return "bg-amber-500";
  return "bg-gray-400";
}

function TrendBadge({ trend }: { trend: TrendResult }) {
  const colors = {
    getting_better: "bg-green-100 text-green-800",
    getting_worse: "bg-red-100 text-red-800",
    stable: "bg-gray-100 text-gray-700",
  };
  const labels = {
    getting_better: "Improving",
    getting_worse: "Worsening",
    stable: "Stable",
  };
  const arrows = {
    getting_better: "\u2193",
    getting_worse: "\u2191",
    stable: "\u2014",
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[trend.trajectory]}`}>
      <span className="text-sm">{arrows[trend.trajectory]}</span>
      {labels[trend.trajectory]}
      <span className="text-[10px] opacity-70">({trend.confidence} conf.)</span>
    </span>
  );
}

function StatCard({ stat }: { stat: CrisisStat }) {
  const label = stat.stat_key.replace(/_/g, " ");
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
      <p className="text-lg font-bold text-[var(--text-primary)]">{stat.stat_value}</p>
      <p className="text-[11px] capitalize text-[var(--text-secondary)]">{label}</p>
    </div>
  );
}

export function CrisisPanel() {
  const [data, setData] = useState<CrisisData | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchCrisis = useCallback(async () => {
    try {
      const res = await fetch("/api/crisis");
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchCrisis();
    const interval = setInterval(() => void fetchCrisis(), 120_000);
    return () => clearInterval(interval);
  }, [fetchCrisis]);

  if (loading || !data?.active || !data.primary) return null;

  const { event, timeline, trend } = data.primary;
  const durationHours = Math.round(
    (Date.now() - new Date(event.started_at).getTime()) / (1000 * 60 * 60),
  );

  return (
    <section className="mx-auto max-w-4xl px-4 py-4 md:px-0">
      <div className="rounded-xl border border-red-200 bg-red-50/50">
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <div className="flex items-center gap-3">
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">{event.name}</h2>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                {event.category} &middot; {durationHours}h duration &middot; Started {formatDate(event.started_at)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <TrendBadge trend={trend} />
            <span className="text-xs text-[var(--text-secondary)]">{expanded ? "\u25B2" : "\u25BC"}</span>
          </div>
        </button>

        {expanded && (
          <div className="border-t border-red-200 px-5 py-4">
            {/* Stats grid */}
            {event.stats.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  Running Totals
                </h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {event.stats.map((stat) => (
                    <StatCard key={stat.stat_key} stat={stat} />
                  ))}
                </div>
              </div>
            )}

            {/* Trend summary */}
            <div className="mb-4 rounded-lg bg-white p-3 text-xs text-[var(--text-secondary)]">
              {trend.summary}
            </div>

            {/* Timeline */}
            {timeline.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  Timeline ({timeline.length} developments)
                </h3>
                <div className="relative space-y-2 pl-4">
                  <div className="absolute left-[7px] top-0 h-full w-px bg-gray-200" />
                  {timeline.slice(0, 15).map((entry, i) => (
                    <div key={i} className="relative flex gap-3">
                      <div className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${severityDot(entry.severity)} ring-2 ring-white`} />
                      <div className={`flex-1 rounded-lg border-l-2 px-3 py-2 ${severityColor(entry.severity)}`}>
                        <div className="flex items-baseline gap-2">
                          <span className="text-[10px] font-medium text-[var(--text-secondary)]">
                            {formatTime(entry.timestamp)} {formatDate(entry.timestamp)}
                          </span>
                          <span className="text-[10px] text-[var(--text-secondary)]">{entry.source_name}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-[var(--text-primary)]">{entry.headline}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
