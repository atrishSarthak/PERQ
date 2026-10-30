import {
  createGeminiModelCaller,
  EMBER_MODEL,
  runEmber,
  ungroundedRupees,
  type AgentRunRecord,
  type ConversationTurn,
  type ModelCaller,
} from "@perq/ai";
import { formatInr } from "@perq/finance-engine";
import type { CatalogCard, QuizAnswersV2, RecommendationResult } from "@perq/shared";
import { recommenderFallback } from "./fallback";
import { fallbackLabels, labelsForEvent } from "./narration";
import { CHAT_SYSTEM_PROMPT, EXPLANATION_SYSTEM_PROMPT } from "./prompts";
import { createRecommenderTools } from "./tools";

/**
 * The model caller, or null when Gemini is unavailable (no key, or
 * GEMINI_DISABLED=1 to exercise the template fallback on purpose).
 */
export function geminiCaller(): ModelCaller | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || process.env.GEMINI_DISABLED === "1") return null;
  return createGeminiModelCaller(key);
}

export interface RecommenderRunInput {
  userId: string | null;
  answers: QuizAnswersV2;
  result: RecommendationResult;
  catalogue: CatalogCard[];
  heldCardIds: string[];
  callModel: ModelCaller | null;
  onLabel?: (label: string) => void | Promise<void>;
  logRun?: (r: AgentRunRecord) => Promise<void>;
}

export interface EmberAnswer {
  text: string;
  source: "gemini" | "fallback_template";
  toolOutputs: unknown[];
}

const STEP_GAP_MS = 350; // fallback narration pacing, so steps visibly tick in

async function narrateFallback(input: RecommenderRunInput) {
  for (const label of fallbackLabels(input.result.catalogue.total, input.result.ranked.length)) {
    await input.onLabel?.(label);
    await new Promise((r) => setTimeout(r, STEP_GAP_MS));
  }
}

/** Ember's explanation of the Top Pick (POST /api/recommender/explain and the eval). */
export async function explainRecommendation(input: RecommenderRunInput): Promise<EmberAnswer> {
  const fallbackText = recommenderFallback(input.result);
  if (!input.callModel || input.result.ranked.length === 0) {
    await narrateFallback(input);
    return { text: fallbackText, source: "fallback_template", toolOutputs: [] };
  }

  const tools = createRecommenderTools(input).filter((t) => t.name !== "whatIf");
  const toolOutputs: unknown[] = [];
  const labels: Promise<void>[] = [];
  const run = await runEmber({
    userId: input.userId,
    task: "recommendation",
    systemPrompt: EXPLANATION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: "Explain my Top Pick and the next two cards." }],
    tools,
    maxPermission: 1,
    callModel: input.callModel,
    model: EMBER_MODEL,
    logRun: input.logRun,
    fallback: () => fallbackText,
    onStep: (event) => {
      if (event.type === "tool") toolOutputs.push(event.output);
      for (const label of labelsForEvent(event)) labels.push(Promise.resolve(input.onLabel?.(label)));
    },
  });
  await Promise.all(labels);

  if (run.status !== "ok") {
    if (!run.steps.length) await narrateFallback(input);
    return { text: run.text, source: "fallback_template", toolOutputs };
  }
  // Grounding guardrail: any ₹ figure not in a tool output → template.
  if (ungroundedRupees(run.text, toolOutputs).length > 0) {
    return { text: fallbackText, source: "fallback_template", toolOutputs };
  }
  return { text: run.text, source: "gemini", toolOutputs };
}

const GENERIC_WORDS = new Set(["card", "credit", "bank", "the", "and", "first"]);

/** The catalogue card a message most clearly names (by distinctive name words), if any. */
export function cardMentioned(message: string, catalogue: CatalogCard[]): CatalogCard | undefined {
  const text = message.toLowerCase();
  let best: { card: CatalogCard; score: number } | undefined;
  for (const card of catalogue) {
    const words = card.name
      .toLowerCase()
      .split(/[^a-z0-9+]+/)
      .filter((w) => w.length > 2 && !GENERIC_WORDS.has(w));
    const score = words.filter((w) => text.includes(w)).length / Math.max(words.length, 1);
    if (score > 0.5 && (!best || score > best.score)) best = { card, score };
  }
  return best?.card;
}

/** Deterministic chat answer when Gemini can't answer (or answered ungrounded). */
export function chatFallback(message: string, input: RecommenderRunInput): string {
  const top = input.result.ranked[0];
  if (!top) return "I don't have ranked cards for you yet. Finish the quiz and ask me again.";
  const mentioned = cardMentioned(message, input.catalogue.filter((c) => c.id !== top.cardId));
  const other = mentioned ? input.result.ranked.find((r) => r.cardId === mentioned.id) : undefined;
  if (mentioned && other) {
    return `${other.name} is worth about ${formatInr(other.ongoingValue)} a year to you, against ${formatInr(top.ongoingValue)} for ${top.name}. Open "See the math" on both to compare category by category. (I couldn't reach my reasoning model just now, so this is the short version.)`;
  }
  if (mentioned) {
    const why = input.result.ineligible.find((c) => c.cardId === mentioned.id)?.reason ??
      (mentioned.verified ? "It isn't ranked for your answers." : "PERQ hasn't verified its terms on the bank's page yet.");
    return `${mentioned.name} isn't in your ranking: ${why} Your Top Pick, ${top.name}, is worth about ${formatInr(top.ongoingValue)} a year.`;
  }
  return `Your Top Pick is ${top.name}, worth about ${formatInr(top.ongoingValue)} a year to you. I couldn't reach my reasoning model just now; try your question again in a moment.`;
}

/** One chat turn (POST /api/ember/chat). */
export async function chatWithEmber(
  input: RecommenderRunInput & { message: string; history: ConversationTurn[] }
): Promise<EmberAnswer> {
  if (!input.callModel) return { text: chatFallback(input.message, input), source: "fallback_template", toolOutputs: [] };

  const toolOutputs: unknown[] = [];
  const run = await runEmber({
    userId: input.userId,
    task: "chat",
    systemPrompt: CHAT_SYSTEM_PROMPT,
    messages: [...input.history, { role: "user", content: input.message }],
    tools: createRecommenderTools(input),
    maxPermission: 1,
    callModel: input.callModel,
    model: EMBER_MODEL,
    logRun: input.logRun,
    fallback: () => chatFallback(input.message, input),
    onStep: (event) => {
      if (event.type === "tool") toolOutputs.push(event.output);
      for (const label of labelsForEvent(event)) {
        if (label !== "Writing your recommendation") void input.onLabel?.(label);
      }
    },
  });
  if (run.status !== "ok") return { text: run.text, source: "fallback_template", toolOutputs };
  if (ungroundedRupees(run.text, toolOutputs).length > 0) {
    return { text: chatFallback(input.message, input), source: "fallback_template", toolOutputs };
  }
  return { text: run.text, source: "gemini", toolOutputs };
}
