/**
 * Purge all source_snapshots from Supabase.
 * Useful before a clean re-ingest after pipeline changes.
 *
 * Usage:  npx tsx --env-file=.env.local scripts/purge-snapshots.ts
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { count, error: countErr } = await supabase
    .from("source_snapshots")
    .select("id", { count: "exact", head: true });

  if (countErr) {
    console.error("Failed to count snapshots:", countErr.message);
    process.exit(1);
  }

  console.log(`Found ${count ?? 0} snapshots to purge.`);
  if (!count) {
    console.log("Nothing to delete.");
    return;
  }

  const { error } = await supabase
    .from("source_snapshots")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (error) {
    console.error("Delete failed:", error.message);
    process.exit(1);
  }

  console.log(`Purged ${count} snapshots.`);
}

main();
