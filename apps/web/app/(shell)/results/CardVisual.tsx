import type { ResultsCard } from "./types";
import { getBankGradient, getBankLabel, getLast4 } from "./bankBrand";
import { NetworkMark } from "./NetworkMark";

/**
 * The rendered credit-card graphic on the left of a result card. Gradient
 * is per-issuer (bankBrand.ts), never a fixed palette; the bank wordmark
 * (top-left) is plain text for now, built so an actual SVG logo asset can
 * drop in later without restructuring this component.
 */
export function CardVisual({
  card,
  cardHolderName,
}: {
  card: ResultsCard;
  cardHolderName: string;
}) {
  const { from, to } = getBankGradient(card.issuer);
  const last4 = getLast4(card.cardId);

  return (
    <div
      className="relative flex aspect-[1.75/1] w-full shrink-0 flex-col justify-between overflow-hidden rounded-md p-4 text-white md:w-80"
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate font-body text-sm font-bold uppercase tracking-wide text-white/90">
          {getBankLabel(card.issuer)}
        </span>
        <NetworkMark network={card.network} />
      </div>

      <div className="flex items-center gap-2 font-body text-lg tracking-widest">
        <span aria-hidden="true">•••• •••• ••••</span>
        <span>{last4}</span>
      </div>

      <div className="flex items-end justify-between">
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-wide text-white/70">Card Holder</p>
          <p className="truncate font-body text-sm uppercase">{cardHolderName}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] uppercase tracking-wide text-white/70">Expires</p>
          <p className="font-body text-sm">MM/YY</p>
        </div>
      </div>

      {/* Subtle diagonal accent shape, bottom-right corner */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-8 -right-8 h-24 w-24 rotate-45 bg-white/10"
      />
    </div>
  );
}
