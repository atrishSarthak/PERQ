// Shared between understandGoal.ts and the API route so both can import the
// type/constant without a circular dependency. The clarification exchange
// is held client-side and resent on each follow-up request (not persisted
// server-side) — see the plan's reasoning: a goal's clarification exchange
// is short-lived and disposable, unlike the long-lived /api/chat history.

export interface ClarificationTurn {
  question: string;
  answer: string;
}

// Bounded so MIMIR never interrogates a user indefinitely — ask one thing
// at a time, but never more than this many times before committing to a
// best-effort answer or an honest decline.
export const MAX_CLARIFYING_ROUNDS = 3;
