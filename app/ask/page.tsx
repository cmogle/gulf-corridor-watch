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
    <main className="mx-auto max-w-3xl p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Ask the Official Sources</h1>
      <textarea
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Examples: What’s the status of EK511? | What flights from DXB to DEL are delayed right now?"
        className="w-full min-h-32 rounded-xl border p-3"
      />
      <button onClick={ask} disabled={loading || !q.trim()} className="rounded-lg bg-black text-white px-4 py-2 disabled:opacity-50">
        {loading ? "Checking..." : "Ask"}
      </button>
      {a && <pre className="whitespace-pre-wrap rounded-xl bg-zinc-100 p-4 text-sm">{a}</pre>}
    </main>
  );
}
