import type { ResultsCard } from "./types";
import { CardVisual } from "./CardVisual";
import { getRewardHighlight } from "./rewardHighlight";
import { useMimirChat } from "../mimir/MimirChatContext";

function formatRupee(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-body text-caption font-semibold uppercase tracking-wide text-text-secondary">
        {label}
      </p>
      <p className="mt-0.5 font-body text-body font-bold text-text-primary">{value}</p>
    </div>
  );
}

/**
 * The result card component used for both MIMIR's Top Pick and every card
 * in "More Matches" — only the border (isTopPick) differs; the "Top Pick"
 * label itself is rendered by the caller, above the card, not inside it.
 *
 * Layout: card visual (left) and name/stats (right) sit in a row up top,
 * with the arsenal button at the top-right of that row (same right edge
 * as the container); MIMIR's explanation runs full-width beneath both.
 */
export function ResultCard({
  card,
  pending,
  onToggleArsenal,
  cardHolderName,
  isTopPick,
}: {
  card: ResultsCard;
  pending: boolean;
  onToggleArsenal: (cardId: string, next: "held" | "not_held") => void;
  cardHolderName: string;
  isTopPick?: boolean;
}) {
  const held = card.arsenalStatus === "held";
  const { send } = useMimirChat();

  function askMimirToElaborate() {
    void send(
      `Tell me more about the ${card.issuer} ${card.name}. Why does it fit my profile, and what should I know before applying?`
    );
  }

  return (
    <div
      className="rounded-lg p-4 md:p-6"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderStyle: "solid",
        borderWidth: isTopPick ? 3 : 1,
        borderColor: isTopPick ? "var(--gold)" : "var(--border)",
        boxShadow: isTopPick ? "0 0 0 4px rgba(184, 134, 11, 0.12)" : undefined,
      }}
    >
      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <CardVisual card={card} cardHolderName={cardHolderName} />

        <div className="flex flex-1 flex-col">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-h2 font-bold text-text-primary">
              {card.issuer} {card.name}
            </h3>

            <button
              disabled={pending}
              onClick={() => onToggleArsenal(card.cardId, held ? "not_held" : "held")}
              className={`shrink-0 font-body text-body-sm font-semibold disabled:opacity-50 ${
                held ? "rounded-full px-4 py-2" : "rounded-md px-4 py-2"
              }`}
              style={{
                backgroundColor: held ? "var(--success)" : "var(--text-primary)",
                color: held ? "var(--color-white)" : "var(--bg-base)",
              }}
            >
              {held ? "✓ In My Arsenal" : "Add to My Arsenal"}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4">
            <Stat label="Annual Fee" value={formatRupee(card.annualFee)} />
            <Stat label="Joining Fee" value={formatRupee(card.joiningFee)} />
            <Stat label="Reward Highlight" value={getRewardHighlight(card.rewardRates)} />
            <Stat label="Fee Waiver" value={card.feeWaiverCondition ?? "None"} />
          </div>

          {/* D15: web-searched cards must show where their terms came
              from — a trust requirement, not decoration. */}
          {card.sourceUrls && card.sourceUrls.length > 0 && (
            <p className="mt-4 font-body text-caption text-text-secondary">
              Sourced via web search.{" "}
              <a
                href={card.sourceUrls[0]}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                View source
              </a>
            </p>
          )}
        </div>
      </div>

      <div
        className="mt-4 rounded-md p-3 font-body text-body-sm text-text-primary"
        style={{ backgroundColor: "var(--bg-surface-2)" }}
      >
        <p>
          <span className="font-bold text-accent">✦ MIMIR:</span>{" "}
          {card.recommendation?.explanation ?? "Not yet scored for your profile."}
        </p>
        {card.recommendation && (
          <button
            type="button"
            onClick={askMimirToElaborate}
            className="mt-2 font-body text-caption text-accent opacity-70 underline decoration-dotted underline-offset-2 hover:opacity-100"
          >
            Learn more
          </button>
        )}
      </div>
    </div>
  );
}
