// Feature 3 Engineering Plan 2B / PRD §11: the 6 new financial-context/
// billing-cycle fields, editable ONLY from the profile-edit panel — a
// deliberately SEPARATE array from ../quiz/questions.ts's QUESTIONS, not
// appended to it, so the 13-question onboarding quiz wizard (which also
// renders from QUESTIONS) never grows 6 new questions. Same
// saveField(key, value) mutation as the 13 quiz fields — both write
// through PATCH /api/profile, which already validates any of
// quizAnswersSchema's 19 keys generically (profileFieldSchema.ts needed
// zero changes for this, per 2B).
export type FinancialQuestionDef =
  | {
      key: "creditScoreRange" | "activeEmiCount";
      type: "select";
      prompt: string;
      options: { value: string; label: string }[];
    }
  | {
      key: "statementDate" | "paymentDueDate";
      type: "day-of-month";
      prompt: string;
      subtext?: string;
    }
  | {
      key: "outstandingBalance" | "creditLimit";
      type: "rupee-amount";
      prompt: string;
    };

export const FINANCIAL_CONTEXT_QUESTIONS: FinancialQuestionDef[] = [
  {
    key: "creditScoreRange",
    type: "select",
    prompt: "What's your credit score range?",
    options: [
      { value: "below-650", label: "Below 650" },
      { value: "650-750", label: "650–750" },
      { value: "750-plus", label: "750+" },
      { value: "unknown", label: "I don't know" },
    ],
  },
  {
    key: "activeEmiCount",
    type: "select",
    prompt: "How many active EMIs/loans do you have?",
    options: [
      { value: "0", label: "0" },
      { value: "1", label: "1" },
      { value: "2", label: "2" },
      { value: "3-plus", label: "3+" },
    ],
  },
  {
    key: "statementDate",
    type: "day-of-month",
    prompt: "What day of the month does your card statement close?",
    subtext: "Lets MIMIR suggest waiting to buy until after it closes, when that helps.",
  },
  {
    key: "paymentDueDate",
    type: "day-of-month",
    prompt: "What day of the month is your payment due?",
  },
  {
    key: "outstandingBalance",
    type: "rupee-amount",
    prompt: "What's your current outstanding balance, roughly?",
  },
  {
    key: "creditLimit",
    type: "rupee-amount",
    prompt: "What's your credit limit?",
  },
];
