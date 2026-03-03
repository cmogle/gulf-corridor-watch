/**
 * Strip boilerplate HTML elements (nav, header, footer, cookie banners, etc.)
 * leaving only content-bearing markup. Works on raw HTML strings using regex
 * since we don't have a DOM parser in the serverless environment.
 */

// Tags whose entire content should be removed
const STRIP_TAGS = ["nav", "header", "footer", "aside", "script", "style", "noscript"];

// Class/id substrings that indicate boilerplate containers
const BOILERPLATE_CLASSES = [
  "cookie", "banner", "breadcrumb", "sidebar", "menu",
  "skip-to", "skip-link", "skipnav", "site-header", "site-footer",
  "nav-bar", "navbar", "navigation", "masthead", "toolbar",
];

// ARIA roles that indicate non-content regions
const BOILERPLATE_ROLES = ["banner", "navigation", "contentinfo", "complementary"];

export function cleanDom(html: string): string {
  if (!html) return "";

  let cleaned = html;

  // Strip known boilerplate tags and their contents
  for (const tag of STRIP_TAGS) {
    const pattern = new RegExp(`<${tag}[\\s>][\\s\\S]*?<\\/${tag}>`, "gi");
    cleaned = cleaned.replace(pattern, " ");
  }

  // Strip self-closing variants too (e.g. <script ... />)
  for (const tag of STRIP_TAGS) {
    const pattern = new RegExp(`<${tag}[^>]*/\\s*>`, "gi");
    cleaned = cleaned.replace(pattern, " ");
  }

  // Strip divs/sections with boilerplate class or id
  for (const keyword of BOILERPLATE_CLASSES) {
    const pattern = new RegExp(
      `<(div|section|span|ul|ol)\\b[^>]*(?:class|id)="[^"]*${keyword}[^"]*"[^>]*>[\\s\\S]*?</\\1>`,
      "gi",
    );
    cleaned = cleaned.replace(pattern, " ");
  }

  // Strip elements with boilerplate ARIA roles
  for (const role of BOILERPLATE_ROLES) {
    const pattern = new RegExp(
      `<\\w+[^>]*role=["']${role}["'][^>]*>[\\s\\S]*?</\\w+>`,
      "gi",
    );
    cleaned = cleaned.replace(pattern, " ");
  }

  return cleaned;
}
