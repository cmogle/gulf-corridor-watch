"use client";

import { useEffect, useRef } from "react";

const HEARTBEAT_INTERVAL_MS = 5 * 60_000; // 5 minutes
const CATCHUP_DEBOUNCE_KEY = "gcw:catchup_ts";
const CATCHUP_DEBOUNCE_MS = 60_000; // 1 minute

export function HeartbeatProvider({ children }: { children: React.ReactNode }) {
  const catchUpFired = useRef(false);

  useEffect(() => {
    async function sendHeartbeat(isInitial: boolean) {
      try {
        const res = await fetch("/api/heartbeat", { method: "POST" });
        if (!res.ok) return;
        const data = await res.json();

        if (isInitial && data.needs_catch_up && !catchUpFired.current) {
          // Debounce across tabs via sessionStorage
          const last = sessionStorage.getItem(CATCHUP_DEBOUNCE_KEY);
          if (last && Date.now() - Number(last) < CATCHUP_DEBOUNCE_MS) return;

          catchUpFired.current = true;
          sessionStorage.setItem(CATCHUP_DEBOUNCE_KEY, String(Date.now()));

          // Fire-and-forget catch-up
          fetch("/api/catchup", { method: "POST" }).catch(() => {});
        }
      } catch {
        // Heartbeat failure is non-critical
      }
    }

    sendHeartbeat(true);

    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        sendHeartbeat(false);
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, []);

  return <>{children}</>;
}
