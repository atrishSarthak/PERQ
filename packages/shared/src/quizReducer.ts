import {
  QUIZ_SPEND_CATEGORIES,
  quizAnswersV2Schema,
  shouldAskOpenToSecured,
  type MonthlySpendAnswer,
  type QuizAnswersV2,
  type QuizKey,
} from "./quiz";

// The quiz as a pure reducer (handoff §1.1/§1.6): one question per screen,
// progress, back, and the conditional FD question. Shared by the mobile quiz
// and the web wizard, so both ask exactly the same questions the same way.

export type Draft = {
  cardsHeld: string[];
  occupation?: QuizAnswersV2["occupation"];
  monthlyIncome?: QuizAnswersV2["monthlyIncome"];
  monthlySpend: Partial<MonthlySpendAnswer>;
  travelPerYear?: QuizAnswersV2["travelPerYear"];
  feeTolerance?: QuizAnswersV2["feeTolerance"];
  priorities: QuizAnswersV2["priorities"];
  openToSecured?: boolean;
};

export interface QuizState {
  index: number;
  draft: Draft;
}

export type QuizAction =
  | { type: "set"; key: keyof Draft; value: unknown }
  | { type: "setSpend"; category: keyof MonthlySpendAnswer; value: MonthlySpendAnswer[keyof MonthlySpendAnswer] }
  | { type: "togglePriority"; value: QuizAnswersV2["priorities"][number] | "none" }
  | { type: "toggleCard"; cardId: string }
  | { type: "next" }
  | { type: "back" };

export const initialQuizState = (draft?: Partial<Draft>): QuizState => ({
  index: 0,
  draft: { cardsHeld: [], monthlySpend: {}, priorities: [], ...draft },
});

const BASE_STEPS: QuizKey[] = [
  "cardsHeld",
  "occupation",
  "monthlyIncome",
  "monthlySpend",
  "travelPerYear",
  "feeTolerance",
  "priorities",
];

/** The questions to show, given the answers so far (7, or 8 with the FD question). */
export function quizSteps(draft: Draft): QuizKey[] {
  const ask =
    draft.occupation !== undefined &&
    draft.monthlyIncome !== undefined &&
    shouldAskOpenToSecured({ occupation: draft.occupation, monthlyIncome: draft.monthlyIncome });
  return ask ? [...BASE_STEPS, "openToSecured"] : BASE_STEPS;
}

export function currentStep(state: QuizState): QuizKey {
  const steps = quizSteps(state.draft);
  return steps[Math.min(state.index, steps.length - 1)]!;
}

/** Whether the current question has a usable answer. */
export function canContinue(state: QuizState): boolean {
  const d = state.draft;
  switch (currentStep(state)) {
    case "cardsHeld":
    case "priorities":
      return true; // empty = "I don't have one yet" / "No preference"
    case "monthlySpend":
      return QUIZ_SPEND_CATEGORIES.every((c) => d.monthlySpend[c] !== undefined);
    case "openToSecured":
      return d.openToSecured !== undefined;
    default:
      return d[currentStep(state) as keyof Draft] !== undefined;
  }
}

export function isLastStep(state: QuizState): boolean {
  return state.index >= quizSteps(state.draft).length - 1;
}

export function quizReducer(state: QuizState, action: QuizAction): QuizState {
  const d = state.draft;
  switch (action.type) {
    case "set":
      return { ...state, draft: { ...d, [action.key]: action.value } };
    case "setSpend":
      return { ...state, draft: { ...d, monthlySpend: { ...d.monthlySpend, [action.category]: action.value } } };
    case "toggleCard": {
      const has = d.cardsHeld.includes(action.cardId);
      return {
        ...state,
        draft: { ...d, cardsHeld: has ? d.cardsHeld.filter((c) => c !== action.cardId) : [...d.cardsHeld, action.cardId] },
      };
    }
    case "togglePriority": {
      if (action.value === "none") return { ...state, draft: { ...d, priorities: [] } };
      const has = d.priorities.includes(action.value);
      if (has) return { ...state, draft: { ...d, priorities: d.priorities.filter((p) => p !== action.value) } };
      if (d.priorities.length >= 2) return state; // up to 2
      return { ...state, draft: { ...d, priorities: [...d.priorities, action.value] } };
    }
    case "next":
      if (!canContinue(state) || isLastStep(state)) return state;
      return { ...state, index: state.index + 1 };
    case "back":
      return { ...state, index: Math.max(0, state.index - 1) };
  }
}

/** The finished answers, or null if anything required is missing. */
export function toAnswers(draft: Draft): QuizAnswersV2 | null {
  const asked = quizSteps(draft).includes("openToSecured");
  const parsed = quizAnswersV2Schema.safeParse({
    schemaVersion: 2,
    ...draft,
    openToSecured: asked ? (draft.openToSecured ?? null) : null,
  });
  return parsed.success ? parsed.data : null;
}

/** Pre-fills the quiz from saved answers (retake / edit). */
export function draftFromAnswers(a: QuizAnswersV2): Draft {
  return { ...a, openToSecured: a.openToSecured ?? undefined };
}
