import assert from "node:assert/strict";
import test from "node:test";
import { buildExtractionPrompt, parseExtractionResponse, LLM_EXTRACT_MAX_PER_CYCLE } from "./llm-extract.ts";

test("buildExtractionPrompt includes source name and truncated text", () => {
  const prompt = buildExtractionPrompt("Emirates Travel Updates", "Here is some page content about flights being delayed.");
  assert.ok(prompt.includes("Emirates Travel Updates"));
  assert.ok(prompt.includes("flights being delayed"));
});

test("buildExtractionPrompt truncates text to 4000 chars", () => {
  const longText = "A".repeat(10000);
  const prompt = buildExtractionPrompt("Test Source", longText);
  assert.ok(prompt.length < 5000);
});

test("parseExtractionResponse returns null for EMPTY response", () => {
  assert.equal(parseExtractionResponse("EMPTY"), null);
  assert.equal(parseExtractionResponse("  EMPTY  "), null);
  assert.equal(parseExtractionResponse("EMPTY\n"), null);
});

test("parseExtractionResponse returns trimmed summary for real content", () => {
  const response = "  All flights from DXB are operating normally. No delays reported.  ";
  assert.equal(parseExtractionResponse(response), "All flights from DXB are operating normally. No delays reported.");
});

test("parseExtractionResponse returns null for very short response", () => {
  assert.equal(parseExtractionResponse("OK"), null);
});

test("LLM_EXTRACT_MAX_PER_CYCLE is a reasonable budget", () => {
  assert.ok(LLM_EXTRACT_MAX_PER_CYCLE >= 3 && LLM_EXTRACT_MAX_PER_CYCLE <= 10);
});
