"use client";

import type { AircraftFamily } from "@/lib/aircraft-family";

type EquipmentCount = { family: AircraftFamily; count: number };

type Props = {
  equipment: EquipmentCount[];
};

const FAMILY_STYLES: Record<AircraftFamily, { label: string; color: string }> = {
  widebody:   { label: "Widebody",  color: "var(--primary-blue)" },
  narrowbody: { label: "Narrowbody", color: "var(--green)" },
  freighter:  { label: "Freighter", color: "var(--amber)" },
  unknown:    { label: "Unknown",   color: "var(--text-secondary)" },
};

export function EquipmentMixChart({ equipment }: Props) {
  const total = equipment.reduce((sum, e) => sum + e.count, 0);
  if (total === 0) return null;

  return (
    <div>
      {/* Segmented bar */}
      <div className="flex h-5 overflow-hidden rounded-md">
        {equipment.map((e) => {
          const pct = (e.count / total) * 100;
          if (pct < 1) return null;
          const style = FAMILY_STYLES[e.family];
          return (
            <div
              key={e.family}
              className="flex items-center justify-center text-[8px] font-medium text-white"
              style={{
                width: `${pct}%`,
                backgroundColor: style.color,
                opacity: 0.8,
                minWidth: pct > 5 ? undefined : 0,
              }}
              title={`${style.label}: ${e.count} (${Math.round(pct)}%)`}
            >
              {pct > 12 && style.label.slice(0, 2).toUpperCase()}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {equipment.map((e) => {
          const style = FAMILY_STYLES[e.family];
          const pct = Math.round((e.count / total) * 100);
          return (
            <span key={e.family} className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: style.color, opacity: 0.8 }}
              />
              {style.label} {e.count} ({pct}%)
            </span>
          );
        })}
      </div>
    </div>
  );
}
