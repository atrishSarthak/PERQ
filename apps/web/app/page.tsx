import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/home");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="font-display text-[length:var(--text-display-size)] text-text-primary">
        MIMIR
      </h1>
      <p className="font-body text-body text-text-secondary">
        PERQ recommends the right credit card for you.
      </p>
      <div className="flex gap-3">
        <a
          href="/register"
          className="rounded-md bg-accent px-4 py-2 font-body text-body text-white"
        >
          Get started
        </a>
        <a
          href="/login"
          className="rounded-md border border-border px-4 py-2 font-body text-body text-text-primary"
        >
          Sign in
        </a>
      </div>
    </main>
  );
}
