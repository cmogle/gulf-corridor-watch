import { findFlightByNumber, findRouteFlights, FlightObservation } from "@/lib/flightradar";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateText, hasAnthropicKey } from "./anthropic";

export type FlightIntent =
  | { type: "flight_number"; flightNumber: string }
  | { type: "route"; originCodes: string[]; destinationCodes: string[]; originLabel: string; destinationLabel: string; airline?: { icao: string; iataPrefix: string } }
  | { type: "airport"; codes: string[]; label: string; direction: "arrivals" | "departures" | "both"; airline?: { icao: string; iataPrefix: string } }
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
  // UAE
  dxb: ["DXB"], dubai: ["DXB"],
  auh: ["AUH"], "abu dhabi": ["AUH"],
  dwc: ["DWC"], "al maktoum": ["DWC"], "dubai world central": ["DWC"],
  // India
  del: ["DEL"], delhi: ["DEL"], "new delhi": ["DEL"],
  bom: ["BOM"], mumbai: ["BOM"], bombay: ["BOM"],
  blr: ["BLR"], bengaluru: ["BLR"], bangalore: ["BLR"],
  maa: ["MAA"], chennai: ["MAA"], madras: ["MAA"],
  cok: ["COK"], kochi: ["COK"], cochin: ["COK"],
  hyd: ["HYD"], hyderabad: ["HYD"],
  ccu: ["CCU"], kolkata: ["CCU"], calcutta: ["CCU"],
  amd: ["AMD"], ahmedabad: ["AMD"],
  goa: ["GOI"], goi: ["GOI"],
  // UK / Ireland
  lhr: ["LHR"], heathrow: ["LHR"],
  lgw: ["LGW"], gatwick: ["LGW"],
  man: ["MAN"], manchester: ["MAN"],
  dub: ["DUB"], dublin: ["DUB"],
  // Europe
  cdg: ["CDG"], paris: ["CDG"],
  fra: ["FRA"], frankfurt: ["FRA"],
  ams: ["AMS"], amsterdam: ["AMS"],
  zrh: ["ZRH"], zurich: ["ZRH"],
  mad: ["MAD"], madrid: ["MAD"],
  bcn: ["BCN"], barcelona: ["BCN"],
  fco: ["FCO"], rome: ["FCO"],
  mxp: ["MXP"], milan: ["MXP"],
  // Gulf / Middle East
  doh: ["DOH"], doha: ["DOH"],
  kwi: ["KWI"], kuwait: ["KWI"],
  bah: ["BAH"], bahrain: ["BAH"], manama: ["BAH"],
  ruh: ["RUH"], riyadh: ["RUH"],
  jed: ["JED"], jeddah: ["JED"],
  mct: ["MCT"], muscat: ["MCT"],
  // North America
  jfk: ["JFK"], "new york": ["JFK", "EWR"],
  lax: ["LAX"], "los angeles": ["LAX"],
  ord: ["ORD"], chicago: ["ORD"],
  yyz: ["YYZ"], toronto: ["YYZ"],
  // Asia Pacific
  sin: ["SIN"], singapore: ["SIN"],
  bkk: ["BKK"], bangkok: ["BKK"],
  hkg: ["HKG"], "hong kong": ["HKG"],
  nrt: ["NRT"], tokyo: ["NRT"],
  syd: ["SYD"], sydney: ["SYD"],
  mel: ["MEL"], melbourne: ["MEL"],
  // Africa
  nbo: ["NBO"], nairobi: ["NBO"],
  jnb: ["JNB"], johannesburg: ["JNB"],
  cai: ["CAI"], cairo: ["CAI"],
};

const KNOWN_IATA = new Set<string>(Object.values(AIRPORT_ALIASES).flat());

const AIRLINE_KEYWORDS: Record<string, { icao: string; iataPrefix: string }> = {
  emirates: { icao: "UAE", iataPrefix: "EK" },
  etihad: { icao: "ETD", iataPrefix: "EY" },
  flydubai: { icao: "FDB", iataPrefix: "FZ" },
  "fly dubai": { icao: "FDB", iataPrefix: "FZ" },
  "air arabia": { icao: "ABY", iataPrefix: "G9" },
  saudia: { icao: "SVA", iataPrefix: "SV" },
  "qatar airways": { icao: "QTR", iataPrefix: "QR" },
  "oman air": { icao: "OMA", iataPrefix: "WY" },
  "gulf air": { icao: "GFA", iataPrefix: "GF" },
  "british airways": { icao: "BAW", iataPrefix: "BA" },
};

