import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Sidebar } from "./Sidebar";

/**
 * Wraps every authenticated page (home, quiz, results) with a persistent
 * sidebar — the 3 planned features as icons (PRD: Card Recommender live,
 * Chrome Extension and Goal-Based Advisor shown but disabled since only
 * Feature 1 is built). The auth check lives here once, instead of
 * duplicated per page.
 */
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1">{children}</div>
    </div>
  );
}
