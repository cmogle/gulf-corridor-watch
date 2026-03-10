import { FlightObservationRow } from "@/lib/focused-routes";

export type FocusedEkFlight = {
  flightNumber: string;
  originIata: "DXB" | "BOM" | "LHR" | "LGW";
  destinationIata: "DXB" | "BOM" | "LHR" | "LGW";
};

export type EmiratesStatusRecord = {
  statusCode: string;
  statusText: string;
  isDelayed: boolean;
  delayMinutes: number | null;
  scheduledTime: string | null;
  estimatedTime: string | null;
  actualTime: string | null;
  fetchedAt: string;
  sourceUrl: string;
  rawPayload: Record<string, unknown>;
};

export type EmiratesStatusResult = {
  ok: boolean;
  flight: FocusedEkFlight;
  record: EmiratesStatusRecord | null;
  unavailableReason: string | null;
};

type CacheEntry = {
  expiresAt: number;
  value: EmiratesStatusResult;
};

const CACHE_TTL_MS = Number.parseInt(process.env.EMIRATES_STATUS_TTL_MS ?? "90000", 10);
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.EMIRATES_STATUS_TIMEOUT_MS ?? "12000", 10);
const cache = new Map<string, CacheEntry>();

function cacheKey(flight: FocusedEkFlight, date: string): string {
  return `${flight.flightNumber}:${flight.originIata}:${flight.destinationIata}:${date}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeFlightNumber(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length ? text : null;
}

function normalizeDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function mapStatusCode(rawStatus: string | null): string {
  const upper = (rawStatus ?? "").trim().toUpperCase();
  if (!upper) return "unknown";
  if (/CANC|CNL/.test(upper)) return "CAN";
  if (/DIVERT/.test(upper)) return "DIV";
  if (/DELAY/.test(upper)) return "DEL";
  if (/BOARD/.test(upper)) return "BRD";
  if (/GATE\s+CLOSED/.test(upper)) return "DEP";
  if (/DEPART|TAKE\s*OFF/.test(upper)) return "DEP";
  if (/AIRBORNE/.test(upper)) return "OFF";
  if (/TAXI/.test(upper)) return "TAX";
  if (/CRUISE|EN\s+ROUTE|IN\s+FLIGHT/.test(upper)) return "CRZ";
  if (/APPROACH/.test(upper)) return "DSC";
  if (/ARRIV/.test(upper)) return "ARR";
  if (/LAND/.test(upper)) return "LND";
  if (/SCHED|ON\s*TIME/.test(upper)) return "SCH";
  if (/GROUND/.test(upper)) return "GND";
  return "unknown";
}

function parseIsoCandidate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  const t = new Date(text).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = normalizeText(obj[key]);
    if (value) return value;
  }
  return null;
}

function pickIso(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const iso = parseIsoCandidate(obj[key]);
    if (iso) return iso;
    const value = obj[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = pickIso(value as Record<string, unknown>, [
        "utc",
        "iso",
        "dateTime",
        "value",
      ]);
      if (nested) return nested;
    }
  }
  return null;
}

function pickDelayMinutes(obj: Record<string, unknown>): number | null {
  const direct = obj.delayMinutes;
  if (typeof direct === "number" && Number.isFinite(direct) && direct >= 0) {
    return Math.round(direct);
  }

  const delayText = pickString(obj, ["delay", "delayText", "statusDetail", "description"]);
  if (!delayText) return null;
  const match = delayText.match(/(\d{1,3})\s*(?:M|MIN|MINS|MINUTE|MINUTES)/i);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function routeTokens(iata: FocusedEkFlight["originIata"] | FocusedEkFlight["destinationIata"]): string[] {
  if (iata === "DXB") return ["DXB", "DUBAI"];
  if (iata === "BOM") return ["BOM", "MUMBAI"];
  if (iata === "LHR") return ["LHR", "HEATHROW", "LONDON"];
  return ["LGW", "GATWICK", "LONDON"];
}

function looksLikeTargetFlight(
  obj: Record<string, unknown>,
  flight: FocusedEkFlight,
): boolean {
  const targetNumber = normalizeFlightNumber(flight.flightNumber);
  const textCandidates = [
    pickString(obj, ["flightNumber", "flight_number", "flightNo", "flight", "number"]),
    pickString(obj, ["callsign", "operatingAs"]),
  ].filter((v): v is string => Boolean(v));

  if (textCandidates.some((candidate) => normalizeFlightNumber(candidate).endsWith(targetNumber))) {
    return true;
  }

  const origin = pickString(obj, ["origin", "originIata", "departureAirport", "from"]);
  const destination = pickString(obj, ["destination", "destinationIata", "arrivalAirport", "to"]);
  const hasRoute =
    (origin && routeTokens(flight.originIata).some((token) => origin.toUpperCase().includes(token))) &&
    (destination && routeTokens(flight.destinationIata).some((token) => destination.toUpperCase().includes(token)));
  if (!hasRoute) return false;

  return textCandidates.some((candidate) => candidate.toUpperCase().includes(targetNumber));
}

function findMatchingFlightObject(
  node: unknown,
  flight: FocusedEkFlight,
): Record<string, unknown> | null {
  if (!node) return null;

  if (Array.isArray(node)) {
    for (const value of node) {
      const found = findMatchingFlightObject(value, flight);
      if (found) return found;
    }
    return null;
  }

  if (typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;

  if (looksLikeTargetFlight(obj, flight)) return obj;

  for (const value of Object.values(obj)) {
    if (!value || typeof value !== "object") continue;
    const found = findMatchingFlightObject(value, flight);
    if (found) return found;
  }

  return null;
}

function parseStatusFromObject(
  obj: Record<string, unknown>,
  sourceUrl: string,
): EmiratesStatusRecord | null {
  const statusText = pickString(obj, [
    "status",
    "flightStatus",
    "statusText",
    "statusDescription",
    "currentStatus",
  ]);

  const mappedStatus = mapStatusCode(statusText);
  if (!statusText && mappedStatus === "unknown") return null;

  const delayMinutes = pickDelayMinutes(obj);
  const isDelayed = mappedStatus === "DEL" || (typeof delayMinutes === "number" && delayMinutes > 0);

  return {
    statusCode: mappedStatus,
    statusText: statusText ?? "Status unavailable",
    isDelayed,
    delayMinutes,
    scheduledTime: pickIso(obj, [
      "scheduledTime",
      "scheduledDeparture",
      "std",
      "departureScheduled",
      "scheduled",
    ]),
    estimatedTime: pickIso(obj, [
      "estimatedTime",
      "estimatedDeparture",
      "etd",
      "eta",
      "estimated",
    ]),
    actualTime: pickIso(obj, ["actualTime", "actualDeparture", "atd", "actual"]),
    fetchedAt: nowIso(),
    sourceUrl,
    rawPayload: obj,
  };
}

function parseStatusFromText(
  html: string,
  flight: FocusedEkFlight,
  sourceUrl: string,
): EmiratesStatusRecord | null {
  const normalized = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .toUpperCase();
  const targetA = normalizeFlightNumber(flight.flightNumber);
  const targetB = targetA.replace(/^EK/, "EK ");

  const idx = Math.max(normalized.indexOf(targetA), normalized.indexOf(targetB));
  if (idx < 0) return null;

  const window = normalized.slice(Math.max(0, idx - 500), Math.min(normalized.length, idx + 700));
  const hasRoute =
    routeTokens(flight.originIata).some((token) => window.includes(token)) &&
    routeTokens(flight.destinationIata).some((token) => window.includes(token));

  if (!hasRoute) return null;

  const keywordByCode: Array<[string, string]> = [
    ["CANCELLED", "CAN"],
    ["DIVERTED", "DIV"],
    ["DELAYED", "DEL"],
    ["BOARDING", "BRD"],
    ["DEPARTED", "DEP"],
    ["AIRBORNE", "OFF"],
    ["IN FLIGHT", "CRZ"],
    ["EN ROUTE", "CRZ"],
    ["LANDED", "LND"],
    ["ARRIVED", "ARR"],
    ["SCHEDULED", "SCH"],
    ["ON TIME", "SCH"],
  ];

  const matched = keywordByCode.find(([keyword]) => window.includes(keyword));
  if (!matched) return null;

  const delayMatch = window.match(/(\d{1,3})\s*(?:M|MIN|MINS|MINUTE|MINUTES)\s*DELAY/);
  const delayMinutes = delayMatch ? Number.parseInt(delayMatch[1], 10) : null;

  return {
    statusCode: matched[1],
    statusText: matched[0],
    isDelayed: matched[1] === "DEL" || (typeof delayMinutes === "number" && delayMinutes > 0),
    delayMinutes: Number.isFinite(delayMinutes) ? delayMinutes : null,
    scheduledTime: null,
    estimatedTime: null,
    actualTime: null,
    fetchedAt: nowIso(),
    sourceUrl,
    rawPayload: { snippet: window.slice(0, 400) },
  };
}

function extractJsonScripts(html: string): string[] {
  const scripts: string[] = [];
  const regex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null = regex.exec(html);

  while (match) {
    const script = match[1]?.trim();
    if (script && (script.startsWith("{") || script.startsWith("["))) {
      scripts.push(script);
    }
    match = regex.exec(html);
  }

  return scripts;
}

function buildCandidateUrls(flight: FocusedEkFlight, dateIso: string): string[] {
  const date = normalizeDate(dateIso);
  const fn = encodeURIComponent(normalizeFlightNumber(flight.flightNumber));
  return [
    `https://www.emirates.com/ae/english/manage-booking/flight-status/?flightNumber=${fn}&departureDate=${date}`,
    `https://www.emirates.com/english/manage-booking/flight-status/?flightNumber=${fn}&departureDate=${date}`,
    `https://www.emirates.com/english/manage-booking/flight-status/?flightNumber=${fn}&date=${date}`,
  ];
}

