"use client";

import { useMemo, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  mode?: string;
  summary?: { total?: number; delayed?: number; cancelled?: number; latest_fetch?: string | null };
};

type Props = {
  initialQuery?: string;
};

export function OmnipresentChat({ initialQuery }: Props) {
  const [openMobile, setOpenMobile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState(initialQuery ?? "");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const canSend = input.trim().length > 0 && !loading;

  const title = useMemo(() => (loading ? "Thinking..." : "Ask GPT"), [loading]);

  async function send() {
    const question = input.trim();
    if (!question || loading) return;
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const json = await res.json();
      const content = json?.answer ?? json?.error ?? "No response";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content,
          mode: json?.mode,
          summary: json?.summary,
        },
      ]);
    } catch (error) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Request failed: ${String(error)}` }]);
    } finally {
      setLoading(false);
    }
  }

  function ChatBody() {
    return (
      <>
        <div className="flex items-center justify-between border-b border-zinc-300 px-3 py-2">
          <p className="text-sm font-semibold">{title}</p>
          <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] uppercase text-zinc-700">Omnipresent</span>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {messages.length === 0 ? (
            <p className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
              Ask flight, route, advisory, or policy questions from anywhere in this dashboard.
            </p>
          ) : null}

          {messages.map((m, i) => (
            <article
              key={`${m.role}-${i}`}
              className={`rounded-lg p-3 text-sm ${m.role === "user" ? "bg-zinc-900 text-white" : "border border-zinc-300 bg-white text-zinc-800"}`}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.role === "assistant" && m.mode ? (
                <div className="mt-2 space-y-1 text-[11px] text-zinc-600">
                  <p>Mode: {m.mode}</p>
                  {m.summary ? (
                    <p>
                      total={m.summary.total ?? 0} delayed={m.summary.delayed ?? 0} cancelled={m.summary.cancelled ?? 0} latest=
                      {m.summary.latest_fetch ?? "n/a"}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </div>

        <div className="space-y-2 border-t border-zinc-300 p-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about flights, disruptions, or advisories..."
            className="min-h-24 w-full rounded-lg border border-zinc-300 p-2 text-sm outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-zinc-700"
          />
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {loading ? "Checking..." : "Ask"}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] min-h-[540px] flex-col overflow-hidden rounded-2xl border border-zinc-300 bg-white/90 shadow-[0_10px_40px_rgba(10,28,42,0.08)] lg:flex">
        <ChatBody />
      </aside>

      <button
        type="button"
        onClick={() => setOpenMobile(true)}
        className="fixed bottom-5 right-4 z-40 rounded-full bg-zinc-900 px-4 py-3 text-sm font-medium text-white shadow-lg lg:hidden"
      >
        Ask GPT
      </button>

      {openMobile ? (
        <div className="fixed inset-0 z-50 bg-black/35 lg:hidden" onClick={() => setOpenMobile(false)}>
          <section
            className="absolute inset-x-0 bottom-0 flex h-[78vh] flex-col overflow-hidden rounded-t-2xl border border-zinc-300 bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-300 px-3 py-2">
              <p className="text-sm font-semibold">Ask GPT</p>
              <button type="button" onClick={() => setOpenMobile(false)} className="rounded-md border border-zinc-300 px-2 py-1 text-xs">
                Close
              </button>
            </div>
            <ChatBody />
          </section>
        </div>
      ) : null}
    </>
  );
}
