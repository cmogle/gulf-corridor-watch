"use client";

import { useState } from "react";

type SuppressedSource = {
  source_id: string;
  source_name: string;
  source_url: string;
  reason: string;
};

type Props = {
  totalSources: number;
  healthySources: number;
  suppressedSources: SuppressedSource[];
};

export function SourceHealth({ totalSources, healthySources, suppressedSources }: Props) {
  const [expanded, setExpanded] = useState(false);
  const unavailable = suppressedSources.length;

  return (
    <footer className="border-t border-gray-200 bg-gray-50 px-4 py-4">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--text-secondary)]">
          {healthySources} of {totalSources} sources reporting normally
          {unavailable > 0 && (
            <> · <span className="text-[var(--amber)]">{unavailable} temporarily unavailable</span></>
          )}
        </p>
        {unavailable > 0 && (
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-[var(--primary-blue)] underline">
            {expanded ? "Hide" : "Details"}
          </button>
        )}
      </div>
      {expanded && suppressedSources.length > 0 && (
        <div className="mx-auto mt-3 max-w-4xl">
          <ul className="grid gap-2 sm:grid-cols-2">
            {suppressedSources.map((s) => (
              <li key={s.source_id} className="rounded-lg bg-white p-3 text-xs">
                <p className="font-medium">{s.source_name}</p>
                <p className="text-[var(--text-secondary)]">{s.reason}</p>
                <a href={s.source_url} target="_blank" className="text-[var(--primary-blue)] underline">
                  Check directly
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </footer>
  );
}
