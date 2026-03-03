import assert from "node:assert/strict";
import test from "node:test";
import { cleanDom } from "./dom-cleanup.ts";

test("cleanDom strips <nav> tags and contents", () => {
  const html = '<html><body><nav><ul><li>Home</li><li>About</li></ul></nav><main><p>Real content here.</p></main></body></html>';
  const result = cleanDom(html);
  assert.ok(!result.includes("Home"));
  assert.ok(!result.includes("About"));
  assert.ok(result.includes("Real content here."));
});

test("cleanDom strips <header> and <footer> tags", () => {
  const html = '<header><div>Skip to main content</div></header><article><p>Flight operations normal.</p></article><footer>Copyright 2026</footer>';
  const result = cleanDom(html);
  assert.ok(!result.includes("Skip to main content"));
  assert.ok(!result.includes("Copyright 2026"));
  assert.ok(result.includes("Flight operations normal."));
});

test("cleanDom strips <aside>, <script>, <style>, <noscript>", () => {
  const html = '<aside>Sidebar ad</aside><script>var x=1;</script><style>.foo{}</style><noscript>Enable JS</noscript><div><p>Important update about flights.</p></div>';
  const result = cleanDom(html);
  assert.ok(!result.includes("Sidebar ad"));
  assert.ok(!result.includes("var x=1"));
  assert.ok(!result.includes(".foo"));
  assert.ok(!result.includes("Enable JS"));
  assert.ok(result.includes("Important update about flights."));
});

test("cleanDom strips elements with boilerplate class names", () => {
  const html = '<div class="cookie-banner">Accept cookies</div><div class="breadcrumb">Home > News</div><div class="content"><p>Travel advisory issued today.</p></div>';
  const result = cleanDom(html);
  assert.ok(!result.includes("Accept cookies"));
  assert.ok(!result.includes("Home > News"));
  assert.ok(result.includes("Travel advisory issued today."));
});

test("cleanDom strips elements with role=banner, role=navigation, role=contentinfo", () => {
  const html = '<div role="banner">Site header</div><div role="navigation">Nav links</div><div role="main"><p>Advisory content here.</p></div><div role="contentinfo">Footer info</div>';
  const result = cleanDom(html);
  assert.ok(!result.includes("Site header"));
  assert.ok(!result.includes("Nav links"));
  assert.ok(!result.includes("Footer info"));
  assert.ok(result.includes("Advisory content here."));
});

test("cleanDom preserves <main> and <article> content", () => {
  const html = '<nav>Menu</nav><main><article><h1>Breaking News</h1><p>UAE airspace update.</p></article></main>';
  const result = cleanDom(html);
  assert.ok(result.includes("Breaking News"));
  assert.ok(result.includes("UAE airspace update."));
});

test("cleanDom returns full body when no boilerplate tags present", () => {
  const html = '<html><body><h1>Simple Page</h1><p>Content without any nav or header tags.</p></body></html>';
  const result = cleanDom(html);
  assert.ok(result.includes("Simple Page"));
  assert.ok(result.includes("Content without any nav or header tags."));
});

test("cleanDom handles empty input", () => {
  assert.equal(cleanDom(""), "");
});
