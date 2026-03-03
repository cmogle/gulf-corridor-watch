import assert from "node:assert/strict";
import test from "node:test";
import { isUsableSnapshot, isUsableFeedItem } from "./source-quality.ts";

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
