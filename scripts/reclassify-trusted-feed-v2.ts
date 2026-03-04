/**
 * Reclassify legacy v2 published rows that fail current strict relevance rules.
 *
 * Usage:
 *   DRY_RUN=1 npx tsx --env-file=.env.local scripts/reclassify-trusted-feed-v2.ts
 *   npx tsx --env-file=.env.local scripts/reclassify-trusted-feed-v2.ts
 */

import { createClient } from "@supabase/supabase-js";
import { isTrustedOperationallyRelevant } from "../lib/trusted-feed-quality";
import { TRUSTED_FEED_CORE_SOURCE_IDS } from "../lib/trusted-feed-core-sources";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const maxAgeHours = Number(process.env.TRUSTED_FEED_MAX_EVENT_AGE_HOURS ?? 48);
const dryRun = process.env.DRY_RUN === "1";

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

type PublishedRow = {
  event_id: string;
  source_id: string;
  event_time: string;
  headline: string;
  summary: string;
  published_at: string | null;
};

function isRecentEvent(eventIso: string): boolean {
  const parsed = new Date(eventIso).getTime();
  if (!Number.isFinite(parsed)) return false;
  const ageHours = (Date.now() - parsed) / (60 * 60 * 1000);
  return ageHours <= (Number.isFinite(maxAgeHours) ? maxAgeHours : 48);
}

async function loadPublishedRows(): Promise<PublishedRow[]> {
  const rows: PublishedRow[] = [];
  const pageSize = 500;
  let page = 0;

  while (true) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("source_events_v2")
      .select("event_id,source_id,event_time,headline,summary,published_at")
      .eq("quality_state", "published")
      .in("source_id", [...TRUSTED_FEED_CORE_SOURCE_IDS])
      .order("event_time", { ascending: false })
      .range(from, to);
    if (error) throw error;
    const pageRows = (data ?? []) as PublishedRow[];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) break;
    page += 1;
  }

  return rows;
}

async function demoteRows(eventIds: string[]) {
  const chunkSize = 200;
  for (let i = 0; i < eventIds.length; i += chunkSize) {
    const chunk = eventIds.slice(i, i + chunkSize);
    const { error } = await supabase
      .from("source_events_v2")
      .update({
        quality_state: "rejected",
        quality_reason: "backfill_not_actionable_update",
        published_at: null,
      })
      .in("event_id", chunk);
    if (error) throw error;
  }
}

async function refreshLastPublishForSource(sourceId: string) {
  const { data: latest, error: latestError } = await supabase
    .from("source_events_v2")
    .select("published_at")
    .eq("source_id", sourceId)
    .eq("quality_state", "published")
    .order("event_time", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;

  const { error } = await supabase
    .from("source_health_v2")
    .update({
      last_publish_at: latest?.published_at ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("source_id", sourceId);
  if (error) throw error;
}

async function main() {
  const rows = await loadPublishedRows();
  const toDemote = rows.filter((row) => {
    const relevant = isTrustedOperationallyRelevant(row.headline, row.summary);
    const recent = isRecentEvent(row.event_time);
    return !relevant || !recent;
  });

  console.log(
    JSON.stringify(
      {
        scanned_published_rows: rows.length,
        to_demote: toDemote.length,
        dry_run: dryRun,
      },
      null,
      2,
    ),
  );

  if (toDemote.length > 0) {
    console.log("Sample rows to demote:");
    for (const row of toDemote.slice(0, 10)) {
      console.log(`${row.source_id}\t${row.event_id}\t${row.event_time}\t${row.headline.slice(0, 80)}`);
    }
  }

  if (dryRun || toDemote.length === 0) return;

  await demoteRows(toDemote.map((row) => row.event_id));
  for (const sourceId of TRUSTED_FEED_CORE_SOURCE_IDS) {
    await refreshLastPublishForSource(sourceId);
  }

  console.log(`Demoted ${toDemote.length} rows and refreshed source last_publish_at fields.`);
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
