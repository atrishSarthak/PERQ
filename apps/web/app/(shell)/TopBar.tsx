import Link from "next/link";
import Image from "next/image";
import { SignOutButton } from "./SignOutButton";

/**
 * Full-width top bar: PERQ logo far left, sign-out control far right,
 * nothing else. Replaces the old vertical icon rail (Sidebar) — that rail
 * put three feature icons (Card Recommender / Chrome Extension / Goal-Based
 * Advisor) in an unlabeled strip with no spec behind it. If/when Feature 2
 * or 3 need real nav, it belongs here with an actual label, not another
 * icon-only strip.
 */
export function TopBar() {
  return (
    <header
      className="flex h-16 w-full shrink-0 items-center justify-between border-b border-border px-6"
      style={{ backgroundColor: "var(--bg-surface)" }}
    >
      <Link href="/home" aria-label="PERQ home">
        <Image src="/perq-logo.png" alt="PERQ" width={800} height={304} className="h-7 w-auto" />
      </Link>
      <SignOutButton />
    </header>
  );
}