function detectAirline(query: string): { icao: string; iataPrefix: string } | undefined {
  const lower = query.toLowerCase();
  for (const [keyword, info] of Object.entries(AIRLINE_KEYWORDS)) {
    if (lower.includes(keyword)) return info;
  }
  return undefined;
}

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

/** Detect arrival/departure direction keywords in a query. */
function detectDirection(query: string): "arrivals" | "departures" | "both" | null {
  const q = query.toLowerCase();
  const arrivalRe = /\b(land|landed|landing|arriv|arrival|arrivals|arriving|inbound|incoming|came in|touched down)\b/;
  const departureRe = /\b(depart|departed|departing|departure|departures|takeoff|take off|taking off|took off|outbound|outgoing|left from)\b/;
  const hasArrival = arrivalRe.test(q);
  const hasDeparture = departureRe.test(q);
  if (hasArrival && hasDeparture) return "both";
  if (hasArrival) return "arrivals";
  if (hasDeparture) return "departures";
  // Generic airport activity keywords (no direction specified)
  const genericRe = /\b(flights?\s+(at|from|into|out of|through)|how (busy|many flights)|traffic at|operations at|airport.{0,15}(status|busy|traffic))\b/i;
  if (genericRe.test(q)) return "both";
  return null;
}

export function parseFlightIntent(query: string): FlightIntent {
  const trimmed = query.trim();
  const upper = trimmed.toUpperCase();

  const flightMatch = upper.match(/\b([A-Z]{2,3}\s?\d{1,4}[A-Z]?)\b/);
  if (flightMatch) {
    return { type: "flight_number", flightNumber: flightMatch[1].replace(/\s+/g, "") };
  }

  const airline = detectAirline(trimmed);

  const routeArrow = upper.match(/\b([A-Z]{3})\s*(?:-|TO|->|→)\s*([A-Z]{3})\b/);
  if (routeArrow && KNOWN_IATA.has(routeArrow[1]) && KNOWN_IATA.has(routeArrow[2])) {
    return {
      type: "route",
      originCodes: [routeArrow[1]],
      destinationCodes: [routeArrow[2]],
      originLabel: routeArrow[1],
      destinationLabel: routeArrow[2],
      airline,
    };
  }

  const routeFromToIata = upper.match(/\bFROM\s+([A-Z]{3})\s+TO\s+([A-Z]{3})\b/);
  if (routeFromToIata && KNOWN_IATA.has(routeFromToIata[1]) && KNOWN_IATA.has(routeFromToIata[2])) {
    return {
      type: "route",
      originCodes: [routeFromToIata[1]],
      destinationCodes: [routeFromToIata[2]],
      originLabel: routeFromToIata[1],
      destinationLabel: routeFromToIata[2],
      airline,
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
        airline,
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
        airline,
      };
    }
  }

  // Fallback: scan for any known IATA codes in the query
  const iataCodes: string[] = [];
  for (const match of upper.matchAll(/\b([A-Z]{3})\b/g)) {
    if (KNOWN_IATA.has(match[1]) && !iataCodes.includes(match[1])) {
      iataCodes.push(match[1]);
    }
  }
  if (iataCodes.length >= 2) {
    return {
      type: "route",
      originCodes: [iataCodes[0]],
      destinationCodes: [iataCodes[1]],
      originLabel: iataCodes[0],
      destinationLabel: iataCodes[1],
      airline,
    };
  }
  if (iataCodes.length === 1) {
    const direction = detectDirection(trimmed);
    // Single airport code: treat as airport query (not a self-referencing route)
    return {
      type: "airport",
      codes: [iataCodes[0]],
      label: iataCodes[0],
      direction: direction ?? "both",
      airline,
    };
  }

  // No IATA codes found — check for city/airport name aliases with direction keywords
  const direction = detectDirection(trimmed);
  if (direction) {
    const lower = cleanToken(trimmed);
    for (const [alias, codes] of Object.entries(AIRPORT_ALIASES)) {
      if (lower.includes(alias)) {
        return {
          type: "airport",
          codes,
          label: alias,
          direction,
          airline,
        };
      }
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
  if (intent.type === "unknown" || intent.type === "airport") return [];
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
    if (intent.airline) {
      query = query.or(`airline.eq.${intent.airline.icao},flight_number.like.${intent.airline.iataPrefix}%`);
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as FlightObservation[];
}

export type AirportScheduleStats = {
  airport: string;
  board_type: string;
  total: number;
  delayed: number;
  cancelled: number;
  avg_delay_minutes: number | null;
  latest_fetch: string | null;
};

export type AirportScheduleRow = {
  flight_number: string;
  airline: string | null;
  origin_iata: string | null;
  destination_iata: string | null;
  scheduled_time: string;
  estimated_time: string | null;
  actual_time: string | null;
  status: string;
  is_delayed: boolean;
  delay_minutes: number | null;
  is_cancelled: boolean;
  gate: string | null;
  terminal: string | null;
  fetched_at: string;
};

export type AirportQueryResult = {
  stats: AirportScheduleStats[];
  flights: AirportScheduleRow[];
  direction: "arrivals" | "departures" | "both";
};

/** Query flight_schedules and flight_schedule_stats for an airport intent. */
async function lookupAirportFromDb(
  intent: FlightIntent & { type: "airport" },
): Promise<AirportQueryResult> {
  const supabase = getSupabaseAdmin();
  const boardTypes = intent.direction === "both"
    ? ["arrival", "departure"]
    : [intent.direction === "arrivals" ? "arrival" : "departure"];

  // Query stats view and individual flights in parallel
  const [statsResult, flightsResult] = await Promise.all([
    supabase
      .from("flight_schedule_stats")
      .select("*")
      .in("airport", intent.codes)
      .in("board_type", boardTypes),
    supabase
      .from("flight_schedules")
      .select("flight_number,airline,origin_iata,destination_iata,scheduled_time,estimated_time,actual_time,status,is_delayed,delay_minutes,is_cancelled,gate,terminal,fetched_at")
      .in("airport", intent.codes)
      .in("board_type", boardTypes)
      .gte("fetched_at", new Date(Date.now() - 6 * 60 * 60_000).toISOString())
      .order("scheduled_time", { ascending: false })
      .limit(200),
  ]);

  const stats = (statsResult.data ?? []) as AirportScheduleStats[];
  const flights = (flightsResult.data ?? []) as AirportScheduleRow[];

  return { stats, flights, direction: intent.direction };
}

async function lookupLive(intent: FlightIntent): Promise<FlightObservation[]> {
  if (intent.type === "unknown" || intent.type === "airport") return [];
  if (intent.type === "flight_number") return findFlightByNumber(intent.flightNumber);
  if (intent.originCodes.length === 1 && intent.destinationCodes.length === 1) {
    return findRouteFlights(intent.originCodes[0], intent.destinationCodes[0]);
  }
  return [];
}

/** Pull the latest source snapshots for advisory context */
async function fetchAdvisoryContext(): Promise<string> {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("latest_source_snapshots")
      .select("source_name,title,summary,status_level,reliability")
      .order("priority", { ascending: false })
      .limit(10);
    if (!data?.length) return "No advisory data available.";
    return data.map((r) => `[${r.source_name}] status=${r.status_level} reliability=${r.reliability}\n  ${r.title}\n  ${r.summary?.slice(0, 200)}`).join("\n\n");
  } catch { return "Advisory data unavailable."; }
}

/** Pull latest airspace observation count as context */
async function fetchAirspaceCount(): Promise<number> {
  try {
    const supabase = getSupabaseAdmin();
    const cutoff = new Date(Date.now() - 45 * 60_000).toISOString();
    const { count } = await supabase.from("flight_observations").select("id", { count: "exact", head: true }).gte("fetched_at", cutoff);
    return count ?? 0;
  } catch { return 0; }
}

/**
 * For likelihood questions with sparse/no route data, generate a GPT assessment
 * using the current advisory snapshot context + airspace observation count.
 */
async function buildAdvisoryLikelihoodInsight(
  query: string,
  intent: FlightIntent & { type: "route" },
  advisoryContext: string,
  airspaceCount: number,
): Promise<FlightInsight> {
  const horizon = parseHorizonHours(query);

  if (!hasAnthropicKey()) {
    return {
      type: "likelihood",
      headline: `Likelihood: ${intent.originLabel} → ${intent.destinationLabel} (advisory-based)`,
      summary: `No direct flight data for this route. Current UAE/Gulf advisories show significant disruption. Check official airline pages for latest schedule status.`,
      confidence: "low",
      horizon_hours: horizon,
      score: null,
    };
  }

  try {
    const result = await generateText({
      model: "claude-sonnet-4-6",
      temperature: 0.1,
      maxTokens: 280,
      system: `You are a Gulf Corridor travel disruption analyst. You help travellers assess likelihood of completing flights into/out of Dubai (DXB) or Abu Dhabi (AUH).

Current airspace context: ${airspaceCount} aircraft observed in UAE/Gulf airspace in last 45 minutes. Normal is ~150-250. Severely low count indicates major disruption.

Your output must be JSON only: { "score": <0-100 integer>, "band": "high|moderate|low|very_low", "headline": "<15 words>", "summary": "<2 sentences max, specific, actionable>", "confidence": "high|medium|low" }

Score guide: 90+ = operating normally, 70-89 = some disruption but likely to operate, 50-69 = significant uncertainty, 30-49 = major disruption likely, <30 = severe disruption/suspension likely.`,
      userMessage: `Question: ${query}
Route: ${intent.originLabel} (${intent.originCodes.join("/")}) → ${intent.destinationLabel} (${intent.destinationCodes.join("/")})
Time horizon: next ${horizon} hours
Aircraft in UAE airspace now: ${airspaceCount} (normal ~200)

Official source advisories:
${advisoryContext}`,
    });

    const raw = result.text || "{}";
    const parsed = JSON.parse(raw.replace(/```json\n?|```/g, "").trim()) as {
      score?: number; band?: string; headline?: string; summary?: string; confidence?: string;
    };

    return {
      type: "likelihood",
      headline: parsed.headline ?? `${intent.originLabel} → ${intent.destinationLabel}: ${parsed.band ?? "uncertain"}`,
      summary: parsed.summary ?? "Advisory-based assessment. No direct route observations available.",
      confidence: (["high","medium","low"].includes(parsed.confidence ?? "")) ? parsed.confidence as "high"|"medium"|"low" : "low",
      horizon_hours: horizon,
      score: typeof parsed.score === "number" ? parsed.score : null,
    };
  } catch {
    return {
      type: "likelihood",
      headline: `${intent.originLabel} → ${intent.destinationLabel}: advisory-based`,
      summary: "LLM assessment failed. Check official airline and government advisories directly.",
      confidence: "low",
      horizon_hours: horizon,
      score: null,
    };
  }
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
      airportData: null as AirportQueryResult | null,
    };
  }

  // Airport intent — query schedule board data instead of flight observations
  if (intent.type === "airport") {
    const airportData = await lookupAirportFromDb(intent);
    const totalStats = airportData.stats.reduce((acc, s) => ({
      total: acc.total + s.total,
      delayed: acc.delayed + s.delayed,
      cancelled: acc.cancelled + s.cancelled,
    }), { total: 0, delayed: 0, cancelled: 0 });
    const latestFetch = airportData.stats
      .map((s) => s.latest_fetch)
      .filter(Boolean)
      .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0] ?? null;

    const supabase = getSupabaseAdmin();
    await supabase.from("flight_query_logs").insert({
      query,
      resolved_filters: { intent, source: "schedule_board" },
      result_count: airportData.flights.length,
    });

    return {
      intent,
      source: "cache" as const,
      summary: { ...totalStats, latest_fetch: latestFetch },
      flights: [] as FlightObservation[],
      insight: {
        type: "status" as const,
        headline: `${intent.codes.join("/")} ${intent.direction}: ${totalStats.total} flights`,
        summary: `${totalStats.delayed} delayed, ${totalStats.cancelled} cancelled in schedule board data.`,
        confidence: (totalStats.total >= 10 ? "high" : totalStats.total >= 3 ? "medium" : "low") as FlightInsight["confidence"],
        horizon_hours: 6,
        score: null,
      },
      airportData,
    };
  }

  const likelihoodMode = isLikelihoodQuestion(query);
  const horizon = parseHorizonHours(query);
  const lookbackHours = likelihoodMode ? Math.max(24, horizon) : 12;

  let flights = await lookupFromDb(intent, lookbackHours);
  let source: "cache" | "live" = "cache";
  if (flights.length === 0 && options?.allowLive && process.env.FLIGHTRADAR_KEY) {
    flights = await lookupLive(intent);
    source = "live";
  }

  // For likelihood questions with no flight data, use advisory context + GPT
  let advisoryInsight: FlightInsight | null = null;
  if (likelihoodMode && flights.length === 0 && intent.type === "route") {
    const [advisoryContext, airspaceCount] = await Promise.all([
      fetchAdvisoryContext(),
      fetchAirspaceCount(),
    ]);
    advisoryInsight = await buildAdvisoryLikelihoodInsight(query, intent, advisoryContext, airspaceCount);
  }

  const supabase = getSupabaseAdmin();
  await supabase.from("flight_query_logs").insert({
    query,
    resolved_filters: { intent, likelihood_mode: likelihoodMode, horizon_hours: horizon, source },
    result_count: flights.length,
  });

  return {
    intent,
    source: (advisoryInsight ? "advisory" : source) as "cache" | "live" | "none" | "advisory",
    summary: summarize(flights),
    flights,
    insight: advisoryInsight ?? buildInsight(query, intent, flights),
    airportData: null as AirportQueryResult | null,
  };
}

