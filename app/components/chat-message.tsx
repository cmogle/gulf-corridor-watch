"use client";

import { memo, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type ChatMessageData = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
};

function formatTime(iso?: string): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="5" width="9" height="9" rx="1.5" />
      <path d="M5 11H3.5A1.5 1.5 0 012 9.5v-7A1.5 1.5 0 013.5 1h7A1.5 1.5 0 0112 2.5V5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 9 6 12 13 4" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8v5a1 1 0 001 1h6a1 1 0 001-1V8" />
      <polyline points="11 4 8 1 5 4" />
      <line x1="8" y1="1" x2="8" y2="10" />
    </svg>
  );
}

function ShareActions({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }, []);

  const handleCopy = useCallback(async () => {
    await copyToClipboard(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content, copyToClipboard]);

  const handleShare = useCallback(async () => {
    const shareText = content + "\n\n— keepcalmandcarryon.help";
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text: shareText });
        return;
      } catch {
        // User cancelled — fall through to copy
      }
    }
    // Fallback: copy with attribution
    await copyToClipboard(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content, copyToClipboard]);

  const btnClass =
    "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-gray-100 hover:text-[var(--text-primary)]";

  return (
    <div className="mt-1 flex items-center gap-0.5">
      <button onClick={handleCopy} className={btnClass} title="Copy to clipboard">
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? "Copied" : "Copy"}
      </button>
      <button onClick={handleShare} className={btnClass} title="Share">
        <ShareIcon />
        Share
      </button>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--text-secondary)] [animation-delay:0ms]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--text-secondary)] [animation-delay:150ms]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--text-secondary)] [animation-delay:300ms]" />
    </div>
  );
}

export const ChatMessage = memo(function ChatMessage({
  message,
  isStreaming,
}: {
  message: ChatMessageData;
  isStreaming?: boolean;
}) {
  const isUser = message.role === "user";
  const time = formatTime(message.timestamp);

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] md:max-w-[70%]">
          <div className="rounded-2xl rounded-br-md bg-[var(--surface-dark)] px-4 py-2.5 text-[14px] leading-relaxed text-white">
            {message.content}
          </div>
          {time && (
            <p className="mt-0.5 text-right text-[11px] text-[var(--text-secondary)]">{time}</p>
          )}
        </div>
      </div>
    );
  }

  const isComplete = !isStreaming && !!message.content;

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] md:max-w-[70%]">
        <div className="rounded-2xl rounded-bl-md border border-gray-200 bg-white px-4 py-2.5 text-[14px] leading-relaxed text-[var(--text-primary)]">
          {isStreaming && !message.content ? (
            <TypingIndicator />
          ) : (
            <div className="chat-prose">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          {time && (
            <p className="text-[11px] text-[var(--text-secondary)]">{time}</p>
          )}
          {isComplete && <ShareActions content={message.content} />}
        </div>
      </div>
    </div>
  );
});
