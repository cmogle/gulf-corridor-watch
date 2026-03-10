"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Sparkline } from "@/app/components/pulse-atlas/sparkline";

type TripIntel = {
  route: string;
  nickname: string;
  nextFlight: string;
  departureTime: string;
  onTimePercent: number;
  reliability: "stable" | "caution" | "volatile";
  terminal?: string;
  gate?: string;
  note?: string;
};

type RouteHealth = {
  route: string;
  avgDelay: number;
  onTimePercent: number;
  totalFlights: number;
  grade: "A" | "B" | "B-" | "C" | "C+" | "D";
  trend: number[]; // delay minutes over recent samples
  windowLabel?: string;
};

type FlightOption = {
  flight: string;
  route: string;
  departure: string;
  reliability: number; // 0-100
  status: string;
  aircraft: string;
  cabinNote?: string;
};

type SortKey = "departure" | "reliability" | "flight";

type Heatmap = number[][]; // [day][hour] average delay minutes

const emiratesRed = "#c1121f";
const accentAmber = "#f59e0b";
const accentGreen = "#22c55e";

const mockTripIntel: TripIntel[] = [
  {
    route: "DXB → BOM",
    nickname: "Mumbai work run",
    nextFlight: "EK500",
    departureTime: "2026-03-15T22:45:00+04:00",
    onTimePercent: 82,
    reliability: "stable",
    terminal: "T3",
    gate: "B12",
    note: "Latest pushback trend steady at -2/+8 min.",
  },
  {
    route: "DXB → LHR",
    nickname: "London long-weekend",
    nextFlight: "EK1",
    departureTime: "2026-03-21T09:45:00+04:00",
    onTimePercent: 74,
    reliability: "caution",
    terminal: "T3",
    gate: "A7",
    note: "Heathrow ATC slows mid-morning flow; pad buffer on arrival.",
  },
];

const mockRouteHealth: RouteHealth[] = [
  {
    route: "DXB → BOM",
    avgDelay: 18,
    onTimePercent: 82,
    totalFlights: 184,
    grade: "B",
    trend: [10, 8, 12, 15, 14, 11, 9, 13, 16, 18, 15, 14, 12, 11],
    windowLabel: "Last 7 days",
  },
  {
    route: "DXB → LHR",
    avgDelay: 26,
    onTimePercent: 74,
    totalFlights: 142,
    grade: "C+",
    trend: [18, 21, 24, 28, 33, 29, 27, 25, 24, 23, 26, 30, 31, 29],
    windowLabel: "Last 7 days",
  },
];

const mockOptions: FlightOption[] = [
  {
    flight: "EK500",
    route: "DXB → BOM",
    departure: "2026-03-15T22:45:00+04:00",
    reliability: 84,
    status: "Evening wave from T3 — historically on-time with light headwinds",
    aircraft: "77W",
    cabinNote: "Saver availability showing in Y",
  },
  {
    flight: "EK504",
    route: "DXB → BOM",
    departure: "2026-03-16T08:55:00+04:00",
    reliability: 78,
    status: "Morning bank sees moderate congestion leaving DXB",
    aircraft: "77W",
    cabinNote: "Easier upgrade odds; quieter load",
  },
  {
    flight: "EK1",
    route: "DXB → LHR",
    departure: "2026-03-21T09:45:00+04:00",
    reliability: 76,
    status: "Slots padded; typically gate-closes on time",
    aircraft: "A388",
    cabinNote: "Upper Deck aisle seats open",
  },
  {
    flight: "VS401",
    route: "DXB → LHR",
    departure: "2026-03-21T13:50:00+04:00",
    reliability: 62,
    status: "Usually 10–18m late due to stand availability at LHR",
    aircraft: "789",
  },
  {
    flight: "EK7",
    route: "DXB → LHR",
    departure: "2026-03-21T14:15:00+04:00",
    reliability: 68,
    status: "Heathrow PM flow control — expect stack vectors",
    aircraft: "A388",
  },
];