export function flightsToContextRows(flights: FlightObservation[]) {
  return flights.slice(0, 25).map((f) => {
    return `[${f.flight_number}] airport=${f.airport} status=${f.status} delayed=${f.is_delayed ? "yes" : "no"} delay_minutes=${f.delay_minutes ?? "n/a"} fetched=${f.fetched_at}
origin=${f.origin_iata ?? "n/a"} destination=${f.destination_iata ?? "n/a"} scheduled=${f.scheduled_time ?? "n/a"} estimated=${f.estimated_time ?? "n/a"} actual=${f.actual_time ?? "n/a"}
source=${f.source_url}`;
  });
}

/** Format airport schedule data as LLM context. */
export function airportDataToContext(data: AirportQueryResult): string {
  const parts: string[] = [];

  // Aggregate stats
  if (data.stats.length > 0) {
    parts.push("=== AIRPORT SCHEDULE BOARD STATS ===");
    for (const s of data.stats) {
      const statParts = [`${s.total} flights`];
      if (s.delayed > 0) statParts.push(`${s.delayed} delayed`);
      if (s.cancelled > 0) statParts.push(`${s.cancelled} cancelled`);
      if (s.avg_delay_minutes != null) statParts.push(`avg delay ${Math.round(s.avg_delay_minutes)}min`);
      parts.push(`[${s.airport} ${s.board_type}s] ${statParts.join(", ")} (latest fetch: ${s.latest_fetch ?? "n/a"})`);
    }
  }

  // Individual flight details (sample)
  if (data.flights.length > 0) {
    parts.push(`\n=== SCHEDULE BOARD FLIGHTS (${data.flights.length} total, showing top 30) ===`);
    for (const f of data.flights.slice(0, 30)) {
      const delayTag = f.is_cancelled ? "CANCELLED" : f.is_delayed ? `DELAYED +${f.delay_minutes ?? "?"}min` : "ON TIME";
      parts.push(`[${f.flight_number}] ${f.origin_iata ?? "?"} → ${f.destination_iata ?? "?"} | ${delayTag} | sched=${f.scheduled_time} | status=${f.status} | T${f.terminal ?? "?"} G${f.gate ?? "?"}`);
    }
  }

  return parts.join("\n");
}
