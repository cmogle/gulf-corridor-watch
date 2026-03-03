import assert from "node:assert/strict";
import test from "node:test";
import { isUsableSnapshot, isUsableFeedItem, isLowConfidenceExtraction } from "./source-quality.ts";

test("isUsableSnapshot rejects blocked reliability", () => {
  assert.equal(isUsableSnapshot({ title: "Emirates", summary: "Normal ops", reliability: "blocked" }), false);
});

test("isUsableSnapshot rejects fetch error text", () => {
  assert.equal(isUsableSnapshot({ title: "Emirates fetch error", summary: "Source fetch failed", reliability: "reliable" }), false);
});

test("isUsableSnapshot accepts normal content", () => {
  assert.equal(isUsableSnapshot({ title: "Emirates Travel Updates", summary: "All operations are running normally today.", reliability: "reliable" }), true);
});

test("isUsableFeedItem rejects degraded reliability", () => {
  assert.equal(isUsableFeedItem({ headline: "UAE MOFA", summary: "SEO boilerplate text here for testing", reliability: "degraded", update_type: "snapshot" }), false);
});

test("isUsableFeedItem rejects blocked reliability", () => {
  assert.equal(isUsableFeedItem({ headline: "Emirates", summary: "Access denied by CDN", reliability: "blocked", update_type: "snapshot" }), false);
});

test("isUsableFeedItem accepts reliable snapshot", () => {
  assert.equal(isUsableFeedItem({ headline: "Emirates Travel Updates", summary: "All operations running normally.", reliability: "reliable", update_type: "snapshot" }), true);
});

test("isUsableFeedItem always accepts x posts regardless of reliability", () => {
  assert.equal(isUsableFeedItem({ headline: "@rta_dubai on X", summary: "Service update", reliability: "degraded", update_type: "x" }), true);
});

test("isUsableFeedItem rejects snapshot with empty summary", () => {
  assert.equal(isUsableFeedItem({ headline: "US Department of Defense Releases", summary: "", reliability: "reliable", update_type: "snapshot" }), false);
  assert.equal(isUsableFeedItem({ headline: "US Department of Defense Releases", summary: "   ", reliability: "reliable", update_type: "snapshot" }), false);
});

test("isUsableSnapshot rejects 'File Not Found' content", () => {
  assert.equal(isUsableSnapshot({ title: "UAE General Civil Aviation Authority", summary: "File Not Found", reliability: "reliable" }), false);
});

test("isUsableSnapshot rejects 'Page not found' content", () => {
  assert.equal(isUsableSnapshot({ title: "Some Source", summary: "The page you requested was not found on this server.", reliability: "reliable" }), false);
});

test("isUsableSnapshot rejects '404 Not Found' content", () => {
  assert.equal(isUsableSnapshot({ title: "404 Not Found", summary: "This page has been removed or is unavailable.", reliability: "reliable" }), false);
});

test("isLowConfidenceExtraction returns true for summary under 50 chars", () => {
  assert.equal(isLowConfidenceExtraction("Short.", "Emirates Travel Updates"), true);
});

test("isLowConfidenceExtraction returns true when summary overlaps 90%+ with source name", () => {
  assert.equal(
    isLowConfidenceExtraction("Emirates Travel Updates information", "Emirates Travel Updates"),
    true,
  );
});

test("isLowConfidenceExtraction returns false for substantive summary", () => {
  assert.equal(
    isLowConfidenceExtraction(
      "All flights from Dubai International are operating on schedule. Passengers are advised to check gate information.",
      "Emirates Travel Updates",
    ),
    false,
  );
});

test("isLowConfidenceExtraction returns true for mostly non-alphabetic text", () => {
  assert.equal(isLowConfidenceExtraction("* A+ A A- *** --- === |||  ### >>>", "Some Source"), true);
});
