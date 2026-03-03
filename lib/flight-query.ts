import { findFlightByNumber, findRouteFlights, FlightObservation } from "@/lib/flightradar";
import { getSupabaseAdmin } from "@/lib/supabase";

export type FlightIntent =
  | { type: "flight_number"; flightNumber: string }
  | { type: "route"; originCodes: string[]; destinationCodes: string[]; originLabel: string; destinationLabel: string }
  | { type: "unknown" };

export type FlightInsight = {
  type: "likelihood" | "status";
  headline: string;
  summary: string;
  confidence: "low" | "medium" | "high";
  horizon_hours: number;
  score: number | null;
};

type QueryOptions = {
  allowLive?: boolean;
};

const AIRPORT_ALIASES: Record<string, string[]> = {
  dxb: ["DXB"],
  auh: ["AUH"],
  dubai: ["DXB"],
  "abu dhabi": ["AUH"],
  dublin: ["DUB"],
  dub: ["DUB"],
  delhi: ["DEL"],
  del: ["DEL"],
  mumbai: ["BOM"],
  bom: ["BOM"],
  bengaluru: ["BLR"],
  bangalore: ["BLR"],
  blr: ["BLR"],
  chennai: ["MAA"],
  maa: ["MAA"],
  kochi: ["COK"],
  cok: ["COK"],
  doha: ["DOH"],
  doh: ["DOH"],
  london: ["LHR", "LGW", "STN"],
  "heathrow": ["LHR"],
  lhr: ["LHR"],
};

