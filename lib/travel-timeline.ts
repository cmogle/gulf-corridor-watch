import { EMIRATES_SCHEDULE, ScheduledFlight } from "@/lib/emirates-schedule";

export type TimelineEventCode =
  | "check_in_open"
  | "arrive_airport"
  | "boarding"
  | "departure"
  | "arrival"
  | "immigration";

export type TimelineEvent = {
  code: TimelineEventCode;
  label: string;
  description: string;
  time: string; // ISO string (UTC)
  airport: string;
  utcOffsetHours: number;
};

export type TravelTimelineInput = {
  departureDate: string; // YYYY-MM-DD in origin local date
  flightNumber: string;
  origin: "DXB" | "BOM" | "LHR" | "LGW";
  destination: "DXB" | "BOM" | "LHR" | "LGW";
};

function normalizeFlightNumber(f: string) {
  return f.trim().toUpperCase().replace(/\s+/g, "");
}

function toMinutes(date: Date) {
  return Math.floor(date.getTime() / 60000);
}

function addMinutes(iso: string, mins: number) {
  return new Date(new Date(iso).getTime() + mins * 60000).toISOString();
}

function isBst(date: Date): boolean {
  const year = date.getUTCFullYear();
  const lastSunday = (month: number) => {
    const lastDay = new Date(Date.UTC(year, month + 1, 0));
    const dow = lastDay.getUTCDay();
    const lastSundayDate = lastDay.getUTCDate() - dow;
    return new Date(Date.UTC(year, month, lastSundayDate));
  };
  const bstStart = lastSunday(2); // March
  bstStart.setUTCHours(1, 0, 0, 0);
  const bstEnd = lastSunday(9); // October
  bstEnd.setUTCHours(1, 0, 0, 0);
  return date >= bstStart && date < bstEnd;
}

function offsetForAirport(code: string, date: Date): number {
  const c = code.toUpperCase();
  if (c === "DXB") return 4;
  if (c === "BOM") return 5.5;
  if (c === "LHR" || c === "LGW") return isBst(date) ? 1 : 0;
  return 0;
}

function buildIsoFromLocal(dateStr: string, hhmm: string, offsetHours: number): string {
  const [year, month, day] = dateStr.split("-").map((v) => parseInt(v, 10));
  const [h, m] = hhmm.split(":").map((v) => parseInt(v, 10));
  const utc = Date.UTC(year, month - 1, day, h - offsetHours, m, 0);
  return new Date(utc).toISOString();
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map((v) => parseInt(v, 10));
  const iso = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const next = new Date(iso.getTime() + days * 86400000);
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function findFlight(flightNumber: string, origin: string, destination: string): ScheduledFlight | undefined {
  const fn = normalizeFlightNumber(flightNumber);
  return EMIRATES_SCHEDULE.find(
    (f) => normalizeFlightNumber(f.flightNumber) === fn && f.origin === origin && f.destination === destination,
  );
}

function immigrationBuffer(destination: string): number {
  switch (destination.toUpperCase()) {
    case "DXB":
      return 35;
    case "BOM":
      return 50;
    case "LHR":
    case "LGW":
      return 45;
    default:
      return 40;
  }
}

export function buildTravelTimeline(input: TravelTimelineInput): TimelineEvent[] {
  const { departureDate, flightNumber, origin, destination } = input;
  const flight = findFlight(flightNumber, origin, destination);
  const depTimeLocal = flight?.departureLocalTime ?? "09:00";
  const arrTimeLocal = flight?.arrivalLocalTime ?? "";
  const arrivalDayOffset = flight?.arrivalDayOffset ?? 0;

  const depDateObj = new Date(`${departureDate}T00:00:00Z`);
  const depOffset = offsetForAirport(origin, depDateObj);
  const departureIso = buildIsoFromLocal(departureDate, depTimeLocal, depOffset);

  // Arrival handling: prefer schedule times; fallback to duration
  let arrivalIso: string;
  if (arrTimeLocal) {
    const arrivalDateStr = addDays(departureDate, arrivalDayOffset);
    const arrDateObj = new Date(`${arrivalDateStr}T00:00:00Z`);
    const arrOffset = offsetForAirport(destination, arrDateObj);
    arrivalIso = buildIsoFromLocal(arrivalDateStr, arrTimeLocal, arrOffset);
  } else if (flight?.durationMinutes) {
    arrivalIso = addMinutes(departureIso, flight.durationMinutes);
  } else {
    arrivalIso = addMinutes(departureIso, 60 * 3); // conservative default
  }

  const events: TimelineEvent[] = [];
  const boardingIso = addMinutes(departureIso, -45);
  const arriveAirportIso = addMinutes(departureIso, -180);
  const checkInIso = addMinutes(departureIso, -2880); // 48h before
  const immigrationIso = addMinutes(arrivalIso, immigrationBuffer(destination));

  events.push(
    {
      code: "check_in_open",
      label: "Online check-in opens",
      description: "Emirates opens check-in 48h before departure; pick seats and upload documents.",
      time: checkInIso,
      airport: origin,
      utcOffsetHours: depOffset,
    },
    {
      code: "arrive_airport",
      label: "Arrive at airport",
      description: "Aim to be kerbside ~3 hours before; add buffer for road traffic and baggage drop queues.",
      time: arriveAirportIso,
      airport: origin,
      utcOffsetHours: depOffset,
    },
    {
      code: "boarding",
      label: "Boarding",
      description: "Boarding typically starts 45–50 minutes before departure; listen for lounge calls.",
      time: boardingIso,
      airport: origin,
      utcOffsetHours: depOffset,
    },
    {
      code: "departure",
      label: "Scheduled departure",
      description: flight ? `${flight.flightNumber} departs ${origin} for ${destination}.` : "Planned pushback.",
      time: departureIso,
      airport: origin,
      utcOffsetHours: depOffset,
    },
    {
      code: "arrival",
      label: "Scheduled arrival",
      description: flight ? `${flight.flightNumber} arrives local time at ${destination}.` : "Planned touchdown.",
      time: arrivalIso,
      airport: destination,
      utcOffsetHours: offsetForAirport(destination, new Date(arrivalIso)),
    },
    {
      code: "immigration",
      label: "Immigration & bags",
      description: `Typical queue + bags at ${destination}: ~${immigrationBuffer(destination)} minutes after landing.`,
      time: immigrationIso,
      airport: destination,
      utcOffsetHours: offsetForAirport(destination, new Date(arrivalIso)),
    },
  );

  return events.sort((a, b) => toMinutes(new Date(a.time)) - toMinutes(new Date(b.time)));
}
