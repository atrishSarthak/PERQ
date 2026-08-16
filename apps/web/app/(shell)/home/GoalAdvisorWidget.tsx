import Link from "next/link";
import { DASHBOARD_COLORS as C } from "./dashboardTheme";

/**
 * Feature 3's real entry point, replacing the "COMING SOON" placeholder
 * that lived here (ComingSoonWidget) now that the feature is built. Same
 * position/sizing/visual treatment as the placeholder it replaces (gridArea
 * "3 / 1 / auto / 9", the "lg" size's padding/radius/surface), and the same
 * whole-card-is-a-link navigation pattern CardRecommenderWidget already
 * uses for /results — a Server Component (no "use client" needed, Link
 * alone doesn't require it) since there's no client interactivity here,
 * just a route into /goal where GoalWizard takes over.
 *
 * dailyLimit is passed as a plain prop (not imported from lib/goals/
 * rateLimit directly) so this purely presentational component stays free
 * of any @perq/db-touching import chain — home/page.tsx (which already
 * queries the DB) is the one place that reads the real
 * MAX_GOAL_SEARCHES_PER_DAY constant.
 */
export function GoalAdvisorWidget({
  atDailyLimit,
  dailyLimit,
}: {
  atDailyLimit: boolean;
  dailyLimit: number;
}) {
  return (
    <Link
      href="/goal"
      className="relative flex flex-col justify-center gap-2.5 rounded-3xl"
      style={{
        gridArea: "3 / 1 / auto / 9",
        backgroundColor: C.surface,
        border: `1px solid ${C.surfaceBorder}`,
        padding: "28px 32px",
      }}
    >
      <h3 className="font-display font-semibold" style={{ color: C.textPrimary, fontSize: 20 }}>
        Ask MIMIR where to buy it
      </h3>
      <p
        className="font-body leading-relaxed"
        style={{ color: C.textSecondary, fontSize: 14, maxWidth: 520 }}
      >
        State a goal — &ldquo;cheapest way to watch Oppenheimer this weekend&rdquo; — and MIMIR
        checks real channels, then tells you where to buy and which card to use.
      </p>
      {atDailyLimit && (
        <p className="font-body font-semibold" style={{ color: "var(--warning)", fontSize: 12 }}>
          You&rsquo;ve used today&rsquo;s {dailyLimit} searches — back tomorrow.
        </p>
      )}
    </Link>
  );
}
