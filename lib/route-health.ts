import { FlightObservation } from "@/lib/flightradar";

export type Observation = FlightObservation;

export type DelayBucketSummary = {
  bucket: string;
  count: number;
  percentage: number;
};

export type HourPerformance = {
  hour: number; // 0-23 UTC hour bucket
  onTimeRate: number;
  averageDelayMinutes: number | null;
  sampleSize: number;
};

export type DayPerformance = {
  dow: string; // Sun, Mon, Tue...
  onTimeRate: number;
  averageDelayMinutes: number | null;
  sampleSize: number;
};

export type TrendDirection = "improving" | "stable" | "degrading";

export type WindowStats = {
  periodHours: number;
  sampleSize: number;
  onTimeRate: number;
  averageDelayMinutes: number | null;
};

export type RouteHealth = {
  route: string;
  sampleSize: number;
  onTimeRate: number; // percentage 0-100
  averageDelayMinutes: number | null;
  delayDistribution: DelayBucketSummary[];
  hourlyPerformance: HourPerformance[];
  dailyPerformance: DayPerformance[];
  healthGrade: string;
  trend: TrendDirection;
  recentWindow?: WindowStats;
  historicalWindow?: WindowStats;
  updatedAt: string | null;
};

const ON_TIME_THRESHOLD_MINUTES = 15;

function toNumber(val: number | string | null | undefined): number | null {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string" && val.trim() !== "" && Number.isFinite(Number(val))) return Number(val);
  return null;
}

function getDelayMinutes(obs: Observation): number | null {
  return toNumber(obs.delay_minutes);
}

function isCancelledOrDiverted(status: string): boolean {
  return /CAN(CEL)?|CNL|DIV/i.test(status || "");
}

function isOnTime(obs: Observation, thresholdMinutes = ON_TIME_THRESHOLD_MINUTES): boolean {
  if (isCancelledOrDiverted(obs.status)) return false;
  const delay = getDelayMinutes(obs);
  if (delay === null) return !obs.is_delayed;
  return delay <= thresholdMinutes;
}

