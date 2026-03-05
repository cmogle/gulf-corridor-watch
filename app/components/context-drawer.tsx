"use client";

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { ContextDrawerTab, FlightPulseData, SuppressedSource } from "./layout-types";
import type { CurrentStateBrief } from "@/lib/current-state-brief";
import type { UnifiedUpdateItem } from "@/lib/unified-updates-types";

// Lazy-load tab contents — only downloaded when first activated
const BriefingTab = lazy(() => import("./drawer-tabs/briefing-tab"));
const FlightsTab = lazy(() => import("./drawer-tabs/flights-tab"));
const FeedTab = lazy(() => import("./drawer-tabs/feed-tab"));
const ResourcesTab = lazy(() => import("./drawer-tabs/resources-tab"));

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

const DRAG_DISMISS_THRESHOLD = 0.3; // 30% of sheet height

function TabLoader() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[var(--primary-blue)]" />
    </div>
  );
}

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
  // Track which tabs have been visited so they stay mounted (hidden) after first load
  const [visitedTabs, setVisitedTabs] = useState<Set<ContextDrawerTab>>(new Set);
  const prevOpen = useRef(isOpen);

  // When drawer opens or active tab changes, mark the current tab as visited
  useEffect(() => {
    if (isOpen) {
      setVisitedTabs((prev) => {
        if (prev.has(activeTab)) return prev;
        return new Set(prev).add(activeTab);
      });
    }
  }, [isOpen, activeTab]);

  // Reset visited tabs on close (transition from open → closed only)
  useEffect(() => {
    if (prevOpen.current && !isOpen) {
      setVisitedTabs(new Set());
    }
    prevOpen.current = isOpen;
  }, [isOpen]);

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

  // --- Drag-to-dismiss for mobile bottom sheet ---
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startY: number; startTranslate: number } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const isDragging = dragOffset > 0;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only enable on mobile (the drag handle area, or sheet header)
    const touch = e.touches[0];
    dragState.current = { startY: touch.clientY, startTranslate: 0 };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragState.current) return;
    const touch = e.touches[0];
    const dy = touch.clientY - dragState.current.startY;
    // Only allow dragging down, not up
    if (dy > 0) {
      setDragOffset(dy);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!dragState.current || !sheetRef.current) {
      dragState.current = null;
      setDragOffset(0);
      return;
    }
    const sheetHeight = sheetRef.current.offsetHeight;
    if (dragOffset > sheetHeight * DRAG_DISMISS_THRESHOLD) {
      onClose();
    }
    dragState.current = null;
    setDragOffset(0);
  }, [dragOffset, onClose]);

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
        ref={sheetRef}
        role="complementary"
        aria-label="Dashboard panels"
        className={`fixed z-20 flex flex-col bg-white shadow-2xl
          /* Mobile: bottom sheet */
          inset-x-0 bottom-0 max-h-[80vh] rounded-t-2xl
          /* Desktop: right panel */
          md:inset-x-auto md:top-12 md:right-0 md:bottom-0 md:max-h-none md:w-[480px] md:rounded-none
          ${isDragging ? "" : "transition-transform duration-300 ease-out"}
          ${isOpen
            ? "translate-y-0 md:translate-x-0 md:translate-y-0"
            : "translate-y-full md:translate-x-full md:translate-y-0"
          }
        `}
        style={isDragging ? { transform: `translateY(${dragOffset}px)` } : undefined}
      >
        {/* Mobile drag handle — touch target for drag-to-dismiss */}
        <div
          className="flex justify-center py-2 md:hidden"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>

        {/* Header with tabs + close button */}
        <div
          className="flex items-center border-b border-gray-200"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
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

        {/* Tab content — lazy-mounted, hidden when not active but kept alive */}
        <div className="flex-1 overflow-y-auto">
          <Suspense fallback={<TabLoader />}>
            {visitedTabs.has("briefing") && (
              <div className={activeTab === "briefing" ? "" : "hidden"}>
                <BriefingTab currentBrief={currentBrief} />
              </div>
            )}
            {visitedTabs.has("flights") && (
              <div className={activeTab === "flights" ? "" : "hidden"}>
                <FlightsTab pulse={pulse} />
              </div>
            )}
            {visitedTabs.has("feed") && (
              <div className={activeTab === "feed" ? "" : "hidden"}>
                <FeedTab initialUpdates={initialUpdates} />
              </div>
            )}
            {visitedTabs.has("resources") && (
              <div className={activeTab === "resources" ? "" : "hidden"}>
                <ResourcesTab
                  totalSources={totalSources}
                  healthySources={healthySources}
                  suppressedSources={suppressedSources}
                />
              </div>
            )}
          </Suspense>
        </div>
      </div>
    </>
  );
}
