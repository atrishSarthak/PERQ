"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QuizWizard, type CardOption } from "../quiz/QuizWizard";
import { DashboardCardChip } from "./DashboardCardChip";
import { DASHBOARD_COLORS as C } from "./dashboardTheme";

export interface TopPickData {
  cardId: string;
  issuer: string;
  name: string;
  network: string;
  explanation: string;
}

/**
 * Three real states, driven by actual user data (design-reference mockup
 * only showed the first two — "quiz taken" there was a design-tool preview
 * toggle, not a real third state; profile-exists-but-zero-eligible-cards
 * is a genuine edge case computeAndPersistRecommendations already handles
 * server-side, so the dashboard shouldn't misreport it as "take the quiz"
 * when the user already did):
 *   1. No quiz on file: CTA + opens the real QuizWizard modal.
 *   2. Quiz taken, has a top pick: compact real preview + link to /results.
 *   3. Quiz taken, no eligible cards: brief explanation, link to /results.
 */
export function CardRecommenderWidget({
  quizTaken,
  topPick,
  cardOptions,
}: {
  quizTaken: boolean;
  topPick: TopPickData | null;
  cardOptions: CardOption[];
}) {
  const router = useRouter();
  const [quizOpen, setQuizOpen] = useState(false);

  if (quizOpen) {
    return (
      <QuizWizard
        cardOptions={cardOptions}
        onComplete={() => {
          setQuizOpen(false);
          router.refresh();
        }}
      />
    );
  }

  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-3xl p-8"
      style={{ gridArea: "1 / 1 / auto / 8", backgroundColor: C.surface, border: `1px solid ${C.surfaceBorder}` }}
    >
      <h2 className="font-display text-[22px] font-semibold" style={{ color: C.textPrimary }}>
        Card Recommender
      </h2>

      {topPick ? (
        <div className="mt-3 flex flex-1 items-center gap-7">
          <div className="h-24 w-[150px] shrink-0">
            <DashboardCardChip
              cardId={topPick.cardId}
              issuer={topPick.issuer}
              name={topPick.name}
              network={topPick.network}
            />
          </div>
          <div className="flex flex-1 flex-col gap-2.5">
            <p
              className="font-body text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--accent)" }}
            >
              Top pick from MIMIR
            </p>
            <p className="font-display text-xl font-semibold" style={{ color: C.textPrimary }}>
              {topPick.issuer} {topPick.name}
            </p>
            <p
              className="font-body text-sm leading-relaxed"
              style={{
                color: C.textSecondary,
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              &ldquo;{topPick.explanation}&rdquo;
            </p>
            <Link
              href="/results"
              className="mt-1 w-fit font-body text-sm font-semibold"
              style={{ color: "var(--accent)" }}
            >
              See all recommendations →
            </Link>
          </div>
        </div>
      ) : quizTaken ? (
        <div className="mt-3 flex flex-1 flex-col justify-center gap-2">
          <p className="font-body text-[15px] leading-relaxed" style={{ color: C.textSecondary }}>
            None of the cards MIMIR checked matched your income eligibility this time.
          </p>
          <Link
            href="/results"
            className="w-fit font-body text-sm font-semibold"
            style={{ color: "var(--accent)" }}
          >
            See your results →
          </Link>
        </div>
      ) : (
        <div className="mt-3 flex flex-1 items-center gap-8">
          <div className="flex flex-1 flex-col gap-4">
            <p className="font-display text-2xl font-semibold leading-tight" style={{ color: C.textPrimary }}>
              Find your perfect card in 2 minutes
            </p>
            <p className="max-w-[380px] font-body text-[15px] leading-relaxed" style={{ color: C.textSecondary }}>
              Answer a few quick questions about how you spend and MIMIR will match you with the cards worth
              having.
            </p>
            <button
              type="button"
              onClick={() => setQuizOpen(true)}
              className="mt-2 w-fit rounded-2xl px-6 py-3.5 font-body text-[15px] font-semibold"
              style={{ backgroundColor: "var(--gold)", color: "#161611" }}
            >
              Take the quiz
            </button>
          </div>
          <div
            className="hidden h-[220px] w-[180px] shrink-0 rounded-2xl sm:block"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 8px, rgba(255,255,255,0.02) 8px, rgba(255,255,255,0.02) 16px)",
              border: `1px solid ${C.innerBorder08}`,
            }}
          />
        </div>
      )}
    </div>
  );
}
