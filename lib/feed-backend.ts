export type FeedBackend = "v1" | "v2";

export function getFeedBackend(): FeedBackend {
  const raw = process.env.FEED_BACKEND?.trim().toLowerCase();
  return raw === "v2" ? "v2" : "v1";
}

export function isTrustedFeedV2Enabled(): boolean {
  return getFeedBackend() === "v2";
}
