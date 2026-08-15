import Link from "next/link";
import { DashboardCardChip } from "./DashboardCardChip";
import { DASHBOARD_COLORS as C } from "./dashboardTheme";

export interface ArsenalCardData {
  cardId: string;
  issuer: string;
  name: string;
  network: string;
}

/**
 * 2-column grid with vertical overflow scroll — matches
 * design-reference/PERQ Dashboard standalone.html's actual arsenal layout
 * exactly (`grid-template-columns: repeat(2, 1fr); overflow-y: auto`), not
 * a horizontal scroll strip. "Add your first card" links to /results,
 * where arsenal marking already lives (PRD §12) — /results itself
 * redirects to /quiz if there's no profile yet, so this works correctly
 * for a brand-new user too, without a second add-card flow to build.
 */
export function CardArsenalWidget({ cards }: { cards: ArsenalCardData[] }) {
  return (
    <div
      className="flex flex-col rounded-3xl p-7"
      style={{ gridArea: "1 / 8 / 3 / 13", backgroundColor: C.surface, border: `1px solid ${C.surfaceBorder}` }}
    >
      <div className="mb-[18px] flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold" style={{ color: C.textPrimary }}>
            Your Card Arsenal
          </h2>
          <p className="mt-0.5 font-body text-[13px]" style={{ color: C.textTertiary }}>
            {cards.length > 0 ? `${cards.length} card${cards.length === 1 ? "" : "s"}` : "No cards yet"}
          </p>
        </div>
      </div>

      {cards.length > 0 ? (
        <div className="grid flex-1 grid-cols-2 content-start gap-3.5 overflow-y-auto pr-1">
          {cards.map((c) => (
            <div key={c.cardId} className="h-[88px] w-full">
              <DashboardCardChip cardId={c.cardId} issuer={c.issuer} name={c.name} network={c.network} />
            </div>
          ))}
        </div>
      ) : (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl p-5"
          style={{ border: `1px dashed ${C.innerBorder14}` }}
        >
          <p className="font-body text-sm" style={{ color: C.textTertiary }}>
            No cards added yet
          </p>
          <Link
            href="/results"
            className="rounded-xl px-[18px] py-2 font-body text-[13px] font-semibold"
            style={{ color: "var(--gold)", border: "1px solid rgba(229,181,103,0.4)" }}
          >
            Add your first card
          </Link>
        </div>
      )}
    </div>
  );
}
