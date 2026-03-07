# FlyDubai DXB→BEG Route Monitor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Gulf Corridor Watch crisis dashboard with a single-purpose FlyDubai DXB→BEG flight route monitor showing real-time schedule status and a live map for airborne flights.

**Architecture:** Surgical rebuild — keep `lib/flightradar.ts`, `lib/flight-schedules.ts`, `lib/supabase.ts`, `lib/supabase-browser.ts`, `lib/cron-auth.ts`, and existing DB tables. Delete everything else. Build one cron endpoint, one API route, one page with flight cards, and a Leaflet map component.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4, Supabase PostgreSQL, Flightradar24 API, Leaflet.js

**Design doc:** `docs/plans/2026-03-07-route-monitor-design.md`

---

## Task 1: Delete all non-essential files

**Files:**
- Delete: All files in `app/api/` except keep the directory itself
- Delete: All files in `app/components/`
- Delete: `app/page.tsx`, `app/ask/`, `app/auth/`, `app/settings/`
- Delete: All files in `lib/` EXCEPT: `flightradar.ts`, `flight-schedules.ts`, `supabase.ts`, `supabase-browser.ts`, `cron-auth.ts`
- Keep: `app/layout.tsx`, `app/globals.css`, `app/favicon.ico`

**Step 1: Delete lib files that are no longer needed**

```bash
cd /Users/conorogle/Development/gulf-corridor-watch
# Delete all lib files except the 5 we keep
find lib -maxdepth 1 -type f \
  ! -name 'flightradar.ts' \
  ! -name 'flight-schedules.ts' \
  ! -name 'supabase.ts' \
  ! -name 'supabase-browser.ts' \
  ! -name 'cron-auth.ts' \
  -delete
# Delete lib subdirectories
rm -rf lib/trusted-feed
```

**Step 2: Delete app directories and files no longer needed**

```bash
rm -rf app/api app/components app/ask app/auth app/settings app/page.tsx
```

**Step 3: Clean up package.json — remove unused dependencies**

Remove from `dependencies`: `@anthropic-ai/sdk`, `@vercel/kv`, `fast-xml-parser`, `openai`, `react-markdown`, `remark-gfm`

Keep: `@supabase/supabase-js`, `date-fns`, `next`, `react`, `react-dom`

Add: `leaflet` (for map), `@types/leaflet` (devDependency)

Updated package.json dependencies:

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.98.0",
    "date-fns": "^4.1.0",
    "leaflet": "^1.9.4",
    "next": "16.1.6",
    "react": "19.2.3",
    "react-dom": "19.2.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/leaflet": "^1.9.8",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.1.6",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

**Step 4: Run `npm install` to sync lockfile**

```bash
npm install
```

**Step 5: Simplify `app/layout.tsx`**

Replace entire content with a clean dark-theme layout. Remove `AuthProvider`, `HeartbeatProvider` imports (files are deleted). Update metadata for route monitor.

```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlyDubai DXB → BEG — Route Monitor",
  description:
    "Live flight status for FlyDubai routes from Dubai to Belgrade. Delays, cancellations, and live tracking.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-gray-950 text-gray-100 antialiased">
        {children}
      </body>
    </html>
  );
}
```

**Step 6: Replace `app/globals.css` with minimal dark-theme styles**

```css
@import "tailwindcss";

@theme inline {
  --font-sans: "DM Sans", system-ui, sans-serif;
}

@layer base {
  body {
    font-family: "DM Sans", system-ui, sans-serif;
  }
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.animate-pulse-dot {
  animation: pulse-dot 2s ease-in-out infinite;
}
```

**Step 7: Update `vercel.json` — replace all crons with route-monitor**

```json
{
  "crons": [
    { "path": "/api/cron/route-monitor", "schedule": "*/5 * * * *" }
  ],
  "functions": {
    "app/api/cron/route-monitor/route.ts": {
      "maxDuration": 30
    }
  }
}
```

**Step 8: Verify the build compiles with no pages**

Create a placeholder `app/page.tsx`:

```tsx
export default function Home() {
  return <main className="p-8"><h1 className="text-2xl font-bold">Route Monitor</h1><p className="mt-2 text-gray-400">Coming soon...</p></main>;
}
```

```bash
npm run build
```

Expected: Build succeeds with no errors.

**Step 9: Commit**

```bash
git add -A
git commit -m "chore: strip to route-monitor skeleton

Remove all crisis dashboard code. Keep only FR24 flight
libraries, Supabase clients, and cron auth. Add leaflet."
```

---

## Task 2: Build the cron endpoint

**Files:**
- Create: `app/api/cron/route-monitor/route.ts`

**Step 1: Write the cron route**

This endpoint:
1. Checks cron auth
2. Fetches DXB departure board from FR24
3. Filters to FlyDubai (FZ) flights going to BEG
4. Upserts matching rows into `flight_schedules`
5. Fetches live positions from FR24
6. Filters to FZ flights with destination BEG
7. Inserts matching rows into `flight_observations`

```ts
import { getSupabaseAdmin } from "@/lib/supabase";
import { fetchAirportBoard } from "@/lib/flight-schedules";
import { ingestAirports } from "@/lib/flightradar";
import { isCronAuthorized } from "@/lib/cron-auth";

export const maxDuration = 30;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  let scheduleCount = 0;
  let observationCount = 0;

  try {
    // 1. Fetch DXB departure board and filter to FZ → BEG
    const departures = await fetchAirportBoard("DXB", "departure");
    const fzBeg = departures.filter(
      (f) =>
        f.flight_number.startsWith("FZ") &&
        f.destination_iata === "BEG"
    );

    if (fzBeg.length > 0) {
      const { error } = await supabase
        .from("flight_schedules")
        .upsert(fzBeg, {
          onConflict: "airport,board_type,flight_number,scheduled_time",
        });
      if (error) throw error;
      scheduleCount = fzBeg.length;
    }

    // 2. Fetch live positions and filter to FZ → BEG
    if (process.env.FLIGHTRADAR_KEY) {
      try {
        const allObs = await ingestAirports(["DXB"]);
        const fzBegObs = allObs.filter(
          (o) =>
            o.flight_number.startsWith("FZ") &&
            o.destination_iata === "BEG"
        );

        if (fzBegObs.length > 0) {
          const { error } = await supabase
            .from("flight_observations")
            .insert(fzBegObs);
          if (error) throw error;
          observationCount = fzBegObs.length;
        }
      } catch (err) {
        console.error("Live position fetch failed:", err);
      }
    }

    return Response.json({
      ok: true,
      schedules: scheduleCount,
      observations: observationCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Route monitor cron failed:", error);
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
```

**Step 2: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

**Step 3: Commit**

```bash
git add app/api/cron/route-monitor/route.ts
git commit -m "feat: add route-monitor cron endpoint

Fetches DXB departure board and live positions every 5min,
filtered to FlyDubai flights bound for Belgrade."
```

---

## Task 3: Build the flights API route

**Files:**
- Create: `app/api/flights/route.ts`

This returns JSON with:
- `schedules`: FZ→BEG flights from `flight_schedules` (24h back, 48h forward)
- `livePositions`: FZ→BEG from `flight_observations` (last 10 min)

**Step 1: Write the API route**

```ts
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const past24h = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
  const future48h = new Date(now.getTime() + 48 * 60 * 60_000).toISOString();
  const recent10m = new Date(now.getTime() - 10 * 60_000).toISOString();

  const [schedResult, obsResult] = await Promise.all([
    supabase
      .from("flight_schedules")
      .select("*")
      .eq("airport", "DXB")
      .eq("board_type", "departure")
      .like("flight_number", "FZ%")
      .eq("destination_iata", "BEG")
      .gte("scheduled_time", past24h)
      .lte("scheduled_time", future48h)
      .order("scheduled_time", { ascending: true }),

    supabase
      .from("flight_observations")
      .select("*")
      .like("flight_number", "FZ%")
      .eq("destination_iata", "BEG")
      .gte("fetched_at", recent10m)
      .order("fetched_at", { ascending: false }),
  ]);

  if (schedResult.error) {
    return Response.json(
      { error: String(schedResult.error) },
      { status: 500 }
    );
  }

  return Response.json({
    schedules: schedResult.data ?? [],
    livePositions: obsResult.data ?? [],
    queriedAt: now.toISOString(),
  });
}
```