function pickBestTimestamp(obs: Observation): Date | null {
  const candidates = [obs.scheduled_time, obs.estimated_time, obs.actual_time, obs.fetched_at];
  for (const ts of candidates) {
    if (!ts) continue;
    const d = new Date(ts);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function percentage(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 1000) / 10; // one decimal place
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

export function getHealthGrade(onTimeRate: number): string {
  if (onTimeRate >= 90) return "A";
  if (onTimeRate >= 80) return "B";
  if (onTimeRate >= 70) return "C";
  if (onTimeRate >= 60) return "D";
  if (onTimeRate >= 50) return "E";
  return "F";
}

function buildDelayDistribution(observations: Observation[]): DelayBucketSummary[] {
  const buckets = [
    { bucket: "On time / early (≤15m)", test: (d: number | null, status: string) => !isCancelledOrDiverted(status) && (d === null || d <= 15) },
    { bucket: "Minor delay (16-30m)", test: (d: number | null) => d !== null && d > 15 && d <= 30 },
    { bucket: "Moderate delay (31-60m)", test: (d: number | null) => d !== null && d > 30 && d <= 60 },
    { bucket: "Heavy delay (61-120m)", test: (d: number | null) => d !== null && d > 60 && d <= 120 },
    { bucket: "Severe delay (>120m)", test: (d: number | null) => d !== null && d > 120 },
    { bucket: "Diverted / Cancelled", test: (_d: number | null, status: string) => isCancelledOrDiverted(status) },
  ];

  const totals = buckets.map(() => 0);
  const totalSamples = observations.length;

  for (const obs of observations) {
    const delay = getDelayMinutes(obs);
    const status = obs.status || "";
    const idx = buckets.findIndex((b) => b.test(delay, status));
    if (idx >= 0) totals[idx] += 1;
  }

  return buckets.map((b, i) => ({
    bucket: b.bucket,
    count: totals[i],
    percentage: percentage(totals[i], totalSamples),
  }));
}

function buildHourlyPerformance(observations: Observation[]): HourPerformance[] {
  const map = new Map<number, Observation[]>();

  for (const obs of observations) {
    const dt = pickBestTimestamp(obs);
    if (!dt) continue;
    const hour = dt.getUTCHours();
    if (!map.has(hour)) map.set(hour, []);
    map.get(hour)!.push(obs);
  }

  const result: HourPerformance[] = [];
  for (const [hour, rows] of [...map.entries()].sort((a, b) => a[0] - b[0])) {
    const onTimeCount = rows.filter((r) => isOnTime(r)).length;
    const sampleSize = rows.length;
    const delays: number[] = [];
    for (const r of rows) {
      const d = getDelayMinutes(r);
      if (d !== null) delays.push(d);
      else if (isOnTime(r)) delays.push(0);
    }
    result.push({
      hour,
      sampleSize,
      onTimeRate: percentage(onTimeCount, sampleSize),
      averageDelayMinutes: average(delays),
    });
  }

  return result;
}

function buildDailyPerformance(observations: Observation[]): DayPerformance[] {
  const map = new Map<number, Observation[]>();

  for (const obs of observations) {
    const dt = pickBestTimestamp(obs);
    if (!dt) continue;
    const dow = dt.getUTCDay(); // 0 = Sun
    if (!map.has(dow)) map.set(dow, []);
    map.get(dow)!.push(obs);
  }

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const result: DayPerformance[] = [];

  for (const [dow, rows] of [...map.entries()].sort((a, b) => a[0] - b[0])) {
    const onTimeCount = rows.filter((r) => isOnTime(r)).length;
    const sampleSize = rows.length;
    const delays: number[] = [];
    for (const r of rows) {
      const d = getDelayMinutes(r);
      if (d !== null) delays.push(d);
      else if (isOnTime(r)) delays.push(0);
    }
    result.push({
      dow: dayNames[dow],
      sampleSize,
      onTimeRate: percentage(onTimeCount, sampleSize),
      averageDelayMinutes: average(delays),
    });
  }

  return result;
}

function computeWindow(observations: Observation[], cutoffFrom: Date, cutoffTo: Date): WindowStats | null {
  const windowRows = observations.filter((o) => {
    const ts = new Date(o.fetched_at);
    return ts >= cutoffFrom && ts < cutoffTo;
  });

  if (!windowRows.length) return null;
  const onTimeCount = windowRows.filter((r) => isOnTime(r)).length;
  const delays: number[] = [];
  for (const r of windowRows) {
    const d = getDelayMinutes(r);
    if (d !== null) delays.push(d);
    else if (isOnTime(r)) delays.push(0);
  }

  const periodHours = Math.round((cutoffTo.getTime() - cutoffFrom.getTime()) / 3_600_000);
  return {
    periodHours,
    sampleSize: windowRows.length,
    onTimeRate: percentage(onTimeCount, windowRows.length),
    averageDelayMinutes: average(delays),
  };
}

function computeTrend(observations: Observation[], latestTimestamp: Date | null): {
  trend: TrendDirection;
  recent?: WindowStats;
  historical?: WindowStats;
} {
  if (!latestTimestamp || observations.length < 6) return { trend: "stable" };

  const WINDOW_HOURS = 48;
  const recentStart = new Date(latestTimestamp.getTime() - WINDOW_HOURS * 3_600_000);
  const historicStart = new Date(recentStart.getTime() - WINDOW_HOURS * 3_600_000);

  const recent = computeWindow(observations, recentStart, latestTimestamp);
  const historic = computeWindow(observations, historicStart, recentStart);

  if (!recent || !historic || recent.sampleSize < 3 || historic.sampleSize < 3) {
    return { trend: "stable", recent: recent ?? undefined, historical: historic ?? undefined };
  }

  const delta = recent.onTimeRate - historic.onTimeRate;
  const trend: TrendDirection = delta >= 5 ? "improving" : delta <= -5 ? "degrading" : "stable";
  return { trend, recent, historical: historic };
}

export function computeRouteHealth(observations: Observation[]): RouteHealth {
  if (!observations.length) {
    return {
      route: "unknown",
      sampleSize: 0,
      onTimeRate: 0,
      averageDelayMinutes: null,
      delayDistribution: [],
      hourlyPerformance: [],
      dailyPerformance: [],
      healthGrade: "F",
      trend: "stable",
      updatedAt: null,
    };
  }

  const route = `${observations[0].origin_iata ?? "???"}-${observations[0].destination_iata ?? "???"}`;
  const sampleSize = observations.length;
  const onTimeCount = observations.filter((o) => isOnTime(o)).length;

  const delays: number[] = [];
  for (const obs of observations) {
    const d = getDelayMinutes(obs);
    if (d !== null) delays.push(d);
    else if (isOnTime(obs)) delays.push(0);
  }

  const updatedAt =
    observations
      .map((o) => new Date(o.fetched_at))
      .filter((d) => !Number.isNaN(d.getTime()))
      .sort((a, b) => b.getTime() - a.getTime())[0]?.toISOString() ?? null;

  const onTimeRate = percentage(onTimeCount, sampleSize);
  const delayDistribution = buildDelayDistribution(observations);
  const hourlyPerformance = buildHourlyPerformance(observations);
  const dailyPerformance = buildDailyPerformance(observations);
  const { trend, recent, historical } = computeTrend(observations, updatedAt ? new Date(updatedAt) : null);

  return {
    route,
    sampleSize,
    onTimeRate,
    averageDelayMinutes: average(delays),
    delayDistribution,
    hourlyPerformance,
    dailyPerformance,
    healthGrade: getHealthGrade(onTimeRate),
    trend,
    recentWindow: recent,
    historicalWindow: historical,
    updatedAt,
  };
}
