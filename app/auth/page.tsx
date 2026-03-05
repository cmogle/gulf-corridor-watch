"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type AuthTab = "login" | "signup" | "magic-link";

export default function AuthPage() {
  const [tab, setTab] = useState<AuthTab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const supabase = getSupabaseBrowser();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      router.push("/");
    }
    setLoading(false);
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (password !== confirmPassword) {
      setMessage({ type: "error", text: "Passwords do not match" });
      return;
    }
    if (password.length < 6) {
      setMessage({ type: "error", text: "Password must be at least 6 characters" });
      return;
    }
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "Check your email to confirm your account." });
    }
    setLoading(false);
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "Check your email for the login link." });
    }
    setLoading(false);
  }

  if (!supabase) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--surface-light)]">
        <p className="text-sm text-[var(--text-secondary)]">Authentication is not configured.</p>
      </main>
    );
  }

  const tabs: { key: AuthTab; label: string }[] = [
    { key: "login", label: "Sign In" },
    { key: "signup", label: "Sign Up" },
    { key: "magic-link", label: "Magic Link" },
  ];

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--surface-light)] px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="font-serif text-2xl text-[var(--text-primary)]">Gulf Corridor Watch</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Sign in for personalized tracking and chat history</p>
        </div>

        <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
          {/* Tab bar */}
          <div className="flex border-b border-[#E5E7EB]">
            {tabs.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { setTab(key); setMessage(null); }}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  tab === key
                    ? "border-b-2 border-[var(--primary-blue)] text-[var(--primary-blue)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Message */}
          {message && (
            <div
              className={`mt-4 rounded-lg px-3 py-2 text-sm ${
                message.type === "success"
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-red-50 text-red-800"
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Login form */}
          {tab === "login" && (
            <form onSubmit={handleLogin} className="mt-4 space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-[var(--text-primary)]">
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm focus:border-[var(--primary-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-blue)]"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label htmlFor="login-password" className="block text-sm font-medium text-[var(--text-primary)]">
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm focus:border-[var(--primary-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-blue)]"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[var(--primary-blue)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
              <div className="flex justify-between text-xs">
                <button
                  type="button"
                  onClick={() => setTab("magic-link")}
                  className="text-[var(--primary-blue)] hover:underline"
                >
                  Use magic link instead
                </button>
                <a href="/auth/reset" className="text-[var(--primary-blue)] hover:underline">
                  Forgot password?
                </a>
              </div>
            </form>
          )}

          {/* Sign up form */}
          {tab === "signup" && (
            <form onSubmit={handleSignup} className="mt-4 space-y-4">
              <div>
                <label htmlFor="signup-email" className="block text-sm font-medium text-[var(--text-primary)]">
                  Email
                </label>
                <input
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm focus:border-[var(--primary-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-blue)]"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label htmlFor="signup-password" className="block text-sm font-medium text-[var(--text-primary)]">
                  Password
                </label>
                <input
                  id="signup-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm focus:border-[var(--primary-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-blue)]"
                />
              </div>
              <div>
                <label htmlFor="signup-confirm" className="block text-sm font-medium text-[var(--text-primary)]">
                  Confirm Password
                </label>
                <input
                  id="signup-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm focus:border-[var(--primary-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-blue)]"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[var(--primary-blue)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "Creating account..." : "Create Account"}
              </button>
            </form>
          )}

          {/* Magic link form */}
          {tab === "magic-link" && (
            <form onSubmit={handleMagicLink} className="mt-4 space-y-4">
              <p className="text-sm text-[var(--text-secondary)]">
                We'll send you a sign-in link. No password needed.
              </p>
              <div>
                <label htmlFor="magic-email" className="block text-sm font-medium text-[var(--text-primary)]">
                  Email
                </label>
                <input
                  id="magic-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm focus:border-[var(--primary-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-blue)]"
                  placeholder="you@example.com"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[var(--primary-blue)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "Sending..." : "Send Magic Link"}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-[var(--text-secondary)]">
          <a href="/" className="hover:underline">Back to dashboard</a>
        </p>
      </div>
    </main>
  );
}
