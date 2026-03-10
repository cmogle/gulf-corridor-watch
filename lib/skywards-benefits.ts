export type CabinClass = "Economy" | "Premium Economy" | "Business" | "First";

export type LoungeAccessRule = {
  cabin: CabinClass;
  locations: string[];
  rule: string;
  guestPolicy: string;
  notes?: string;
};

export type BaggageAllowance = {
  cabin: CabinClass;
  allowanceKg: number;
  silverExtraKg: number;
  priorityTag: boolean;
  notes?: string;
};

export type MilesEarning = {
  route: string;
  origin: "DXB" | "BOM" | "LHR" | "LGW";
  destination: "DXB" | "BOM" | "LHR" | "LGW";
  distanceMiles: number;
  cabinMultipliers: Record<CabinClass, number>;
  silverBonusRate: number; // 0.25 => +25%
};

export type TerminalNote = {
  airport: "DXB" | "BOM" | "LHR";
  terminal: string;
  highlights: string[];
};

export type SkywardsSilverBenefits = {
  lounge: LoungeAccessRule[];
  baggage: BaggageAllowance[];
  boarding: string;
  seatSelection: string;
  miles: MilesEarning[];
  statusQualification: {
    tierMiles: number;
    tierFlights: number;
    reviewWindowMonths: number;
    notes: string[];
  };
  terminals: TerminalNote[];
};

const LOUNGE: LoungeAccessRule[] = [
  {
    cabin: "Economy",
    locations: ["DXB T3"],
    rule: "Silver can access Emirates Business Lounge when flying Emirates; no guest allowance in Economy.",
    guestPolicy: "No guests in Economy unless traveling in the same PNR with Business/First pax.",
    notes: "Carry the digital card; passport + boarding pass are checked at lounge desk.",
  },
  {
    cabin: "Premium Economy",
    locations: ["DXB T3"],
    rule: "Silver may use Emirates Business Lounge subject to capacity; guests not guaranteed.",
    guestPolicy: "Typically no complimentary guest; paid guesting sometimes offered off-peak.",
  },
  {
    cabin: "Business",
    locations: ["DXB T3", "BOM T2", "LHR T3"],
    rule: "Business cabin already grants lounge; Silver keeps the perk if on mixed PNRs.",
    guestPolicy: "One guest on Emirates flights when space permits.",
  },
  {
    cabin: "First",
    locations: ["DXB Concourse A & B", "Partner lounges when First not available"],
    rule: "First cabin overrides status. Silver still welcomed; escort sometimes offered at DXB.",
    guestPolicy: "One guest traveling on Emirates flight, subject to lounge rules.",
  },
];

const BAGGAGE: BaggageAllowance[] = [
  {
    cabin: "Economy",
    allowanceKg: 25,
    silverExtraKg: 12,
    priorityTag: true,
    notes: "Silver adds +12kg on weight-based tickets; for piece concept, +1 extra piece up to 23kg.",
  },
  {
    cabin: "Premium Economy",
    allowanceKg: 30,
    silverExtraKg: 12,
    priorityTag: true,
  },
  {
    cabin: "Business",
    allowanceKg: 40,
    silverExtraKg: 0,
    priorityTag: true,
    notes: "Business already includes priority handling; Silver tag reinforces it at DXB T3.",
  },
  {
    cabin: "First",
    allowanceKg: 50,
    silverExtraKg: 0,
    priorityTag: true,
  },
];

const MILES: MilesEarning[] = [
  {
    route: "DXB-BOM",
    origin: "DXB",
    destination: "BOM",
    distanceMiles: 1215,
    cabinMultipliers: {
      Economy: 1.0,
      "Premium Economy": 1.1,
      Business: 1.5,
      First: 2.0,
    },
    silverBonusRate: 0.25,
  },
  {
    route: "DXB-LHR",
    origin: "DXB",
    destination: "LHR",
    distanceMiles: 3400,
    cabinMultipliers: {
      Economy: 1.0,
      "Premium Economy": 1.15,
      Business: 1.6,
      First: 2.0,
    },
    silverBonusRate: 0.25,
  },
];

const TERMINALS: TerminalNote[] = [
  {
    airport: "DXB",
    terminal: "T3 (Emirates concourses A/B/C)",
    highlights: [
      "Dedicated Skywards Silver/Gold check-in in Zone C",
      "Fast-track security lane usually open for premium + elites",
      "Business lounges in Concourses A/B/C with quiet rooms and showers",
    ],
  },
  {
    airport: "BOM",
    terminal: "T2 (International)",
    highlights: [
      "Emirates uses check-in islands at Door 8–10; oversized baggage at Door 2",
      "GVK lounge access for Business/First; Silver in Economy may need paid access",
      "Immigration queues spike 01:00–04:00 and 22:00–00:00",
    ],
  },
  {
    airport: "LHR",
    terminal: "T3",
    highlights: [
      "Check-in Zone C typically opens 3 hours before departure",
      "Emirates Lounge near Gate 7; fast track security for Business/First + elites",
      "Shower availability is limited in peak morning banks",
    ],
  },
];

export const skywardsSilverBenefits: SkywardsSilverBenefits = {
  lounge: LOUNGE,
  baggage: BAGGAGE,
  boarding: "Priority boarding lane offered; Silver called with Business/First when space allows, else immediately after.",
  seatSelection: "Free regular seat selection at booking; discounted preferred seats (exit/bulkhead) shown during seat map step.",
  miles: MILES,
  statusQualification: {
    tierMiles: 25000,
    tierFlights: 25,
    reviewWindowMonths: 12,
    notes: [
      "Earn either 25,000 Tier Miles or complete 25 eligible flights to retain Silver.",
      "Silver bonus: +25% Skywards Miles on flown base miles across cabins.",
    ],
  },
  terminals: TERMINALS,
};

export function calculateSilverMiles(
  origin: "DXB" | "BOM" | "LHR" | "LGW",
  destination: "DXB" | "BOM" | "LHR" | "LGW",
  cabin: CabinClass,
) {
  const match = MILES.find((m) => m.origin === origin && m.destination === destination);
  if (!match) return null;
  const base = match.distanceMiles * (match.cabinMultipliers[cabin] ?? 1);
  const bonus = Math.round(base * match.silverBonusRate);
  const total = Math.round(base + bonus);
  return {
    route: match.route,
    cabin,
    baseMiles: Math.round(base),
    silverBonusMiles: bonus,
    totalMiles: total,
    silverBonusRate: match.silverBonusRate,
  };
}
