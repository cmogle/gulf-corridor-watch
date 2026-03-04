import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { OFFICIAL_SOURCES } from "./sources";
import { extractTrustedCandidates } from "./trusted-feed-adapters";

const FIXTURES: Array<{ source_id: string; file: string; content_type: "html" | "rss" }> = [
  { source_id: "emirates_updates", file: "emirates_updates.html", content_type: "html" },
  { source_id: "etihad_advisory", file: "etihad_advisory.html", content_type: "html" },
  { source_id: "air_arabia_updates", file: "air_arabia_updates.html", content_type: "html" },
  { source_id: "uae_mofa", file: "uae_mofa.html", content_type: "html" },
  { source_id: "gcaa_uae", file: "gcaa_uae.html", content_type: "html" },
  { source_id: "flydubai_updates", file: "flydubai_updates.html", content_type: "html" },
  { source_id: "us_state_dept_travel", file: "us_state_dept_travel.rss", content_type: "rss" },
  { source_id: "uk_fcdo_uae", file: "uk_fcdo_uae.rss", content_type: "rss" },
];
const NEGATIVE_HTML_FIXTURES: Array<{ source_id: string; file: string }> = [
  { source_id: "emirates_updates", file: "emirates_evergreen_shell.html" },
  { source_id: "etihad_advisory", file: "etihad_404_shell.html" },
  { source_id: "flydubai_updates", file: "flydubai_nav_shell.html" },
];

for (const fixture of FIXTURES) {
  test(`adapter contract: ${fixture.source_id}`, () => {
    const source = OFFICIAL_SOURCES.find((row) => row.id === fixture.source_id);
    assert.ok(source, `missing source ${fixture.source_id}`);

    const content = readFileSync(path.join(process.cwd(), "lib/trusted-feed/fixtures", fixture.file), "utf8");
    const result = extractTrustedCandidates({
      source: source!,
      raw_text: content,
      normalized_text: content.replace(/\s+/g, " "),
      source_url: source!.url,
      fetched_at: "2026-03-04T00:00:00.000Z",
      content_type: fixture.content_type,
    });

    assert.ok(result.parse_threshold > 0);
    assert.ok(result.candidates.length > 0);

    const first = result.candidates[0];
    assert.ok(first.headline.length >= 8);
    assert.ok(first.summary.length > 20);
    assert.ok(first.evidence_excerpt.length > 20);
    assert.ok(/^https?:\/\//.test(first.original_url));
    assert.ok(!Number.isNaN(new Date(first.event_time).getTime()));
    assert.ok(first.parse_confidence >= 0 && first.parse_confidence <= 1);
  });
}

test("strict HTML adapters keep high confidence on actionable blocks", () => {
  const source = OFFICIAL_SOURCES.find((row) => row.id === "air_arabia_updates");
  assert.ok(source);
  const content = readFileSync(path.join(process.cwd(), "lib/trusted-feed/fixtures", "air_arabia_updates.html"), "utf8");
  const result = extractTrustedCandidates({
    source,
    raw_text: content,
    normalized_text: content.replace(/\s+/g, " "),
    source_url: source.url,
    fetched_at: "2026-03-04T00:00:00.000Z",
    content_type: "html",
  });

  assert.ok(result.candidates.length > 0);
  assert.ok(result.candidates[0].parse_confidence >= 0.86);
  assert.match(result.candidates[0].summary.toLowerCase(), /(suspend|refund|date change)/);
});

for (const fixture of NEGATIVE_HTML_FIXTURES) {
  test(`strict HTML adapters demote non-event shell: ${fixture.source_id}`, () => {
    const source = OFFICIAL_SOURCES.find((row) => row.id === fixture.source_id);
    assert.ok(source, `missing source ${fixture.source_id}`);

    const content = readFileSync(path.join(process.cwd(), "lib/trusted-feed/fixtures", fixture.file), "utf8");
    const result = extractTrustedCandidates({
      source: source!,
      raw_text: content,
      normalized_text: content.replace(/\s+/g, " "),
      source_url: source!.url,
      fetched_at: "2026-03-04T00:00:00.000Z",
      content_type: "html",
    });

    assert.ok(result.candidates.length > 0);
    assert.ok(result.candidates[0].parse_confidence <= 0.45);
  });
}
