import { describe, expect, it } from "vitest";
import {
  canContinue,
  currentStep,
  initialQuizState,
  isLastStep,
  quizReducer,
  quizSteps,
  toAnswers,
  type QuizAction,
  type QuizState,
} from "../src/features/quiz/reducer";

const run = (actions: QuizAction[], s: QuizState = initialQuizState()) => actions.reduce(quizReducer, s);

const fullSpend: QuizAction[] = (["food_delivery", "online_shopping", "groceries", "dining", "fuel", "bills", "upi"] as const).map(
  (category) => ({ type: "setSpend", category, value: "1k_3k" })
);

describe("quiz reducer", () => {
  it("walks the 7 questions in order and blocks Next until answered", () => {
    let s = run([{ type: "toggleCard", cardId: "sbi-cashback" }, { type: "next" }]);
    expect(currentStep(s)).toBe("occupation");
    expect(canContinue(s)).toBe(false);
    s = run([{ type: "next" }], s);
    expect(currentStep(s)).toBe("occupation"); // still blocked
    s = run([{ type: "set", key: "occupation", value: "salaried" }, { type: "next" }, { type: "set", key: "monthlyIncome", value: "50k_1l" }, { type: "next" }], s);
    expect(currentStep(s)).toBe("monthlySpend");
    expect(quizSteps(s.draft)).toHaveLength(7);
  });

  it("needs every spend category on the single spend screen", () => {
    let s = run([{ type: "next" }, { type: "set", key: "occupation", value: "salaried" }, { type: "next" }, { type: "set", key: "monthlyIncome", value: "50k_1l" }, { type: "next" }]);
    s = run(fullSpend.slice(0, 6), s);
    expect(canContinue(s)).toBe(false);
    s = run(fullSpend.slice(6), s);
    expect(canContinue(s)).toBe(true);
  });

  it("adds the FD question only for students or income below ₹25k", () => {
    const student = run([{ type: "set", key: "occupation", value: "student" }, { type: "set", key: "monthlyIncome", value: "25k_50k" }]);
    expect(quizSteps(student.draft)).toHaveLength(8);
    expect(quizSteps(student.draft).at(-1)).toBe("openToSecured");
    const salaried = run([{ type: "set", key: "occupation", value: "salaried" }, { type: "set", key: "monthlyIncome", value: "25k_50k" }]);
    expect(quizSteps(salaried.draft)).toHaveLength(7);
  });

  it("allows at most two priorities and a 'no preference' reset", () => {
    let s = run([{ type: "togglePriority", value: "cashback" }, { type: "togglePriority", value: "travel" }, { type: "togglePriority", value: "fuel" }]);
    expect(s.draft.priorities).toEqual(["cashback", "travel"]);
    s = run([{ type: "togglePriority", value: "none" }], s);
    expect(s.draft.priorities).toEqual([]);
  });

  it("goes back without losing answers and never below the first question", () => {
    const s = run([{ type: "next" }, { type: "set", key: "occupation", value: "salaried" }, { type: "back" }, { type: "back" }]);
    expect(s.index).toBe(0);
    expect(s.draft.occupation).toBe("salaried");
  });

  it("produces valid v2 answers at the end, with openToSecured null when not asked", () => {
    const s = run([
      { type: "set", key: "occupation", value: "salaried" },
      { type: "set", key: "monthlyIncome", value: "50k_1l" },
      ...fullSpend,
      { type: "set", key: "travelPerYear", value: "1_2" },
      { type: "set", key: "feeTolerance", value: "upto_1000" },
    ]);
    const answers = toAnswers(s.draft)!;
    expect(answers).toMatchObject({ schemaVersion: 2, openToSecured: null, cardsHeld: [] });
    expect(toAnswers({ ...s.draft, feeTolerance: undefined })).toBeNull();
  });

  it("knows the last step", () => {
    const s = { ...initialQuizState({ occupation: "salaried", monthlyIncome: "50k_1l" }), index: 6 };
    expect(isLastStep(s)).toBe(true);
  });
});
