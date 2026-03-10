import { MainRouteMonitor } from "@/app/components/main-route-monitor";
import { loadFocusedMonitorData } from "@/lib/focused-monitor-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const initial = await loadFocusedMonitorData(48);
  return <MainRouteMonitor initial={initial} />;
}
