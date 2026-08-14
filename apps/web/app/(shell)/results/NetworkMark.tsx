// Network logos for the card visual's top-right corner. No real logo asset
// library — these are hand-built text/shape approximations, not brand-
// guideline-accurate marks. Verification status per network:
//
// - Mastercard: #EB001B / #F79E1B are the widely and consistently cited
//   circle colors across many independent brand-color references.
//   mastercard.com's own brand center 403s to automated fetches, so this
//   is strong triangulation, not a first-party confirmation.
// - Visa: no color used here (plain white wordmark), so nothing to verify.
// - Amex: #016FD0 is the most-repeated "logo blue" across independent
//   aggregators, but Amex has no public brand-guideline page to check it
//   against — best-available consensus, not a confirmed official value.
// - RuPay: verified against the official NPCI/RuPay Brand Guidelines PDF
//   (npci.org.in digital media kit, fetched directly). The real mark is a
//   solid-color "RuPay" wordmark (never two-tone) plus a *separate*
//   two-color "fast-forward" chevron: orange #D9782D + green #2B8B4B. The
//   guideline's own dark-background example reverses the wordmark to white
//   while keeping the chevron in color — the treatment used below, since
//   this mark always sits on a colored card gradient, never a light one.
export function NetworkMark({ network }: { network: string }) {
  switch (network) {
    case "Visa":
      return (
        <span className="font-body text-xl font-bold italic tracking-tight text-white">
          VISA
        </span>
      );
    case "Mastercard":
      return (
        <span className="relative block h-6 w-10" aria-label="Mastercard" role="img">
          <span
            className="absolute left-0 top-0 h-6 w-6 rounded-full"
            style={{ backgroundColor: "#EB001B" }}
          />
          <span
            className="absolute left-3 top-0 h-6 w-6 rounded-full opacity-90"
            style={{ backgroundColor: "#F79E1B" }}
          />
        </span>
      );
    case "Amex":
      return (
        <span
          className="rounded px-1.5 py-0.5 font-body text-[11px] font-bold tracking-wide text-white"
          style={{ backgroundColor: "#016FD0" }}
        >
          AMEX
        </span>
      );
    case "RuPay":
      return (
        <span className="flex items-center gap-0.5" aria-label="RuPay" role="img">
          <span className="font-body text-base font-bold italic text-white">RuPay</span>
          <span className="flex" aria-hidden="true">
            <span
              className="text-lg font-bold leading-none"
              style={{ color: "#D9782D" }}
            >
              ›
            </span>
            <span
              className="-ml-2 text-lg font-bold leading-none"
              style={{ color: "#2B8B4B" }}
            >
              ›
            </span>
          </span>
        </span>
      );
    default:
      return <span className="font-body text-xs font-semibold text-white">{network}</span>;
  }
}
