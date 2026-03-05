import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

describe("anthropic client module", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset module cache to test fresh client creation
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("hasAnthropicKey()", () => {
    it("returns false when ANTHROPIC_API_KEY is not set", async () => {
      delete process.env.ANTHROPIC_API_KEY;
      // Dynamic import to get fresh module state
      const { hasAnthropicKey } = await import("./anthropic");
      assert.equal(hasAnthropicKey(), false);
    });

    it("returns true when ANTHROPIC_API_KEY is set", async () => {
      process.env.ANTHROPIC_API_KEY = "test-key-123";
      const { hasAnthropicKey } = await import("./anthropic");
      assert.equal(hasAnthropicKey(), true);
    });

    it("returns false when ANTHROPIC_API_KEY is empty string", async () => {
      process.env.ANTHROPIC_API_KEY = "";
      const { hasAnthropicKey } = await import("./anthropic");
      assert.equal(hasAnthropicKey(), false);
    });
  });

  describe("getAnthropicClient()", () => {
    it("throws when ANTHROPIC_API_KEY is not set", async () => {
      delete process.env.ANTHROPIC_API_KEY;
      const { getAnthropicClient } = await import("./anthropic");
      assert.throws(() => getAnthropicClient(), /ANTHROPIC_API_KEY is not set/);
    });

    it("returns a client when API key is set", async () => {
      process.env.ANTHROPIC_API_KEY = "test-key-123";
      const { getAnthropicClient } = await import("./anthropic");
      const client = getAnthropicClient();
      assert.ok(client);
      assert.equal(typeof client.messages, "object");
    });
  });

  describe("extractClaudeUsage()", () => {
    it("returns null tokens when usage is null", async () => {
      const { extractClaudeUsage } = await import("./anthropic");
      const result = extractClaudeUsage(null);
      assert.deepEqual(result, {
        prompt_tokens: null,
        completion_tokens: null,
        total_tokens: null,
      });
    });

    it("returns null tokens when usage is undefined", async () => {
      const { extractClaudeUsage } = await import("./anthropic");
      const result = extractClaudeUsage(undefined);
      assert.deepEqual(result, {
        prompt_tokens: null,
        completion_tokens: null,
        total_tokens: null,
      });
    });

    it("maps Claude usage to OpenAI-compatible format", async () => {
      const { extractClaudeUsage } = await import("./anthropic");
      const result = extractClaudeUsage({
        input_tokens: 100,
        output_tokens: 50,
      });
      assert.deepEqual(result, {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      });
    });

    it("handles partial usage (only input_tokens)", async () => {
      const { extractClaudeUsage } = await import("./anthropic");
      const result = extractClaudeUsage({ input_tokens: 100 });
      assert.equal(result.prompt_tokens, 100);
      assert.equal(result.completion_tokens, null);
      assert.equal(result.total_tokens, null);
    });
  });
});
