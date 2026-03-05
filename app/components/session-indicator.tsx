"use client";

import { useAuth } from "./auth-provider";

export function SessionIndicator() {
  const { user, isAuthenticated, isLoading, signOut } = useAuth();

  if (isLoading) return null;

  if (!isAuthenticated) {
    return (
      <a
        href="/auth"
        className="text-xs text-[var(--text-on-dark-muted)] transition-colors hover:text-[var(--text-on-dark)]"
      >
        Sign in
      </a>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs text-[var(--text-on-dark-muted)]">
      <span className="max-w-[160px] truncate">{user?.email}</span>
      <a
        href="/settings"
        className="text-[var(--text-on-dark-muted)] transition-colors hover:text-[var(--text-on-dark)]"
      >
        Settings
      </a>
      <button
        onClick={() => signOut()}
        className="text-[var(--text-on-dark-muted)] transition-colors hover:text-[var(--text-on-dark)]"
      >
        Sign out
      </button>
    </div>
  );
}
