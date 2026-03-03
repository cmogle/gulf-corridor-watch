# Editorial Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the presentation layer of keepcalmandcarryon.help from a developer dashboard into a modern editorial crisis-information experience, while preserving all backend APIs and data pipelines unchanged.

**Architecture:** Replace the monolithic `app/page.tsx` with composable components (status-hero, unified-query, situation-briefing, flight-pulse, updates-feed, resources-panel, source-health). Merge the separate flight search widget and omnipresent chat into a single unified query component. Add new sources to the ingestion registry. Mobile-first, no sidebar layout.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS 4, Google Fonts (DM Serif Display, DM Sans), existing Supabase + OpenAI backend.

**Design doc:** `docs/plans/2026-03-03-editorial-redesign-design.md`

---

### Task 1: Design System Foundation — globals.css + layout.tsx

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

**Step 1: Rewrite globals.css with new design tokens**

Replace the entire contents of `app/globals.css` with:

```css
@import "tailwindcss";

:root {
  --surface-dark: #111827;
  --surface-dark-heightened: #7C2D12;
  --surface-dark-unclear: #1E293B;
  --surface-light: #FAFAF9;
  --card: #FFFFFF;
  --primary-blue: #2563EB;
  --amber: #D97706;
  --red: #DC2626;
  --green: #16A34A;
  --text-primary: #111827;
  --text-secondary: #6B7280;
  --text-on-dark: #F9FAFB;
  --text-on-dark-muted: rgba(249, 250, 251, 0.6);
}

@theme inline {
  --color-background: var(--surface-light);
  --color-foreground: var(--text-primary);
  --font-sans: "DM Sans", system-ui, sans-serif;
  --font-serif: "DM Serif Display", Georgia, serif;
  --font-mono: "JetBrains Mono", "Fira Code", monospace;
}

body {
  background: var(--surface-light);
  color: var(--text-primary);
  font-family: "DM Sans", system-ui, sans-serif;
}

* {
  border-color: #E5E7EB;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.animate-pulse-dot {
  animation: pulse-dot 2.5s ease-in-out infinite;
}

@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-fade-in-up {
  animation: fade-in-up 0.3s ease-out forwards;
}
```

**Step 2: Update layout.tsx with Google Fonts and metadata**

Replace the entire contents of `app/layout.tsx` with:

```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Keep Calm & Carry On — UAE Airspace & Travel Status",
  description:
    "Live UAE airspace status, flight tracking, and official advisories for residents and travellers during the current crisis.",
  openGraph: {
    title: "Keep Calm & Carry On — UAE Airspace Status",
    description:
      "Live flight data, official advisories, and AI-powered answers for UAE residents and stranded travellers.",
    siteName: "keepcalmandcarryon.help",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,400&family=DM+Serif+Display&family=JetBrains+Mono:wght@400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
```

**Step 3: Build and verify no errors**

Run: `cd /Users/monkeyclaw/gulf-corridor-watch && npm run build 2>&1 | tail -20`
Expected: Build succeeds (page.tsx still uses old components but should compile)

**Step 4: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat: new design system — DM Sans/Serif, editorial colour tokens, animations"
```

---

### Task 2: Unified Query Component

This is the core interaction component — merges flight search widget and GPT chat into one input.

**Files:**
- Create: `app/components/unified-query.tsx`

**Step 1: Create the unified query component**

```tsx
"use client";

import { useMemo, useState } from "react";
import { parseFlightIntent } from "@/lib/flight-query";
import { addTrackedFlight, addTrackedRoute, loadTracking } from "@/lib/tracking-local";

type FlightResult = {
  ok: boolean;
  mode?: "structured_only" | "explain";
  source?: "cache" | "live" | "none" | "advisory";
  error?: string;
  explanation?: string | null;
  summary?: { total: number; delayed: number; cancelled: number; latest_fetch: string | null };
  insight?: {
    type: "likelihood" | "status";
    headline: string;
    summary: string;
    confidence: "low" | "medium" | "high";
    horizon_hours: number;
    score: number | null;
  } | null;
  flights?: Array<{
    flight_number: string;
    airport: string;
    origin_iata: string | null;
    destination_iata: string | null;
    status: string;
    is_delayed: boolean;
    delay_minutes: number | null;
    fetched_at: string;
  }>;
  normalized_intent?: {
    type: "flight_number" | "route" | "unknown";
    flight_number?: string;
    origin_iata?: string | null;
    destination_iata?: string | null;
  };
};

type ChatResult = {
  ok: boolean;
  answer?: string;
  error?: string;
  mode?: string;
  summary?: { total?: number; delayed?: number; cancelled?: number; latest_fetch?: string | null };
};

type QueryResult =
  | { type: "flight"; data: FlightResult }
  | { type: "chat"; data: ChatResult }
  | null;

type Props = {
  suggestedPrompts?: string[];
  variant?: "hero" | "standalone";
};

const DEFAULT_PROMPTS = [
  "Can I fly to Dubai?",
  "DXB delays right now",
  "Is it safe in the UAE?",
  "EK511 status",
];

