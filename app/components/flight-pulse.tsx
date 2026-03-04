"use client";

type AirportPulse = {
  total: number;
  delayed: number;
  cancelled: number;
  latestFetch: string | null;
};

type AirportCode = "DXB" | "AUH" | "DWC";

type Props = {
  byAirport: Record<AirportCode, AirportPulse>;
  topRoutes: Array<{ route: string; count: number }>;
  onClickAirport?: (code: string) => void;
};

const AIRPORT_META: Record<AirportCode, { label: string; suffix?: string }> = {
  DXB: { label: "DXB" },
  AUH: { label: "AUH" },
  DWC: { label: "DWC", suffix: "Cargo" },
};

function relativeTime(iso: string | null): string {
  if (!iso) return "n/a";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

export function FlightPulse({ byAirport, topRoutes, onClickAirport }: Props) {
  return (
    <section className="mx-auto max-w-4xl px-4 py-8 md:px-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">
        Flight Pulse
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {(["DXB", "AUH", "DWC"] as const).map((code) => {
          const airport = byAirport[code] ?? { total: 0, delayed: 0, cancelled: 0, latestFetch: null };
          const meta = AIRPORT_META[code];
          return (
            <article
              key={code}
              onClick={() => onClickAirport?.(code)}
              className="cursor-pointer rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-[var(--primary-blue)] hover:bg-blue-50/30"
            >
              <h3 className="font-serif text-2xl">
                {meta.label}
                {meta.suffix && (
                  <span className="ml-2 text-sm font-normal text-[var(--text-secondary)]">{meta.suffix}</span>
                )}
              </h3>
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