**Step 2: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

**Step 3: Commit**

```bash
git add app/api/flights/route.ts
git commit -m "feat: add flights API route

Returns FZ→BEG schedule data (24h back, 48h forward) and
live positions (last 10min) as JSON for client polling."
```

---

## Task 4: Build the flight card component

**Files:**
- Create: `app/components/flight-card.tsx`

**Step 1: Write the flight card**

Displays a single flight's status. Pure presentational component — no data fetching.

```tsx
"use client";

import { formatInTimeZone } from "date-fns/fp";

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
  // Gulf Standard Time = UTC+4
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
```

Note: The `date-fns/fp` import in the type declaration at the top is unused — remove it. The component uses native `toLocaleString` with `Asia/Dubai` timezone, which is simpler and doesn't need date-fns.

**Step 2: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

**Step 3: Commit**

```bash
git add app/components/flight-card.tsx
git commit -m "feat: add FlightCard component

Displays flight number, scheduled/estimated/actual times,
status pill, gate/terminal. Dark theme, mobile-friendly."
```

---

## Task 5: Build the Leaflet map component

**Files:**
- Create: `app/components/flight-map.tsx`

This is a client component that shows a map with the great circle route DXB→BEG and an aircraft marker at the live position.

**Step 1: Write the map component**

```tsx
"use client";

import { useEffect, useRef } from "react";

type Props = {
  lat: number;
  lon: number;
  flightNumber: string;
};

// DXB and BEG coordinates
const DXB = { lat: 25.2528, lon: 55.3644 };
const BEG = { lat: 44.8184, lon: 20.3091 };

function progressPercent(lat: number, lon: number): number {
  const totalDist = Math.sqrt(
    (BEG.lat - DXB.lat) ** 2 + (BEG.lon - DXB.lon) ** 2
  );
  const coveredDist = Math.sqrt(
    (lat - DXB.lat) ** 2 + (lon - DXB.lon) ** 2
  );
  return Math.min(100, Math.round((coveredDist / totalDist) * 100));
}

export function FlightMap({ lat, lon, flightNumber }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    // Dynamic import to avoid SSR issues with Leaflet
    import("leaflet").then((L) => {
      // Import Leaflet CSS
      if (!document.querySelector('link[href*="leaflet.css"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      // Clean up previous map instance
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as L.Map).remove();
      }

      const map = L.map(mapRef.current!, {
        zoomControl: false,
        attributionControl: false,
      }).setView([lat, lon], 5);

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        maxZoom: 18,
      }).addTo(map);

      // Route line DXB → BEG
      L.polyline(
        [
          [DXB.lat, DXB.lon],
          [BEG.lat, BEG.lon],
        ],
        { color: "#3B82F6", weight: 2, opacity: 0.5, dashArray: "8 4" }
      ).addTo(map);

      // DXB marker
      L.circleMarker([DXB.lat, DXB.lon], {
        radius: 5,
        color: "#6B7280",
        fillColor: "#6B7280",
        fillOpacity: 1,
      })
        .bindTooltip("DXB", { permanent: true, direction: "bottom", className: "map-label" })
        .addTo(map);

      // BEG marker
      L.circleMarker([BEG.lat, BEG.lon], {
        radius: 5,
        color: "#6B7280",
        fillColor: "#6B7280",
        fillOpacity: 1,
      })
        .bindTooltip("BEG", { permanent: true, direction: "bottom", className: "map-label" })
        .addTo(map);

      // Aircraft marker
      const aircraftIcon = L.divIcon({
        html: `<div style="font-size: 20px; filter: drop-shadow(0 0 4px rgba(59,130,246,0.6));">✈</div>`,
        className: "",
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      L.marker([lat, lon], { icon: aircraftIcon })
        .bindTooltip(flightNumber, { permanent: true, direction: "top", className: "map-label" })
        .addTo(map);

      // Fit bounds to show full route
      map.fitBounds(
        L.latLngBounds([DXB.lat, DXB.lon], [BEG.lat, BEG.lon]).pad(0.15)
      );

      mapInstanceRef.current = map;
    });

    return () => {
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove();
        mapInstanceRef.current = null;
      }
    };
  }, [lat, lon, flightNumber]);

  const progress = progressPercent(lat, lon);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
      <div ref={mapRef} className="h-64 w-full" />
      <div className="flex items-center justify-between px-4 py-2 text-sm">
        <span className="text-gray-400">
          {flightNumber} — {progress}% of route
        </span>
        <span className="text-blue-400 animate-pulse-dot">Live tracking</span>
      </div>
    </div>
  );
}
```

