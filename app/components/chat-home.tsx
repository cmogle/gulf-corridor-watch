"use client";

import type { AirspacePosture } from "./layout-types";

type ChatHomeProps = {
  posture: AirspacePosture;
  briefingSummary: string;
  sourceCount: number;
  updatedAt: string | null;
  suggestedPrompts: string[];
  onPromptClick: (prompt: string) => void;
};

const DEFAULT_PROMPTS = [
  "Can I fly to Dubai right now?",
  "DXB delays and cancellations",
  "Is it safe to travel to the UAE?",
  "What airlines are affected?",
];

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

export function ChatHome({
  posture,
  briefingSummary,
  sourceCount,
  updatedAt,
  suggestedPrompts,
  onPromptClick,
}: ChatHomeProps) {
  const prompts = suggestedPrompts.length > 0
    ? [...new Set([...suggestedPrompts, ...DEFAULT_PROMPTS])].slice(0, 6)
    : DEFAULT_PROMPTS;

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl space-y-8 animate-fade-in-up">
        {/* Posture headline */}
        <div className="space-y-3 text-center">
          <div className="flex items-center justify-center gap-3">
            <PostureDot posture={posture} />
            <h1 className="font-serif text-3xl text-[var(--text-primary)] md:text-4xl">
              {postureHeadline(posture)}
            </h1>
          </div>
          <p className="mx-auto max-w-lg text-[15px] leading-relaxed text-[var(--text-secondary)]">
            {briefingSummary}
          </p>
        </div>

        {/* Suggested prompts */}
        <div className="space-y-3">
          <p className="text-center text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">
            Ask anything
          </p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {prompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => onPromptClick(prompt)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-left text-[14px] text-[var(--text-primary)] shadow-sm transition-all hover:border-gray-300 hover:shadow-md active:scale-[0.98]"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-[var(--text-secondary)]">
          Updated {relativeTime(updatedAt)} &middot; {sourceCount} sources reporting
        </p>
      </div>
    </div>
  );
}
