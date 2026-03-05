"use client";

import { useState } from "react";

type BriefSections = {
  security: string;
  flights: string;
  guidance: string;
  source_coverage: string;
} | null;

type Props = {
  paragraph: string;
  sections?: BriefSections;
  refreshedAt: string;
  confidence: "high" | "medium" | "low";
  sourceCount: number;
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return "1 hour ago";
  return `${hours} hours ago`;
}

function confidenceBadge(confidence: Props["confidence"]) {
  const cls =
    confidence === "high"
      ? "bg-emerald-100 text-emerald-800"
      : confidence === "medium"
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-800";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {confidence} confidence
    </span>
  );
}

const SECTION_META: { key: keyof Exclude<BriefSections, null>; label: string; icon: string }[] = [
  { key: "security", label: "Security Situation", icon: "shield" },
  { key: "flights", label: "Airspace & Flights", icon: "plane" },
  { key: "guidance", label: "Practical Guidance", icon: "compass" },
  { key: "source_coverage", label: "Source Coverage", icon: "signal" },
];

function SectionIcon({ type }: { type: string }) {
  switch (type) {
    case "shield":
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
      );
    case "plane":
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
        </svg>
      );
    case "compass":
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
        </svg>
      );
    case "signal":
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
      );
    default:
      return null;
  }
}

export function SituationBriefing({ paragraph, sections, refreshedAt, confidence, sourceCount }: Props) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const hasSections = sections && Object.values(sections).some((s) => s);

  return (
    <section className="mx-auto max-w-3xl px-4 py-8 md:px-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">
        Intelligence Briefing
      </p>
      {confidence !== "high" && (
        <div className="mt-3 h-px bg-[var(--amber)] opacity-40" />
      )}

      {/* Executive Summary */}
      <p className="mt-4 text-base leading-[1.65] text-[var(--text-primary)]">
        {paragraph}
      </p>

      {/* Expandable Sections */}
      {hasSections && (
        <div className="mt-6 space-y-1">
          {SECTION_META.map(({ key, label, icon }) => {
            const content = sections[key];
            if (!content) return null;
            const isExpanded = expandedSection === key;
            return (
              <div key={key} className="rounded-lg border border-[var(--border-light)]">
                <button
                  onClick={() => setExpandedSection(isExpanded ? null : key)}
                  className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)]"
                  aria-expanded={isExpanded}
                >
                  <span className="text-[var(--text-secondary)]">
                    <SectionIcon type={icon} />
                  </span>
                  <span className="flex-1">{label}</span>
                  <svg
                    className={`h-4 w-4 text-[var(--text-secondary)] transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {isExpanded && (
                  <div className="border-t border-[var(--border-light)] px-4 py-3">
                    <p className="text-sm leading-[1.65] text-[var(--text-primary)]">
                      {content}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
        <span>Updated {relativeTime(refreshedAt)}</span>
        {confidenceBadge(confidence)}
        <span>{sourceCount} sources</span>
      </div>
    </section>
  );
}
