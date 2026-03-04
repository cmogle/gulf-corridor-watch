"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { FlightDetailDrawer } from "./drawer";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type FlightDetailSelection =
  | { type: "airport"; airport: string }
  | { type: "route"; from: string; to: string }
  | null;

type FlightDetailContextValue = {
  selected: FlightDetailSelection;
  openAirport: (code: string) => void;
  openRoute: (from: string, to: string) => void;
  close: () => void;
};

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

const FlightDetailContext = createContext<FlightDetailContextValue | null>(null);

export function useFlightDetail(): FlightDetailContextValue {
  const ctx = useContext(FlightDetailContext);
  if (!ctx) throw new Error("useFlightDetail must be used within FlightDetailProvider");
  return ctx;
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function FlightDetailProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<FlightDetailSelection>(null);

  const openAirport = useCallback((code: string) => {
    setSelected({ type: "airport", airport: code });
  }, []);

  const openRoute = useCallback((from: string, to: string) => {
    setSelected({ type: "route", from, to });
  }, []);

  const close = useCallback(() => {
    setSelected(null);
  }, []);

  return (
    <FlightDetailContext.Provider value={{ selected, openAirport, openRoute, close }}>
      {children}
      <FlightDetailDrawer />
    </FlightDetailContext.Provider>
  );
}
