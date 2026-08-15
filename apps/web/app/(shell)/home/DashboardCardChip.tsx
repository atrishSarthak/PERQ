import { getBankGradient, getLast4 } from "../results/bankBrand";

/**
 * The small gradient card chip used in both the Card Recommender widget's
 * top-pick preview and the Card Arsenal grid (design-reference/PERQ
 * Dashboard standalone.html) — network-chip rectangle + network label top
 * row, card name + masked last4 bottom row. Deliberately simpler than the
 * full CardVisual on the results page (no holder name/expiry — this is a
 * glanceable dashboard summary, not the full card). Colors are real,
 * issuer-driven (getBankGradient), not the mockup's fixed demo palette —
 * the mockup's exact layout/sizing is what's pixel-matched here, not its
 * placeholder data.
 */
export function DashboardCardChip({
  cardId,
  issuer,
  name,
  network,
}: {
  cardId: string;
  issuer: string;
  name: string;
  network: string;
}) {
  const { from, to } = getBankGradient(issuer);
  const last4 = getLast4(cardId);

  return (
    <div
      className="flex h-full w-full flex-col justify-between rounded-xl p-3"
      style={{
        background: `linear-gradient(135deg, ${from}, ${to})`,
        border: "1px solid rgba(255,255,255,0.25)",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="h-4 w-[22px] rounded-[3px]" style={{ backgroundColor: "rgba(255,255,255,0.35)" }} />
        <span
          className="font-body text-[9px] tracking-wide"
          style={{ color: "rgba(255,255,255,0.6)" }}
        >
          {network}
        </span>
      </div>
      <div>
        <p className="truncate font-body text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.85)" }}>
          {name}
        </p>
        <p className="mt-0.5 font-body text-[10px] tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>
          •••• {last4}
        </p>
      </div>
    </div>
  );
}
