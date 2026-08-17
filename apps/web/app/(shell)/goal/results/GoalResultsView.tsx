import Link from "next/link";

const OUTCOME_LABEL: Record<string, string> = {
  succeeded: "Confirmed",
  unconfirmed_price: "Found — price not confirmed",
};

const OUTCOME_COLOR: Record<string, string> = {
  succeeded: "var(--success)",
  unconfirmed_price: "var(--text-secondary)",
};

function formatRupee(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

/**
 * The final answer shown alongside a visible breakdown of what was actually
 * compared, plus the checked-listings transparency — "show the work," not
 * just the winning answer with no reasoning trace. Reuses the results
 * page's card-container visual language (rounded-lg, bg-surface, border
 * tokens — ResultCard.tsx's pattern) rather than the home dashboard's
 * fixed-dark bento theme, since this is a dedicated results page like
 * /results, not a home-page widget.
 *
 * v2 (open-ended web-search redesign): recommendedChannel is already a
 * human-readable source label (no fixed-channel lookup needed anymore),
 * links out to the real listing via recommendedSourceUrl when present, and
 * headlines a 3-way paymentMethod branch (card / bnpl / no_card) instead of
 * always framing around a card.
 */
export function GoalResultsView({
  goalText,
  recommendedChannel,
  recommendedSourceUrl,
  cardName,
  paymentMethod,
  bnplNote,
  billingCycleNote,
  cardOfferNote,
  cardOfferCitationUrl,
  explanation,
  channelsChecked,
}: {
  goalText: string;
  recommendedChannel: string;
  recommendedSourceUrl: string | null;
  cardName: string | null;
  paymentMethod: string;
  bnplNote: string | null;
  billingCycleNote: string | null;
  cardOfferNote: string | null;
  cardOfferCitationUrl: string | null;
  explanation: string;
  channelsChecked: { source: string; sourceUrl: string; outcome: string; price?: number }[];
}) {
  const sourceLabel = recommendedSourceUrl ? (
    <a
      href={recommendedSourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="underline decoration-dotted underline-offset-2"
    >
      {recommendedChannel}
    </a>
  ) : (
    recommendedChannel
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
      <div>
        <p className="font-body text-body-sm text-text-secondary">MIMIR checked this for you:</p>
        <h1 className="mt-1 font-display text-body-lg font-semibold text-text-primary">
          &ldquo;{goalText}&rdquo;
        </h1>
      </div>

      <div
        className="rounded-lg p-4 md:p-6"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "3px solid var(--gold)",
          boxShadow: "0 0 0 4px rgba(184, 134, 11, 0.12)",
        }}
      >
        <p className="font-display text-display font-bold text-text-primary">
          Buy it from {sourceLabel}
          {paymentMethod === "card" && cardName ? `, using your ${cardName}` : ""}
          {paymentMethod === "bnpl" ? ", using Buy Now Pay Later" : ""}
        </p>

        <div
          className="mt-4 rounded-md p-3 font-body text-body-sm text-text-primary"
          style={{ backgroundColor: "var(--bg-surface-2)" }}
        >
          <p>
            <span className="font-bold text-accent">✦ MIMIR:</span> {explanation}
          </p>
        </div>

        {paymentMethod === "bnpl" && bnplNote && (
          <p className="mt-3 font-body text-body-sm text-warning">💳 {bnplNote}</p>
        )}

        {billingCycleNote && (
          <p className="mt-3 font-body text-body-sm text-warning">⏱ {billingCycleNote}</p>
        )}

        {cardOfferNote && (
          <div
            className="mt-3 rounded-md p-3 font-body text-body-sm text-text-primary"
            style={{ backgroundColor: "var(--bg-surface-2)" }}
          >
            <p>
              <span className="font-bold text-accent">🏷 MIMIR found a live offer:</span>{" "}
              {cardOfferCitationUrl ? (
                <a
                  href={cardOfferCitationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-dotted underline-offset-2"
                >
                  {cardOfferNote}
                </a>
              ) : (
                cardOfferNote
              )}
            </p>
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 font-body text-caption font-semibold uppercase tracking-wide text-text-secondary">
          What MIMIR checked
        </p>
        <ul className="flex flex-col gap-1.5">
          {channelsChecked.map((c) => (
            <li
              key={c.sourceUrl}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2 font-body text-body-sm"
            >
              <a
                href={c.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-primary underline decoration-dotted underline-offset-2"
              >
                {c.source}
                {c.price != null ? ` — ${formatRupee(c.price)}` : ""}
              </a>
              <span style={{ color: OUTCOME_COLOR[c.outcome] ?? "var(--text-secondary)" }}>
                {OUTCOME_LABEL[c.outcome] ?? c.outcome}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <Link
        href="/goal"
        className="w-fit font-body text-body-sm font-semibold text-accent"
      >
        Ask MIMIR about something else →
      </Link>
    </div>
  );
}
