import type { NudgeChip } from "@perq/shared";

// The first Ember message in a nudge thread and its rule-specific chips
// (handoff §7.4). Chips with an `action` are buttons the app handles
// (never the model); the rest send their text as the user's message.

const ask = (label: string): NudgeChip => ({ label, action: null });

export const NUDGE_CHIPS: Record<string, NudgeChip[]> = {
  due_soon: [{ label: "Mark as paid", action: "mark_paid" }, { label: "Remind me tomorrow", action: "remind_tomorrow" }, ask("Why does paying in full matter?")],
  due_today: [{ label: "Mark as paid", action: "mark_paid" }, ask("What happens if I pay only the minimum?")],
  min_due_trap: [ask("How much interest am I paying?"), ask("Why does paying in full matter?")],
  fees_charged: [ask("What were these fees for?"), ask("How do I avoid them next time?")],
  high_utilisation: [ask("How much should I pay to get under 30%?"), ask("Why does utilisation matter?")],
  statement_upload: [{ label: "Upload statement", action: "upload" }, { label: "Remind me tomorrow", action: "remind_tomorrow" }],
  fee_waiver_pace: [ask("How far am I from the waiver?"), ask("Is this card worth its fee for me?")],
  missed_rewards: [ask("Show the transactions"), ask("Which card for food from now on?")],
  points_value: [ask("How do I use these points?"), ask("Which points expire first?")],
  budget_pace: [ask("Where did that money go?"), ask("Should I change this budget?")],
  goal_progress: [ask("How can I catch up?"), ask("Can I move the date?")],
  plan_buy_window: [{ label: "Open the plan", action: "open_plan" }, ask("What changed since I planned?"), ask("Is there a better way to pay?")],
};

export function nudgeOpening(n: { title: string; body: string }): string {
  return `${n.body} Want to go through it together?`;
}
