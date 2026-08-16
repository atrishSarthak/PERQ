import Link from "next/link";
import { CHANNEL_DISPLAY_NAME, type Channel } from "@/lib/goals/channels";

const OUTCOME_LABEL: Record<string, string> = {
  succeeded: "Checked",
  checked_empty: "Checked — nothing found",
  failed: "Couldn't check",
};

const OUTCOME_COLOR: Record<string, string> = {
  succeeded: "var(--success)",
  checked_empty: "var(--text-secondary)",
  failed: "var(--warning)",
};

/**
 * PRD §10/§13: the final answer shown alongside a visible breakdown of
 * what was actually compared, plus the channels-checked transparency —
 * "show the work," not just the winning answer with no reasoning trace.
 * Reuses the results page's card-container visual language (rounded-lg,
 * bg-surface, border tokens — ResultCard.tsx's pattern) rather than the
 * home dashboard's fixed-dark bento theme, since this is a dedicated
 * results page like /results, not a home-page widget.
 */
export function GoalResultsView({
  goalText,
  recommendedChannel,
  cardName,
  billingCycleNote,
  explanation,
  channelsChecked,
}: {
  goalText: string;
  recommendedChannel: string;
  cardName: string | null;
  billingCycleNote: string | null;
  explanation: string;
  channelsChecked: { channel: string; outcome: string }[];
}) {
  const channelDisplayName =
    CHANNEL_DISPLAY_NAME[recommendedChannel as Channel] ?? recommendedChannel;

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
          Buy it on {channelDisplayName}
          {cardName ? `, using your ${cardName}` : ""}
        </p>

        <div
          className="mt-4 rounded-md p-3 font-body text-body-sm text-text-primary"
          style={{ backgroundColor: "var(--bg-surface-2)" }}
        >
          <p>
            <span className="font-bold text-accent">✦ MIMIR:</span> {explanation}
          </p>
        </div>

        {billingCycleNote && (
          <p className="mt-3 font-body text-body-sm text-warning">⏱ {billingCycleNote}</p>
        )}
      </div>

      <div>
        <p className="mb-2 font-body text-caption font-semibold uppercase tracking-wide text-text-secondary">
          What MIMIR checked
        </p>
        <ul className="flex flex-col gap-1.5">
          {channelsChecked.map((c) => (
            <li
              key={c.channel}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2 font-body text-body-sm"
            >
              <span className="text-text-primary">
                {CHANNEL_DISPLAY_NAME[c.channel as Channel] ?? c.channel}
              </span>
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
