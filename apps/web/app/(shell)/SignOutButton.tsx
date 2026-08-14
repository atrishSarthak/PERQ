"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="rounded-md border border-border px-3 py-1.5 font-body text-body-sm text-text-primary hover:bg-bg-surface-2"
    >
      Sign out
    </button>
  );
}
