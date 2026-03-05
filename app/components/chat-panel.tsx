"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-provider";
import { ChatMessage, type ChatMessageData } from "./chat-message";

type ChatPanelProps = {
  suggestedPrompts?: string[];
  variant?: "hero" | "standalone" | "fullscreen";
  /** Auto-submit this prompt on mount (used when transitioning from ChatHome) */
  initialPrompt?: string;
  /** Called when the first user message is sent */
  onFirstMessage?: () => void;
  /** Called when user wants to return to the landing page */
  onBackToHome?: () => void;
};

const DEFAULT_PROMPTS = [
  "Can I fly to Dubai?",
  "DXB delays right now",
  "Is it safe in the UAE?",
  "EK511 status",
];

let messageCounter = 0;
function nextId() {
  return `msg-${++messageCounter}-${Date.now()}`;
}

export function ChatPanel({ suggestedPrompts = [], variant = "hero", initialPrompt, onFirstMessage, onBackToHome }: ChatPanelProps) {
  const { session, isAuthenticated } = useAuth();
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isOnDark = variant === "hero";
  const isFullscreen = variant === "fullscreen";

  const chips = suggestedPrompts.length > 0
    ? [...new Set([...suggestedPrompts, ...DEFAULT_PROMPTS])].slice(0, 6)
    : DEFAULT_PROMPTS;

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-submit initial prompt on mount
  useEffect(() => {
    if (initialPrompt) {
      const timer = setTimeout(() => void submit(initialPrompt), 50);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  function newChat() {
    setMessages([]);
    setSessionId(null);
    setLimitReached(false);
    setInput("");
  }

  async function submit(overrideQuestion?: string) {
    const question = (overrideQuestion ?? input).trim();
    if (!question || loading) return;

    // Notify parent on first message
    if (messages.length === 0 && onFirstMessage) {
      onFirstMessage();
    }

    setLoading(true);
    setInput("");

    // Add user message
    const userMsg: ChatMessageData = {
      id: nextId(),
      role: "user",
      content: question,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Add placeholder assistant message for streaming
    const assistantId = nextId();
    const assistantMsg: ChatMessageData = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      // Client-side timeout: abort if no response within 55 seconds
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 55_000);

      let res: Response;
      try {
        res = await fetch("/api/chat", {
          method: "POST",
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            question,
            session_id: sessionId,
            stream: true,
          }),
        });
      } finally {
        clearTimeout(timeoutId);
      }

      // Handle rate limit
      if (res.status === 429) {
        const json = await res.json();
        setLimitReached(true);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: json.message ?? "Free message limit reached. Sign up for unlimited chat." }
              : m,
          ),
        );
        setLoading(false);
        return;
      }

      // Capture session ID from header
      const newSessionId = res.headers.get("X-Session-Id");
      if (newSessionId) setSessionId(newSessionId);

      // Track remaining messages for anonymous users
      const remainingHeader = res.headers.get("X-Remaining");
      if (remainingHeader !== null) {
        setRemaining(parseInt(remainingHeader, 10));
      }

      if (res.headers.get("Content-Type")?.includes("text/event-stream")) {
        // SSE streaming
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            // Parse SSE events
            for (const line of chunk.split("\n")) {
              if (line.startsWith("data: ")) {
                try {
                  const payload = JSON.parse(line.slice(6));
                  if (payload.error) {
                    // Server-side error during streaming
                    const errorText = accumulated
                      ? accumulated + "\n\n*Connection lost. Response may be incomplete.*"
                      : "Request timed out. Please try again.";
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantId ? { ...m, content: errorText } : m,
                      ),
                    );
                    setLoading(false);
                    inputRef.current?.focus();
                    return;
                  }
                  if (payload.text) {
                    accumulated += payload.text;
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantId ? { ...m, content: accumulated } : m,
                      ),
                    );
                  }
                } catch {
                  // Ignore parse errors on partial chunks
                }
              }
            }
          }
        }
      } else {
        // JSON response fallback
        const json = await res.json();
        if (json.ok) {
          if (json.session_id) setSessionId(json.session_id);
          if (json.remaining !== undefined) setRemaining(json.remaining);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: json.answer ?? "No answer available." }
                : m,
            ),
          );
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: json.error ?? "Something went wrong." }
                : m,
            ),
          );
        }
      }
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === "AbortError";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: isTimeout
                ? "Request timed out. The server may be busy — please try again."
                : "Connection error. Please try again." }
            : m,
        ),
      );
    }

    setLoading(false);
    inputRef.current?.focus();
  }

  const hasMessages = messages.length > 0;

  // Fullscreen layout: flex column filling parent
  if (isFullscreen) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Scrollable messages area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-6"
        >
          <div className="mx-auto w-full max-w-3xl space-y-3">
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                isStreaming={loading && msg.role === "assistant" && msg === messages[messages.length - 1]}
              />
            ))}

            {limitReached && !isAuthenticated && (
              <div className="mt-2 flex justify-center">
                <a
                  href="/auth"
                  className="rounded-lg bg-[var(--primary-blue)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Sign up for unlimited chat
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Input area — pinned to bottom */}
        <div className="border-t border-gray-100 bg-[var(--surface-light)] px-4 py-3">
          <div className="relative mx-auto w-full max-w-3xl">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder={
                limitReached && !isAuthenticated
                  ? "Sign up to continue chatting..."
                  : "Ask anything — flights, routes, safety, advisories..."
              }
              disabled={limitReached && !isAuthenticated}
              className={`w-full rounded-xl border-0 bg-white px-4 py-3.5 pr-24 text-[15px] text-[var(--text-primary)] shadow-lg outline-none ring-2 ring-transparent placeholder:text-[var(--text-secondary)] focus:ring-[var(--primary-blue)] disabled:opacity-50 ${onBackToHome ? "pl-11" : ""}`}
              aria-label="Chat message input"
            />
            {onBackToHome && (
              <button
                onClick={onBackToHome}
                className="absolute left-3 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-lg p-1 text-[var(--text-secondary)] transition-colors hover:bg-gray-100 hover:text-[var(--text-primary)]"
                title="Back to home"
                aria-label="Back to home"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="11 14 6 9 11 4" />
                </svg>
              </button>
            )}
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
              {hasMessages && (
                <button
                  onClick={newChat}
                  className="rounded-lg px-2 py-2 text-xs text-[var(--text-secondary)] hover:bg-gray-100"
                  title="New chat"
                >
                  New
                </button>
              )}
              <button
                onClick={() => void submit()}
                disabled={loading || !input.trim() || (limitReached && !isAuthenticated)}
                className="rounded-lg bg-[var(--surface-dark)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {loading ? "..." : "Ask"}
              </button>
            </div>
          </div>

          {/* Remaining messages info */}
          {remaining !== null && remaining > 0 && !isAuthenticated && hasMessages && (
            <p className="mx-auto mt-2 max-w-3xl text-xs text-[var(--text-secondary)]">
              {remaining} free message{remaining !== 1 ? "s" : ""} remaining &middot; <a href="/auth" className="underline">Sign up</a> for unlimited
            </p>
          )}
        </div>
      </div>
    );
  }

  // Original hero/standalone layout
  return (
    <div className="w-full space-y-3">
      {/* Message history */}
      {hasMessages && (
        <div
          ref={scrollRef}
          className={`space-y-3 overflow-y-auto rounded-xl px-3 py-3 ${
            isOnDark ? "bg-white/5" : "bg-gray-50 border border-gray-200"
          }`}
          style={{ maxHeight: "400px" }}
        >
          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              isStreaming={loading && msg.role === "assistant" && msg === messages[messages.length - 1]}
            />
          ))}

          {limitReached && !isAuthenticated && (
            <div className="mt-2 flex justify-center">
              <a
                href="/auth"
                className="rounded-lg bg-[var(--primary-blue)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Sign up for unlimited chat
              </a>
            </div>
          )}
        </div>
      )}

      {/* Input area */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={
            limitReached && !isAuthenticated
              ? "Sign up to continue chatting..."
              : "Ask anything — flights, routes, safety, advisories..."
          }
          disabled={limitReached && !isAuthenticated}
          className="w-full rounded-xl border-0 bg-white px-4 py-3.5 pr-24 text-[15px] text-[var(--text-primary)] shadow-lg outline-none ring-2 ring-transparent placeholder:text-[var(--text-secondary)] focus:ring-[var(--primary-blue)] disabled:opacity-50"
          aria-label="Chat message input"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
          {hasMessages && (
            <button
              onClick={newChat}
              className="rounded-lg px-2 py-2 text-xs text-[var(--text-secondary)] hover:bg-gray-100"
              title="New chat"
            >
              New
            </button>
          )}
          <button
            onClick={() => void submit()}
            disabled={loading || !input.trim() || (limitReached && !isAuthenticated)}
            className="rounded-lg bg-[var(--surface-dark)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "..." : "Ask"}
          </button>
        </div>
      </div>

      {/* Suggested prompts (only when no messages) */}
      {!hasMessages && (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip}
              onClick={() => void submit(chip)}
              className={`rounded-full border px-3 py-1.5 text-[13px] transition ${
                isOnDark
                  ? "border-white/20 text-white/80 hover:bg-white/10"
                  : "border-gray-300 text-[var(--text-secondary)] hover:bg-gray-100"
              }`}
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Footer info */}
      {remaining !== null && remaining > 0 && !isAuthenticated && hasMessages && (
        <p className={`text-xs ${isOnDark ? "text-[var(--text-on-dark-muted)]" : "text-[var(--text-secondary)]"}`}>
          {remaining} free message{remaining !== 1 ? "s" : ""} remaining &middot; <a href="/auth" className="underline">Sign up</a> for unlimited
        </p>
      )}
    </div>
  );
}
