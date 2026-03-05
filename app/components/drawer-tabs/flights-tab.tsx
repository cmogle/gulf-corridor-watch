import type { FlightPulseData } from "../layout-types";
import { FlightDetailProvider } from "../flight-detail/context";
import { AirspacePulseAtlas } from "../pulse-atlas";
import { FlightPulseWithDetail } from "../flight-detail/flight-pulse-wrapper";

type FlightsTabProps = {
  pulse: FlightPulseData;
};

export default function FlightsTab({ pulse }: FlightsTabProps) {
  return (
    <FlightDetailProvider>
      <div className="space-y-4 p-4">
        <AirspacePulseAtlas />
        <FlightPulseWithDetail byAirport={pulse.byAirport} topRoutes={pulse.topRoutes} />
      </div>
    </FlightDetailProvider>
  );
}
