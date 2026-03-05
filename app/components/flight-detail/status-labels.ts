/**
 * Human-friendly flight status labels and badge styles.
 *
 * Merges radar-derived status (cruise, approach, on_ground, etc.)
 * with schedule board status (landed, departed, boarding, cancelled, etc.)
 * to produce a single user-friendly label.
 */

/** Map raw status codes to human-friendly labels. */
export function friendlyStatus(
  radarStatus: string,
  scheduleStatus?: string | null,
): string {
  // Schedule status is more informative when available
  if (scheduleStatus) {
    switch (scheduleStatus) {
      case "cancelled": return "Cancelled";
      case "diverted":  return "Diverted";
      case "landed":    return "Landed";
      case "departed":  return "Departed";
      case "delayed":   return "Delayed";
      case "boarding":  return "Boarding";
      case "scheduled": return "Scheduled";
      case "expected":  return "Expected";
    }
  }

  // Fall back to radar-derived status
  switch (radarStatus) {
    case "cruise":    return "In Flight";
    case "airborne":  return "In Flight";
    case "approach":  return "Landing";
    case "departure": return "Departing";
    case "on_ground": return "On Ground";
  }

  // Catch schedule-like statuses that might come through radarStatus
  if (/cancel/i.test(radarStatus)) return "Cancelled";
  if (/landed/i.test(radarStatus)) return "Landed";
  if (/boarding/i.test(radarStatus)) return "Boarding";

  return radarStatus.charAt(0).toUpperCase() + radarStatus.slice(1);
}

/** Badge color styling for a friendly status label. */
export function statusBadgeStyle(status: string): { bg: string; text: string } {
  switch (status) {
    case "In Flight":  return { bg: "bg-emerald-50",  text: "text-emerald-700" };
    case "Landing":    return { bg: "bg-blue-50",     text: "text-blue-700" };
    case "Departing":  return { bg: "bg-purple-50",   text: "text-purple-700" };
    case "Departed":   return { bg: "bg-purple-50",   text: "text-purple-700" };
    case "On Ground":  return { bg: "bg-gray-100",    text: "text-gray-600" };
    case "Landed":     return { bg: "bg-sky-50",      text: "text-sky-700" };
    case "Boarding":   return { bg: "bg-indigo-50",   text: "text-indigo-700" };
    case "Scheduled":  return { bg: "bg-gray-50",     text: "text-gray-500" };
    case "Expected":   return { bg: "bg-gray-50",     text: "text-gray-500" };
    case "Delayed":    return { bg: "bg-amber-50",    text: "text-amber-700" };
    case "Cancelled":  return { bg: "bg-red-50",      text: "text-red-700" };
    case "Diverted":   return { bg: "bg-orange-50",   text: "text-orange-700" };
    default:           return { bg: "bg-gray-100",    text: "text-gray-600" };
  }
}