const mockHeatmap: Heatmap = [
  [6, 5, 4, 4, 4, 5, 6, 10, 12, 14, 16, 18, 14, 13, 12, 14, 18, 22, 20, 16, 12, 10, 8, 6], // Mon
  [5, 4, 4, 4, 5, 6, 7, 10, 12, 16, 18, 20, 18, 16, 14, 15, 20, 26, 24, 18, 14, 12, 9, 7], // Tue
  [5, 4, 4, 4, 5, 6, 8, 12, 14, 16, 18, 22, 20, 18, 16, 18, 22, 28, 26, 20, 15, 12, 9, 7], // Wed
  [6, 5, 4, 4, 5, 7, 10, 14, 16, 18, 20, 24, 22, 20, 18, 20, 26, 32, 28, 22, 16, 12, 10, 8], // Thu
  [8, 6, 5, 5, 6, 8, 12, 18, 20, 22, 24, 28, 26, 24, 22, 24, 30, 36, 32, 24, 18, 14, 12, 10], // Fri
  [10, 8, 6, 6, 7, 10, 14, 20, 22, 24, 26, 30, 28, 26, 24, 26, 32, 40, 34, 26, 20, 16, 14, 12], // Sat
  [8, 6, 5, 5, 6, 8, 12, 18, 20, 22, 24, 28, 26, 24, 22, 22, 24, 30, 28, 22, 16, 12, 10, 9], // Sun
];

async function safeFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) return fallback;
    const json = (await res.json()) as T;
    return json ?? fallback;
  } catch {
    return fallback;
  }
}

