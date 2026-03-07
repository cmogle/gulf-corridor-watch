"use client";

type FlightStatus =
  | "scheduled"
  | "delayed"
  | "cancelled"
  | "departed"
  | "boarding"
  | "landed"
  | "diverted"
  | "unknown";

type Props = {
  flightNumber: string;
  scheduledTime: string;
  estimatedTime: string | null;
  actualTime: string | null;
  status: FlightStatus;
  isDelayed: boolean;
  delayMinutes: number | null;
  isCancelled: boolean;
  gate: string | null;
  terminal: string | null;
  isAirborne: boolean;
  isPast: boolean;
};

const STATUS_STYLES: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  scheduled: { bg: "bg-green-900/40", text: "text-green-400", label: "On Time" },
  delayed: { bg: "bg-amber-900/40", text: "text-amber-400", label: "Delayed" },
  cancelled: { bg: "bg-red-900/40", text: "text-red-400", label: "Cancelled" },
  departed: { bg: "bg-blue-900/40", text: "text-blue-400", label: "Departed" },
  boarding: { bg: "bg-blue-900/40", text: "text-blue-300", label: "Boarding" },
  landed: { bg: "bg-green-900/40", text: "text-green-400", label: "Landed" },
  diverted: { bg: "bg-red-900/40", text: "text-red-400", label: "Diverted" },
  unknown: { bg: "bg-gray-800", text: "text-gray-400", label: "Unknown" },
};

function formatGST(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    timeZone: "Asia/Dubai",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatTimeOnly(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    timeZone: "Asia/Dubai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function FlightCard({
  flightNumber,
  scheduledTime,
  estimatedTime,
  actualTime,
  status,
  isDelayed,
  delayMinutes,
  isCancelled,
  gate,
  terminal,
  isAirborne,
  isPast,
}: Props) {
  const effectiveStatus = isCancelled
    ? "cancelled"
    : isAirborne
      ? "departed"
      : isDelayed
        ? "delayed"
        : status;

  const style = STATUS_STYLES[effectiveStatus] ?? STATUS_STYLES.unknown;

  return (
    <div
      className={`rounded-xl border border-gray-800 bg-gray-900 p-4 ${isPast ? "opacity-50" : ""}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-white">{flightNumber}</span>
          <span className="text-sm text-gray-400">DXB → BEG</span>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${style.bg} ${style.text} ${isAirborne ? "animate-pulse-dot" : ""}`}
        >
          {isAirborne
            ? "Airborne"
            : style.label}
          {isDelayed && delayMinutes
            ? ` +${delayMinutes}m`
            : ""}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div>
          <span className="text-gray-500">Scheduled </span>
          <span className="text-gray-200">{formatGST(scheduledTime)}</span>
        </div>
        {estimatedTime && estimatedTime !== scheduledTime && (
          <div>
            <span className="text-gray-500">Est. </span>
            <span className="text-gray-200">{formatTimeOnly(estimatedTime)}</span>
          </div>
        )}
        {actualTime && (
          <div>
            <span className="text-gray-500">Actual </span>
            <span className="text-gray-200">{formatTimeOnly(actualTime)}</span>
          </div>
        )}
      </div>

      {(gate || terminal) && (
        <div className="mt-2 flex gap-4 text-sm">
          {terminal && (
            <div>
              <span className="text-gray-500">Terminal </span>
              <span className="text-gray-200">{terminal}</span>
            </div>
          )}
          {gate && (
            <div>
              <span className="text-gray-500">Gate </span>
              <span className="text-gray-200">{gate}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
