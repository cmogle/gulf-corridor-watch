export type ExpertCategory = "maritime" | "defense" | "energy" | "geopolitical" | "osint";

export type ExpertAccount = {
  handle: string;
  tier: 1 | 2;
  category: ExpertCategory;
  label: string;
};

export type ExpertSignal = {
  handle: string;
  post_id: string;
  posted_at: string;
  text_original: string;
  text_en: string | null;
  url: string;
  category: ExpertCategory;
  relevance_score: number;
  relevance_method: "keyword" | "llm";
  keyword_matches: string[];
  included_in_digest: boolean;
  fetched_at: string;
};

export type ExpertDigest = {
  id: string;
  digest_text: string;
  signal_ids: string[];
  signal_count: number;
  generated_at: string;
};

export type ExpertFeedResponse = {
  ok: boolean;
  digest: ExpertDigest | null;
  signals: ExpertSignal[];
  meta: {
    total_accounts: number;
    active_signals_24h: number;
    last_poll: string | null;
  };
};

// --- Account Registry ---

export const EXPERT_ACCOUNTS: ExpertAccount[] = [
  // Tier 1 — Maritime
  { handle: "mikeschuler", tier: 1, category: "maritime", label: "gCaptain maritime editor" },
  { handle: "mercoglianos", tier: 1, category: "maritime", label: "Maritime industry analyst" },
  { handle: "cavasships", tier: 1, category: "maritime", label: "Naval/shipping journalist" },
  { handle: "samlagrone", tier: 1, category: "maritime", label: "USNI News naval reporter" },
  { handle: "malshelbourne", tier: 1, category: "maritime", label: "USNI News naval reporter" },
  { handle: "tomsharpe134", tier: 1, category: "maritime", label: "Royal Navy, Hormuz expertise" },
  { handle: "bartgonnissen", tier: 1, category: "maritime", label: "Shipping/freight analyst" },

  // Tier 1 — Energy
  { handle: "javierblas", tier: 1, category: "energy", label: "Bloomberg energy/commodities" },
  { handle: "loriannlarocco", tier: 1, category: "energy", label: "CNBC shipping/trade reporter" },
  { handle: "sullycnbc", tier: 1, category: "energy", label: "CNBC markets/energy" },
  { handle: "freightalley", tier: 1, category: "energy", label: "Freight/logistics industry" },
  { handle: "mintzmyer", tier: 1, category: "energy", label: "Shipping/maritime finance" },
  { handle: "ed_fin", tier: 1, category: "energy", label: "Energy/finance analyst" },

  // Tier 1 — Geopolitical & Defense
  { handle: "vtchakarova", tier: 1, category: "geopolitical", label: "Gulf security/geopolitical" },
  { handle: "aviation_intel", tier: 1, category: "defense", label: "Military aviation intel" },

  // Tier 2 — Defense
  { handle: "cdrsalamander", tier: 2, category: "defense", label: "Naval defense analyst" },
  { handle: "brentdsadler", tier: 2, category: "defense", label: "Heritage Foundation naval policy" },
  { handle: "bdherzinger", tier: 2, category: "defense", label: "Indo-Pacific defense analyst" },
  { handle: "trenttelenko", tier: 2, category: "defense", label: "Military logistics analyst" },
  { handle: "thomasbsauer", tier: 2, category: "defense", label: "Military/defense analysis" },

  // Tier 2 — Geopolitical
  { handle: "joshuasteinman", tier: 2, category: "geopolitical", label: "Former NSC, national security" },
  { handle: "ezracohen", tier: 2, category: "geopolitical", label: "Intelligence community" },
  { handle: "jkylebass", tier: 2, category: "geopolitical", label: "Macro/geopolitical finance" },

  // Tier 2 — OSINT
  { handle: "schizointel", tier: 2, category: "osint", label: "OSINT analyst" },
  { handle: "vcdgf555", tier: 2, category: "osint", label: "OSINT/geopolitical" },
  { handle: "ianellisjones", tier: 2, category: "osint", label: "Geopolitical/OSINT analyst" },

  // Tier 2 — Energy
  { handle: "joshyoung", tier: 2, category: "energy", label: "Energy markets analyst" },
  { handle: "biancoresearch", tier: 2, category: "energy", label: "Markets/macro research" },
];

// --- Gulf/Conflict Keywords ---

const GEOGRAPHIC_TERMS = [
  "iran", "hormuz", "persian gulf", "strait", "gulf of oman",
  "arabian sea", "uae", "adnoc", "fujairah", "bandar abbas",
  "kish", "chabahar",
];

const MILITARY_TERMS = [
  "centcom", "navy", "carrier", "destroyer", "strike group",
  "deployment", "missile", "drone", "intercept", "sortie",
  "b-52", "irgc", "quds", "revolutionary guard",
];

const SHIPPING_TERMS = [
  "tanker", "shipping lane", "insurance", "freight", "maritime",
  "piracy", "blockade", "escort", "convoy", "war risk premium",
  "p&i", "lloyds",
];

const ENERGY_TERMS = [
  "oil price", "crude", "lng", "pipeline", "sanctions",
  "opec", "barrel", "refinery", "brent",
];

const AVIATION_TERMS = [
  "airspace", "notam", "divert", "overflight", "restricted",
  "no-fly", "fir", "tehran fir",
];

const ALL_GULF_KEYWORDS = [
  ...GEOGRAPHIC_TERMS,
  ...MILITARY_TERMS,
  ...SHIPPING_TERMS,
  ...ENERGY_TERMS,
  ...AVIATION_TERMS,
];

export function findGulfKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return ALL_GULF_KEYWORDS.filter((term) => lower.includes(term));
}

export function scoreRelevance(keywords: string[]): number {
  if (keywords.length === 0) return 0.15;
  if (keywords.length === 1) return 0.45;
  if (keywords.length === 2) return 0.6;
  if (keywords.length === 3) return 0.8;
  return 0.92;
}
