/**
 * Coarse aircraft family classification from ICAO type designators.
 * Used by the Pulse Atlas to show dominant equipment on route corridors.
 *
 * Input: FR24 raw_payload.type (e.g. "B77W", "A320", "B744F")
 * Output: one of widebody | narrowbody | freighter | unknown
 */

export type AircraftFamily = "widebody" | "narrowbody" | "freighter" | "unknown";

// Freighter patterns checked first — "B744F" should match freighter, not widebody
const FREIGHTER_RE = /F$/;
const FREIGHTER_TYPES = new Set([
  "AN12", "AN26", "AN72", "AN74", "IL76", "C17", "C130", "C5",
  "A124", "A225",
]);

const WIDEBODY_RE =
  /^(B7[4-8]|B789|B78X|A33|A34|A35|A38|B76[7-9]|B77|B78|A300|A310|A340|A350|A380|IL96|IL86|MD11|DC10|L101)/;

const REGIONAL_RE =
  /^(E1[3-9]|E170|E175|E190|E195|CRJ|DH[48]|AT[4-7]|SB20|SF34|AN24|AN26|L410)/;

export function classifyAircraftType(
  typeCode: string | null | undefined,
): AircraftFamily {
  if (!typeCode || !typeCode.trim()) return "unknown";

  const code = typeCode.trim().toUpperCase();

  // Dedicated freighter types
  if (FREIGHTER_TYPES.has(code)) return "freighter";

  // Freighter variants (suffix F, e.g. B744F, B77F, A332F)
  if (FREIGHTER_RE.test(code) && code.length > 1) return "freighter";

  // Widebody
  if (WIDEBODY_RE.test(code)) return "widebody";

  // Regional — classify as narrowbody for corridor-level view
  // (distinction is not useful at this granularity)
  if (REGIONAL_RE.test(code)) return "narrowbody";

  // Anything else that looks like a commercial designator → narrowbody
  // (A320, B738, A321, etc.)
  if (/^[A-Z]/.test(code) && code.length >= 3) return "narrowbody";

  return "unknown";
}

/** Short display label for equipment badges */
export function familyLabel(family: AircraftFamily): string {
  switch (family) {
    case "widebody": return "WB";
    case "narrowbody": return "NB";
    case "freighter": return "FR";
    default: return "?";
  }
}
