import type { AgentStepEvent } from "@perq/ai";

/**
 * D3 (revised): narration is driven by actual tool-call events, not a
 * fixed script. Maps packages/ai's generic AgentStepEvent to a display
 * label — this mapping is Feature-1-specific (knows about Ember's tool
 * names and card-name shape), so it lives in apps/web, not packages/ai or
 * packages/ui.
 *
 * A card name lookup is passed in for getCardDetails events since the
 * event itself only carries the raw args (cardId) — resolving cardId to a
 * display name is a caller concern (it has the loaded card list; this
 * function does not).
 */
export function narrationLabelForStep(
  event: AgentStepEvent,
  resolveCardName?: (cardId: string) => string | undefined,
  scoredCardCount?: number
): string | null {
  if (event.type === "tool_call") {
    switch (event.toolName) {
      case "getUserProfile":
        return "Ember is checking your profile";
      case "scoreCards":
        return typeof scoredCardCount === "number"
          ? `Ember compared ${scoredCardCount} cards`
          : "Ember is comparing your cards";
      case "getCardDetails": {
        const cardId = event.args["cardId"];
        const cardName =
          typeof cardId === "string" ? resolveCardName?.(cardId) : undefined;
        return cardName ? `Ember is looking up ${cardName}` : "Ember is looking up a card";
      }
      default:
        return null;
    }
  }
  if (event.type === "final") {
    return "Ember is writing your recommendation";
  }
  return null;
}
