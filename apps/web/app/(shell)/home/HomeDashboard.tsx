"use client";

import { AskMimirWidget } from "./AskMimirWidget";
import { CardRecommenderWidget, type TopPickData } from "./CardRecommenderWidget";
import { CardArsenalWidget, type ArsenalCardData } from "./CardArsenalWidget";
import { ComingSoonWidget } from "./ComingSoonWidget";
import type { CardOption } from "../quiz/QuizWizard";
import { DASHBOARD_COLORS as C } from "./dashboardTheme";

/**
 * The bento grid from design-reference/PERQ Dashboard standalone.html —
 * 12-column grid, 3 fixed row heights, widgets placed via grid-area so
 * every cell tiles with no gaps, matching the mockup exactly:
 *   Card Recommender  1/1/auto/8   Card Arsenal  1/8/3/13 (spans rows 1-2)
 *   Ask MIMIR         2/1/auto/8
 *   Goal-Based        3/1/auto/9   MIMIR for Chrome  3/9/auto/13
 */
export function HomeDashboard({
  greeting,
  dateString,
  quizTaken,
  topPick,
  arsenalCards,
  cardOptions,
}: {
  greeting: string;
  dateString: string;
  quizTaken: boolean;
  topPick: TopPickData | null;
  arsenalCards: ArsenalCardData[];
  cardOptions: CardOption[];
}) {
  return (
    <div style={{ backgroundColor: C.pageBg, minHeight: "100vh" }} className="px-16 py-14 pb-24">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-10">
          <h1
            className="font-display text-[46px] font-bold"
            style={{ color: C.textPrimary, letterSpacing: "-0.5px" }}
          >
            {greeting}
          </h1>
          <p className="mt-2 font-body text-base" style={{ color: C.textSecondary }}>
            {dateString}
          </p>
        </div>

        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: "repeat(12, 1fr)", gridTemplateRows: "380px 100px 240px" }}
        >
          <CardRecommenderWidget quizTaken={quizTaken} topPick={topPick} cardOptions={cardOptions} />
          <CardArsenalWidget cards={arsenalCards} />
          <AskMimirWidget />
          <ComingSoonWidget
            gridArea="3 / 1 / auto / 9"
            size="lg"
            badge="COMING SOON"
            title="Goal-Based Advisor"
            body={
              'State a goal — "best card for a ₹50,000 purchase" — and get one clear, confident answer instead of ten open tabs.'
            }
          />
          <ComingSoonWidget
            gridArea="3 / 9 / auto / 13"
            size="sm"
            badge="SOON"
            title="MIMIR for Chrome"
            body="MIMIR watches for better offers while you shop, wherever you are."
          />
        </div>
      </div>
    </div>
  );
}
