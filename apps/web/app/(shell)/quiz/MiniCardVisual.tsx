import { getBankGradient, getBankLabel } from "../results/bankBrand";
import { NetworkMark } from "../results/NetworkMark";

/**
 * Compact version of the results page's CardVisual (issuer gradient +
 * network mark), for the quiz's card-search picker (Task 1's CARD SEARCH
 * spec: "a small, compact version of the existing credit-card visual
 * component"). Deliberately drops the last-4/holder-name/expiry rows that
 * only make sense once a card is "yours" in the results view — here it's
 * just an identification chip in a selectable list.
 */
export function MiniCardVisual({
  issuer,
  network,
  name,
}: {
  issuer: string;
  network: string;
  name: string;
}) {
  const { from, to } = getBankGradient(issuer);

  return (
    <div
      className="relative flex aspect-[1.75/1] w-full shrink-0 flex-col justify-between overflow-hidden rounded-md p-3 text-white"
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate font-body text-[11px] font-bold uppercase tracking-wide text-white/90">
          {getBankLabel(issuer)}
        </span>
        <div className="scale-75 origin-top-right">
          <NetworkMark network={network} />
        </div>
      </div>
      <p className="truncate font-body text-xs font-semibold text-white">{name}</p>
    </div>
  );
}