async function fetchHtml(url: string): Promise<{ ok: boolean; status: number; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent": "gulf-corridor-watch/1.0 (+hybrid-monitor)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en",
      },
    });

    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFlightStatus(
  flight: FocusedEkFlight,
  dateIso: string,
): Promise<EmiratesStatusResult> {
  const urls = buildCandidateUrls(flight, dateIso);
  let lastReason = "No parseable Emirates flight status found";

  for (const url of urls) {
    try {
      const response = await fetchHtml(url);
      if (!response.ok) {
        lastReason = `Emirates returned HTTP ${response.status}`;
        continue;
      }

      const scripts = extractJsonScripts(response.body);
      for (const script of scripts) {
        try {
          const parsed = JSON.parse(script) as unknown;
          const found = findMatchingFlightObject(parsed, flight);
          if (!found) continue;
          const record = parseStatusFromObject(found, url);
          if (!record) continue;

          return {
            ok: true,
            flight,
            record,
            unavailableReason: null,
          };
        } catch {
          // Script blob is not valid JSON; continue.
        }
      }

      const textRecord = parseStatusFromText(response.body, flight, url);
      if (textRecord) {
        return {
          ok: true,
          flight,
          record: textRecord,
          unavailableReason: null,
        };
      }

      lastReason = "Emirates page fetched but no reliable status found";
    } catch (error) {
      lastReason = `Emirates request failed: ${String(error)}`;
    }
  }

  return {
    ok: false,
    flight,
    record: null,
    unavailableReason: lastReason,
  };
}

