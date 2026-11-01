import { categoriseOne, merchantsNeedingAi, type Categorised, type TxnCategory } from "@perq/finance-engine";
import { TXN_CATEGORIES, type ExtractedTransaction } from "@perq/shared";
import type { StatementLlm } from "./extract";

// Categorising a statement's lines (handoff §5.5) with the IO injected:
// shared cache reads/writes and the user's overrides come from the server.
// Gemini only ever sees merchant NAMES (no amounts, dates or user data).

const AI_BATCH = 40;

const AI_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: { merchant: { type: "string" }, category: { type: "string" } },
        required: ["merchant", "category"],
      },
    },
  },
  required: ["results"],
};

export function aiCategoryPrompt(merchants: string[]): string {
  return [
    "Assign each Indian card-statement merchant name to exactly one category.",
    `Categories: ${TXN_CATEGORIES.join(", ")}.`,
    'Use "other" when unsure. Return every merchant exactly as given.',
    "Merchants:",
    ...merchants.map((m) => `- ${m}`),
  ].join("\n");
}

export async function categoriseMerchantsWithAi(merchants: string[], llm: StatementLlm): Promise<Map<string, TxnCategory>> {
  const out = new Map<string, TxnCategory>();
  const allowed = new Set<string>(TXN_CATEGORIES);
  for (let i = 0; i < merchants.length; i += AI_BATCH) {
    const batch = merchants.slice(i, i + AI_BATCH);
    const raw = (await llm(aiCategoryPrompt(batch), AI_SCHEMA)) as { results?: { merchant?: string; category?: string }[] };
    for (const r of raw?.results ?? []) {
      if (r.merchant && batch.includes(r.merchant) && r.category && allowed.has(r.category)) {
        out.set(r.merchant, r.category as TxnCategory);
      }
    }
  }
  return out;
}

export interface CategoriseIo {
  sharedCacheFor: (merchants: string[]) => Promise<Map<string, TxnCategory>>;
  userOverrides: () => Promise<Map<string, TxnCategory>>;
  /** Persist AI answers to the shared cache. Never called with user overrides. */
  saveSharedCache: (entries: Map<string, TxnCategory>) => Promise<void>;
  llm?: StatementLlm | null;
}

export async function categoriseTransactions(
  txns: ExtractedTransaction[],
  io: CategoriseIo
): Promise<(ExtractedTransaction & Categorised)[]> {
  const inputs = txns.map((t) => ({ description: t.description, direction: t.direction }));
  const userOverrides = await io.userOverrides();
  const firstPass = inputs.map((t) => categoriseOne(t, { userOverrides }));
  const sharedCache = await io.sharedCacheFor([...new Set(firstPass.map((c) => c.merchantNormalized))]);

  let aiResults = new Map<string, TxnCategory>();
  const unknown = merchantsNeedingAi(inputs, { userOverrides, sharedCache });
  if (unknown.length && io.llm) {
    try {
      aiResults = await categoriseMerchantsWithAi(unknown, io.llm);
      if (aiResults.size) await io.saveSharedCache(aiResults);
    } catch {
      // AI is optional: unknown merchants fall back to "other".
    }
  }
  return txns.map((t, i) => ({ ...t, ...categoriseOne(inputs[i]!, { userOverrides, sharedCache, aiResults }) }));
}
