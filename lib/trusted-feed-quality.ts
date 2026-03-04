import { createHash } from "crypto";
import { isUnusableSourceText, sanitizeSourceText } from "./source-quality";
import type { TrustedQualityState, TrustedStatusLevel } from "./trusted-feed-types";

export type TrustedCandidateEvent = {
  event_time: string;
  headline: string;
  summary: string;
  original_url: string;
  evidence_excerpt: string;
  parse_confidence: number;
  status_level?: TrustedStatusLevel;
};

export type QualificationDecision = {
  quality_state: TrustedQualityState;
  quality_reason: string | null;
  event_hash: string;
  status_level: TrustedStatusLevel;
};

const MIN_HEADLINE_LEN = 8;
const MAX_HEADLINE_LEN = 220;
const MIN_SUMMARY_LEN = 80;
const MAX_SUMMARY_LEN = 2000;
const MAX_EVENT_AGE_HOURS = 24 * 7;
const OPERATIONAL_KEYWORDS = [
  "flight",
  "flights",
  "airline",
  "airport",
  "airspace",
  "delay",
  "delayed",
  "cancel",
  "cancelled",
  "suspend",
  "suspended",
  "terminal",
  "gate",
  "runway",
  "route",
  "reroute",
  "diversion",
  "advisory",
  "travel",
  "depart",
  "departure",
  "arrival",
];
const NON_ACTIONABLE_PATTERNS = [
  /oops[^.]{0,80}page/i,
  /page (doesn'?t exist|was removed|temporarily unavailable)/i,
  /inaccurate reporting/i,
  /false and misleading claims/i,
  /deputy prime minister/i,
  /meets .* foreign minister/i,
  /\bgood morning\b/i,
  /\bwelcome to\b/i,
  /\bfollow @/i,
  /\btravel insurance\b/i,
  /\bleave large electricals\b/i,
  /\bempty pockets\b/i,
  /\bwhat are you looking for\b/i,
  /\bmanage booking\b/i,
  /\bbook (a )?flight\b/i,
  /\bupgrade to business class\b/i,
  /\bfrequently asked questions\b/i,
  /\bchildren travelling alone\b/i,
  /\bthe extraordinary challenge\b/i,
  /\benglishالعربية/i,
  /find out about the latest travel updates/i,
  /we update this page regularly/i,
  /\bwhether your next trip abroad\b/i,
];
const ACTIONABLE_KEYWORDS = [
  "delay",
  "delayed",
  "cancel",
  "cancelled",
  "suspend",
  "suspended",
  "closure",
  "closed",
  "disruption",
  "reroute",
  "diversion",
  "grounded",
  "rebook",
  "refund",
  "waiver",
  "terminal change",
  "do not travel",
  "reconsider travel",
];

function compact(text: string, max = 5000): string {
  return sanitizeSourceText(text).slice(0, max);
}

function safeDate(iso: string): string | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function alphaRatio(text: string): number {
  const cleaned = compact(text);
  if (!cleaned) return 0;
  const alphaCount = (cleaned.match(/[a-z]/gi) ?? []).length;
  return alphaCount / cleaned.length;
}

function uniqueTokenRatio(text: string): number {
  const tokens = compact(text)
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 2);
  if (tokens.length === 0) return 0;
  return new Set(tokens).size / tokens.length;
}

function looksLikeUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

function operationalScore(text: string): number {
  const normalized = text.toLowerCase();
  return OPERATIONAL_KEYWORDS.reduce((sum, keyword) => sum + (normalized.includes(keyword) ? 1 : 0), 0);
}

function actionableScore(text: string): number {
  const normalized = text.toLowerCase();
  return ACTIONABLE_KEYWORDS.reduce((sum, keyword) => sum + (normalized.includes(keyword) ? 1 : 0), 0);
}

export function isTrustedOperationallyRelevant(headline: string, summary: string): boolean {
  const combined = `${compact(headline, 400)} ${compact(summary, 2000)}`;
  if (NON_ACTIONABLE_PATTERNS.some((pattern) => pattern.test(combined))) return false;
  if (operationalScore(combined) === 0) return false;
  if (actionableScore(combined) === 0) return false;
  return true;
}

