"use client";

import { useEffect, useRef } from "react";
import { useFlightDetail } from "./context";
import { AirportDetail } from "./airport-detail";
import { RouteDetail } from "./route-detail";

export function FlightDetailDrawer() {
  const { selected, close } = useFlightDetail();
  const panelRef = useRef<HTMLDivElement>(null);
  const isOpen = selected !== null;

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, close]);

  // Focus trap: focus panel on open
  useEffect(() => {
    if (isOpen && panelRef.current) {
      panelRef.current.focus();
    }
  }, [isOpen]);

  // Lock body scroll when open on mobile
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={close}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={
          selected?.type === "airport"
            ? `${selected.airport} flight detail`
            : selected?.type === "route"
              ? `${selected.from} to ${selected.to} route detail`
              : "Flight detail"
        }
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-white shadow-2xl outline-none transition-transform duration-300 ease-out md:max-w-[480px] ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">
            Flight Intelligence
          </p>
          <button
            onClick={close}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-gray-100 hover:text-[var(--text-primary)]"
            aria-label="Close panel"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="4" x2="12" y2="12" />
              <line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {selected?.type === "airport" && (
            <AirportDetail airport={selected.airport} />
          )}
          {selected?.type === "route" && (
            <RouteDetail from={selected.from} to={selected.to} />
          )}
        </div>
      </div>
    </>
  );
}
