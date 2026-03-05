import type { SuppressedSource } from "../layout-types";
import { ExpertAnalysisPanel } from "../expert-analysis-panel";
import { ResourcesPanel } from "../resources-panel";
import { MyTrackingPanel } from "../my-tracking-panel";
import { SourceHealth } from "../source-health";

type ResourcesTabProps = {
  totalSources: number;
  healthySources: number;
  suppressedSources: SuppressedSource[];
};

export default function ResourcesTab({
  totalSources,
  healthySources,
  suppressedSources,
}: ResourcesTabProps) {
  return (
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
  );
}
