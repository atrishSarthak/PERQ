import { inferPlanCategory, planInputSchema, type PartialPlanInput, type PlanInput } from "@perq/shared";

// Pure helpers for planner messages in an Ember thread (no React Native, so they're testable).

/** `[plan:<id>]` in a stored message: the text, and the plan to show as a card. */
const MARKER = /\n*\[plan:([0-9a-f-]{36})\]\s*$/;
/** The note kept for the model when a confirmation card was shown; the card itself isn't stored. */
const CONFIRM_NOTE = /\n*\(Showed a card to confirm: [^\n]*\)\s*$/;

export function splitPlanMarker(content: string): { text: string; planId: string | null } {
  const m = content.match(MARKER);
  const text = (m ? content.replace(MARKER, "") : content).replace(CONFIRM_NOTE, "");
  return { text, planId: m ? m[1]! : null };
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A confirmed-looking draft as a full PlanInput, or null while something's missing. */
export function draftToInput(d: PartialPlanInput): PlanInput | null {
  if (!d.item?.name || !d.price) return null;
  const parsed = planInputSchema.safeParse({ ...d, item: { name: d.item.name, category: d.item.category ?? inferPlanCategory(d.item.name) } });
  return parsed.success ? parsed.data : null;
}
