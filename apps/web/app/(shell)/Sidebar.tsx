import Link from "next/link";
import { SignOutButton } from "./SignOutButton";

interface FeatureLink {
  href: string;
  label: string;
  icon: React.ReactNode;
  enabled: boolean;
}

// Simple monochrome line icons, 24x24 — Design System §7 defers a real
// iconography style until it's needed; these are deliberately minimal
// (stroke-only, no fill, no illustration) so they don't lock in a look
// the design system hasn't decided yet.
function CardIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <line x1="2" y1="10" x2="22" y2="10" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ExtensionIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 4h4a1 1 0 0 1 1 1v2a2 2 0 1 0 0 4v2a1 1 0 0 1-1 1h-2a2 2 0 1 1-4 0H5a1 1 0 0 1-1-1v-2a2 2 0 1 0 0-4V5a1 1 0 0 1 1-1h2a2 2 0 1 1 4 0Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GoalIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

const FEATURES: FeatureLink[] = [
  { href: "/quiz", label: "Card Recommender", icon: <CardIcon />, enabled: true },
  { href: "#", label: "Chrome Extension", icon: <ExtensionIcon />, enabled: false },
  { href: "#", label: "Goal-Based Advisor", icon: <GoalIcon />, enabled: false },
];

export function Sidebar() {
  return (
    <nav
      aria-label="Features"
      className="flex w-20 shrink-0 flex-col items-center gap-6 border-r border-border py-6"
    >
      <Link href="/home" className="font-display text-body-sm text-accent">
        M
      </Link>

      <ul className="flex flex-col gap-2">
        {FEATURES.map((f) =>
          f.enabled ? (
            <li key={f.label}>
              <Link
                href={f.href}
                title={f.label}
                className="flex h-12 w-12 items-center justify-center rounded-md text-text-primary hover:bg-bg-surface"
              >
                {f.icon}
              </Link>
            </li>
          ) : (
            <li key={f.label}>
              <button
                type="button"
                disabled
                title={`${f.label} — coming soon`}
                className="flex h-12 w-12 cursor-not-allowed items-center justify-center rounded-md text-text-secondary opacity-40"
              >
                {f.icon}
              </button>
            </li>
          )
        )}
      </ul>

      <div className="mt-auto">
        <SignOutButton />
      </div>
    </nav>
  );
}
