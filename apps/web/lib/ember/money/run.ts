import { EMBER_MODEL, runEmber, ungroundedRupees, type AgentRunRecord, type ConversationTurn, type ModelCaller } from "@perq/ai";
import { formatInr } from "@perq/finance-engine";
import type { CatalogCard, QuizAnswersV2, RecommendationResult } from "@perq/shared";
import { chatFallback, type EmberAnswer } from "../recommender/run";
import { labelsForEvent, WRITING_LABEL } from "../recommender/narration";
import { CHAT_SYSTEM_PROMPT } from "../recommender/prompts";
import { createRecommenderTools } from "../recommender/tools";
import { cardThreadPrompt, MONEY_RULES, MONEY_TOOLS_GUIDE, nudgeThreadPrompt } from "./prompts";
import { createMoneyTools, type MoneyNudge, type MoneyProposal, type MoneyToolContext } from "./tools";

// One Ember chat turn with whichever tool sets the user has data for:
// recommender tools after the quiz, money tools after a statement upload.
// A nudge thread adds that nudge to the system prompt (§7.4).

export interface RecommenderChatContext {
  answers: QuizAnswersV2;
  result: RecommendationResult;
  catalogue: CatalogCard[];
  heldCardIds: string[];
}

export interface ChatTurnInput {
  userId: string | null;
  message: string;
  history: ConversationTurn[];
  recommender: RecommenderChatContext | null;
  money: MoneyToolContext | null;
  nudge?: MoneyNudge | null;
  /** A card thread's card (thread_ref card:<id>). */
  card?: { cardAccountId: string; label: string } | null;
  callModel: ModelCaller | null;
  onLabel?: (label: string) => void;
  onProposal?: (p: MoneyProposal) => void;
  logRun?: (r: AgentRunRecord) => Promise<void>;
}

const NO_STATEMENT = `
The user hasn't uploaded a statement yet. For questions about bills, dues, utilisation or spending, say you need a statement and suggest "Upload a statement" on Home.`;

export function systemPromptFor(input: Pick<ChatTurnInput, "recommender" | "money" | "nudge" | "card">): string {
  const base = input.recommender
    ? CHAT_SYSTEM_PROMPT
    : "You are Ember, PERQ's money assistant, helping a user with their credit cards, bills and spending.";
  return [base, input.money ? MONEY_TOOLS_GUIDE + MONEY_RULES : NO_STATEMENT + MONEY_RULES, input.nudge ? nudgeThreadPrompt(input.nudge) : "", input.card ? cardThreadPrompt(input.card) : ""].join("\n");
}

/** Deterministic answer when Gemini can't answer, or answered with an ungrounded number. */
export function moneyFallback(input: ChatTurnInput): string {
  const sorry = "I couldn't reach my reasoning model just now; ask me again in a moment.";
  if (input.nudge) return `${input.nudge.body} ${sorry}`;
  if (input.recommender && !input.money) return chatFallback(input.message, { ...input.recommender, userId: input.userId, callModel: null });
  if (!input.money) return `Upload a statement and I can help with your bills and spending. ${sorry}`;
  const s = input.money.state;
  return `Across your cards, ${formatInr(s.totals.totalDueAll)} is due on your latest statements${s.dataThrough ? ` (data up to ${s.dataThrough})` : ""}. ${sorry}`;
}

export async function chatTurn(input: ChatTurnInput): Promise<EmberAnswer> {
  if (!input.callModel) return { text: moneyFallback(input), source: "fallback_template", toolOutputs: [] };
  const tools = [
    ...(input.recommender ? createRecommenderTools(input.recommender) : []),
    ...(input.money ? createMoneyTools(input.money, input.onProposal) : []),
  ];
  const toolOutputs: unknown[] = [];
  const run = await runEmber({
    userId: input.userId,
    task: input.nudge ? "nudge_chat" : "chat",
    systemPrompt: systemPromptFor(input),
    messages: [...input.history, { role: "user", content: input.message }],
    tools,
    maxPermission: 3, // level 3 = proposals the user confirms in the app
    callModel: input.callModel,
    model: EMBER_MODEL,
    logRun: input.logRun,
    fallback: () => moneyFallback(input),
    onStep: (event) => {
      if (event.type === "tool") toolOutputs.push(event.output);
      for (const label of labelsForEvent(event)) if (label !== WRITING_LABEL) input.onLabel?.(label);
    },
  });
  if (run.status !== "ok") return { text: run.text, source: "fallback_template", toolOutputs };
  if (ungroundedRupees(run.text, toolOutputs).length > 0) {
    return { text: moneyFallback(input), source: "fallback_template", toolOutputs };
  }
  return { text: run.text, source: "gemini", toolOutputs };
}