export function UnifiedQuery({ suggestedPrompts = [], variant = "hero" }: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult>(null);
  const [trackNotice, setTrackNotice] = useState<string | null>(null);

  const chips = suggestedPrompts.length > 0
    ? [...new Set([...suggestedPrompts, ...DEFAULT_PROMPTS])].slice(0, 6)
    : DEFAULT_PROMPTS;

  const isOnDark = variant === "hero";

  async function submit() {
    const question = input.trim();
    if (!question || loading) return;
    setLoading(true);
    setResult(null);
    setTrackNotice(null);

    const intent = parseFlightIntent(question);

    if (intent.type !== "unknown") {
      try {
        const res = await fetch("/api/flights/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: question, mode: "structured_only", allowLive: false }),
        });
        const json = (await res.json()) as FlightResult;
        setResult({ type: "flight", data: json });

        if (json.ok && (json.summary?.total ?? 0) === 0) {
          const liveRes = await fetch("/api/flights/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: question, mode: "structured_only", allowLive: true }),
          });
          const liveJson = (await liveRes.json()) as FlightResult;
          setResult({ type: "flight", data: liveJson });
        }
      } catch {
        setResult({ type: "flight", data: { ok: false, error: "Request failed" } });
      }
    } else {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question }),
        });
        const json = (await res.json()) as ChatResult;
        setResult({ type: "chat", data: json });
      } catch {
        setResult({ type: "chat", data: { ok: false, error: "Request failed" } });
      }
    }

    setLoading(false);
  }

  const trackIntent = useMemo(() => {
    if (result?.type !== "flight" || !result.data.ok || !result.data.normalized_intent) return null;
    const ni = result.data.normalized_intent;
    if (ni.type === "flight_number" && ni.flight_number) return { kind: "flight" as const, flight_number: ni.flight_number };
    if (ni.type === "route" && ni.origin_iata && ni.destination_iata) {
      return { kind: "route" as const, origin_iata: ni.origin_iata, destination_iata: ni.destination_iata };
    }
    return null;
  }, [result]);

  function handleTrack() {
    if (!trackIntent) return;
    if (trackIntent.kind === "flight") {
      addTrackedFlight(trackIntent.flight_number);
      setTrackNotice(`Tracking ${trackIntent.flight_number}`);
    } else {
      addTrackedRoute(trackIntent.origin_iata, trackIntent.destination_iata);
      setTrackNotice(`Tracking ${trackIntent.origin_iata} → ${trackIntent.destination_iata}`);
    }
  }

  function clear() {
    setResult(null);
    setInput("");
    setTrackNotice(null);
  }

  const textClass = isOnDark ? "text-[var(--text-on-dark)]" : "text-[var(--text-primary)]";
  const mutedClass = isOnDark ? "text-[var(--text-on-dark-muted)]" : "text-[var(--text-secondary)]";

  return (
    <div className="w-full space-y-3">
      <div className="relative">
        <input
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setResult(null); setTrackNotice(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
          placeholder="Ask anything — flights, routes, safety, advisories..."
          className="w-full rounded-xl border-0 bg-white px-4 py-3.5 text-[15px] text-[var(--text-primary)] shadow-lg outline-none ring-2 ring-transparent placeholder:text-[var(--text-secondary)] focus:ring-[var(--primary-blue)]"
          aria-label="Search flights, routes, or ask a question"
        />
        {input.trim() && (
          <button
            onClick={() => void submit()}
            disabled={loading}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-[var(--surface-dark)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "..." : "Ask"}
          </button>
        )}
      </div>

      {!result && (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip}
              onClick={() => { setInput(chip); setResult(null); }}
              className={`rounded-full border px-3 py-1.5 text-[13px] transition ${
                isOnDark
                  ? "border-white/20 text-white/80 hover:bg-white/10"
                  : "border-gray-300 text-[var(--text-secondary)] hover:bg-gray-100"
              }`}
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {result && (
        <div className="animate-fade-in-up space-y-3">
          {result.type === "flight" && result.data.ok && result.data.insight && (
            <div className={`rounded-xl p-4 ${
              (result.data.insight.score ?? 0) >= 70
                ? "bg-emerald-900/30 border border-emerald-500/30"
                : (result.data.insight.score ?? 0) >= 45
                  ? "bg-amber-900/30 border border-amber-500/30"
                  : "bg-red-900/30 border border-red-500/30"
            }`}>
              <div className="flex items-start justify-between gap-3">
                <p className={`font-medium ${textClass}`}>{result.data.insight.headline}</p>
                {result.data.insight.score != null && (
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-bold ${
                    result.data.insight.score >= 70 ? "bg-emerald-500/20 text-emerald-300"
                    : result.data.insight.score >= 45 ? "bg-amber-500/20 text-amber-300"
                    : "bg-red-500/20 text-red-300"
                  }`}>{result.data.insight.score}/100</span>
                )}
              </div>
              <p className={`mt-1 text-sm ${mutedClass}`}>{result.data.insight.summary}</p>
              <p className={`mt-1 text-xs ${mutedClass}`}>
                Confidence: {result.data.insight.confidence.toUpperCase()} · Horizon: {result.data.insight.horizon_hours}h
              </p>
            </div>
          )}

          {result.type === "flight" && result.data.ok && result.data.summary && (
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-lg px-3 py-1.5 text-xs font-mono ${isOnDark ? "bg-white/10 text-white/80" : "bg-gray-100 text-gray-700"}`}>
                {result.data.summary.total} flights
              </span>
              <span className={`rounded-lg px-3 py-1.5 text-xs font-mono ${isOnDark ? "bg-amber-500/20 text-amber-300" : "bg-amber-50 text-amber-700"}`}>
                {result.data.summary.delayed} delayed
              </span>
              <span className={`rounded-lg px-3 py-1.5 text-xs font-mono ${isOnDark ? "bg-red-500/20 text-red-300" : "bg-red-50 text-red-700"}`}>
                {result.data.summary.cancelled} cancelled
              </span>
              {trackIntent && (
                <button onClick={handleTrack} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${isOnDark ? "bg-white/10 text-white hover:bg-white/20" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                  Track {trackIntent.kind === "flight" ? "flight" : "route"}
                </button>
              )}
            </div>
          )}

          {result.type === "flight" && result.data.ok && result.data.flights && result.data.flights.length > 0 && (
            <ul className="space-y-1">
              {result.data.flights.slice(0, 6).map((f) => (
                <li key={`${f.flight_number}-${f.fetched_at}`} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${isOnDark ? "bg-white/5 text-white/90" : "bg-white border border-gray-200"}`}>
                  <span>
                    <span className="font-mono font-medium">{f.flight_number}</span>{" "}
                    <span className={mutedClass}>{f.origin_iata ?? "?"} → {f.destination_iata ?? "?"}</span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${
                    f.is_delayed ? (isOnDark ? "bg-amber-500/20 text-amber-300" : "bg-amber-100 text-amber-800")
                    : (isOnDark ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-800")
                  }`}>{f.status}</span>
                </li>
              ))}
            </ul>
          )}

          {result.type === "chat" && result.data.ok && result.data.answer && (
            <div className={`rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap ${isOnDark ? "bg-white/10 text-white/90" : "bg-white border border-gray-200 text-[var(--text-primary)]"}`}>
              {result.data.answer}
            </div>
          )}

          {result && !result.data.ok && (
            <p className="text-sm text-[var(--red)]">{result.data.error ?? "Something went wrong."}</p>
          )}

          {trackNotice && <p className="text-xs text-[var(--green)]">{trackNotice}</p>}

          <button onClick={clear} className={`text-xs underline ${mutedClass}`}>
            Clear & ask another question
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify the component compiles**

Run: `cd /Users/monkeyclaw/gulf-corridor-watch && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to unified-query.tsx

**Step 3: Commit**

```bash
git add app/components/unified-query.tsx
git commit -m "feat: unified query component — merges flight search + GPT chat"
```

---

### Task 3: Status Hero Component

**Files:**
- Create: `app/components/status-hero.tsx`

**Step 1: Create the status hero component**

This is a server component that receives pre-loaded data as props.

```tsx
import { UnifiedQuery } from "./unified-query";

type AirspacePosture = "normal" | "heightened" | "unclear";

type StatusHeroProps = {
  posture: AirspacePosture;
  briefingSummary: string;
  flightTotal: number;
  flightDelayed: number;
  flightCancelled: number;
  updatedAt: string | null;
  sourceCount: number;
  suggestedPrompts: string[];
};

function PostureDot({ posture }: { posture: AirspacePosture }) {
  const color =
    posture === "normal"
      ? "bg-[var(--green)]"
      : posture === "heightened"
        ? "bg-[var(--amber)]"
        : "bg-[var(--text-secondary)]";
  return (
    <span className={`inline-block h-3 w-3 rounded-full ${color} ${posture !== "normal" ? "animate-pulse-dot" : ""}`} />
  );
}

function postureHeadline(posture: AirspacePosture): string {
  if (posture === "normal") return "UAE Airspace Open";
  if (posture === "heightened") return "Disruptions Reported";
  return "Status Unclear — Data Limited";
}

function postureSubtitle(posture: AirspacePosture): string {
  if (posture === "normal") return "Commercial flights operating from DXB and AUH";
  if (posture === "heightened") return "Delays or advisories detected — check details below";
  return "Some sources are not reporting. Verify official channels directly.";
}

function heroBackground(posture: AirspacePosture): string {
  if (posture === "heightened") return "bg-gradient-to-br from-[var(--surface-dark)] to-[#7C2D12]";
  if (posture === "unclear") return "bg-gradient-to-br from-[var(--surface-dark)] to-[var(--surface-dark-unclear)]";
  return "bg-[var(--surface-dark)]";
}

function relativeTime(iso: string | null): string {
  if (!iso) return "unknown";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return "1 hour ago";
  return `${hours} hours ago`;
}

export function StatusHero({
  posture,
  briefingSummary,
  flightTotal,
  flightDelayed,
  flightCancelled,
  updatedAt,
  sourceCount,
  suggestedPrompts,
}: StatusHeroProps) {
  return (
    <section className={`${heroBackground(posture)} px-4 py-8 md:px-8 md:py-12`}>
      <div className="mx-auto max-w-3xl space-y-6">
        <p className="text-[13px] font-medium uppercase tracking-[0.15em] text-[var(--text-on-dark-muted)]">
          keep calm &amp; carry on
        </p>

        <div className="space-y-2">
          <h1 className="flex items-center gap-3 font-serif text-3xl text-[var(--text-on-dark)] md:text-4xl">
            <PostureDot posture={posture} />
            {postureHeadline(posture)}
          </h1>
          <p className="text-[15px] text-[var(--text-on-dark-muted)]">
            {postureSubtitle(posture)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-sm text-[var(--text-on-dark-muted)]">
          <span>{flightTotal} tracked</span>
          <span className={flightDelayed > 0 ? "text-[var(--amber)]" : ""}>
            {flightDelayed} delayed
          </span>
          <span className={flightCancelled > 0 ? "text-[var(--red)]" : ""}>
            {flightCancelled} cancelled
          </span>
        </div>

        <UnifiedQuery suggestedPrompts={suggestedPrompts} variant="hero" />

        <p className="text-xs text-[var(--text-on-dark-muted)]">
          Updated {relativeTime(updatedAt)} · {sourceCount} sources reporting
        </p>
      </div>
    </section>
  );
}
```

**Step 2: Verify compilation**

Run: `cd /Users/monkeyclaw/gulf-corridor-watch && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add app/components/status-hero.tsx
git commit -m "feat: status hero component with posture-adaptive display"
```

---

### Task 4: Situation Briefing Component

**Files:**
- Create: `app/components/situation-briefing.tsx`

**Step 1: Create the component**

```tsx
type Props = {
  paragraph: string;
  refreshedAt: string;
  confidence: "high" | "medium" | "low";
  sourceCount: number;
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return "1 hour ago";
  return `${hours} hours ago`;
}

function confidenceBadge(confidence: Props["confidence"]) {
  const cls =
    confidence === "high"
      ? "bg-emerald-100 text-emerald-800"
      : confidence === "medium"
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-800";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {confidence} confidence
    </span>
  );
}

export function SituationBriefing({ paragraph, refreshedAt, confidence, sourceCount }: Props) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-8 md:px-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">
        Situation Briefing
      </p>
      {confidence !== "high" && (
        <div className="mt-3 h-px bg-[var(--amber)] opacity-40" />
      )}
      <p className="mt-4 text-base leading-[1.65] text-[var(--text-primary)]">
        {paragraph}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
        <span>Updated {relativeTime(refreshedAt)}</span>
        {confidenceBadge(confidence)}
        <span>{sourceCount} sources</span>
      </div>
    </section>
  );
}
```

**Step 2: Commit**

```bash
git add app/components/situation-briefing.tsx
git commit -m "feat: situation briefing component"
```

---

### Task 5: Flight Pulse Component

**Files:**
- Create: `app/components/flight-pulse.tsx`

**Step 1: Create the component**

```tsx
type AirportPulse = {
  total: number;
  delayed: number;
  cancelled: number;
  latestFetch: string | null;
};

type Props = {
  byAirport: Record<"DXB" | "AUH", AirportPulse>;
  topRoutes: Array<{ route: string; count: number }>;
};

function relativeTime(iso: string | null): string {
  if (!iso) return "n/a";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

export function FlightPulse({ byAirport, topRoutes }: Props) {
  return (
    <section className="mx-auto max-w-4xl px-4 py-8 md:px-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">
        Flight Pulse
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {(["DXB", "AUH"] as const).map((code) => {
          const airport = byAirport[code];
          return (
            <article
              key={code}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <h3 className="font-serif text-2xl">{code}</h3>
              <div className="mt-3 space-y-1 font-mono text-sm">
                <p>
                  <span className="text-[var(--text-secondary)]">Tracked</span>{" "}
                  <span className="font-medium">{airport.total}</span>
                </p>
                <p>
                  <span className="text-[var(--text-secondary)]">Delayed</span>{" "}
                  <span className={`font-medium ${airport.delayed > 0 ? "text-[var(--amber)]" : ""}`}>
                    {airport.delayed}
                  </span>
                </p>
                <p>
                  <span className="text-[var(--text-secondary)]">Cancelled</span>{" "}
                  <span className={`font-medium ${airport.cancelled > 0 ? "text-[var(--red)]" : ""}`}>
                    {airport.cancelled}
                  </span>
                </p>
              </div>
              <p className="mt-3 text-xs text-[var(--text-secondary)]">
                Last data: {relativeTime(airport.latestFetch)}
              </p>
            </article>
          );
        })}
      </div>

      {topRoutes.length > 0 && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
            Top Active Routes
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {topRoutes.map((r) => (
              <span
                key={r.route}
                className="rounded-lg bg-gray-100 px-3 py-1.5 font-mono text-sm text-[var(--text-primary)]"
              >
                {r.route}{" "}
                <span className="text-[var(--text-secondary)]">({r.count})</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
```

**Step 2: Commit**

```bash
git add app/components/flight-pulse.tsx
git commit -m "feat: flight pulse component with airport cards"
```

---

### Task 6: Updates Feed Component

**Files:**
- Create: `app/components/updates-feed.tsx`

**Step 1: Create the redesigned live updates feed**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { UnifiedUpdateItem } from "@/lib/unified-updates-types";

type FeedResponse = {
  ok: boolean;
  error?: string;
  fetched_at?: string;
  items?: UnifiedUpdateItem[];
};

type SourceHistoryResponse = {
  ok: boolean;
  error?: string;
  items?: UnifiedUpdateItem[];
  next_before?: string | null;
};

type FilterOption = "all" | "advisories" | "airlines" | "government";

function statusDotColor(level: string): string {
  if (level === "disrupted") return "bg-[var(--red)]";
  if (level === "advisory") return "bg-[var(--amber)]";
  if (level === "normal") return "bg-[var(--green)]";
  return "bg-gray-400";
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function matchesFilter(item: UnifiedUpdateItem, filter: FilterOption): boolean {
  if (filter === "all") return true;
  if (filter === "advisories") return item.status_level === "advisory" || item.status_level === "disrupted";
  if (filter === "airlines") return item.source_name.toLowerCase().includes("emirates") || item.source_name.toLowerCase().includes("etihad") || item.source_name.toLowerCase().includes("oman air") || item.source_name.toLowerCase().includes("flydubai") || item.source_name.toLowerCase().includes("air arabia") || item.source_name.toLowerCase().includes("qatar");
  if (filter === "government") return !matchesFilter(item, "airlines");
  return true;
}

export function UpdatesFeed({ initialItems }: { initialItems: UnifiedUpdateItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState<FilterOption>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<UnifiedUpdateItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyNextBefore, setHistoryNextBefore] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  const refreshFeed = useCallback(async () => {
    try {
      const res = await fetch("/api/updates/feed?limit=80", { cache: "no-store" });
      const json = (await res.json()) as FeedResponse;
      if (json.ok) {
        setItems(json.items ?? []);
        setLastRefresh(json.fetched_at ?? new Date().toISOString());
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshFeed();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [refreshFeed]);

  async function loadHistory(sourceId: string, append = false) {
    const before = append ? historyNextBefore : null;
    if (!append) { setHistoryItems([]); setHistoryNextBefore(null); }
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({ limit: "25" });
      if (before) params.set("before", before);
      const res = await fetch(`/api/updates/source/${encodeURIComponent(sourceId)}?${params}`, { cache: "no-store" });
      const json = (await res.json()) as SourceHistoryResponse;
      if (json.ok) {
        setHistoryItems((prev) => append ? [...prev, ...(json.items ?? [])] : (json.items ?? []));
        setHistoryNextBefore(json.next_before ?? null);
      }
    } catch { /* silent */ }
    setHistoryLoading(false);
  }

  const filtered = items.filter((item) => matchesFilter(item, filter));
  const filters: { label: string; value: FilterOption }[] = [
    { label: "All", value: "all" },
    { label: "Advisories", value: "advisories" },
    { label: "Airlines", value: "airlines" },
    { label: "Government", value: "government" },
  ];

  return (
    <section className="mx-auto max-w-4xl px-4 py-8 md:px-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">
            Latest Updates
          </p>
          <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse-dot" />
            Live
          </span>
        </div>
        <p className="text-xs text-[var(--text-secondary)]">
          Auto-refresh 60s{lastRefresh ? ` · ${relativeTime(lastRefresh)}` : ""}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              filter === f.value
                ? "bg-[var(--surface-dark)] text-white"
                : "bg-gray-100 text-[var(--text-secondary)] hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {filtered.length === 0 && (
          <p className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-[var(--text-secondary)]">
            No updates match this filter.
          </p>
        )}
        {filtered.map((item) => {
          const itemKey = `${item.update_type}:${item.id}`;
          const isExpanded = expandedId === itemKey;
          return (
            <article
              key={itemKey}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${statusDotColor(item.status_level)}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{item.source_name}</p>
                    <p className="shrink-0 text-xs text-[var(--text-secondary)]">{relativeTime(item.event_at)}</p>
                  </div>
                  <p className="mt-1 text-[15px] font-medium leading-snug">{item.headline}</p>
                  <p className={`mt-1 text-sm text-[var(--text-secondary)] leading-relaxed ${isExpanded ? "" : "line-clamp-2"}`}>
                    {item.summary}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 ${
                      item.update_type === "snapshot" ? "bg-blue-100 text-blue-800" : "bg-indigo-100 text-indigo-800"
                    }`}>
                      {item.update_type === "snapshot" ? "Official" : "Official X"}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 ${
                      item.validation_state === "validated" ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"
                    }`}>
                      {item.validation_state === "validated" ? "Verified" : "Unverified"}
                    </span>
                    <a
                      href={item.original_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--primary-blue)] underline"
                    >
                      Source
                    </a>
                    <button
                      onClick={() => { setExpandedId(isExpanded ? null : itemKey); if (!isExpanded) void loadHistory(item.source_id); }}
                      className="text-[var(--primary-blue)] underline"
                    >
                      {isExpanded ? "Collapse" : "History"}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                      {historyLoading && <p className="text-xs text-[var(--text-secondary)]">Loading...</p>}
                      {historyItems.map((h) => (
                        <div key={`h:${h.update_type}:${h.id}`} className="rounded-lg bg-gray-50 p-3">
                          <p className="text-xs font-medium">{h.headline}</p>
                          <p className="mt-1 text-xs text-[var(--text-secondary)] line-clamp-2">{h.summary}</p>
                          <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{relativeTime(h.event_at)}</p>
                        </div>
                      ))}
                      {historyNextBefore && !historyLoading && (
                        <button
                          onClick={() => void loadHistory(item.source_id, true)}
                          className="text-xs text-[var(--primary-blue)] underline"
                        >
                          Load older
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
```

**Step 2: Commit**

```bash
git add app/components/updates-feed.tsx
git commit -m "feat: editorial updates feed with filters and inline history"
```

---

### Task 7: Resources Panel Component

**Files:**
- Create: `app/components/resources-panel.tsx`

**Step 1: Create the component**

```tsx
import { INDIA_TRANSIT_VISA_LINKS, OFFICIAL_DIRECTORY } from "@/lib/resource-directory";

export function ResourcesPanel() {
  const wellbeing = OFFICIAL_DIRECTORY.filter((e) => e.type === "wellbeing");
  const airlines = OFFICIAL_DIRECTORY.filter((e) => e.type === "airline");
  const govTransport = OFFICIAL_DIRECTORY.filter((e) => e.type === "government" || e.type === "transport");

  return (
    <section className="mx-auto max-w-4xl px-4 py-8 md:px-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">
        Resources &amp; Contacts
      </p>

      {wellbeing.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-[var(--green)]">Emergency &amp; Wellbeing</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {wellbeing.map((entry) => (
              <article key={entry.name} className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="font-medium text-sm">{entry.name}</p>
                {entry.phone && (
                  <a href={`tel:${entry.phone.replace(/\s/g, "")}`} className="mt-1 block text-sm font-mono text-[var(--green)]">
                    {entry.phone}
                  </a>
                )}
                {entry.note && <p className="mt-1 text-xs text-[var(--text-secondary)]">{entry.note}</p>}
                <a href={entry.contactPage} target="_blank" className="mt-2 inline-block text-xs text-[var(--primary-blue)] underline">
                  Official page
                </a>
              </article>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">Airlines</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {airlines.map((entry) => (
            <article key={entry.name} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="font-medium text-sm">{entry.name}</p>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{entry.region}</p>
              {entry.phone && (
                <a href={`tel:${entry.phone.replace(/\s/g, "")}`} className="mt-1 block text-sm font-mono text-[var(--primary-blue)]">
                  {entry.phone}
                </a>
              )}
              <a href={entry.contactPage} target="_blank" className="mt-2 inline-block text-xs text-[var(--primary-blue)] underline">
                Contact page
              </a>
            </article>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">Government &amp; Embassies</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {govTransport.map((entry) => (
            <article key={entry.name} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="font-medium text-sm">{entry.name}</p>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{entry.region}</p>
              {entry.phone && (
                <a href={`tel:${entry.phone.replace(/\s/g, "")}`} className="mt-1 block text-sm font-mono text-[var(--primary-blue)]">
                  {entry.phone}
                </a>
              )}
              <a href={entry.contactPage} target="_blank" className="mt-2 inline-block text-xs text-[var(--primary-blue)] underline">
                Contact page
              </a>
            </article>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">India Transit &amp; Visa</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {INDIA_TRANSIT_VISA_LINKS.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md"
            >
              <p className="text-sm font-medium text-[var(--primary-blue)]">{link.label}</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{link.note}</p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
```

**Step 2: Commit**

```bash
git add app/components/resources-panel.tsx
git commit -m "feat: resources panel with wellbeing, airlines, government contacts"
```

---

### Task 8: Source Health Footer Component

**Files:**
- Create: `app/components/source-health.tsx`

**Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";

type SuppressedSource = {
  source_id: string;
  source_name: string;
  source_url: string;
  reason: string;
};

type Props = {
  totalSources: number;
  healthySources: number;
  suppressedSources: SuppressedSource[];
};

export function SourceHealth({ totalSources, healthySources, suppressedSources }: Props) {
  const [expanded, setExpanded] = useState(false);
  const unavailable = suppressedSources.length;

  return (
    <footer className="border-t border-gray-200 bg-gray-50 px-4 py-4">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--text-secondary)]">
          {healthySources} of {totalSources} sources reporting normally
          {unavailable > 0 && (
            <> · <span className="text-[var(--amber)]">{unavailable} temporarily unavailable</span></>
          )}
        </p>
        {unavailable > 0 && (
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-[var(--primary-blue)] underline">
            {expanded ? "Hide" : "Details"}
          </button>
        )}
      </div>
      {expanded && suppressedSources.length > 0 && (
        <div className="mx-auto mt-3 max-w-4xl">
          <ul className="grid gap-2 sm:grid-cols-2">
            {suppressedSources.map((s) => (
              <li key={s.source_id} className="rounded-lg bg-white p-3 text-xs">
                <p className="font-medium">{s.source_name}</p>
                <p className="text-[var(--text-secondary)]">{s.reason}</p>
                <a href={s.source_url} target="_blank" className="text-[var(--primary-blue)] underline">
                  Check directly
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </footer>
  );
}
```

**Step 2: Commit**

```bash
git add app/components/source-health.tsx
git commit -m "feat: source health footer strip"
```

---

### Task 9: Expand Source Registry

**Files:**
- Modify: `lib/sources.ts`
- Modify: `lib/resource-directory.ts`

**Step 1: Add new sources to lib/sources.ts**

Append these entries to the `OFFICIAL_SOURCES` array, before the closing `];`:

```ts
  {
    id: "flydubai_updates",
    name: "flydubai Travel Updates",
    category: "airline",
    url: "https://www.flydubai.com/en/travel-updates",
    parser: "html",
    connector: "direct_html",
    fallback_connector: "chrome_relay",
    extractor_id: "html_title_text",
    priority: 95,
    freshness_target_minutes: 5,
    x_handles: ["flydubai"],
    region: "UAE",
  },
  {
    id: "air_arabia_updates",
    name: "Air Arabia Travel Updates",
    category: "airline",
    url: "https://www.airarabia.com/en/travel-alerts",
    parser: "html",
    connector: "direct_html",
    fallback_connector: "chrome_relay",
    extractor_id: "html_title_text",
    priority: 85,
    freshness_target_minutes: 10,
    x_handles: ["aaboriginal"],
    region: "UAE",
  },
  {
    id: "qatar_airways_updates",
    name: "Qatar Airways Travel Alerts",
    category: "airline",
    url: "https://www.qatarairways.com/en/travel-alerts.html",
    parser: "html",
    connector: "direct_html",
    fallback_connector: "chrome_relay",
    extractor_id: "html_title_text",
    priority: 80,
    freshness_target_minutes: 10,
    region: "Qatar (transit via Doha)",
  },
  {
    id: "gcaa_uae",
    name: "UAE General Civil Aviation Authority",
    category: "government",
    url: "https://www.gcaa.gov.ae/en/pages/newslist.aspx",
    parser: "html",
    connector: "direct_html",
    fallback_connector: "chrome_relay",
    extractor_id: "html_title_text",
    priority: 96,
    freshness_target_minutes: 5,
    x_handles: ["ABORJALUAE"],
    region: "UAE",
  },
  {
    id: "uk_fcdo_uae",
    name: "UK FCDO Travel Advice — UAE",
    category: "government",
    url: "https://www.gov.uk/foreign-travel-advice/united-arab-emirates.atom",
    parser: "rss",
    connector: "rss",
    extractor_id: "rss_default",
    priority: 75,
    freshness_target_minutes: 15,
    region: "UK / UAE",
  },
  {
    id: "australia_dfat_uae",
    name: "Australian DFAT SmartTraveller — UAE",
    category: "government",
    url: "https://www.smartraveller.gov.au/destinations/middle-east/united-arab-emirates",
    parser: "html",
    connector: "direct_html",
    fallback_connector: "chrome_relay",
    extractor_id: "html_title_text",
    priority: 60,
    freshness_target_minutes: 30,
    region: "Australia / UAE",
  },
  {
    id: "canada_gac_uae",
    name: "Canadian GAC Travel Advice — UAE",
    category: "government",
    url: "https://travel.gc.ca/destinations/united-arab-emirates",
    parser: "html",
    connector: "direct_html",
    fallback_connector: "chrome_relay",
    extractor_id: "html_title_text",
    priority: 58,
    freshness_target_minutes: 30,
    region: "Canada / UAE",
  },
```

**Step 2: Add new entries to lib/resource-directory.ts**

Add to the `OFFICIAL_DIRECTORY` array:

```ts
  {
    name: "flydubai",
    type: "airline",
    region: "UAE",
    contactPage: "https://www.flydubai.com/en/contact",
    socials: [{ label: "X", url: "https://x.com/flydubai" }],
  },
  {
    name: "Air Arabia",
    type: "airline",
    region: "UAE",
    contactPage: "https://www.airarabia.com/en/contact-us",
    socials: [{ label: "X", url: "https://x.com/aaboriginal" }],
  },
  {
    name: "Qatar Airways",
    type: "airline",
    region: "Qatar (Doha transit)",
    contactPage: "https://www.qatarairways.com/en/help.html",
    socials: [{ label: "X", url: "https://x.com/qaboriginalrways" }],
  },
  {
    name: "UAE General Civil Aviation Authority (GCAA)",
    type: "government",
    region: "UAE",
    contactPage: "https://www.gcaa.gov.ae/en/pages/contact.aspx",
  },
  {
    name: "UK FCDO — UAE Travel Advice",
    type: "government",
    region: "UK / UAE",
    contactPage: "https://www.gov.uk/foreign-travel-advice/united-arab-emirates",
  },
  {
    name: "Australian DFAT — UAE SmartTraveller",
    type: "government",
    region: "Australia / UAE",
    contactPage: "https://www.smartraveller.gov.au/destinations/middle-east/united-arab-emirates",
  },
```

**Step 3: Verify build**

Run: `cd /Users/monkeyclaw/gulf-corridor-watch && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

**Step 4: Commit**

```bash
git add lib/sources.ts lib/resource-directory.ts
git commit -m "feat: expand source registry — flydubai, Air Arabia, QR, GCAA, FCDO, DFAT, GAC"
```

---

### Task 10: Rewrite page.tsx — Full Page Assembly

This is the main integration task. Replace the entire page layout with the new components.

**Files:**
- Modify: `app/page.tsx`

**Step 1: Rewrite page.tsx**

Replace the entire file. Keep all the data-loading functions (`loadRows`, `loadSocialSignals`, `loadFlightPulse`, `buildFlightPromptSuggestions`) and the types. Replace only the JSX return and the component imports.

The key changes:
- Import new components instead of old ones
- Compute `posture` from the briefing data for the hero
- Pass data to new components
- Remove sidebar layout — single column flow
- Remove `OmnipresentChat` and `FlightSearchWidget` imports
- Remove `XEmbed` import

The new page structure:

```tsx
import { OFFICIAL_SOURCES, PROJECT_NAME } from "@/lib/sources";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isUsableSnapshot } from "@/lib/source-quality";
import { loadUnifiedFeed } from "@/lib/unified-updates";
import { loadCurrentStateBrief } from "@/lib/current-state-brief";
import { StatusHero } from "@/app/components/status-hero";
import { SituationBriefing } from "@/app/components/situation-briefing";
import { FlightPulse } from "@/app/components/flight-pulse";
import { UpdatesFeed } from "@/app/components/updates-feed";
import { MyTrackingPanel } from "@/app/components/my-tracking-panel";
import { ResourcesPanel } from "@/app/components/resources-panel";
import { SourceHealth } from "@/app/components/source-health";

export const dynamic = "force-dynamic";

// --- Keep ALL existing type definitions (Row, SocialSignalRow, FlightRow, FlightPulse) ---
// --- Keep ALL existing data-loading functions (loadRows, loadSocialSignals, loadFlightPulse, buildFlightPromptSuggestions) ---
// --- Keep the suppressionReason function ---

// Replace ONLY the Home component and its return JSX:

export default async function Home() {
  const currentBrief = await loadCurrentStateBrief({ allowTransient: true }).catch(() => null);
  const rows = await loadRows();
  const usableRows = rows.filter((row) => isUsableSnapshot({ title: row.title, summary: row.summary, reliability: row.reliability }));
  const suppressedRows = rows.filter((row) => !isUsableSnapshot({ title: row.title, summary: row.summary, reliability: row.reliability }));
  const pulse = await loadFlightPulse();
  const suggestedFlightPrompts = buildFlightPromptSuggestions(pulse);
  const initialUpdates = await loadUnifiedFeed(80).catch(() => []);

  const posture: "normal" | "heightened" | "unclear" =
    currentBrief?.confidence === "low" || currentBrief?.freshness_state === "stale"
      ? "unclear"
      : (currentBrief?.flight.delayed ?? 0) > 0 || (currentBrief?.flight.cancelled ?? 0) > 0 ||
        usableRows.some((r) => r.status_level === "advisory" || r.status_level === "disrupted")
        ? "heightened"
        : "normal";

  return (
    <>
      <StatusHero
        posture={posture}
        briefingSummary={currentBrief?.paragraph ?? "Checking sources..."}
        flightTotal={pulse.total}
        flightDelayed={pulse.delayed}
        flightCancelled={pulse.cancelled}
        updatedAt={pulse.latestFetch}
        sourceCount={usableRows.length}
        suggestedPrompts={suggestedFlightPrompts}
      />

      {currentBrief && (
        <SituationBriefing
          paragraph={currentBrief.paragraph}
          refreshedAt={currentBrief.refreshed_at}
          confidence={currentBrief.confidence}
          sourceCount={currentBrief.coverage.sources_included.length}
        />
      )}

      <FlightPulse byAirport={pulse.byAirport} topRoutes={pulse.topRoutes} />

      <UpdatesFeed initialItems={initialUpdates} />

      <div className="mx-auto max-w-4xl px-4 py-4 md:px-0">
        <MyTrackingPanel />
      </div>

      <ResourcesPanel />

      <SourceHealth
        totalSources={rows.length}
        healthySources={usableRows.length}
        suppressedSources={suppressedRows.map((row) => ({
          source_id: row.source_id,
          source_name: row.source_name,
          source_url: row.source_url,
          reason: suppressionReason(row),
        }))}
      />
    </>
  );
}
```

Important: Keep the `loadRows`, `loadSocialSignals`, `loadFlightPulse`, `buildFlightPromptSuggestions`, and `suppressionReason` functions and all types exactly as they are. Only replace the imports at the top and the `Home` component's return JSX. Remove the `searchParams` prop since the query is now handled entirely client-side in `UnifiedQuery`.

**Step 2: Build and verify**

Run: `cd /Users/monkeyclaw/gulf-corridor-watch && npm run build 2>&1 | tail -30`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: rewrite page layout with editorial components — no sidebar, status-first"
```

---

### Task 11: Update MyTrackingPanel Styling

**Files:**
- Modify: `app/components/my-tracking-panel.tsx`

**Step 1: Update the component styling**

Adjust the outer wrapper styling to remove the old shadow/border pattern and use the new design tokens. The functional logic stays identical. Key changes:

- Replace `shadow-[0_10px_40px_rgba(10,28,42,0.06)]` with `shadow-sm`
- Replace `bg-white/85` with `bg-white`
- Replace `rounded-2xl` with `rounded-xl`
- Replace tiny text sizes (text-[10px], text-[11px]) with minimum text-xs (12px)
- Update status badge colours to use CSS variables

**Step 2: Commit**

```bash
git add app/components/my-tracking-panel.tsx
git commit -m "style: update tracking panel to new design system"
```

---

### Task 12: Visual QA and Polish

**Files:**
- Possibly: `app/globals.css`, any component files

**Step 1: Run the dev server and inspect**

Run: `cd /Users/monkeyclaw/gulf-corridor-watch && npm run dev`

**Step 2: Check on mobile viewport (375px)**

Verify:
- [ ] Hero fills full width
- [ ] Query input is usable on mobile
- [ ] Scenario chips wrap cleanly
- [ ] No horizontal scroll on any section
- [ ] All text is minimum 12px
- [ ] Touch targets are minimum 44px
- [ ] Status dot animates on non-normal posture

**Step 3: Check desktop (1280px+)**

Verify:
- [ ] Content is centred and not too wide
- [ ] Flight pulse cards sit side-by-side
- [ ] Updates feed cards look clean
- [ ] Resources grid fills 2-3 columns

**Step 4: Fix any issues found**

Apply CSS/component fixes as needed.

**Step 5: Final build check**

Run: `cd /Users/monkeyclaw/gulf-corridor-watch && npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add -A
git commit -m "style: visual QA fixes and polish"
```

---

### Task 13: Clean Up Deprecated Components

**Files:**
- Delete or mark deprecated: `app/components/omnipresent-chat.tsx`
- Delete or mark deprecated: `app/components/flight-search-widget.tsx`
- Delete or mark deprecated: `app/components/x-embed.tsx`
- Delete or mark deprecated: `app/components/live-updates-ticker.tsx`

**Step 1: Verify no imports remain**

Run: `grep -r "omnipresent-chat\|flight-search-widget\|x-embed\|live-updates-ticker" app/ lib/ --include="*.tsx" --include="*.ts"`
Expected: No results (if page.tsx rewrite was clean)

**Step 2: Remove old component files**

```bash
rm app/components/omnipresent-chat.tsx app/components/flight-search-widget.tsx app/components/x-embed.tsx app/components/live-updates-ticker.tsx
```

**Step 3: Build verify**

Run: `cd /Users/monkeyclaw/gulf-corridor-watch && npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove deprecated components replaced by editorial redesign"
```

---

Plan complete and saved to `docs/plans/2026-03-03-editorial-redesign-implementation.md`. Two execution options:

**1. Subagent-Driven (this session)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** — Open a new session with executing-plans, batch execution with checkpoints

Which approach?
