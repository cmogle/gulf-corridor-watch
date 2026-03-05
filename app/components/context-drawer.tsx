"use client";

import { useEffect } from "react";
import type { ContextDrawerTab, FlightPulseData, SuppressedSource } from "./layout-types";
import type { CurrentStateBrief } from "@/lib/current-state-brief";
import type { UnifiedUpdateItem } from "@/lib/unified-updates-types";
import { SituationBriefing } from "./situation-briefing";
import { FlightDetailProvider } from "./flight-detail/context";
import { AirspacePulseAtlas } from "./pulse-atlas";
import { FlightPulseWithDetail } from "./flight-detail/flight-pulse-wrapper";
import { UpdatesFeed } from "./updates-feed";
import { CrisisPanel } from "./crisis-timeline";
import { ExpertAnalysisPanel } from "./expert-analysis-panel";
import { ResourcesPanel } from "./resources-panel";
import { MyTrackingPanel } from "./my-tracking-panel";
import { SourceHealth } from "./source-health";

type ContextDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  activeTab: ContextDrawerTab;
  onTabChange: (tab: ContextDrawerTab) => void;
  // Briefing data
  currentBrief: CurrentStateBrief | null;
  // Flights data
  pulse: FlightPulseData;
  // Feed data
  initialUpdates: UnifiedUpdateItem[];
  // Source health data
  totalSources: number;
  healthySources: number;
  suppressedSources: SuppressedSource[];
};

const TABS: { id: ContextDrawerTab; label: string }[] = [
  { id: "briefing", label: "Briefing" },
  { id: "flights", label: "Flights" },
  { id: "feed", label: "Feed" },
  { id: "resources", label: "Resources" },
];

export function ContextDrawer({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  currentBrief,
  pulse,
  initialUpdates,
  totalSources,
  healthySources,
  suppressedSources,
}: ContextDrawerProps) {
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  // Lock body scroll on mobile when open
  useEffect(() => {
    if (!isOpen) return;
    const mq = window.matchMedia("(max-width: 768px)");
    if (mq.matches) {
      document.body.style.overflow = "hidden";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-20 bg-black/20 transition-opacity duration-300 md:hidden ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel — right slide on desktop, bottom sheet on mobile */}
      <div
        role="complementary"
        aria-label="Dashboard panels"
        className={`fixed z-20 flex flex-col bg-white shadow-2xl transition-transform duration-300 ease-out
          /* Mobile: bottom sheet */
          inset-x-0 bottom-0 max-h-[80vh] rounded-t-2xl
          /* Desktop: right panel */
          md:inset-x-auto md:top-12 md:right-0 md:bottom-0 md:max-h-none md:w-[480px] md:rounded-none
          ${isOpen
            ? "translate-y-0 md:translate-x-0 md:translate-y-0"
            : "translate-y-full md:translate-x-full md:translate-y-0"
          }
        `}
      >
        {/* Mobile drag handle */}
        <div className="flex justify-center py-2 md:hidden">
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>

        {/* Header with tabs + close button */}
        <div className="flex items-center border-b border-gray-200">
          <div className="flex flex-1 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`whitespace-nowrap px-4 py-3 text-xs font-medium uppercase tracking-wider transition-colors ${
                  activeTab === tab.id
                    ? "border-b-2 border-[var(--primary-blue)] text-[var(--primary-blue)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="mr-2 flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-gray-100 hover:text-[var(--text-primary)]"
            aria-label="Close panel"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="4" x2="12" y2="12" />
              <line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        </div>

        {/* Tab content — scrollable */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === "briefing" && (
            <div className="p-4">
              {currentBrief ? (
                <SituationBriefing
                  paragraph={currentBrief.paragraph}
                  sections={currentBrief.sections}
                  refreshedAt={currentBrief.refreshed_at}
                  confidence={currentBrief.confidence}
                  sourceCount={currentBrief.coverage.sources_included.length}
                />
              ) : (
                <p className="py-8 text-center text-sm text-[var(--text-secondary)]">
                  No briefing available yet.
                </p>
              )}
            </div>
          )}

          {activeTab === "flights" && (
            <FlightDetailProvider>
              <div className="space-y-4 p-4">
                <AirspacePulseAtlas />
                <FlightPulseWithDetail byAirport={pulse.byAirport} topRoutes={pulse.topRoutes} />
              </div>
            </FlightDetailProvider>
          )}

          {activeTab === "feed" && (
            <div className="space-y-4 p-4">
              <CrisisPanel />
              <UpdatesFeed initialItems={initialUpdates} />
            </div>
          )}

          {activeTab === "resources" && (
            <div className="space-y-4 p-4">
              <ExpertAnalysisPanel />
              <ResourcesPanel />
              <MyTrackingPanel />
              <SourceHealth
                totalSources={totalSources}
                healthySources={healthySources}
                suppressedSources={suppressedSources}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
