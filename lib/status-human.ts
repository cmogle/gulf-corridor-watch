export type HumanStatus = {
  label: string;
  emoji: string;
  description: string;
  severity: "info" | "warning" | "critical";
};

const STATUS_MAP: Record<string, HumanStatus> = {
  CRZ: { label: "Cruising", emoji: "✈️", description: "Aircraft is cruising at planned altitude.", severity: "info" },
  CLB: { label: "Climbing", emoji: "🛫", description: "Departed and climbing to cruise altitude.", severity: "info" },
  DSC: { label: "Descending", emoji: "🛬", description: "Descending toward destination.", severity: "info" },
  GND: { label: "On the ground", emoji: "🛬", description: "Aircraft is at the airport (not moving or taxiing).", severity: "info" },
  TAX: { label: "Taxiing", emoji: "🚖", description: "Taxiing to or from the runway.", severity: "info" },
  DEP: { label: "Departing", emoji: "🛫", description: "Rolling for takeoff or just airborne.", severity: "info" },
  OFF: { label: "Airborne", emoji: "🛫", description: "Airborne and leaving departure airport.", severity: "info" },
  ARR: { label: "Arrived", emoji: "✅", description: "Flight arrived at destination gate.", severity: "info" },
  LND: { label: "Landed", emoji: "✅", description: "Landed and taxiing to gate.", severity: "info" },
  SCH: { label: "Scheduled", emoji: "🗓️", description: "Scheduled to operate; not yet departed.", severity: "info" },
  BRD: { label: "Boarding", emoji: "🧳", description: "Passengers are boarding.", severity: "info" },
  DEL: { label: "Delayed", emoji: "⏰", description: "Departing or arriving later than planned.", severity: "warning" },
  DIV: { label: "Diverted", emoji: "⚠️", description: "Flight diverted away from planned destination.", severity: "critical" },
  CAN: { label: "Cancelled", emoji: "❌", description: "Flight cancelled; will not operate.", severity: "critical" },
  CNL: { label: "Cancelled", emoji: "❌", description: "Flight cancelled; will not operate.", severity: "critical" },
  RTN: { label: "Returned", emoji: "↩️", description: "Returned to departure airport.", severity: "warning" },
  // Derived codes already used in the app
  on_ground: { label: "On the ground", emoji: "🛬", description: "Aircraft is at the airport.", severity: "info" },
  ON_GROUND: { label: "On the ground", emoji: "🛬", description: "Aircraft is at the airport.", severity: "info" },
  approach: { label: "Landing soon", emoji: "🛬", description: "On final approach to destination.", severity: "info" },
  APPROACH: { label: "Landing soon", emoji: "🛬", description: "On final approach to destination.", severity: "info" },
  departure: { label: "Just taken off", emoji: "🛫", description: "Recently departed and climbing.", severity: "info" },
  DEPARTURE: { label: "Just taken off", emoji: "🛫", description: "Recently departed and climbing.", severity: "info" },
  cruise: { label: "In flight (cruising)", emoji: "✈️", description: "Stable at cruise altitude.", severity: "info" },
  CRUISE: { label: "In flight (cruising)", emoji: "✈️", description: "Stable at cruise altitude.", severity: "info" },
  airborne: { label: "In the air", emoji: "✈️", description: "Airborne and en route.", severity: "info" },
  AIRBORNE: { label: "In the air", emoji: "✈️", description: "Airborne and en route.", severity: "info" },
};

function normalize(code: string): string {
  return code?.trim() || "";
}

function fallbackStatus(raw: string): HumanStatus {
  return {
    label: "Status unknown",
    emoji: "❓",
    description: raw ? `Unmapped status code: ${raw}` : "No status reported yet.",
    severity: "info",
  };
}

export function humanizeStatus(code: string): HumanStatus {
  const normalized = normalize(code);
  const upper = normalized.toUpperCase();
  if (normalized && STATUS_MAP[normalized]) return STATUS_MAP[normalized];
  if (upper && STATUS_MAP[upper]) return STATUS_MAP[upper];

  // Pattern-based fallbacks for common textual statuses
  if (/CANC/i.test(upper)) return STATUS_MAP.CAN;
  if (/DIV/i.test(upper)) return STATUS_MAP.DIV;
  if (/DELAY/i.test(upper)) return STATUS_MAP.DEL;
  if (/ARR/.test(upper) || /LAND/.test(upper)) return STATUS_MAP.LND;
  if (/DEP|TAKEOFF/.test(upper)) return STATUS_MAP.DEP;

  return fallbackStatus(code);
}
