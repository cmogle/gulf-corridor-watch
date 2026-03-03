"use client";

import { useState } from "react";

export default function AskPage() {
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [loading, setLoading] = useState(false);

  async function ask() {
    setLoading(true);
    setA("");
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q }),
    });
    const json = await res.json();
    setA(json.answer ?? json.error ?? "No response");
    setLoading(false);
  }

  return (
    <main className="mx-auto max-w-3xl p-4 md:p-6 space-y-4">
      <section className="rounded-2xl border border-zinc-300 bg-white/85 p-4 md:p-6 space-y-4 shadow-[0_10px_40px_rgba(10,28,42,0.08)]">
      <h1 className="text-2xl font-semibold tracking-tight">Ask the Agent</h1>
      <p className="text-sm text-zinc-600">Flight and route questions are answered from cached flight observations first. Policy questions use official-source snapshots.</p>
      <textarea
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Examples: What’s the status of EK511? | What flights from DXB to DEL are delayed right now?"
        className="w-full min-h-32 rounded-xl border border-zinc-400 p-3 outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-zinc-700"
      />
      <button onClick={ask} disabled={loading || !q.trim()} className="rounded-lg bg-zinc-900 text-white px-4 py-2 disabled:opacity-50">
        {loading ? "Checking..." : "Ask"}
      </button>
      {a && <pre className="whitespace-pre-wrap rounded-xl bg-zinc-100 p-4 text-sm">{a}</pre>}
      </section>
    </main>
  );
}
