export const TRUSTED_FEED_CORE_SOURCE_IDS = [
  "emirates_updates",
  "etihad_advisory",
  "air_arabia_updates",
  "oman_air",
  "flydubai_updates",
  "heathrow_airport_x",
  "emirates_x",
  "etihad_x",
  "flydubai_x",
] as const;

export type TrustedFeedCoreSourceId = (typeof TRUSTED_FEED_CORE_SOURCE_IDS)[number];

const CORE_SET = new Set<string>(TRUSTED_FEED_CORE_SOURCE_IDS);

export function isTrustedFeedCoreSource(sourceId: string): sourceId is TrustedFeedCoreSourceId {
  return CORE_SET.has(sourceId);
}
