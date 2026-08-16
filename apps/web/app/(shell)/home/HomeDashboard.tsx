"use client";

import { AskMimirWidget } from "./AskMimirWidget";
import { CardRecommenderWidget, type TopPickData } from "./CardRecommenderWidget";
import { CardArsenalWidget, type ArsenalCardData } from "./CardArsenalWidget";
import { ComingSoonWidget } from "./ComingSoonWidget";
import { GoalAdvisorWidget } from "./GoalAdvisorWidget";
import type { CardOption } from "../quiz/QuizWizard";
import { DASHBOARD_COLORS as C } from "./dashboardTheme";

/**
 * The bento grid, adapted from design-reference/PERQ Dashboard
 * standalone.html — 12-column grid, 3 fixed row heights, widgets placed
 * via grid-area so every cell tiles with no gaps. Card Arsenal's column
 * span was narrowed from the mockup's 8/5 split (cols 1-7 / 8-12) to a
 * 8/4 split (cols 1-8 / 9-12), matching row 3's existing Goal-Based/Chrome
 * split exactly — a deliberate widened-left/narrowed-right change per
 * user feedback (arsenal cards now stack one per row instead of a 2-up
 * grid), which as a side effect makes the whole page's left/right column
 * rhythm consistent top to bottom:
 *   Card Recommender  1/1/auto/9   Card Arsenal  1/9/3/13 (spans rows 1-2)
 *   Ask MIMIR         2/1/auto/9
 *   Goal-Based        3/1/auto/9   MIMIR for Chrome  3/9/auto/13
 */
export function HomeDashboard({
  greeting,
  dateString,
  quizTaken,
  topPick,
  arsenalCards,
  cardOptions,
  atGoalSearchDailyLimit,
  goalSearchDailyLimit,
}: {
  greeting: string;
  dateString: string;
  quizTaken: boolean;
  topPick: TopPickData | null;
  arsenalCards: ArsenalCardData[];
  cardOptions: CardOption[];
  atGoalSearchDailyLimit: boolean;
  goalSearchDailyLimit: number;
}) {
  return (
    <div style={{ backgroundColor: C.pageBg, minHeight: "100vh" }} className="px-16 py-14 pb-24">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-10">
          <h1
            className="font-display text-[32px] font-bold"
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
          <GoalAdvisorWidget
            atDailyLimit={atGoalSearchDailyLimit}
            dailyLimit={goalSearchDailyLimit}
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
