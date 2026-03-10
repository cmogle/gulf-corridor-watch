import { FlightObservation } from "@/lib/flightradar";

export type ScheduledFlight = {
  flightNumber: string;
  origin: "DXB" | "BOM" | "LHR" | "LGW";
  destination: "DXB" | "BOM" | "LHR" | "LGW";
  /** Local departure time in HH:MM 24h format */
  departureLocalTime: string;
  /** Local arrival time in HH:MM 24h format */
  arrivalLocalTime: string;
  /** Day offset for arrival relative to departure date (e.g. 1 means next day). */
  arrivalDayOffset?: number;
  /** Block time gate-to-gate in minutes. */
  durationMinutes: number;
  aircraft: "A380" | "B777-300ER";
  notes?: string;
};

export type ObservationLike = Pick<
  FlightObservation,
  | "flight_number"
  | "origin_iata"
  | "destination_iata"
  | "status"
  | "is_delayed"
  | "delay_minutes"
  | "scheduled_time"
  | "estimated_time"
  | "actual_time"
  | "fetched_at"
> &
  Partial<FlightObservation>;

export type EnrichedScheduledFlight = ScheduledFlight & {
  stats: {
    totalObservations: number;
    onTimeRate: number; // 0..1
    averageDelayMinutes: number | null;
    latestStatus: string | null;
    latestSeenAt: string | null;
  };
  recentObservation: ObservationLike | null;
};

const schedule: ScheduledFlight[] = [
  /* DXB <> BOM */
  {
    flightNumber: "EK500",
    origin: "DXB",
    destination: "BOM",
    departureLocalTime: "04:00",
    arrivalLocalTime: "08:45",
    durationMinutes: 195,
    aircraft: "B777-300ER",
    notes: "Early morning rotation; good for morning Mumbai meetings.",
  },
  {
    flightNumber: "EK503",
    origin: "DXB",
    destination: "BOM",
    departureLocalTime: "09:50",
    arrivalLocalTime: "14:30",
    durationMinutes: 200,
    aircraft: "B777-300ER",
    notes: "Daytime slot that usually skirts DXB morning congestion.",
  },
  {
    flightNumber: "EK505",
    origin: "DXB",
    destination: "BOM",
    departureLocalTime: "15:30",
    arrivalLocalTime: "20:05",
    durationMinutes: 195,
    aircraft: "B777-300ER",
  },
  {
    flightNumber: "EK507",
    origin: "DXB",
    destination: "BOM",
    departureLocalTime: "21:50",
    arrivalLocalTime: "02:30",
    arrivalDayOffset: 1,
    durationMinutes: 200,
    aircraft: "B777-300ER",
    notes: "Overnight option, lands before Mumbai rush-hour peaks.",
  },
  {
    flightNumber: "EK501",
    origin: "BOM",
    destination: "DXB",
    departureLocalTime: "10:25",
    arrivalLocalTime: "12:15",
    durationMinutes: 170,
    aircraft: "B777-300ER",
    notes: "Pairs with EK500 inbound to DXB before lunch hour.",
  },
  {
    flightNumber: "EK504",
    origin: "BOM",
    destination: "DXB",
    departureLocalTime: "16:15",
    arrivalLocalTime: "18:00",
    durationMinutes: 165,
    aircraft: "B777-300ER",
  },
  {
    flightNumber: "EK506",
    origin: "BOM",
    destination: "DXB",
    departureLocalTime: "22:05",
    arrivalLocalTime: "23:45",
    durationMinutes: 160,
    aircraft: "B777-300ER",
    notes: "Late evening return, lines up with DXB midnight bank.",
  },
  /* DXB <> LHR */
  {
    flightNumber: "EK1",
    origin: "DXB",
    destination: "LHR",
    departureLocalTime: "02:15",
    arrivalLocalTime: "06:20",
    durationMinutes: 445,
    aircraft: "A380",
    notes: "First wave into Heathrow, typically smoother arrival queues.",
  },
  {
    flightNumber: "EK3",
    origin: "DXB",
    destination: "LHR",
    departureLocalTime: "07:45",
    arrivalLocalTime: "12:00",
    durationMinutes: 455,
    aircraft: "A380",
  },
  {
    flightNumber: "EK7",
    origin: "DXB",
    destination: "LHR",
    departureLocalTime: "14:30",
    arrivalLocalTime: "18:35",
    durationMinutes: 425,
    aircraft: "A380",
    notes: "Afternoon departure, popular with business travellers.",
  },
  {
    flightNumber: "EK2",
    origin: "LHR",
    destination: "DXB",
    departureLocalTime: "09:10",
    arrivalLocalTime: "20:00",
    durationMinutes: 410,
    aircraft: "A380",
    notes: "Morning return into DXB, beats the night rush at immigration.",
  },
  {
    flightNumber: "EK4",
    origin: "LHR",
    destination: "DXB",
    departureLocalTime: "14:00",
    arrivalLocalTime: "00:55",
    arrivalDayOffset: 1,
    durationMinutes: 415,
    aircraft: "A380",
  },
  {
    flightNumber: "EK8",
    origin: "LHR",
    destination: "DXB",
    departureLocalTime: "21:00",
    arrivalLocalTime: "08:05",
    arrivalDayOffset: 1,
    durationMinutes: 425,
    aircraft: "A380",
    notes: "Overnight from London, connects into DXB morning bank.",
  },
  /* DXB <> LGW */
  {
    flightNumber: "EK69",
    origin: "DXB",
    destination: "LGW",
    departureLocalTime: "09:35",
    arrivalLocalTime: "13:00",
    durationMinutes: 445,
    aircraft: "B777-300ER",
    notes: "Gatwick North Terminal; good fallback if LHR slots are tight.",
  },
  {
    flightNumber: "EK70",
    origin: "LGW",
    destination: "DXB",
    departureLocalTime: "20:30",
    arrivalLocalTime: "07:20",
    arrivalDayOffset: 1,
    durationMinutes: 470,
    aircraft: "B777-300ER",
  },
];