function cleanToken(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function looksLikeIata(raw: string): boolean {
  return /^[A-Z]{3}$/.test(raw.trim().toUpperCase());
}

function resolveAirportToken(raw: string): { label: string; codes: string[] } | null {
  const cleaned = cleanToken(raw);
  if (!cleaned) return null;
  if (looksLikeIata(cleaned)) {
    const code = cleaned.toUpperCase();
    return { label: code, codes: [code] };
  }

  if (AIRPORT_ALIASES[cleaned]) {
    return { label: raw.trim(), codes: AIRPORT_ALIASES[cleaned] };
  }

  for (const alias of Object.keys(AIRPORT_ALIASES)) {
    if (cleaned.includes(alias)) {
      return { label: raw.trim(), codes: AIRPORT_ALIASES[alias] };
    }
  }

  return null;
}

export function parseFlightIntent(query: string): FlightIntent {
  const trimmed = query.trim();
  const upper = trimmed.toUpperCase();

  const flightMatch = upper.match(/\b([A-Z]{2,3}\s?\d{1,4}[A-Z]?)\b/);
  if (flightMatch) {
    return { type: "flight_number", flightNumber: flightMatch[1].replace(/\s+/g, "") };
  }

  const routeArrow = upper.match(/\b([A-Z]{3})\s*(?:-|TO|->|→)\s*([A-Z]{3})\b/);
  if (routeArrow) {
    return {
      type: "route",
      originCodes: [routeArrow[1]],
      destinationCodes: [routeArrow[2]],
      originLabel: routeArrow[1],
      destinationLabel: routeArrow[2],
    };
  }

  const routeFromToIata = upper.match(/\bFROM\s+([A-Z]{3})\s+TO\s+([A-Z]{3})\b/);
  if (routeFromToIata) {
    return {
      type: "route",
      originCodes: [routeFromToIata[1]],
      destinationCodes: [routeFromToIata[2]],
      originLabel: routeFromToIata[1],
      destinationLabel: routeFromToIata[2],
    };
  }

  const fromToNatural = trimmed.match(/from\s+(.+?)\s+to\s+(.+?)(?=\s+(?:in|within|over|during|next)\b|[?.!,]|$)/i);
  if (fromToNatural) {
    const origin = resolveAirportToken(fromToNatural[1]);
    const destination = resolveAirportToken(fromToNatural[2]);
    if (origin && destination) {
      return {
        type: "route",
        originCodes: origin.codes,
        destinationCodes: destination.codes,
        originLabel: origin.label,
        destinationLabel: destination.label,
      };
    }
  }

  const toFromNatural = trimmed.match(/to\s+(.+?)\s+from\s+(.+?)(?=\s+(?:in|within|over|during|next)\b|[?.!,]|$)/i);
  if (toFromNatural) {
    const destination = resolveAirportToken(toFromNatural[1]);
    const origin = resolveAirportToken(toFromNatural[2]);
    if (origin && destination) {
      return {
        type: "route",
        originCodes: origin.codes,
        destinationCodes: destination.codes,
        originLabel: origin.label,
        destinationLabel: destination.label,
      };
    }
  }

  return { type: "unknown" };
}

function parseHorizonHours(query: string): number {
  const match = query.match(/next\s+(\d+)\s*(hour|hours|hr|hrs|day|days)/i);
  if (!match) return 24;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return 24;
  const unit = match[2].toLowerCase();
  const hours = unit.startsWith("day") ? value * 24 : value;
  return Math.max(6, Math.min(72, hours));
}

function isLikelihoodQuestion(query: string): boolean {
  return /\blikelihood|likely|chance|probability|get back|make it|odds|feasible|possible\b/i.test(query);
}

function observationKey(row: FlightObservation): string {
  const scheduleDate = row.scheduled_time ? row.scheduled_time.slice(0, 10) : "na";
  return `${row.flight_number}|${scheduleDate}|${row.origin_iata ?? "na"}|${row.destination_iata ?? "na"}`;
}

function dedupeLatest(rows: FlightObservation[]): FlightObservation[] {
  const byKey = new Map<string, FlightObservation>();
  for (const row of rows) {
    const key = observationKey(row);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    if (new Date(row.fetched_at).getTime() > new Date(existing.fetched_at).getTime()) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()];
}

function summarize(rows: FlightObservation[]) {
  const delayed = rows.filter((r) => r.is_delayed).length;
  const cancelled = rows.filter((r) => /cancel/.test(r.status)).length;
  const latestFetch = rows
    .map((r) => r.fetched_at)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
  return { total: rows.length, delayed, cancelled, latest_fetch: latestFetch };
}

function buildInsight(query: string, intent: FlightIntent, rows: FlightObservation[]): FlightInsight | null {
  if (intent.type === "unknown") return null;
  const likelihoodMode = isLikelihoodQuestion(query);
  const horizon = parseHorizonHours(query);
  const deduped = dedupeLatest(rows);
  const summary = summarize(deduped);

  if (likelihoodMode && intent.type === "route") {
    if (summary.total === 0) {
      return {
        type: "likelihood",
        headline: `Likelihood for ${intent.originLabel} -> ${intent.destinationLabel}: unknown`,
        summary: "No recent cached observations for this route. Run ingestion or enable live lookup for a current estimate.",
        confidence: "low",
        horizon_hours: horizon,
        score: null,
      };
    }
    const onTrack = Math.max(0, summary.total - summary.delayed - summary.cancelled);
    const score = Math.max(0, Math.min(100, Math.round(((onTrack + summary.delayed * 0.5) / summary.total) * 100)));
    const confidence: FlightInsight["confidence"] = summary.total >= 8 ? "high" : summary.total >= 4 ? "medium" : "low";
    const band = score >= 75 ? "good" : score >= 50 ? "moderate" : "low";
    return {
      type: "likelihood",
      headline: `Likelihood for ${intent.originLabel} -> ${intent.destinationLabel} in next ${horizon}h: ${band}`,
      summary: `Route reliability score ${score}/100 from ${summary.total} recent observed flights (${summary.delayed} delayed, ${summary.cancelled} cancelled).`,
      confidence,
      horizon_hours: horizon,
      score,
    };
  }

  if (summary.total === 0) {
    return {
      type: "status",
      headline: "No recent matches",
      summary: "No recent cached flight observations matched this query.",
      confidence: "low",
      horizon_hours: horizon,
      score: null,
    };
  }

  return {
    type: "status",
    headline: `${summary.total} matching flights found`,
    summary: `${summary.delayed} delayed and ${summary.cancelled} cancelled in recent cached observations.`,
    confidence: summary.total >= 6 ? "high" : "medium",
    horizon_hours: horizon,
    score: null,
  };
}

async function lookupFromDb(intent: FlightIntent, lookbackHours: number): Promise<FlightObservation[]> {
  if (intent.type === "unknown") return [];
  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - lookbackHours * 60 * 60_000).toISOString();

  let query = supabase
    .from("flight_observations")
    .select(
      "airport,flight_number,callsign,icao24,flight_id,airline,origin_iata,origin_name,destination_iata,destination_name,scheduled_time,estimated_time,actual_time,status,is_delayed,delay_minutes,source_url,raw_payload,fetched_at"
    )
    .gte("fetched_at", cutoff)
    .order("fetched_at", { ascending: false })
    .limit(500);

  if (intent.type === "flight_number") {
    query = query.eq("flight_number", intent.flightNumber);
  } else {
    query = query.in("origin_iata", intent.originCodes).in("destination_iata", intent.destinationCodes);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as FlightObservation[];
}

async function lookupLive(intent: FlightIntent): Promise<FlightObservation[]> {
  if (intent.type === "unknown") return [];
  if (intent.type === "flight_number") return findFlightByNumber(intent.flightNumber);
  if (intent.originCodes.length === 1 && intent.destinationCodes.length === 1) {
    return findRouteFlights(intent.originCodes[0], intent.destinationCodes[0]);
  }
  return [];
}

export async function runFlightQuery(queryText: string, options?: QueryOptions) {
  const query = queryText.trim();
  const intent = parseFlightIntent(query);
  if (intent.type === "unknown") {
    return {
      intent,
      source: "none" as const,
      summary: { total: 0, delayed: 0, cancelled: 0, latest_fetch: null },
      flights: [] as FlightObservation[],
      insight: null as FlightInsight | null,
    };
  }

  const likelihoodMode = isLikelihoodQuestion(query);
  const horizon = parseHorizonHours(query);
  const lookbackHours = likelihoodMode ? Math.max(24, horizon) : 3;

  let flights = await lookupFromDb(intent, lookbackHours);
  let source: "cache" | "live" = "cache";
  if (flights.length === 0 && options?.allowLive && process.env.FLIGHTRADAR_KEY) {
    flights = await lookupLive(intent);
    source = "live";
  }

  const supabase = getSupabaseAdmin();
  await supabase.from("flight_query_logs").insert({
    query,
    resolved_filters: { intent, likelihood_mode: likelihoodMode, horizon_hours: horizon, source },
    result_count: flights.length,
  });

  return {
    intent,
    source,
    summary: summarize(flights),
    flights,
    insight: buildInsight(query, intent, flights),
  };
}

export function flightsToContextRows(flights: FlightObservation[]) {
  return flights.slice(0, 25).map((f) => {
    return `[${f.flight_number}] airport=${f.airport} status=${f.status} delayed=${f.is_delayed ? "yes" : "no"} delay_minutes=${f.delay_minutes ?? "n/a"} fetched=${f.fetched_at}
origin=${f.origin_iata ?? "n/a"} destination=${f.destination_iata ?? "n/a"} scheduled=${f.scheduled_time ?? "n/a"} estimated=${f.estimated_time ?? "n/a"} actual=${f.actual_time ?? "n/a"}
source=${f.source_url}`;
  });
}
