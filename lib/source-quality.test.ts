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

test("isLowConfidenceExtraction catches 'skip to main content' nav chrome", () => {
  assert.equal(
    isLowConfidenceExtraction(
      "Skip to main content Sitemap Contact Feedback Media Login Screen Reader Access Please select Language Search Menu Home About Us Profiles",
      "India MEA Advisories",
    ),
    true,
  );
});

test("isLowConfidenceExtraction catches language selector patterns", () => {
  assert.equal(
    isLowConfidenceExtraction(
      "Travel Update LOGIN United Arab Emirates AED en English Deutsch English español français italiano Türkçe русский العربية Login AirRewards Discover AirRewards Join now",
      "Air Arabia Travel Updates",
    ),
    true,
  );
});

test("isLowConfidenceExtraction catches airline menu chrome", () => {
  assert.equal(
    isLowConfidenceExtraction(
      "Travel updates | Help | Emirates Skip to the main contentAccessibility information BOOK Search flights MANAGE Search flights EXPERIENCE Search flights WHERE WE FLY Search flights",
      "Emirates Travel Updates",
    ),
    true,
  );
});

test("isLowConfidenceExtraction catches consecutive duplicate words", () => {
  assert.equal(
    isLowConfidenceExtraction(
      "News Center Government Government Government Government Economy Government Government Government DPC Economy Government",
      "Dubai Government Media Office",
    ),
    true,
  );
});

test("isLowConfidenceExtraction catches A+ A A- font size toggles", () => {
  assert.equal(
    isLowConfidenceExtraction(
      "Bureau of Immigration - BOI भारत सरकार GOVERNMENT OF INDIA * A+ A A- BUREAU OF IMMIGRATION Ministry of Home Affairs, Government of India Immigration About Us Vision Mission",
      "India Bureau of Immigration",
    ),
    true,
  );
});

test("isLowConfidenceExtraction passes real news content with nav-like words", () => {
  assert.equal(
    isLowConfidenceExtraction(
      "The FCDO advises against all but essential travel to the United Arab Emirates due to the heightened regional security situation. Travellers currently in the UAE should register their presence with the embassy for safety and insurance purposes.",
      "UK FCDO Travel Advice",
    ),
    false,
  );
});
