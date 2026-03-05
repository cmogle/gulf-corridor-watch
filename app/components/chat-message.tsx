"use client";

import { memo } from "react";
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
        {time && (
          <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">{time}</p>
        )}
      </div>
    </div>
  );
});
