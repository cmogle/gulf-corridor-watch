export type TrustedQualityState = "published" | "rejected";
export type TrustedHealthState = "healthy" | "degraded" | "failing" | "unknown";

export type TrustedStatusLevel = "normal" | "advisory" | "disrupted" | "unknown";

export type TrustedFeedItem = {
  id: string;
  source_id: string;
  source_name: string;
  update_type: "published_event";
  event_at: string;
  fetched_at: string;
  headline: string;
  summary: string;
  original_url: string;
  run_id: string;
  evidence_excerpt: string;
  quality_state: TrustedQualityState;
  quality_reason: string | null;
  published_at: string;
  status_level: TrustedStatusLevel;
};

export type TrustedSourceHistoryItem = TrustedFeedItem;

export type TrustedSourceHealthItem = {
  source_id: string;
  source_name: string;
  source_url: string;
  latest_run_at: string | null;
  latest_success_at: string | null;
  last_publish_at: string | null;
  consecutive_failures: number;
  health_state: TrustedHealthState;
  health_reason: string | null;
  updated_at: string;
};
