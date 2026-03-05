"use client";

import { useEffect, useState } from "react";
import type { CurrentStateBrief } from "@/lib/current-state-brief";
import { SituationBriefing } from "../situation-briefing";

const POLL_INTERVAL_MS = 5 * 60_000; // 5 minutes — matches cron refresh cadence

type BriefingTabProps = {
  currentBrief: CurrentStateBrief | null;
};

export default function BriefingTab({ currentBrief }: BriefingTabProps) {
  const [brief, setBrief] = useState(currentBrief);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;

    async function fetchBrief() {
      try {
        const res = await fetch("/api/brief/current");
        if (!res.ok) return;
        const data = await res.json();
        if (data.ok && data.item) setBrief(data.item);
      } catch {
        // silently ignore — next poll will retry
      }
    }

    // Fetch immediately if the brief is already stale (> 10 min old)
    if (brief?.refreshed_at) {
      const ageMs = Date.now() - new Date(brief.refreshed_at).getTime();
      if (ageMs > 10 * 60_000) fetchBrief();
    }

    timer = setInterval(fetchBrief, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-4">
      {brief ? (
        <SituationBriefing
          paragraph={brief.paragraph}
          sections={brief.sections}
          refreshedAt={brief.refreshed_at}
          confidence={brief.confidence}
          sourceCount={brief.coverage.sources_included.length}
        />
      ) : (
        <p className="py-8 text-center text-sm text-[var(--text-secondary)]">
          No briefing available yet.
        </p>
      )}
    </div>
  );
}
