"use client";

import { useState, useCallback } from "react";
import { StatusBar } from "./status-bar";
import { ChatHome } from "./chat-home";
import { ChatPanel } from "./chat-panel";
import { ContextDrawer } from "./context-drawer";
import type {
  AirspacePosture,
  CrisisTrend,
  ContextDrawerTab,
  FlightPulseData,
  SuppressedSource,
} from "./layout-types";
import type { CurrentStateBrief } from "@/lib/current-state-brief";
import type { UnifiedUpdateItem } from "@/lib/unified-updates-types";

type ChatFirstLayoutProps = {
  // Status bar
  posture: AirspacePosture;
  flightTotal: number;
  flightDelayed: number;
  flightCancelled: number;
  updatedAt: string | null;
  trend: CrisisTrend;
  sourceCount: number;
  // Chat home
  briefingSummary: string;
  suggestedPrompts: string[];
  // Context drawer data
  currentBrief: CurrentStateBrief | null;
  pulse: FlightPulseData;
  initialUpdates: UnifiedUpdateItem[];
  totalSources: number;
  healthySources: number;
  suppressedSources: SuppressedSource[];
};

export function ChatFirstLayout({
  posture,
  flightTotal,
  flightDelayed,
  flightCancelled,
  updatedAt,
  trend,
  sourceCount,
  briefingSummary,
  suggestedPrompts,
  currentBrief,
  pulse,
  initialUpdates,
  totalSources,
  healthySources,
  suppressedSources,
}: ChatFirstLayoutProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ContextDrawerTab>("briefing");
  const [hasStartedChat, setHasStartedChat] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | undefined>(undefined);

  const handleToggleDrawer = useCallback(() => {
    setIsDrawerOpen((prev) => !prev);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setIsDrawerOpen(false);
  }, []);

  const handlePromptClick = useCallback((prompt: string) => {
    setPendingPrompt(prompt);
    setHasStartedChat(true);
  }, []);

  const handleFirstMessage = useCallback(() => {
    setHasStartedChat(true);
  }, []);

  const handleBackToHome = useCallback(() => {
    setHasStartedChat(false);
    setPendingPrompt(undefined);
  }, []);

  const handleOpenBriefing = useCallback(() => {
    setActiveTab("briefing");
    setIsDrawerOpen(true);
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--surface-light)]">
      <StatusBar
        posture={posture}
        flightTotal={flightTotal}
        flightDelayed={flightDelayed}
        flightCancelled={flightCancelled}
        updatedAt={updatedAt}
        trend={trend}
        onToggleDrawer={handleToggleDrawer}
        isDrawerOpen={isDrawerOpen}
      />

      {/* Main content area below fixed status bar */}
      <div className="flex flex-1 overflow-hidden pt-12">
        {/* Chat area */}
        <div
          className="flex flex-1 flex-col overflow-hidden"
          onClick={isDrawerOpen ? handleCloseDrawer : undefined}
        >
          {!hasStartedChat ? (
            <ChatHome
              posture={posture}
              briefingSummary={briefingSummary}
              sourceCount={sourceCount}
              updatedAt={updatedAt}
              suggestedPrompts={suggestedPrompts}
              onPromptClick={handlePromptClick}
              onOpenBriefing={handleOpenBriefing}
            />
          ) : (
            <ChatPanel
              variant="fullscreen"
              suggestedPrompts={suggestedPrompts}
              initialPrompt={pendingPrompt}
              onFirstMessage={handleFirstMessage}
              onBackToHome={handleBackToHome}
            />
          )}
        </div>

        {/* Context drawer */}
        <ContextDrawer
          isOpen={isDrawerOpen}
          onClose={handleCloseDrawer}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          currentBrief={currentBrief}
          pulse={pulse}
          initialUpdates={initialUpdates}
          totalSources={totalSources}
          healthySources={healthySources}
          suppressedSources={suppressedSources}
        />
      </div>
    </div>
  );
}
