"use client";

import type { AircraftFamily } from "@/lib/aircraft-family";

type EquipmentCount = { family: AircraftFamily; count: number };

type Props = {
  equipment: EquipmentCount[];
  onClickFamily?: (family: AircraftFamily) => void;
  activeFamily?: AircraftFamily | null;
};

const FAMILY_STYLES: Record<AircraftFamily, { label: string; color: string }> = {
  widebody:   { label: "Widebody",  color: "var(--primary-blue)" },
  narrowbody: { label: "Narrowbody", color: "var(--green)" },
  freighter:  { label: "Freighter", color: "var(--amber)" },
  unknown:    { label: "Unknown",   color: "var(--text-secondary)" },
};

export function EquipmentMixChart({ equipment, onClickFamily, activeFamily }: Props) {
  const total = equipment.reduce((sum, e) => sum + e.count, 0);
  if (total === 0) return null;

  const interactive = !!onClickFamily;

  return (
    <div>
      {/* Segmented bar */}
      <div className="flex h-5 overflow-hidden rounded-md">
        {equipment.map((e) => {
          const pct = (e.count / total) * 100;
          if (pct < 1) return null;
          const style = FAMILY_STYLES[e.family];
          const isActive = activeFamily === e.family;
          const dimmed = activeFamily != null && !isActive;

          return (
            <button
              key={e.family}
              type="button"
              onClick={() => onClickFamily?.(e.family)}
              disabled={!interactive}
              className={`flex items-center justify-center text-[8px] font-medium text-white ${
                interactive ? "cursor-pointer" : ""
              } ${isActive ? "ring-2 ring-offset-1 ring-blue-400" : ""}`}
              style={{
                width: `${pct}%`,
                backgroundColor: style.color,
                opacity: dimmed ? 0.25 : 0.8,
                minWidth: pct > 5 ? undefined : 0,
              }}
              title={`${style.label}: ${e.count} (${Math.round(pct)}%)`}
            >
              {pct > 12 && style.label.slice(0, 2).toUpperCase()}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {equipment.map((e) => {
          const style = FAMILY_STYLES[e.family];
          const pct = Math.round((e.count / total) * 100);
          const isActive = activeFamily === e.family;
          const dimmed = activeFamily != null && !isActive;

          return (
            <button
              key={e.family}
              type="button"
              onClick={() => onClickFamily?.(e.family)}
              disabled={!interactive}
              className={`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] transition-colors ${
                interactive ? "cursor-pointer hover:bg-gray-50" : ""
              } ${isActive ? "bg-blue-50/60 ring-1 ring-blue-200" : ""} ${
                dimmed ? "opacity-40" : ""
              } text-[var(--text-secondary)]`}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: style.color, opacity: dimmed ? 0.3 : 0.8 }}
              />
              {style.label} {e.count} ({pct}%)
            </button>
          );
        })}
      </div>
    </div>
  );
}
