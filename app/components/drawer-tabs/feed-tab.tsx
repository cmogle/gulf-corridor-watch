import type { UnifiedUpdateItem } from "@/lib/unified-updates-types";
import { CrisisPanel } from "../crisis-timeline";
import { UpdatesFeed } from "../updates-feed";

type FeedTabProps = {
  initialUpdates: UnifiedUpdateItem[];
};

export default function FeedTab({ initialUpdates }: FeedTabProps) {
  return (
    <div className="space-y-4 p-4">
      <CrisisPanel />
      <UpdatesFeed initialItems={initialUpdates} />
    </div>
  );
}
