import { TrackingItem, TrackingSnapshot } from "@/lib/tracking-types";

const KEY = "gcw_tracking_v1";
const MAX_ITEMS = 20;

function nowIso() {
  return new Date().toISOString();
}

function canonical(item: TrackingItem): string {
  if (item.kind === "flight") return `flight:${(item.flight_number ?? "").toUpperCase()}`;
  return `route:${(item.origin_iata ?? "").toUpperCase()}:${(item.destination_iata ?? "").toUpperCase()}`;
}

function readSnapshot(): TrackingSnapshot {
  try {
    if (typeof window === "undefined") return { items: [], updated_at: nowIso() };
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { items: [], updated_at: nowIso() };
    const parsed = JSON.parse(raw) as TrackingSnapshot;
    if (!parsed || !Array.isArray(parsed.items)) return { items: [], updated_at: nowIso() };
    return { items: parsed.items, updated_at: parsed.updated_at ?? nowIso() };
  } catch {
    return { items: [], updated_at: nowIso() };
  }
}

function writeSnapshot(items: TrackingItem[]): TrackingItem[] {
  const deduped = new Map<string, TrackingItem>();
  for (const item of items) deduped.set(canonical(item), item);
  const normalized = [...deduped.values()]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(-MAX_ITEMS);

  if (typeof window !== "undefined") {
    const payload: TrackingSnapshot = { items: normalized, updated_at: nowIso() };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  }
  return normalized;
}

export function loadTracking(): TrackingItem[] {
  return readSnapshot().items;
}

export function saveTracking(items: TrackingItem[]): void {
  writeSnapshot(items);
}

export function addTrackedFlight(flightNumber: string): TrackingItem[] {
  const clean = flightNumber.toUpperCase().replace(/\s+/g, "");
  const current = readSnapshot().items;
  const next: TrackingItem = {
    id: `flight-${clean}`,
    kind: "flight",
    flight_number: clean,
    label: clean,
    created_at: nowIso(),
  };
  return writeSnapshot([...current, next]);
}

export function addTrackedRoute(origin: string, destination: string): TrackingItem[] {
  const o = origin.toUpperCase().trim();
  const d = destination.toUpperCase().trim();
  const current = readSnapshot().items;
  const next: TrackingItem = {
    id: `route-${o}-${d}`,
    kind: "route",
    origin_iata: o,
    destination_iata: d,
    label: `${o} -> ${d}`,
    created_at: nowIso(),
  };
  return writeSnapshot([...current, next]);
}

export function removeTrackedItem(id: string): TrackingItem[] {
  const current = readSnapshot().items;
  return writeSnapshot(current.filter((item) => item.id !== id));
}
