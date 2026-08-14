"use client";

import { signOut } from "next-auth/react";

function LogoutIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 17l5-5-5-5M21 12H9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SignOutButton() {
  return (
    <button
      type="button"
      title="Sign out"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="flex h-12 w-12 items-center justify-center rounded-md text-text-secondary hover:bg-bg-surface hover:text-text-primary"
    >
      <LogoutIcon />
    </button>
  );
}
