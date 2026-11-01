import { notFound } from "next/navigation";
import { FIXTURE_SPECS } from "@perq/statements";

export const dynamic = "force-dynamic";

// Test statements for the phone (open in Safari → Download → Save to Files).
// Synthetic only; available when DEMO_ENABLED=true.
export default function DemoStatements() {
  if (process.env.DEMO_ENABLED !== "true") notFound();
  return (
    <main className="mx-auto max-w-xl px-4 py-10 font-body text-text-primary">
      <h1 className="font-display text-h2 font-bold">Synthetic test statements</h1>
      <p className="mt-2 text-text-secondary">Fictional cards and holders, password-protected like real ones. For testing PERQ&apos;s upload only.</p>
      <ul className="mt-6 flex flex-col gap-4">
        {FIXTURE_SPECS.map((s) => (
          <li key={s.layout} className="rounded-lg border border-border bg-bg-surface p-4">
            <p className="font-semibold">
              {s.issuer} · {s.cardName}
            </p>
            <p className="text-body-sm text-text-secondary">
              Statement {s.statementDate} · password <code className="text-ember-text">{s.password}</code>
            </p>
            <a className="mt-2 inline-block rounded-md bg-primary px-3 py-2 text-on-primary" href={`/api/demo/fixtures?layout=${s.layout}`}>
              Download PDF
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
