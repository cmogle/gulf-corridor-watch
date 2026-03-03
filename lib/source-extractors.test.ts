import assert from "node:assert/strict";
import test from "node:test";
import { stripJinaPrefix, stripMarkdown, extractHtmlSnapshot } from "./source-extractors.ts";

// Jina responses have blank lines between header fields
const JINA_RESPONSE = `Title: Oman Air

URL Source: http://www.omanair.com/om/en/travel-updates

Markdown Content:
Oman Air ===============

![Image 18: notification icon](http://ww...)

## Travel Updates

Important notice regarding flights.`;

test("stripJinaPrefix removes Title/URL Source/Markdown Content prefix", () => {
  const result = stripJinaPrefix(JINA_RESPONSE);
  assert.ok(!result.includes("Title: Oman Air"));
  assert.ok(!result.includes("URL Source:"));
  assert.ok(!result.includes("Markdown Content:"));
  assert.ok(result.includes("Oman Air ==============="));
  assert.ok(result.includes("## Travel Updates"));
});

test("stripJinaPrefix returns non-Jina text unchanged", () => {
  const html = "<html><body><h1>Hello</h1></body></html>";
  assert.equal(stripJinaPrefix(html), html);
});

test("stripJinaPrefix handles empty string", () => {
  assert.equal(stripJinaPrefix(""), "");
});

test("stripJinaPrefix handles partial Jina prefix (only Title line)", () => {
  const partial = "Title: Some Page\nActual content here";
  const result = stripJinaPrefix(partial);
  assert.ok(!result.includes("Title: Some Page"));
  assert.ok(result.includes("Actual content here"));
});

test("stripJinaPrefix does not strip Title: in middle of content", () => {
  const content = "Some heading\n\nTitle: this is a heading in the body\n\nMore content";
  const result = stripJinaPrefix(content);
  assert.equal(result, content);
});

test("stripJinaPrefix handles response starting with URL Source (no Title line)", () => {
  const noTitle = `URL Source: http://www.emirates.com/ae/english/help/travel-updates/
Markdown Content:
Travel updates | Help | Emirates ===============`;
  const result = stripJinaPrefix(noTitle);
  assert.ok(!result.includes("URL Source:"));
  assert.ok(!result.includes("Markdown Content:"));
  assert.ok(result.includes("Travel updates | Help | Emirates"));
});

test("stripJinaPrefix strips Published Time and Warning lines", () => {
  const withWarnings = `URL Source: http://www.etihad.com/en/help/travel-updates
Published Time: Tue, 03 Mar 2026 15:12:40 GMT
Warning: Target URL returned error 404: Not Found
Warning: This page maybe not yet fully loaded
Markdown Content:
Page Not Found ===============`;
  const result = stripJinaPrefix(withWarnings);
  assert.ok(!result.includes("URL Source:"));
  assert.ok(!result.includes("Published Time:"));
  assert.ok(!result.includes("Warning:"));
  assert.ok(!result.includes("Markdown Content:"));
  assert.ok(result.includes("Page Not Found"));
});

test("stripMarkdown removes image syntax", () => {
  assert.equal(stripMarkdown("Hello ![alt text](http://example.com/img.png) world"), "Hello  world");
});

test("stripMarkdown converts links to plain text", () => {
  assert.equal(stripMarkdown("Visit [Google](https://google.com) today"), "Visit Google today");
});

test("stripMarkdown removes setext underlines", () => {
  const input = "Heading\n========\nContent";
  assert.ok(!stripMarkdown(input).includes("========"));
  assert.ok(stripMarkdown(input).includes("Heading"));
  assert.ok(stripMarkdown(input).includes("Content"));
});

test("stripMarkdown strips ATX heading markers", () => {
  assert.equal(stripMarkdown("### Travel Updates"), "Travel Updates");
});

test("stripMarkdown strips list bullets", () => {
  const input = "* First item\n- Second item\n+ Third item";
  const result = stripMarkdown(input);
  assert.ok(result.includes("First item"));
  assert.ok(result.includes("Second item"));
  assert.ok(result.includes("Third item"));
  assert.ok(!result.includes("* "));
  assert.ok(!result.includes("- Second"));
  assert.ok(!result.includes("+ "));
});

test("stripMarkdown passes plain text unchanged", () => {
  const plain = "This is normal text with no markdown.";
  assert.equal(stripMarkdown(plain), plain);
});

test("stripMarkdown handles mixed markdown content", () => {
  const input = "# Welcome\n\n![logo](img.png)\n\nVisit [our site](http://example.com) for * updates\n- Item one\n- Item two";
  const result = stripMarkdown(input);
  assert.ok(!result.includes("!["));
  assert.ok(!result.includes("]("));
  assert.ok(result.includes("our site"));
  assert.ok(result.includes("Item one"));
});

test("extractHtmlSnapshot marks unusable when summary equals source name", () => {
  const source = {
    id: "test_source",
    name: "Bureau of Immigration - BOI",
    url: "https://example.com",
    category: "government",
    parser: "html" as const,
    connector: "direct_html" as const,
    extractor_id: "html_title_text",
    priority: 60,
    freshness_target_minutes: 30,
    region: "india" as const,
  };
  const html = "<html><head><title>Bureau of Immigration - BOI</title></head><body><p>Bureau of Immigration - BOI</p></body></html>";
  const result = extractHtmlSnapshot(source, html);
  assert.equal(result.unusable, true);
});

test("extractHtmlSnapshot strips nav chrome before extraction", () => {
  const source = {
    id: "test_source",
    name: "Air Arabia Travel Updates",
    url: "https://example.com",
    category: "airline" as const,
    parser: "html" as const,
    connector: "direct_html" as const,
    extractor_id: "html_title_text" as const,
    priority: 85,
    freshness_target_minutes: 10,
    region: "UAE",
  };
  const html = `<html><head><title>Air Arabia Travel Updates</title>
    <meta name="description" content="Check the latest travel alerts and flight status for Air Arabia.">
  </head><body>
    <nav><ul><li>LOGIN</li><li>United Arab Emirates</li><li>AED</li><li>en</li></ul></nav>
    <header><div>Skip to main content</div></header>
    <main><p>Check the latest travel alerts and flight status for Air Arabia.</p></main>
    <footer>Copyright 2026 Air Arabia</footer>
  </body></html>`;
  const result = extractHtmlSnapshot(source, html);
  // Should get the meta description or main content, not nav chrome
  assert.ok(!result.summary.includes("LOGIN"));
  assert.ok(!result.summary.includes("Skip to main content"));
  assert.ok(result.summary.includes("travel alerts"));
});

test("extractHtmlSnapshot does not mark unusable when summary has real content", () => {
  const source = {
    id: "test_source",
    name: "Emirates Travel Updates",
    url: "https://example.com",
    category: "airline",
    parser: "html" as const,
    connector: "direct_html" as const,
    extractor_id: "html_title_text",
    priority: 90,
    freshness_target_minutes: 5,
    region: "uae" as const,
  };
  const html = '<html><head><title>Emirates Travel Updates</title><meta name="description" content="Check the latest travel advisories and flight schedule changes for Emirates airline."></head><body></body></html>';
  const result = extractHtmlSnapshot(source, html);
  assert.equal(result.unusable, false);
});
