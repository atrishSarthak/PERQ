import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { TopBar } from "./TopBar";
import { EmberChatProvider } from "./ember/EmberChatContext";
import { EmberChatPanel } from "./ember/EmberChatPanel";

/**
 * Wraps every authenticated page (home, quiz, results) with a persistent
 * top bar (PERQ logo + sign out) and the Ember chat panel. The auth check
 * lives here once, instead of duplicated per page.
 */
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <EmberChatProvider>
      <div className="flex min-h-screen flex-col">
        <TopBar />
        <div className="flex-1">{children}</div>
      </div>
      <EmberChatPanel />
    </EmberChatProvider>
  );
}
