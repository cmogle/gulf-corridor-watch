import type { CurrentStateBrief } from "@/lib/current-state-brief";
import { SituationBriefing } from "../situation-briefing";

type BriefingTabProps = {
  currentBrief: CurrentStateBrief | null;
};

export default function BriefingTab({ currentBrief }: BriefingTabProps) {
  return (
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
  );
}
