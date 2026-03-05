"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AirspacePosture } from "./layout-types";

type ChatHomeProps = {
  posture: AirspacePosture;
  briefingSummary: string;
  sourceCount: number;
  updatedAt: string | null;
  suggestedPrompts: string[];
  onPromptClick: (prompt: string) => void;
  onOpenBriefing?: () => void;
};

/** Rotating placeholder examples — disappear once the user starts typing */
const PLACEHOLDER_CYCLE = [
  "Is my flight to Dubai still operating?",
  "LCA > DXB alternatives today",
  "Which airlines are suspended?",
  "EK202 status right now",
  "Is UAE airspace open?",
  "Safest route to Abu Dhabi",
];

const CYCLE_INTERVAL_MS = 3500;

function PostureDot({ posture }: { posture: AirspacePosture }) {
  const color =
    posture === "normal"
      ? "bg-[var(--green)]"
      : posture === "heightened"
        ? "bg-[var(--amber)]"
        : "bg-[var(--text-secondary)]";
  return (
    <span className={`inline-block h-3.5 w-3.5 rounded-full ${color} ${posture !== "normal" ? "animate-pulse-dot" : ""}`} />
  );
}

function postureHeadline(posture: AirspacePosture): string {
  if (posture === "normal") return "UAE Airspace Open";
  if (posture === "heightened") return "Disruptions Reported";
  return "Status Unclear — Data Limited";
}

function relativeTime(iso: string | null): string {
  if (!iso) return "unknown";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return "1 hour ago";
  return `${hours} hours ago`;
}

/** Truncate to the first N sentences, with ellipsis if truncated */
function truncateSentences(text: string, max: number): { text: string; truncated: boolean } {
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  if (sentences.length <= max) return { text: text.trim(), truncated: false };
  return { text: sentences.slice(0, max).join(" ").trim(), truncated: true };
}

/** Hook: cycle through placeholder strings, pausing when user has typed */
function useCyclingPlaceholder(items: string[], intervalMs: number, pause: boolean) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (pause) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % items.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [items.length, intervalMs, pause]);

  return items[index];
}

export function ChatHome({
  posture,
  briefingSummary,
  sourceCount,
  updatedAt,
  suggestedPrompts,
  onPromptClick,
  onOpenBriefing,
}: ChatHomeProps) {
  const [input, setInput] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build chip list: use dynamic suggested prompts, limit to 4 short ones
  const chips = (suggestedPrompts.length > 0 ? suggestedPrompts : []).slice(0, 4);

  const brief = truncateSentences(briefingSummary, 3);

  // Cycle placeholder when input is empty and not focused
  const placeholder = useCyclingPlaceholder(
    PLACEHOLDER_CYCLE,
    CYCLE_INTERVAL_MS,
    isFocused || input.length > 0,
  );

  const handleSubmit = useCallback(() => {
    const q = input.trim();
    if (!q) return;
    setInput("");
    onPromptClick(q);
  }, [input, onPromptClick]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Scrollable content area */}
      <div className="flex flex-1 items-center justify-center overflow-y-auto px-4 py-8">
        <div className="w-full max-w-2xl space-y-6 animate-fade-in-up">
          {/* Posture headline */}
          <div className="space-y-3 text-center">
            <div className="flex items-center justify-center gap-3">
              <PostureDot posture={posture} />
              <h1 className="font-serif text-3xl text-[var(--text-primary)] md:text-4xl">
                {postureHeadline(posture)}
              </h1>
            </div>
            <p className="mx-auto max-w-lg text-[15px] leading-relaxed text-[var(--text-secondary)]">
              {brief.text}
              {brief.truncated && onOpenBriefing && (
                <>
                  {" "}
                  <button
                    onClick={onOpenBriefing}
                    className="inline text-[var(--primary-blue)] hover:underline"
                  >
                    Full briefing &rarr;
                  </button>
                </>
              )}
            </p>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-[var(--text-secondary)]">
            Updated {relativeTime(updatedAt)} &middot; {sourceCount} sources reporting
          </p>
        </div>
      </div>

      {/* Chat input + chips — pinned to bottom */}
      <div className="border-t border-gray-100 bg-[var(--surface-light)] px-4 pb-4 pt-3">
        <div className="mx-auto w-full max-w-2xl space-y-2.5">
          {/* Input */}
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={placeholder}
              className="w-full rounded-xl border-0 bg-white px-4 py-3.5 pr-20 text-[15px] text-[var(--text-primary)] shadow-lg outline-none ring-2 ring-transparent placeholder:text-[var(--text-secondary)] placeholder:transition-opacity focus:ring-[var(--primary-blue)]"
              aria-label="Ask a question"
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-[var(--surface-dark)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Ask
            </button>
          </div>

          {/* Compact suggestion chips */}
          {chips.length > 0 && (
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {chips.map((chip) => (
                <button
                  key={chip}
                  onClick={() => onPromptClick(chip)}
                  className="shrink-0 rounded-full border border-gray-200 bg-white/80 px-3 py-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:border-gray-300 hover:text-[var(--text-primary)]"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
