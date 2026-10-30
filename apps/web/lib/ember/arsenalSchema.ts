import { z } from "zod";

// PRD §12: explicit desired state, not a blind toggle — the same mutation
// is triggered from two entry points (quiz Q1's multi-select, and the
// results-page button), and a multi-select naturally wants to SET a
// card's held state rather than flip whatever it currently is (a blind
// toggle would double-flip on a double-click or a re-render race).
export const arsenalToggleSchema = z.object({
  cardId: z.string().min(1),
  status: z.enum(["held", "not_held"]),
});
