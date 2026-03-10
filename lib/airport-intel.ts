export type AirportIntel = {
  code: "DXB" | "BOM" | "LHR";
  terminal: string;
  checkIn: {
    counters: string;
    opensHoursBefore: number;
    recommendedArrivalHoursBefore: { economy: number; business: number };
    baggageDropNotes?: string;
  };
  gates: {
    ranges: string;
    walkTimes: string;
    shuttle?: string;
    notes?: string;
  };
  immigration: {
    offPeakMinutes: [number, number];
    peakMinutes: [number, number];
    tips: string[];
  };
  transit: {
    minConnectionMinutes: number;
    typicalConnectionMinutes: number;
    notes: string[];
  };
  lounges: Array<{ name: string; location: string; access: string; features?: string[] }>;
  transport: {
    toCity: string[];
    rideShare: string;
    metro?: string;
    taxi?: string;
  };
  amenities: {
    food: string[];
    prayerRooms: string[];
    currencyExchange: string[];
    other?: string[];
  };
};

const AIRPORT_INTEL: AirportIntel[] = [
  {
    code: "DXB",
    terminal: "Terminal 3 (Concourses A/B/C)",
    checkIn: {
      counters: "Zones B–D for Emirates; Skywards Silver/Gold desks in Zone C",
      opensHoursBefore: 24,
      recommendedArrivalHoursBefore: { economy: 3, business: 2 },
      baggageDropNotes: "Baggage drop accepts bags up to 24h prior; oversize at end of Zone A.",
    },
    gates: {
      ranges: "A1–A24 (A380), B1–B32, C1–C50",
      walkTimes: "10–18 min from security to most gates; A gates require brief train ride",
      shuttle: "Automated train runs every ~3 min to Concourse A",
      notes: "Gate changes frequent in B/C; monitor screens after immigration.",
    },
    immigration: {
      offPeakMinutes: [10, 20],
      peakMinutes: [25, 40],
      tips: [
        "Use SmartGate if UAE resident; passports + face scan",
        "Morning 06:00–09:00 and midnight bank 23:00–01:30 are the busiest",
      ],
    },
    transit: {
      minConnectionMinutes: 75,
      typicalConnectionMinutes: 90,
      notes: ["Airside transfer desks located between B15–B19", "Expect extra 10 min if connecting to Concourse A"],
    },
    lounges: [
      {
        name: "Emirates Business Lounge",
        location: "Concourses A/B/C (multiple entrances)",
        access: "Business cabin or Skywards Silver+ on Emirates flights",
        features: ["Showers", "Quiet pods", "Hot food all day"],
      },
      {
        name: "Emirates First Lounge",
        location: "Concourse A & B",
        access: "First Class or paid upgrade; Silver allowed if flying First",
      },
    ],
    transport: {
      toCity: ["Taxi to Downtown ~20–30 min off-peak", "Metro Red Line from T3 every 4–6 min"],
      rideShare: "Careem/Uber pick-up from arrivals kerb; follow green signs",
      metro: "T3 Metro connects to Financial Centre/DIFC in ~22 min",
      taxi: "Airport taxis are metered; credit cards accepted",
    },
    amenities: {
      food: ["Jones the Grocer", "Costa, Pret, and Giraffe in B", "Shake Shack near B26"],
      prayerRooms: ["Prayer rooms at each concourse near gates A1, B7, C17"],
      currencyExchange: ["Travelex desks in Arrivals and near B10/C15"],
      other: ["Sleep pods in B Quiet area", "Showers inside lounges and at health club near B13"],
    },
  },
  {
    code: "BOM",
    terminal: "Terminal 2 (International)",
    checkIn: {
      counters: "Islands P–S; Emirates usually near Door 8–10",
      opensHoursBefore: 4,
      recommendedArrivalHoursBefore: { economy: 3, business: 2.5 },
      baggageDropNotes: "Oversize drop at Door 2; expect queue during late-night waves.",
    },
    gates: {
      ranges: "Gates 45–78",
      walkTimes: "8–15 min post-security; remote stands common for late-night departures",
      notes: "Security is centralized; keep boarding pass handy for second scan at gates.",
    },
    immigration: {
      offPeakMinutes: [15, 30],
      peakMinutes: [45, 70],
      tips: [
        "Peak spikes 23:00–02:00 and 04:00–06:00; factor extra buffer",
        "Indian passport e-gates are rolling out but not fully reliable; keep manual line as backup",
      ],
    },
    transit: {
      minConnectionMinutes: 90,
      typicalConnectionMinutes: 120,
      notes: ["Transfer desks near Gate 50", "Expect additional bus time if arriving on remote stand"],
    },
    lounges: [
      {
        name: "GVK Lounge (International)",
        location: "Level 3 after security",
        access: "Business/First or eligible credit cards; Silver in Economy may pay at door off-peak",
        features: ["Showers", "Live cooking station", "Nap chairs"],
      },
    ],
    transport: {
      toCity: ["Pre-paid taxi counters in arrivals", "Private car to BKC ~25–45 min off-peak"],
      rideShare: "Uber/Ola pick-up from P5 car park via lift after arrivals",
      metro: "Nearest metro Airport Road/Marol Naka (Line 1) via 10–12 min cab; Line 3 under construction",
      taxi: "Pre-paid black/yellow cabs are cheaper but queue can be long",
    },
    amenities: {
      food: ["Street Food by Punjab Grill", "Starbucks near Gate 66", "Irish House bar"],
      prayerRooms: ["Prayer room near Gate 47"],
      currencyExchange: ["Thomas Cook and Centrum desks in arrivals and near Gate 65"],
      other: ["Free Wi‑Fi for 45 min; OTP via mobile", "Showers inside GVK lounge"],
    },
  },
  {
    code: "LHR",
    terminal: "Terminal 3",
    checkIn: {
      counters: "Zone C for Emirates",
      opensHoursBefore: 3,
      recommendedArrivalHoursBefore: { economy: 3, business: 2 },
      baggageDropNotes: "Self-service bag drops available; oversized bags at Zone E.",
    },
    gates: {
      ranges: "Gates 1–11 and 16–25",
      walkTimes: "6–15 min after central security",
      notes: "Gate numbering resets; monitors announce 90–60 min before departure.",
    },
    immigration: {
      offPeakMinutes: [10, 20],
      peakMinutes: [30, 60],
      tips: [
        "Use UK eGates with biometric passport (age 12+)",
        "Morning bank 05:30–08:00 can build; arrivals from US/ME land together",
      ],
    },
    transit: {
      minConnectionMinutes: 75,
      typicalConnectionMinutes: 90,
      notes: ["All T3; short walk unless coach to T5 needed", "Fast Track available for eligible Business/First arrivals"],
    },
    lounges: [
      {
        name: "Emirates Lounge",
        location: "Near Gate 7",
        access: "Business/First or Skywards Silver+ on Emirates flights",
        features: ["Shower suites", "Direct boarding bridge when gate allows"],
      },
      {
        name: "No1 Lounge / Club Aspire",
        location: "Near Gate 9/1",
        access: "Priority Pass/DragonPass (back-up if Emirates Lounge at capacity)",
      },
    ],
    transport: {
      toCity: ["Elizabeth Line to Paddington ~28 min", "Piccadilly Line ~50–55 min to Zone 1"],
      rideShare: "Uber/Bolt from arrivals forecourt; allow 10–15 min pick-up",
      metro: "Heathrow Express from T3 via walkway to T2/3 station (15 min to Paddington)",
      taxi: "Black cab into central London ~£70–£90, 45–75 min depending on traffic",
    },
    amenities: {
      food: ["Pret, Costa, and Spuntino post-security", "Duty-free World Duty Free superstore"],
      prayerRooms: ["Multi-faith prayer room near Gate 24"],
      currencyExchange: ["Travelex desks before and after security"],
      other: ["Free Wi‑Fi, no time cap", "Showers in Emirates Lounge and Plaza Premium (paid)"],
    },
  },
];

export function getAirportIntel(code: string): AirportIntel | null {
  const c = code.trim().toUpperCase();
  return AIRPORT_INTEL.find((a) => a.code === c) ?? null;
}

export const airportIntel = AIRPORT_INTEL;