function formatDateTime(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "TBD";
  return dt.toLocaleString("en-GB", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function countdownLabel(targetIso: string, nowMs: number): string {
  const target = new Date(targetIso).getTime();
  if (Number.isNaN(target)) return "Schedule pending";
  const diff = target - nowMs;
  if (diff <= 0) return "Boarding / departed";
  const totalMinutes = Math.round(diff / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  parts.push(`${hours}h`, `${minutes}m`);
  return parts.join(" ");
}

function gaugeColor(pct: number): string {
  if (pct >= 85) return accentGreen;
  if (pct >= 70) return accentAmber;
  return emiratesRed;
}

function reliabilityLabel(level: TripIntel["reliability"]) {
  switch (level) {
    case "stable":
      return { text: "High reliability", bg: "bg-emerald-500/15", ring: "ring-emerald-400/40", dot: "bg-emerald-400" };
    case "caution":
      return { text: "Watch buffers", bg: "bg-amber-500/15", ring: "ring-amber-400/40", dot: "bg-amber-400" };
    default:
      return { text: "Volatile", bg: "bg-red-500/15", ring: "ring-red-400/40", dot: "bg-red-400" };
  }
}

function gradePill(grade: RouteHealth["grade"]) {
  if (grade === "A" || grade === "B") return "bg-emerald-500/20 text-emerald-200 border border-emerald-500/30";
  if (grade === "B-" || grade === "C+") return "bg-amber-500/20 text-amber-200 border border-amber-500/30";
  return "bg-red-500/20 text-red-100 border border-red-500/30";
}

function statusTone(reliability: number) {
  if (reliability >= 80) return "text-emerald-200 bg-emerald-500/10 border-emerald-500/20";
  if (reliability >= 65) return "text-amber-100 bg-amber-500/10 border-amber-500/20";
  return "text-red-100 bg-red-500/10 border-red-500/20";
}

function heatColor(minutes: number) {
  const clamped = Math.min(Math.max(minutes, 0), 45);
  const intensity = 0.18 + (clamped / 45) * 0.72; // min 0.18, max 0.9
  return `rgba(193, 18, 31, ${intensity.toFixed(2)})`;
}

export default function MyTripsPage() {
  const [tripIntel, setTripIntel] = useState<TripIntel[]>(mockTripIntel);
  const [routeHealth, setRouteHealth] = useState<RouteHealth[]>(mockRouteHealth);
  const [flightOptions, setFlightOptions] = useState<FlightOption[]>(mockOptions);
  const [heatmap, setHeatmap] = useState<Heatmap>(mockHeatmap);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({
    key: "departure",
    direction: "asc",
  });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    void hydrateFromApis();
  }, []);

  async function hydrateFromApis() {
    setLoading(true);
    const [routes, trips, schedule, delayGrid] = await Promise.all([
      safeFetch<RouteHealth[]>("/api/route-health", mockRouteHealth),
      safeFetch<TripIntel[]>("/api/trip-intel", mockTripIntel),
      safeFetch<FlightOption[]>("/api/schedule", mockOptions),
      safeFetch<Heatmap>("/api/airport-info", mockHeatmap),
    ]);
    setRouteHealth(routes?.length ? routes : mockRouteHealth);
    setTripIntel(trips?.length ? trips : mockTripIntel);
    setFlightOptions(schedule?.length ? schedule : mockOptions);
    setHeatmap(delayGrid?.length ? delayGrid : mockHeatmap);
    setLoading(false);
  }

  const sortedOptions = useMemo(() => {
    const next = [...flightOptions];
    next.sort((a, b) => {
      if (sort.key === "departure") {
        return sort.direction === "asc"
          ? new Date(a.departure).getTime() - new Date(b.departure).getTime()
          : new Date(b.departure).getTime() - new Date(a.departure).getTime();
      }
      if (sort.key === "reliability") {
        return sort.direction === "asc" ? a.reliability - b.reliability : b.reliability - a.reliability;
      }
      return sort.direction === "asc" ? a.flight.localeCompare(b.flight) : b.flight.localeCompare(a.flight);
    });
    return next;
  }, [flightOptions, sort]);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "reliability" ? "desc" : "asc" },
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0f1a] via-[#0f1729] to-[#0b0f1a] text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4 shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">Personal Travel Intelligence</p>
              <h1 className="text-2xl font-semibold text-white">My Trips</h1>
              <p className="text-sm text-zinc-400">DXB home base · tuned for Emirates Skywards Silver</p>
            </div>
            <div
              className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-zinc-200"
              style={{ backgroundColor: "rgba(193, 18, 31, 0.15)" }}
            >
              {loading ? "Refreshing intel…" : "Live with mock fallback"}
            </div>
          </div>
        </header>

        {/* Trip cards */}
        <section className="grid gap-4 md:grid-cols-2">
          {tripIntel.map((trip) => {
            const gauge = trip.onTimePercent;
            const angle = Math.min(Math.max(gauge, 0), 100) * 3.6;
            const rel = reliabilityLabel(trip.reliability);
            return (
              <article
                key={trip.route}
                className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4 shadow-lg backdrop-blur"
              >
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-[#c1121f]/15" />
                <div className="relative flex items-start gap-4">
                  <div className="flex-1 space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">{trip.nickname}</p>
                    <h2 className="text-xl font-semibold text-white">{trip.route}</h2>
                    <p className="text-sm text-zinc-300">
                      Next: <span className="font-semibold text-white">{trip.nextFlight}</span> · {formatDateTime(trip.departureTime)}
                    </p>
                    <p className="text-xs text-zinc-400">
                      Terminal {trip.terminal ?? "TBD"} · Gate {trip.gate ?? "—"} · {trip.note ?? "Status steady"}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ring-1 ${rel.ring} ${rel.bg}`}>
                        <span className={`h-2 w-2 rounded-full ${rel.dot}`} />
                        {rel.text}
                      </span>
                      <span className="rounded-full bg-white/5 px-2 py-1 text-[11px] text-zinc-200 ring-1 ring-white/10">
                        Countdown · {countdownLabel(trip.departureTime, now)}
                      </span>
                    </div>
                  </div>

                  <div className="relative flex-shrink-0">
                    <div
                      className="relative h-28 w-28 rounded-full"
                      style={{
                        background: `conic-gradient(${gaugeColor(gauge)} ${angle}deg, rgba(255,255,255,0.08) ${angle}deg)`,
                      }}
                    >
                      <div className="absolute inset-3 rounded-full bg-[#0b0f1a] shadow-inner ring-1 ring-white/10" />
                      <div className="absolute inset-3 flex flex-col items-center justify-center">
                        <span className="text-2xl font-semibold text-white">{gauge}%</span>
                        <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-400">On-time</span>
                      </div>
                    </div>
                    <p className="mt-2 text-center text-[11px] text-zinc-400">Route health gauge</p>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        {/* Route health corridor panels */}
        <section className="grid gap-4 md:grid-cols-2">
          {routeHealth.map((route) => (
            <article
              key={route.route}
              className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg backdrop-blur"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">{route.windowLabel ?? "Recent window"}</p>
                  <h3 className="text-lg font-semibold text-white">{route.route}</h3>
                  <p className="text-sm text-zinc-400">Delay trend · minutes late over time</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-sm font-semibold ${gradePill(route.grade)}`}>{route.grade}</span>
              </div>

              <div className="mt-4">
                <Sparkline data={route.trend} width={220} height={50} color={gaugeColor(route.onTimePercent)} />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-400">Avg delay</p>
                  <p className="text-xl font-semibold text-white">{route.avgDelay}m</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-400">On-time</p>
                  <p className="text-xl font-semibold text-white">{route.onTimePercent}%</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-400">Flights tracked</p>
                  <p className="text-xl font-semibold text-white">{route.totalFlights}</p>
                </div>
              </div>
            </article>
          ))}
        </section>

        {/* Flight options table */}
        <section className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Flight options</p>
              <h3 className="text-lg font-semibold text-white">Recommended departures</h3>
            </div>
            <p className="text-xs text-zinc-400">Tap headers to sort</p>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-zinc-300">
                <tr>
                  <th className="px-2 py-2">
                    <button onClick={() => toggleSort("departure")} className="flex items-center gap-1 text-xs uppercase tracking-[0.14em] text-zinc-300">
                      Departure
                      {sort.key === "departure" ? <span className="text-[10px]">{sort.direction === "asc" ? "↑" : "↓"}</span> : null}
                    </button>
                  </th>
                  <th className="px-2 py-2 text-xs uppercase tracking-[0.14em] text-zinc-300">Route</th>
                  <th className="px-2 py-2">
                    <button onClick={() => toggleSort("flight")} className="flex items-center gap-1 text-xs uppercase tracking-[0.14em] text-zinc-300">
                      Flight
                      {sort.key === "flight" ? <span className="text-[10px]">{sort.direction === "asc" ? "↑" : "↓"}</span> : null}
                    </button>
                  </th>
                  <th className="px-2 py-2">
                    <button onClick={() => toggleSort("reliability")} className="flex items-center gap-1 text-xs uppercase tracking-[0.14em] text-zinc-300">
                      Reliability
                      {sort.key === "reliability" ? <span className="text-[10px]">{sort.direction === "asc" ? "↑" : "↓"}</span> : null}
                    </button>
                  </th>
                  <th className="px-2 py-2 text-xs uppercase tracking-[0.14em] text-zinc-300">Status</th>
                  <th className="px-2 py-2 text-xs uppercase tracking-[0.14em] text-zinc-300">Aircraft</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sortedOptions.map((opt) => (
                  <tr key={`${opt.flight}-${opt.departure}`} className="hover:bg-white/5">
                    <td className="px-2 py-3 align-top font-medium text-white whitespace-nowrap">{formatDateTime(opt.departure)}</td>
                    <td className="px-2 py-3 align-top text-zinc-200 whitespace-nowrap">{opt.route}</td>
                    <td className="px-2 py-3 align-top font-semibold text-white">{opt.flight}</td>
                    <td className="px-2 py-3 align-top">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${opt.reliability}%`, backgroundColor: gaugeColor(opt.reliability) }}
                          />
                        </div>
                        <span className="text-sm text-zinc-200">{opt.reliability}%</span>
                      </div>
                    </td>
                    <td className="px-2 py-3 align-top">
                      <span className={`inline-block rounded-lg border px-2 py-1 text-[13px] ${statusTone(opt.reliability)}`}>
                        {opt.status}
                      </span>
                      {opt.cabinNote ? <p className="mt-1 text-xs text-zinc-400">{opt.cabinNote}</p> : null}
                    </td>
                    <td className="px-2 py-3 align-top text-zinc-200">{opt.aircraft}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 7x24 delay heatmap */}
        <section className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Delay heatmap</p>
              <h3 className="text-lg font-semibold text-white">Average delay by day + hour</h3>
              <p className="text-xs text-zinc-400">GitHub-style grid — darker red = longer delays</p>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-zinc-400">
              <span className="h-3 w-3 rounded" style={{ backgroundColor: heatColor(0) }} />
              <span>On time</span>
              <span className="h-3 w-3 rounded" style={{ backgroundColor: heatColor(20) }} />
              <span>+20m</span>
              <span className="h-3 w-3 rounded" style={{ backgroundColor: heatColor(40) }} />
              <span>+40m</span>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-[60px_repeat(24,minmax(0,1fr))] gap-1 text-[11px] text-zinc-500">
                <div />
                {Array.from({ length: 24 }).map((_, hour) => (
                  <div key={hour} className="text-center">
                    {hour % 3 === 0 ? hour : ""}
                  </div>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-[60px_repeat(24,minmax(0,1fr))] gap-1">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, dayIndex) => (
                  <Fragment key={day}>
                    <div className="flex items-center justify-end pr-2 text-[12px] text-zinc-400">{day}</div>
                    {heatmap[dayIndex]?.map((minutes, hour) => (
                      <div
                        key={`${day}-${hour}`}
                        title={`${day} ${hour}:00 — avg delay ${minutes}m`}
                        className="h-4 w-full rounded-sm border border-white/5"
                        style={{ backgroundColor: heatColor(minutes) }}
                      />
                    ))}
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Skywards Silver benefits */}
        <section className="rounded-3xl border border-white/10 bg-gradient-to-r from-white/5 via-white/10 to-white/5 p-4 shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Skywards Silver</p>
              <h3 className="text-lg font-semibold text-white">Quick benefit check</h3>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-zinc-200 ring-1 ring-white/10">
              Applies to Emirates + Virgin codeshares on these routes
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-400">Core perks</p>
              <ul className="mt-2 space-y-1 text-sm text-zinc-200">
                <li>+12kg checked bag (or +1 piece)</li>
                <li>Business Class lounge access at DXB T3 when flying Emirates</li>
                <li>25% Tier Miles bonus on flown miles</li>
                <li>Free seat selection in standard zone</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-400">DXB → BOM</p>
              <ul className="mt-2 space-y-1 text-sm text-zinc-200">
                <li>Gates B10–B20 usually; lounge walk ~6–8 min</li>
                <li>Early check-in at T3 Zone 2; BOM arrival T2 makes baggage priority useful</li>
                <li>Best value: EK500 evening wave — shorter security lines</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-400">DXB → LHR</p>
              <ul className="mt-2 space-y-1 text-sm text-zinc-200">
                <li>A380 upper-deck lounge access; showers at A-concourse close to A7</li>
                <li>LHR arrivals: Silver keeps fast-track when available (T3 partners often include)</li>
                <li>Choose earlier slots (EK1) to beat stack delays; Silver excess baggage helps winter kit</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