export async function fetchEmiratesStatuses(
  flights: FocusedEkFlight[],
  dateIso = nowIso(),
): Promise<Map<string, EmiratesStatusResult>> {
  const results = new Map<string, EmiratesStatusResult>();
  const nowMs = Date.now();

  for (const flight of flights) {
    const key = cacheKey(flight, normalizeDate(dateIso));
    const cached = cache.get(key);
    if (cached && cached.expiresAt > nowMs) {
      results.set(key, cached.value);
      continue;
    }

    const result = await fetchFlightStatus(flight, dateIso);
    cache.set(key, {
      expiresAt: nowMs + CACHE_TTL_MS,
      value: result,
    });
    results.set(key, result);
  }

  return results;
}

export function toObservationFromEmirates(
  flight: FocusedEkFlight,
  record: EmiratesStatusRecord,
  id: string,
): FlightObservationRow {
  return {
    id,
    flight_number: flight.flightNumber,
    callsign: null,
    icao24: null,
    flight_id: null,
    airline: "Emirates",
    origin_iata: flight.originIata,
    destination_iata: flight.destinationIata,
    status: record.statusCode,
    is_delayed: record.isDelayed,
    delay_minutes: record.delayMinutes,
    scheduled_time: record.scheduledTime,
    estimated_time: record.estimatedTime,
    actual_time: record.actualTime,
    fetched_at: record.fetchedAt,
    raw_payload: {
      source: "emirates",
      sourceUrl: record.sourceUrl,
      statusText: record.statusText,
      payload: record.rawPayload,
    },
  };
}

export function buildEmiratesResultKey(flight: FocusedEkFlight, dateIso: string): string {
  return cacheKey(flight, normalizeDate(dateIso));
}
