"use client";

import { useState } from "react";
import type { RecommendationResult } from "@perq/shared";
import { QuizV2Wizard } from "./QuizV2Wizard";
import { ResultsV2 } from "./ResultsV2";

/** "Find your card" on the landing page: no login, nothing saved (handoff §1.7). */
export function PublicFinder() {
  const [result, setResult] = useState<RecommendationResult | null>(null);

  if (result) {
    return (
      <div className="flex flex-col gap-5">
        <ResultsV2 result={result} explanation={null} limit={3} />
        <div className="rounded-lg border border-border bg-bg-surface-2 p-5">
          <p className="font-display text-h2 font-bold text-text-primary">Get the PERQ app</p>
          <p className="mt-1 font-body text-body text-text-secondary">
            Save your answers, mark the cards you hold, and ask Ember why one card beats another, with the numbers.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a href="/register" className="rounded-md bg-primary px-4 py-2 font-body text-body font-semibold text-on-primary">
              Create a free account
            </a>
            <button type="button" onClick={() => setResult(null)} className="rounded-md border border-border px-4 py-2 font-body text-body text-text-primary">
              Change answers
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <QuizV2Wizard
      submitLabel="Show my top 3"
      onComplete={async (answers) => {
        const res = await fetch("/api/recommender/public", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(answers),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? "Couldn't score your answers. Try again.");
        setResult(data.result);
      }}
    />
  );
}
