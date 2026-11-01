import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PublicFinder } from "@/components/recommender/PublicFinder";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/home");
  }

  return (
    <main className="min-h-screen bg-bg-base px-4 py-10 sm:px-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-10">
        <header className="flex items-center justify-between">
          <Image src="/perq-logo.png" alt="PERQ" width={800} height={304} className="h-9 w-auto" priority />
          <div className="flex gap-3">
            <a href="/login" className="rounded-md border border-border px-4 py-2 font-body text-body text-text-primary">
              Sign in
            </a>
            <a href="/register" className="rounded-md bg-primary px-4 py-2 font-body text-body font-semibold text-on-primary">
              Get started
            </a>
          </div>
        </header>
        <section className="flex flex-col gap-3">
          <h1 className="font-display text-h1 font-extrabold text-text-primary sm:text-display">Get more from the cards you use</h1>
          <p className="font-body text-body-lg text-text-secondary">
            <span className="font-semibold text-ember-text">Ember</span> works out what each credit card is worth to you, in rupees a year, from
            terms checked on the banks&apos; own pages.
          </p>
        </section>
        <section id="find-your-card" className="rounded-lg border border-border bg-bg-surface p-5 sm:p-8">
          <h2 className="mb-1 font-display text-h2 font-bold text-text-primary">Find your card</h2>
          <p className="mb-6 font-body text-body text-text-secondary">Seven quick questions. No sign-up, nothing saved.</p>
          <PublicFinder />
        </section>
      </div>
    </main>
  );
}
