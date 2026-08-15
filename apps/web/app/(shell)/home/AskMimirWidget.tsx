"use client";

import { useMimirChat } from "../mimir/MimirChatContext";
import { DASHBOARD_COLORS as C } from "./dashboardTheme";

/**
 * The whole widget is one clickable surface (design-reference mockup:
 * cursor:pointer on the outer container, no separate "open" button) that
 * opens the shell's existing MIMIR chat panel (Feature 1 §9.4's follow-up
 * chat) — not a new bespoke chat UI. The "input" shown here is static bait
 * text, matching the mockup exactly (it was never a real <input> there
 * either — the whole card opens the drawer, where the real input lives).
 */
export function AskMimirWidget() {
  const { setOpen } = useMimirChat();

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex items-center gap-5 rounded-3xl px-7 py-5 text-left"
      style={{
        gridArea: "2 / 1 / auto / 8",
        backgroundColor: C.surface,
        border: `1px solid ${C.surfaceBorder}`,
      }}
    >
      <span className="h-11 w-11 shrink-0" aria-hidden="true">
        <svg viewBox="0 0 52 52" width="100%" height="100%" fill="none">
          <circle cx="26" cy="26" r="24.5" stroke="var(--gold)" strokeWidth="1.2" opacity="0.35" />
          <path
            d="M10 26C14 18 20 15 26 15C32 15 38 18 42 26C38 34 32 37 26 37C20 37 14 34 10 26Z"
            stroke="var(--gold)"
            strokeWidth="1.4"
          />
          <circle cx="26" cy="26" r="6" stroke="var(--accent)" strokeWidth="1.4" />
          <circle cx="26" cy="26" r="1.8" fill="var(--accent)" />
          <path d="M6 20C3 16 3 10 6 6" stroke="var(--gold)" strokeWidth="1.1" strokeLinecap="round" opacity="0.7" />
          <path d="M6 32C2 36 2 42 6 46" stroke="var(--gold)" strokeWidth="1.1" strokeLinecap="round" opacity="0.7" />
          <path d="M46 20C49 16 49 10 46 6" stroke="var(--gold)" strokeWidth="1.1" strokeLinecap="round" opacity="0.7" />
          <path d="M46 32C50 36 50 42 46 46" stroke="var(--gold)" strokeWidth="1.1" strokeLinecap="round" opacity="0.7" />
        </svg>
      </span>

      <span className="shrink-0">
        <span className="block font-display text-[17px] font-semibold" style={{ color: C.textPrimary }}>
          Ask MIMIR anything
        </span>
        <span className="mt-0.5 block font-body text-xs" style={{ color: C.textSecondary }}>
          Rewards math, comparisons, strategy
        </span>
      </span>

      <span
        className="flex min-w-0 flex-1 items-center justify-between rounded-2xl px-4 py-3"
        style={{ backgroundColor: C.inputBg, border: `1px solid ${C.innerBorder08}` }}
      >
        <span
          className="truncate font-body text-sm"
          style={{ color: C.inputPlaceholder }}
        >
          &ldquo;How should I pay for this trip?&rdquo;
        </span>
        <span
          className="ml-3 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: "var(--accent)" }}
          aria-hidden="true"
        >
          <span
            style={{
              width: 0,
              height: 0,
              borderTop: "5px solid transparent",
              borderBottom: "5px solid transparent",
              borderLeft: "7px solid #06131A",
              marginLeft: "2px",
            }}
          />
        </span>
      </span>
    </button>
  );
}
