import { computeRouteHealth, getHealthGrade, Observation, RouteHealth } from "@/lib/route-health";

export type FlightOption = {
  flightNumber: string;
  airline?: string | null;
  departureTime?: string | null; // ISO string if known
  origin?: string | null;
  destination?: string | null;
};

export type RankedFlight = FlightOption & {
  sampleSize: number;
  onTimeRate: number | null; // percentage 0-100, null when insufficient data
  averageDelayMinutes: number | null;
  reliabilityLabel: string;
  riskLevel: "low" | "medium" | "high";
};

export type BestDepartureWindow = {
  windowLabel: string;
  onTimeRate: number;
  averageDelayMinutes: number | null;
  sampleSize: number;
  rationale: string;
};

export type TripBrief = {
  route: string;
  headline: string;
  bestDepartureWindows: BestDepartureWindow[];
  reliabilityRanking: RankedFlight[];
  summary: string;
  recommendations: string[];
  stats: {
    sampleSize: number;
    onTimeRate: number;
    averageDelayMinutes: number | null;
    grade: string;
    trend: RouteHealth["trend"];
  };
};

const WINDOW_DEFS: { label: string; hours: number[]; rationale: string }[] = [
  { label: "Early morning (05:00-08:59)", hours: [5, 6, 7, 8], rationale: "Usually less congestion and cooler temps at DXB." },
  { label: "Morning (09:00-11:59)", hours: [9, 10, 11], rationale: "Business departures; moderate congestion." },
  { label: "Afternoon (12:00-16:59)", hours: [12, 13, 14, 15, 16], rationale: "Heat + busy ramp can push delays." },
  { label: "Evening (17:00-21:59)", hours: [17, 18, 19, 20, 21], rationale: "Bank of outbound Europe/India departures." },
  { label: "Late night (22:00-04:59)", hours: [22, 23, 0, 1, 2, 3, 4], rationale: "Overnight bank; potential ATC flow programs." },
];

function toNumber(val: number | string | null | undefined): number | null {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string" && val.trim() !== "" && Number.isFinite(Number(val))) return Number(val);
  return null;
}

function isCancelled(status: string): boolean {
  return /CAN(CEL)?|CNL/i.test(status || "");
}

function getDelayMinutes(obs: Observation): number | null {
  return toNumber(obs.delay_minutes);
}

function isOnTime(obs: Observation, thresholdMinutes = 15): boolean {
  if (isCancelled(obs.status)) return false;
  const delay = getDelayMinutes(obs);
  if (delay === null) return !obs.is_delayed;
  return delay <= thresholdMinutes;
}

