import {
  FEE_OPTIONS,
  INCOME_OPTIONS,
  OCCUPATION_OPTIONS,
  PRIORITY_OPTIONS,
  SPEND_CATEGORY_QUESTIONS,
  SPEND_OPTIONS,
  TRAVEL_OPTIONS,
  type QuizAnswersV2,
  type QuizKey,
} from "@perq/shared";

const label = <V extends string>(opts: { value: V; label: string }[], v: V | null | undefined) =>
  opts.find((o) => o.value === v)?.label ?? "Not answered";

/** One-line summary of an answer, for the Profile list. */
export function answerSummary(key: QuizKey, a: QuizAnswersV2, cardName: (id: string) => string): string {
  switch (key) {
    case "cardsHeld":
      return a.cardsHeld.length ? a.cardsHeld.map(cardName).join(", ") : "None yet";
    case "occupation":
      return label(OCCUPATION_OPTIONS, a.occupation);
    case "monthlyIncome":
      return label(INCOME_OPTIONS, a.monthlyIncome);
    case "monthlySpend":
      return SPEND_CATEGORY_QUESTIONS.filter((q) => a.monthlySpend[q.key] !== "0")
        .map((q) => `${q.label} ${label(SPEND_OPTIONS, a.monthlySpend[q.key])}`)
        .join(" · ") || "₹0 everywhere";
    case "travelPerYear":
      return label(TRAVEL_OPTIONS, a.travelPerYear);
    case "feeTolerance":
      return label(FEE_OPTIONS, a.feeTolerance);
    case "priorities":
      return a.priorities.length ? a.priorities.map((p) => label(PRIORITY_OPTIONS, p)).join(", ") : "No preference";
    case "openToSecured":
      return a.openToSecured === null ? "Not asked" : a.openToSecured ? "Yes" : "No";
  }
}
