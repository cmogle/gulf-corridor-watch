import assert from "node:assert/strict";
import test from "node:test";
import { stripJinaPrefix } from "./source-extractors.ts";

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