**Step 2: Add map label styles to `globals.css`**

Append to `globals.css`:

```css
.map-label {
  background: rgba(17, 24, 39, 0.85) !important;
  border: 1px solid #374151 !important;
  border-radius: 4px !important;
  color: #d1d5db !important;
  font-family: "DM Sans", system-ui, sans-serif !important;
  font-size: 11px !important;
  padding: 2px 6px !important;
  box-shadow: none !important;
}

.map-label::before {
  display: none !important;
}
```

**Step 3: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

**Step 4: Commit**

```bash
git add app/components/flight-map.tsx app/globals.css
git commit -m "feat: add FlightMap component

Leaflet map with DXB→BEG route line and aircraft marker.
Dark CARTO tiles, progress percentage, dynamic import for SSR."
```

---

## Task 6: Build the main page with auto-refresh

**Files:**
- Create: `app/components/route-monitor.tsx` (client component with polling)
- Modify: `app/page.tsx` (server component, initial data load)

**Step 1: Write the client component (`route-monitor.tsx`)**

This component:
- Receives initial data from SSR
- Polls `/api/flights` every 60 seconds
- Renders the header, flight cards, and map

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { FlightCard } from "./flight-card";
import { FlightMap } from "./flight-map";

type Schedule = {
  flight_number: string;
  scheduled_time: string;
  estimated_time: string | null;
  actual_time: string | null;
  status: string;
  is_delayed: boolean;
  delay_minutes: number | null;
  is_cancelled: boolean;
  gate: string | null;
  terminal: string | null;
};

type LivePosition = {
  flight_number: string;
  status: string;
  raw_payload: {
    lat: number;
    lon: number;
  } | null;
};

type FlightsResponse = {
  schedules: Schedule[];
  livePositions: LivePosition[];
  queriedAt: string;
};

type Props = {
  initial: FlightsResponse;
};

