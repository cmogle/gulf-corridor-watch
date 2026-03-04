"use client";

import { useFlightDetail } from "./context";
import { FlightPulse } from "@/app/components/flight-pulse";

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
};

export function FlightPulseWithDetail({ byAirport, topRoutes }: Props) {
  const { openAirport } = useFlightDetail();
  return <FlightPulse byAirport={byAirport} topRoutes={topRoutes} onClickAirport={openAirport} />;
}