function normalize(str: string): string {
  return str.trim().toUpperCase();
}

export function getSchedule(origin: string, destination: string): ScheduledFlight[] {
  const o = normalize(origin);
  const d = normalize(destination);
  return schedule.filter((f) => f.origin === o && f.destination === d);
}

function pickLatest<
  T extends {
    fetched_at?: string | null;
    actual_time?: string | null;
    estimated_time?: string | null;
    scheduled_time?: string | null;
  },
>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  return rows.reduce((latest, row) => {
    const t = new Date(row.fetched_at ?? row.actual_time ?? row.estimated_time ?? row.scheduled_time ?? 0).getTime();
    const tLatest = new Date(
      latest.fetched_at ?? latest.actual_time ?? latest.estimated_time ?? latest.scheduled_time ?? 0,
    ).getTime();
    return t > tLatest ? row : latest;
  });
}

export function enrichWithObservations(
  baseSchedule: ScheduledFlight[],
  observations: ObservationLike[],
): EnrichedScheduledFlight[] {
  return baseSchedule.map((sched) => {
    const matches = observations.filter((obs) => {
      if (!obs.flight_number) return false;
      const fn = normalize(obs.flight_number);
      if (fn !== normalize(sched.flightNumber)) return false;
      if (obs.origin_iata && normalize(obs.origin_iata) !== sched.origin) return false;
      if (obs.destination_iata && normalize(obs.destination_iata) !== sched.destination) return false;
      return true;
    });

    const total = matches.length;
    const delays = matches.map((m) => m.delay_minutes).filter((n): n is number => typeof n === "number");
    const avgDelay = delays.length > 0 ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : null;
    const onTimeCount = matches.filter((m) => {
      if (m.is_delayed === false) return true;
      if (typeof m.delay_minutes === "number") return m.delay_minutes <= 15;
      return false;
    }).length;

    const latest = pickLatest(matches);

    return {
      ...sched,
      stats: {
        totalObservations: total,
        onTimeRate: total > 0 ? onTimeCount / total : 0,
        averageDelayMinutes: avgDelay,
        latestStatus: latest?.status ?? null,
        latestSeenAt: latest?.fetched_at ?? latest?.actual_time ?? latest?.estimated_time ?? null,
      },
      recentObservation: latest ?? null,
    };
  });
}

export const EMIRATES_SCHEDULE = schedule;