export function RouteMonitor({ initial }: Props) {
  const [data, setData] = useState<FlightsResponse>(initial);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [stale, setStale] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/flights");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as FlightsResponse;
      setData(json);
      setLastRefresh(new Date());
      setStale(false);
    } catch {
      setStale(true);
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const now = new Date();
  const upcoming = data.schedules.filter(
    (s) => new Date(s.scheduled_time) > now || ["boarding", "departed"].includes(s.status)
  );
  const past = data.schedules.filter(
    (s) => new Date(s.scheduled_time) <= now && !["boarding", "departed"].includes(s.status)
  );

  // Find airborne flight with position
  const airborne = data.livePositions.find(
    (p) =>
      p.raw_payload?.lat != null &&
      p.raw_payload?.lon != null &&
      ["airborne", "cruise", "departure"].includes(p.status)
  );

  const onTimeCount = upcoming.filter(
    (s) => !s.is_delayed && !s.is_cancelled
  ).length;
  const delayedCount = upcoming.filter((s) => s.is_delayed).length;
  const cancelledCount = upcoming.filter((s) => s.is_cancelled).length;

  function summaryText(): string {
    const parts: string[] = [];
    if (upcoming.length === 0) return "No upcoming flights found";
    parts.push(`${upcoming.length} flight${upcoming.length !== 1 ? "s" : ""} in next 48hrs`);
    const details: string[] = [];
    if (onTimeCount > 0) details.push(`${onTimeCount} on time`);
    if (delayedCount > 0) details.push(`${delayedCount} delayed`);
    if (cancelledCount > 0) details.push(`${cancelledCount} cancelled`);
    if (details.length > 0) parts.push(details.join(", "));
    return parts.join(" — ");
  }

  const airborneFlights = data.livePositions.filter(
    (p) => ["airborne", "cruise", "departure"].includes(p.status)
  );

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <span className="rounded bg-purple-900/60 px-2 py-0.5 text-xs font-semibold text-purple-300">
            FlyDubai
          </span>
          <h1 className="text-xl font-bold text-white">DXB → BEG</h1>
        </div>
        <p className="mt-2 text-sm text-gray-300">{summaryText()}</p>
        <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
          <span>
            Updated{" "}
            {lastRefresh.toLocaleTimeString("en-GB", {
              timeZone: "Asia/Dubai",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            GST
          </span>
          {stale && (
            <span className="rounded bg-amber-900/40 px-2 py-0.5 text-amber-400">
              Stale data — refresh failed
            </span>
          )}
          {!stale && (
            <span className="text-green-600">●</span>
          )}
        </div>
      </div>

      {/* Map (only if airborne) */}
      {airborne?.raw_payload && (
        <div className="mb-4">
          <FlightMap
            lat={airborne.raw_payload.lat}
            lon={airborne.raw_payload.lon}
            flightNumber={airborne.flight_number}
          />
        </div>
      )}

      {/* Upcoming flights */}
      {upcoming.length > 0 && (
        <div className="space-y-3">
          {upcoming.map((s) => (
            <FlightCard
              key={`${s.flight_number}-${s.scheduled_time}`}
              flightNumber={s.flight_number}
              scheduledTime={s.scheduled_time}
              estimatedTime={s.estimated_time}
              actualTime={s.actual_time}
              status={s.status as any}
              isDelayed={s.is_delayed}
              delayMinutes={s.delay_minutes}
              isCancelled={s.is_cancelled}
              gate={s.gate}
              terminal={s.terminal}
              isAirborne={airborneFlights.some(
                (a) => a.flight_number === s.flight_number
              )}
              isPast={false}
            />
          ))}
        </div>
      )}

      {/* No flights message */}
      {upcoming.length === 0 && past.length === 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
          <p className="text-lg text-gray-300">
            No FlyDubai flights to Belgrade found
          </p>
          <p className="mt-2 text-sm text-gray-500">
            This could mean the route isn&apos;t currently scheduled, or data
            hasn&apos;t been collected yet. The cron runs every 5 minutes.
          </p>
        </div>
      )}

      {/* Past flights (history) */}
      {past.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
            Recent history
          </h2>
          <div className="space-y-3">
            {past.map((s) => (
              <FlightCard
                key={`${s.flight_number}-${s.scheduled_time}`}
                flightNumber={s.flight_number}
                scheduledTime={s.scheduled_time}
                estimatedTime={s.estimated_time}
                actualTime={s.actual_time}
                status={s.status as any}
                isDelayed={s.is_delayed}
                delayMinutes={s.delay_minutes}
                isCancelled={s.is_cancelled}
                gate={s.gate}
                terminal={s.terminal}
                isAirborne={false}
                isPast={true}
              />
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-8 border-t border-gray-800 pt-4 text-center text-xs text-gray-600">
        <p>Data from Flightradar24. Refreshes every 5 minutes.</p>
        <p className="mt-1">Times shown in Gulf Standard Time (GST / UTC+4).</p>
      </footer>
    </main>
  );
}
```

**Step 2: Write the server page (`app/page.tsx`)**

Replace the placeholder:

```tsx
import { getSupabaseAdmin } from "@/lib/supabase";
import { RouteMonitor } from "./components/route-monitor";

export const dynamic = "force-dynamic";

async function loadInitialData() {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const past24h = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
  const future48h = new Date(now.getTime() + 48 * 60 * 60_000).toISOString();
  const recent10m = new Date(now.getTime() - 10 * 60_000).toISOString();

  const [schedResult, obsResult] = await Promise.all([
    supabase
      .from("flight_schedules")
      .select("*")
      .eq("airport", "DXB")
      .eq("board_type", "departure")
      .like("flight_number", "FZ%")
      .eq("destination_iata", "BEG")
      .gte("scheduled_time", past24h)
      .lte("scheduled_time", future48h)
      .order("scheduled_time", { ascending: true }),

    supabase
      .from("flight_observations")
      .select("*")
      .like("flight_number", "FZ%")
      .eq("destination_iata", "BEG")
      .gte("fetched_at", recent10m)
      .order("fetched_at", { ascending: false }),
  ]);

  return {
    schedules: schedResult.data ?? [],
    livePositions: obsResult.data ?? [],
    queriedAt: now.toISOString(),
  };
}

export default async function Home() {
  const initial = await loadInitialData();

  return <RouteMonitor initial={initial} />;
}
```

**Step 3: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

**Step 4: Commit**

```bash
git add app/page.tsx app/components/route-monitor.tsx
git commit -m "feat: add main page with auto-refresh timeline

SSR initial load + 60s client polling. Flight cards for
upcoming/past flights, live map when airborne, stale data warning."
```

---

## Task 7: Verify end-to-end locally

**Step 1: Start dev server**

```bash
npm run dev
```

**Step 2: Open http://localhost:3000 in browser**

Verify:
- Page loads with dark theme
- Header shows "FlyDubai DXB → BEG"
- Either flight cards appear (if there's data in the DB) or the "No flights found" message shows
- No console errors
- Footer shows data attribution

**Step 3: Test cron endpoint**

```bash
curl "http://localhost:3000/api/cron/route-monitor"
```

Expected: JSON response with `ok: true` and counts (may be 0 if no FZ→BEG flights at this moment).

**Step 4: Test flights API**

```bash
curl "http://localhost:3000/api/flights"
```

Expected: JSON with `schedules`, `livePositions`, `queriedAt` fields.

**Step 5: Production build check**

```bash
npm run build
```

Expected: Build succeeds with no errors.

**Step 6: Commit any fixes if needed**

```bash
git add -A
git commit -m "fix: address build/runtime issues from integration test"
```

---

## Task 8: Deploy

**Step 1: Deploy to Vercel**

```bash
vercel --prod --yes
```

Expected: Deploy succeeds. The new cron schedule (`*/5 * * * *` for route-monitor) takes effect.

**Step 2: Verify production**

Open https://keepcalmandcarryon.help and verify:
- Dark theme loads
- Header and footer visible
- No JS errors in console
- Auto-refresh working (check Network tab for `/api/flights` calls every 60s)

**Step 3: Trigger a manual cron run to populate data**

```bash
curl "https://keepcalmandcarryon.help/api/cron/route-monitor?key=$INGEST_SECRET"
```

Expected: `{ "ok": true, "schedules": N, ... }`

**Step 4: Commit final state**

```bash
git add -A
git commit -m "chore: deploy route monitor to production"
```

---

## Summary of commits

| # | Message | What |
|---|---------|------|
| 1 | `chore: strip to route-monitor skeleton` | Delete old code, add leaflet, clean layout |
| 2 | `feat: add route-monitor cron endpoint` | 5-min cron for FZ→BEG data |
| 3 | `feat: add flights API route` | JSON endpoint for client polling |
| 4 | `feat: add FlightCard component` | Flight status card UI |
| 5 | `feat: add FlightMap component` | Leaflet map with aircraft tracking |
| 6 | `feat: add main page with auto-refresh timeline` | Full page assembly |
| 7 | `fix: (if needed)` | Integration test fixes |
| 8 | `chore: deploy route monitor to production` | Ship it |
