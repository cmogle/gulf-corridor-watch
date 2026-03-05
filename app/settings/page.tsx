"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { loadTracking } from "@/lib/tracking-local";

const COMMON_AIRPORTS = [
  "", "DXB", "AUH", "DWC", "DOH", "BAH", "KWI", "MCT", "RUH", "JED",
  "DEL", "BOM", "BLR", "MAA", "COK", "HYD", "CCU", "AMD",
  "LHR", "LGW", "MAN", "DUB",
  "CDG", "FRA", "AMS", "ZRH",
  "JFK", "LAX", "ORD", "YYZ",
  "SIN", "BKK", "HKG", "SYD",
];

const DETAIL_OPTIONS = ["concise", "standard", "comprehensive"] as const;

type ProfileData = {
  home_airport: string | null;
  detail_preference: string | null;
  tracked_routes: Array<{ origin: string; destination: string }> | null;
  tracked_flights: string[] | null;
};

export default function SettingsPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form state
  const [homeAirport, setHomeAirport] = useState("");
  const [detailPref, setDetailPref] = useState("standard");
  const [routes, setRoutes] = useState<Array<{ origin: string; destination: string }>>([]);
  const [flights, setFlights] = useState<string[]>([]);

  // New item inputs
  const [newRouteOrigin, setNewRouteOrigin] = useState("");
  const [newRouteDest, setNewRouteDest] = useState("");
  const [newFlight, setNewFlight] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    loadProfile();
  }, [authLoading, isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadProfile() {
    const supabase = getSupabaseBrowser();
    if (!supabase || !user) { setLoading(false); return; }

    const { data, error } = await supabase
      .from("user_profiles")
      .select("home_airport,detail_preference,tracked_routes,tracked_flights")
      .eq("id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows found, which is fine for new users
      setMessage({ type: "error", text: error.message });
    }

    const p = (data as ProfileData | null) ?? {
      home_airport: null,
      detail_preference: "standard",
      tracked_routes: null,
      tracked_flights: null,
    };
    setProfile(p);
    setHomeAirport(p.home_airport ?? "");
    setDetailPref(p.detail_preference ?? "standard");
    setRoutes(p.tracked_routes ?? []);
    setFlights(p.tracked_flights ?? []);
    setLoading(false);
  }

  async function save() {
    const supabase = getSupabaseBrowser();
    if (!supabase || !user) return;
    setSaving(true);
    setMessage(null);

    const payload = {
      id: user.id,
      home_airport: homeAirport || null,
      detail_preference: detailPref,
      tracked_routes: routes.length > 0 ? routes : null,
      tracked_flights: flights.length > 0 ? flights : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("user_profiles")
      .upsert(payload, { onConflict: "id" });

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "Settings saved." });
    }
    setSaving(false);
  }

  async function importFromLocal() {
    const local = loadTracking();
    if (local.length === 0) {
      setMessage({ type: "error", text: "No local tracking data to import." });
      return;
    }

    const importedRoutes = [...routes];
    const importedFlights = [...flights];

    for (const item of local) {
      if (item.kind === "flight" && item.flight_number) {
        if (!importedFlights.includes(item.flight_number)) {
          importedFlights.push(item.flight_number);
        }
      } else if (item.kind === "route" && item.origin_iata && item.destination_iata) {
        const exists = importedRoutes.some(
          (r) => r.origin === item.origin_iata && r.destination === item.destination_iata,
        );
        if (!exists) {
          importedRoutes.push({ origin: item.origin_iata, destination: item.destination_iata });
        }
      }
    }

    setRoutes(importedRoutes);
    setFlights(importedFlights);
    setMessage({ type: "success", text: `Imported ${local.length} items from local storage. Click Save to persist.` });
  }

  function addRoute() {
    const o = newRouteOrigin.toUpperCase().trim();
    const d = newRouteDest.toUpperCase().trim();
    if (!o || !d || o.length !== 3 || d.length !== 3) return;
    if (routes.some((r) => r.origin === o && r.destination === d)) return;
    setRoutes([...routes, { origin: o, destination: d }]);
    setNewRouteOrigin("");
    setNewRouteDest("");
  }

  function removeRoute(idx: number) {
    setRoutes(routes.filter((_, i) => i !== idx));
  }

  function addFlight() {
    const f = newFlight.toUpperCase().trim().replace(/\s+/g, "");
    if (!f || flights.includes(f)) return;
    setFlights([...flights, f]);
    setNewFlight("");
  }

  function removeFlight(idx: number) {
    setFlights(flights.filter((_, i) => i !== idx));
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-light)]">
        <p className="text-[var(--text-secondary)]">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--surface-light)]">
        <p className="text-lg text-[var(--text-primary)]">Sign in to manage your settings.</p>
        <a href="/auth" className="rounded-lg bg-[var(--surface-dark)] px-6 py-2 text-sm font-medium text-white">
          Sign in
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface-light)]">
      <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-2xl text-[var(--text-primary)]">Settings</h1>
          <a href="/" className="text-sm text-[var(--primary-blue)] hover:underline">Back to dashboard</a>
        </div>

        {message && (
          <div className={`mt-4 rounded-lg px-4 py-3 text-sm ${
            message.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"
          }`}>
            {message.text}
          </div>
        )}

        <div className="mt-8 space-y-8">
          {/* Home Airport */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Home Airport</h2>
            <select
              value={homeAirport}
              onChange={(e) => setHomeAirport(e.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--primary-blue)]"
            >
              <option value="">Not set</option>
              {COMMON_AIRPORTS.filter(Boolean).map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          </section>

          {/* Detail Preference */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Response Detail Level</h2>
            <div className="mt-2 flex gap-2">
              {DETAIL_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setDetailPref(opt)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium capitalize transition ${
                    detailPref === opt
                      ? "bg-[var(--surface-dark)] text-white"
                      : "border border-gray-300 bg-white text-[var(--text-secondary)] hover:bg-gray-50"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Controls how detailed chat responses are.
            </p>
          </section>

          {/* Tracked Routes */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Tracked Routes</h2>
            {routes.length > 0 && (
              <ul className="mt-2 space-y-1">
                {routes.map((r, i) => (
                  <li key={`${r.origin}-${r.destination}`} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                    <span className="font-mono">{r.origin} → {r.destination}</span>
                    <button onClick={() => removeRoute(i)} className="text-xs text-red-600 hover:underline">Remove</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                placeholder="Origin (e.g. DUB)"
                value={newRouteOrigin}
                onChange={(e) => setNewRouteOrigin(e.target.value)}
                maxLength={3}
                className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase outline-none focus:ring-2 focus:ring-[var(--primary-blue)]"
              />
              <span className="text-[var(--text-secondary)]">→</span>
              <input
                type="text"
                placeholder="Dest (e.g. DXB)"
                value={newRouteDest}
                onChange={(e) => setNewRouteDest(e.target.value)}
                maxLength={3}
                className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase outline-none focus:ring-2 focus:ring-[var(--primary-blue)]"
              />
              <button
                onClick={addRoute}
                disabled={!newRouteOrigin.trim() || !newRouteDest.trim()}
                className="rounded-lg bg-[var(--surface-dark)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </section>

          {/* Tracked Flights */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Tracked Flights</h2>
            {flights.length > 0 && (
              <ul className="mt-2 space-y-1">
                {flights.map((f, i) => (
                  <li key={f} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                    <span className="font-mono">{f}</span>
                    <button onClick={() => removeFlight(i)} className="text-xs text-red-600 hover:underline">Remove</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                placeholder="Flight number (e.g. EK162)"
                value={newFlight}
                onChange={(e) => setNewFlight(e.target.value)}
                maxLength={8}
                className="w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase outline-none focus:ring-2 focus:ring-[var(--primary-blue)]"
              />
              <button
                onClick={addFlight}
                disabled={!newFlight.trim()}
                className="rounded-lg bg-[var(--surface-dark)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </section>

          {/* Import from local */}
          <section className="rounded-lg border border-dashed border-gray-300 p-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Have tracking data saved locally? Import it into your profile.
            </p>
            <button
              onClick={() => void importFromLocal()}
              className="mt-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
            >
              Import from local storage
            </button>
          </section>

          {/* Save */}
          <button
            onClick={() => void save()}
            disabled={saving}
            className="w-full rounded-lg bg-[var(--surface-dark)] py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
