// Network logos for the card visual's top-right corner. No real logo asset
// library — these are hand-built text/shape approximations of each
// network's actual wordmark, matching the reference mockup for the three
// networks it shows; RuPay follows the same interim treatment since the
// mockup doesn't include it (PRD adds it as a fourth network here).
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
        <span className="font-body text-base font-bold italic text-white">
          Ru<span style={{ color: "#F7A600" }}>Pay</span>
        </span>
      );
    default:
      return <span className="font-body text-xs font-semibold text-white">{network}</span>;
  }
}
