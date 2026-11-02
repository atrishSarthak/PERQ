// `[cart:<id>]` at the end of a stored Ember message: the text, and the
// Instamart cart to show as a card (Step 4). Pure, so it's testable.
const MARKER = /\n*\[cart:([0-9a-f-]{36})\]\s*$/;

export function splitCartMarker(content: string): { text: string; cartId: string | null } {
  const m = content.match(MARKER);
  return { text: m ? content.replace(MARKER, "") : content, cartId: m ? m[1]! : null };
}
