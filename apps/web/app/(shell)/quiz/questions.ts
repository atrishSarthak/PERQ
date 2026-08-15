import type { QuizAnswers } from "@perq/scoring-engine";

// Finalized quiz copy (Task 1 spec) — single source of truth for the
// wizard's rendering AND its progress indicator ("Question N of 13").
export type QuestionDef =
  | {
      key: "heldCardIds";
      type: "card-search";
      prompt: string;
      subtext?: string;
    }
  | {
      key: keyof QuizAnswers;
      type: "single-select-scale";
      prompt: string;
      subtext?: string;
      options: { value: string; label: string }[];
    }
  | {
      key: "priorityCategories";
      type: "pick-up-to-n-chips";
      prompt: string;
      subtext?: string;
      options: { value: string; label: string }[];
      max: number;
      noneOption: { value: string; label: string };
    };

const spendBucketOptions = [
  { value: "<1k", label: "Under ₹1,000" },
  { value: "1-3k", label: "₹1,000–3,000" },
  { value: "3-6k", label: "₹3,000–6,000" },
  { value: "6k+", label: "₹6,000+" },
];

const frequencyOptions = [
  { value: "never", label: "Never" },
  { value: "1-2", label: "1–2 times" },
  { value: "3-5", label: "3–5 times" },
  { value: "6+", label: "6+ times" },
];

export const QUESTIONS: QuestionDef[] = [
  {
    key: "heldCardIds",
    type: "card-search",
    prompt: "Which cards do you currently have?",
    subtext: "Search or scroll to select all that apply.",
  },
  {
    key: "annualIncome",
    type: "single-select-scale",
    prompt: "What's your annual income, roughly?",
    options: [
      { value: "under-3l", label: "Under ₹3L" },
      { value: "3-6l", label: "₹3L–6L" },
      { value: "6-10l", label: "₹6L–10L" },
      { value: "10l+", label: "₹10L+" },
      { value: "prefer-not-to-say", label: "Prefer not to say" },
    ],
  },
  {
    key: "flightFrequency",
    type: "single-select-scale",
    prompt: "How often do you fly?",
    subtext: "Domestic + international combined, over a year.",
    options: frequencyOptions,
  },
  {
    key: "hotelFrequency",
    type: "single-select-scale",
    prompt: "How often do you stay in hotels?",
    subtext: "For leisure or work.",
    options: frequencyOptions,
  },
  {
    key: "gymMembership",
    type: "single-select-scale",
    prompt: "Got an active gym or fitness membership?",
    options: [
      { value: "under-1500", label: "Yes, under ₹1,500/month" },
      { value: "1500-plus", label: "Yes, ₹1,500+/month" },
      { value: "none", label: "No" },
    ],
  },
  {
    key: "foodDeliverySpend",
    type: "single-select-scale",
    prompt: "How much do you spend on food delivery each month?",
    subtext: "Swiggy, Zomato, that kind of thing.",
    options: spendBucketOptions,
  },
  {
    key: "ecommerceSpend",
    type: "single-select-scale",
    prompt: "How much do you spend shopping online each month?",
    subtext: "Flipkart, Amazon, Myntra, etc.",
    options: spendBucketOptions,
  },
  {
    key: "grocerySpend",
    type: "single-select-scale",
    prompt: "How much do you spend on groceries each month?",
    options: spendBucketOptions,
  },
  {
    key: "diningOutSpend",
    type: "single-select-scale",
    prompt: "How much do you spend dining out each month?",
    subtext: "Restaurants, not delivery.",
    options: spendBucketOptions,
  },
  {
    key: "fuelSpend",
    type: "single-select-scale",
    prompt: "How much do you spend on fuel each month?",
    options: spendBucketOptions,
  },
  {
    key: "recurringBillsByCard",
    type: "single-select-scale",
    prompt: "Do you pay recurring bills or subscriptions by card?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
      { value: "some", label: "Some of them" },
    ],
  },
  {
    key: "feeTolerant",
    type: "single-select-scale",
    prompt: "Open to an annual fee if the rewards are worth it?",
    options: [
      { value: "true", label: "Yes, if it pays off" },
      { value: "false", label: "No, I want ₹0-fee cards only" },
    ],
  },
  {
    key: "priorityCategories",
    type: "pick-up-to-n-chips",
    prompt: "What matters most to you?",
    subtext: "Pick up to 2.",
    options: [
      { value: "travel", label: "Travel & lounge access" },
      { value: "general", label: "Cashback" },
      { value: "dining", label: "Dining" },
      { value: "ecommerce", label: "Online shopping" },
      { value: "fuel", label: "Fuel savings" },
    ],
    max: 2,
    noneOption: { value: "none", label: "No strong preference" },
  },
];
