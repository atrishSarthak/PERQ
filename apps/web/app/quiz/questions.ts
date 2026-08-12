import type { QuizAnswers } from "@perq/scoring-engine";

// PRD §8's 13 questions, each mapped to exactly one of DR1's four widget
// types — single source of truth for the wizard's rendering AND its
// progress indicator ("Question N of 13").
export type QuestionDef =
  | { key: "heldCardIds"; type: "searchable-multi-select"; prompt: string }
  | {
      key: "annualIncome" | "flightFrequency" | "hotelFrequency" | keyof QuizAnswers;
      type: "single-select-scale";
      prompt: string;
      options: { value: string; label: string }[];
    }
  | { key: "gymMembership" | "recurringBillsByCard"; type: "yes-no-with-conditional"; prompt: string; conditionalLabel?: string }
  | { key: "priorityCategories"; type: "pick-up-to-n-chips"; prompt: string; options: { value: string; label: string }[]; max: number };

const spendBucketOptions = [
  { value: "<1k", label: "Under ₹1,000" },
  { value: "1-3k", label: "₹1,000–3,000" },
  { value: "3-6k", label: "₹3,000–6,000" },
  { value: "6k+", label: "₹6,000+" },
];

const frequencyOptions = [
  { value: "never", label: "Never" },
  { value: "1-2", label: "1–2 / year" },
  { value: "3-5", label: "3–5 / year" },
  { value: "6+", label: "6+ / year" },
];

export const QUESTIONS: QuestionDef[] = [
  {
    key: "heldCardIds",
    type: "searchable-multi-select",
    prompt: "Which credit cards do you currently hold?",
  },
  {
    key: "annualIncome",
    type: "single-select-scale",
    prompt: "Approximate annual income",
    options: [
      { value: "under-3l", label: "Under ₹3L" },
      { value: "3-6l", label: "₹3L–6L" },
      { value: "6-12l", label: "₹6L–12L" },
      { value: "12l+", label: "₹12L+" },
    ],
  },
  {
    key: "flightFrequency",
    type: "single-select-scale",
    prompt: "Flight frequency, domestic + international combined",
    options: frequencyOptions,
  },
  {
    key: "hotelFrequency",
    type: "single-select-scale",
    prompt: "Hotel stays for leisure or work",
    options: frequencyOptions,
  },
  {
    key: "gymMembership",
    type: "yes-no-with-conditional",
    prompt: "Active gym/fitness membership?",
    conditionalLabel: "Roughly how much does it cost monthly? (₹)",
  },
  {
    key: "foodDeliverySpend",
    type: "single-select-scale",
    prompt: "Monthly food delivery spend (Swiggy/Zomato)",
    options: spendBucketOptions,
  },
  {
    key: "ecommerceSpend",
    type: "single-select-scale",
    prompt: "Monthly e-commerce spend (Flipkart/Amazon/Myntra, etc.)",
    options: spendBucketOptions,
  },
  {
    key: "grocerySpend",
    type: "single-select-scale",
    prompt: "Monthly grocery spend",
    options: spendBucketOptions,
  },
  {
    key: "diningOutSpend",
    type: "single-select-scale",
    prompt: "Monthly dining-out spend (restaurants, not delivery)",
    options: spendBucketOptions,
  },
  {
    key: "fuelSpend",
    type: "single-select-scale",
    prompt: "Monthly fuel spend",
    options: spendBucketOptions,
  },
  {
    key: "recurringBillsByCard",
    type: "yes-no-with-conditional",
    prompt: "Do you pay recurring bills/subscriptions by card?",
  },
  {
    key: "feeTolerant",
    type: "single-select-scale",
    prompt: "Fee tolerance",
    options: [
      { value: "true", label: "Open to an annual fee if the rewards outweigh it" },
      { value: "false", label: "₹0-fee only" },
    ],
  },
  {
    key: "priorityCategories",
    type: "pick-up-to-n-chips",
    prompt: "Top priority — pick up to 2",
    options: [
      { value: "travel", label: "Travel & lounge" },
      { value: "general", label: "Cashback" },
      { value: "dining", label: "Dining" },
      { value: "ecommerce", label: "Online shopping" },
      { value: "fuel", label: "Fuel" },
    ],
    max: 2,
  },
];