function pct(count: number, total: number): number {
  if (!total) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function avg(values: number[]): number | null {
  if (!values.length) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

function deriveFlightOptionsFromObservations(observations: Observation[]): FlightOption[] {
  const byFlight = new Map<string, Observation>();
  for (const obs of observations) {
    const key = obs.flight_number?.toUpperCase();
    if (!key || byFlight.has(key)) continue;
    byFlight.set(key, obs);
  }
  return [...byFlight.entries()].map(([flightNumber, obs]) => ({
    flightNumber,
    airline: obs.airline,
    departureTime: obs.scheduled_time ?? obs.estimated_time ?? null,
    origin: obs.origin_iata,
    destination: obs.destination_iata,
  }));
}

export function rankFlights(flights: FlightOption[], observations: Observation[]): RankedFlight[] {
  const options = flights.length ? flights : deriveFlightOptionsFromObservations(observations);
  const ranked = options.map((flight) => {
    const rows = observations.filter((o) => o.flight_number?.toUpperCase() === flight.flightNumber.toUpperCase());
    const sampleSize = rows.length;
    const onTimeCount = rows.filter((r) => isOnTime(r)).length;
    const delays: number[] = [];
    for (const r of rows) {
      const d = getDelayMinutes(r);
      if (d !== null) delays.push(d);
      else if (isOnTime(r)) delays.push(0);
    }
    const onTimeRate = sampleSize ? pct(onTimeCount, sampleSize) : null;
    const averageDelayMinutes = avg(delays);
    let reliabilityLabel = "Insufficient data";
    let riskLevel: RankedFlight["riskLevel"] = "high";

    if (onTimeRate !== null) {
      if (onTimeRate >= 90) {
        reliabilityLabel = "Rock solid";
        riskLevel = "low";
      } else if (onTimeRate >= 80) {
        reliabilityLabel = "Reliable";
        riskLevel = "low";
      } else if (onTimeRate >= 70) {
        reliabilityLabel = "Decent";
        riskLevel = "medium";
      } else if (onTimeRate >= 60) {
        reliabilityLabel = "Shaky";
        riskLevel = "medium";
      } else {
        reliabilityLabel = "High disruption risk";
        riskLevel = "high";
      }
    }

    return {
      ...flight,
      sampleSize,
      onTimeRate,
      averageDelayMinutes,
      reliabilityLabel,
      riskLevel,
    };
  });

  return ranked.sort((a, b) => {
    if (a.onTimeRate === null && b.onTimeRate === null) return b.sampleSize - a.sampleSize;
    if (a.onTimeRate === null) return 1;
    if (b.onTimeRate === null) return -1;
    if (b.onTimeRate === a.onTimeRate) return (a.averageDelayMinutes ?? 999) - (b.averageDelayMinutes ?? 999);
    return b.onTimeRate - a.onTimeRate;
  });
}

function computeBestDepartureWindows(health: RouteHealth): BestDepartureWindow[] {
  if (!health.hourlyPerformance.length) return [];

  const windows: BestDepartureWindow[] = [];
  for (const def of WINDOW_DEFS) {
    const rows = health.hourlyPerformance.filter((h) => def.hours.includes(h.hour));
    const sampleSize = rows.reduce((acc, r) => acc + r.sampleSize, 0);
    if (!sampleSize) continue;
    const weightedOnTime = rows.reduce((acc, r) => acc + r.onTimeRate * r.sampleSize, 0) / sampleSize;
    const weightedDelay =
      rows.reduce((acc, r) => acc + (r.averageDelayMinutes ?? 0) * r.sampleSize, 0) / sampleSize;
    windows.push({
      windowLabel: def.label,
      onTimeRate: Math.round(weightedOnTime * 10) / 10,
      averageDelayMinutes: Math.round(weightedDelay * 10) / 10,
      sampleSize,
      rationale: def.rationale,
    });
  }

  return windows.sort((a, b) => b.onTimeRate - a.onTimeRate);
}

function buildSummary(route: string, health: RouteHealth, bestWindow?: BestDepartureWindow): string {
  const base = `${route}: grade ${health.healthGrade} (${Math.round(health.onTimeRate)}% on-time, avg delay ${health.averageDelayMinutes ?? "n/a"}m)`;
  const trend = `trend ${health.trend}`;
  const windowNote = bestWindow ? `Best window: ${bestWindow.windowLabel} (${bestWindow.onTimeRate}% on-time).` : "";
  return [base, trend, windowNote].filter(Boolean).join(" | ");
}

function buildRecommendations(bestWindows: BestDepartureWindow[], ranking: RankedFlight[]): string[] {
  const recs: string[] = [];
  if (bestWindows[0]) {
    recs.push(`Aim for ${bestWindows[0].windowLabel}; ${bestWindows[0].onTimeRate}% on-time from ${bestWindows[0].sampleSize} samples.`);
  }
  if (ranking[0]) {
    recs.push(`Top pick: ${ranking[0].flightNumber} (${ranking[0].reliabilityLabel}, ${ranking[0].onTimeRate ?? "?"}% on-time).`);
  }
  if (ranking.length > 1) {
    const tail = ranking[ranking.length - 1];
    recs.push(`Avoid if flexible: ${tail.flightNumber} (${tail.onTimeRate ?? "?"}% on-time, avg delay ${tail.averageDelayMinutes ?? "n/a"}m).`);
  }
  return recs;
}

export function generateTripBrief(route: string, observations: Observation[]): TripBrief {
  const health = computeRouteHealth(observations);
  const bestWindows = computeBestDepartureWindows(health);
  const flights = deriveFlightOptionsFromObservations(observations);
  const ranking = rankFlights(flights, observations);

  const headline = `${route}: ${getHealthGrade(health.onTimeRate)} grade, ${health.trend} trend`;
  const summary = buildSummary(route, health, bestWindows[0]);
  const recommendations = buildRecommendations(bestWindows, ranking);

  return {
    route,
    headline,
    bestDepartureWindows: bestWindows.slice(0, 3),
    reliabilityRanking: ranking,
    summary,
    recommendations,
    stats: {
      sampleSize: health.sampleSize,
      onTimeRate: health.onTimeRate,
      averageDelayMinutes: health.averageDelayMinutes,
      grade: health.healthGrade,
      trend: health.trend,
    },
  };
}