export function inferTrustedStatusLevel(text: string): TrustedStatusLevel {
  const t = text.toLowerCase();
  if (/(outage|grounded|shutdown|severe|evacuat|closure|closed|suspend(ed)? all)/.test(t)) return "disrupted";
  if (/(cancel|delay|disrupt|incident|warning|advisory|reconsider travel|do not travel|temporarily suspended)/.test(t)) return "advisory";
  if (!t.trim()) return "unknown";
  return "normal";
}

export function computeTrustedEventHash(input: {
  source_id: string;
  headline: string;
  summary: string;
  original_url: string;
}): string {
  const normalized = {
    source_id: input.source_id,
    headline: compact(input.headline, 800),
    summary: compact(input.summary, 3000),
    original_url: input.original_url.trim(),
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export function qualifyTrustedCandidate(input: {
  source_id: string;
  candidate: TrustedCandidateEvent;
  normalized_text: string;
  parse_threshold: number;
  duplicate_recent_event: boolean;
}): QualificationDecision {
  const headline = compact(input.candidate.headline, MAX_HEADLINE_LEN + 20);
  const summary = compact(input.candidate.summary, MAX_SUMMARY_LEN + 20);
  const evidence = compact(input.candidate.evidence_excerpt, 500);
  const eventTimeIso = safeDate(input.candidate.event_time);
  const status = input.candidate.status_level ?? inferTrustedStatusLevel(`${headline} ${summary}`);

  const event_hash = computeTrustedEventHash({
    source_id: input.source_id,
    headline,
    summary,
    original_url: input.candidate.original_url,
  });

  if (input.candidate.parse_confidence < input.parse_threshold) {
    return { quality_state: "rejected", quality_reason: "parse_confidence_below_threshold", event_hash, status_level: status };
  }

  if (!eventTimeIso) {
    return { quality_state: "rejected", quality_reason: "invalid_event_time", event_hash, status_level: status };
  }

  const ageHours = (Date.now() - new Date(eventTimeIso).getTime()) / (60 * 60 * 1000);
  if (!Number.isFinite(ageHours) || ageHours > MAX_EVENT_AGE_HOURS) {
    return { quality_state: "rejected", quality_reason: "stale_event_time", event_hash, status_level: status };
  }

  if (!looksLikeUrl(input.candidate.original_url)) {
    return { quality_state: "rejected", quality_reason: "invalid_original_url", event_hash, status_level: status };
  }

  if (headline.length < MIN_HEADLINE_LEN || headline.length > MAX_HEADLINE_LEN) {
    return { quality_state: "rejected", quality_reason: "headline_length_invalid", event_hash, status_level: status };
  }

  if (summary.length < MIN_SUMMARY_LEN || summary.length > MAX_SUMMARY_LEN) {
    return { quality_state: "rejected", quality_reason: "summary_length_invalid", event_hash, status_level: status };
  }

  if (alphaRatio(summary) < 0.35) {
    return { quality_state: "rejected", quality_reason: "summary_low_alpha_ratio", event_hash, status_level: status };
  }

  if (uniqueTokenRatio(summary) < 0.25) {
    return { quality_state: "rejected", quality_reason: "summary_low_entropy", event_hash, status_level: status };
  }

  if (isUnusableSourceText(`${headline} ${summary}`)) {
    return { quality_state: "rejected", quality_reason: "summary_marked_unusable", event_hash, status_level: status };
  }

  if (!isTrustedOperationallyRelevant(headline, summary)) {
    return { quality_state: "rejected", quality_reason: "not_actionable_update", event_hash, status_level: status };
  }

  if (!evidence || evidence.length < 20) {
    return { quality_state: "rejected", quality_reason: "missing_evidence_excerpt", event_hash, status_level: status };
  }

  const normalizedBody = compact(input.normalized_text, 20000).toLowerCase();
  if (!normalizedBody.includes(evidence.toLowerCase().slice(0, 20))) {
    return { quality_state: "rejected", quality_reason: "evidence_not_traceable", event_hash, status_level: status };
  }

  if (input.duplicate_recent_event) {
    return { quality_state: "rejected", quality_reason: "duplicate_recent_event", event_hash, status_level: status };
  }

  return {
    quality_state: "published",
    quality_reason: null,
    event_hash,
    status_level: status,
  };
}
