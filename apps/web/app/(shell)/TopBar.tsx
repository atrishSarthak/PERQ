import Link from "next/link";
import Image from "next/image";
import { SignOutButton } from "./SignOutButton";
import { AskMimirBar } from "./AskMimirBar";

/**
 * Full-width, sticky top bar: PERQ logo far left, MIMIR's quick-ask
 * centered, sign-out control far right. Replaces the old vertical icon
 * rail (Sidebar) — that rail put three feature icons (Card Recommender /
 * Chrome Extension / Goal-Based Advisor) in an unlabeled strip with no
 * spec behind it. If/when Feature 2 or 3 need real nav, it belongs here
 * with an actual label, not another icon-only strip.
 *
 * A 3-column grid (not flex justify-between) so AskMimirBar sits at the
 * bar's true visual center regardless of how wide the logo vs. sign-out
 * button are — justify-between would only center it if both ends were
 * equal width, which they aren't.
 */
export function TopBar() {
  return (
    <header
      className="sticky top-0 z-40 grid h-16 w-full shrink-0 grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-border px-6"
      style={{ backgroundColor: "var(--bg-surface)" }}
    >
      <Link href="/home" aria-label="PERQ home" className="shrink-0">
        <Image src="/perq-logo.png" alt="PERQ" width={800} height={304} className="h-10 w-auto" />
      </Link>

      <div className="hidden justify-center md:flex">
        <AskMimirBar />
      </div>

      <SignOutButton />
    </header>
  );
}
