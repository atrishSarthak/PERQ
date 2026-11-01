import { createHash } from "node:crypto";
import { and, desc, eq, ne } from "drizzle-orm";
import { db, recommendations, userCardArsenal, userProfile } from "@perq/db";
import { recommend } from "@perq/scoring-engine";
import {
  normalizeStoredAnswers,
  type QuizAnswersV2,
  type RecommendationResult,
  type ResultsResponse,
} from "@perq/shared";
import { catalogueVersion, loadCatalogue } from "./catalog";
import { getSpendSource, statementSpend } from "./spendSync";

// Server side of the recommender (handoff §1.3/§1.5). Shared by the API
// routes and Ember's tools so they can never disagree.

const MAX_STORED = 20; // recommendation rows kept per user (top of the ranking)

export interface StoredProfile {
  answers: QuizAnswersV2;
  needsConfirmation: string[];
}

export async function getProfile(userId: string): Promise<StoredProfile | null> {
  const [row] = await db
    .select({ answers: userProfile.answers })
    .from(userProfile)
    .where(eq(userProfile.userId, userId))
    .limit(1);
  if (!row) return null;
  const n = normalizeStoredAnswers(row.answers);
  return n.answers ? { answers: n.answers, needsConfirmation: n.needsConfirmation } : null;
}

export async function getHeldCardIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ cardId: userCardArsenal.cardId })
    .from(userCardArsenal)
    .where(and(eq(userCardArsenal.userId, userId), eq(userCardArsenal.status, "held")));
  return rows.map((r) => r.cardId).sort();
}

/**
 * Saves a full answer set. The arsenal table is the source of truth for
 * held cards; quiz Q1 and the held toggle are the same mutation (PRD §12),
 * so cardsHeld is written through to it here.
 */
export async function saveAnswers(userId: string, answers: QuizAnswersV2): Promise<void> {
  const catalogueIds = new Set((await loadCatalogue()).map((c) => c.id));
  const held = [...new Set(answers.cardsHeld)].filter((id) => catalogueIds.has(id));
  const clean: QuizAnswersV2 = { ...answers, cardsHeld: held };

  await db
    .insert(userProfile)
    .values({ userId, answers: clean })
    .onConflictDoUpdate({ target: userProfile.userId, set: { answers: clean, updatedAt: new Date() } });

  // Cards no longer listed become not_held; listed cards become held.
  await db
    .update(userCardArsenal)
    .set({ status: "not_held", updatedAt: new Date() })
    .where(
      and(
        eq(userCardArsenal.userId, userId),
        eq(userCardArsenal.status, "held"),
        held.length ? notInHeld(held) : undefined
      )
    );
  for (const cardId of held) await upsertArsenal(userId, cardId, true);
}

function notInHeld(held: string[]) {
  // drizzle has no "not in" helper that composes with `and` on empty arrays,
  // so build it from `ne` for the (small) held list.
  return and(...held.map((id) => ne(userCardArsenal.cardId, id)));
}

async function upsertArsenal(userId: string, cardId: string, held: boolean) {
  await db
    .insert(userCardArsenal)
    .values({ userId, cardId, status: held ? "held" : "not_held" })
    .onConflictDoUpdate({
      target: [userCardArsenal.userId, userCardArsenal.cardId],
      set: { status: held ? "held" : "not_held", updatedAt: new Date() },
    });
}

/** Held toggle from results or Profile; keeps answers.cardsHeld in step. */
export async function setHeld(userId: string, cardId: string, held: boolean): Promise<void> {
  await upsertArsenal(userId, cardId, held);
  const profile = await getProfile(userId);
  if (profile) {
    const set = new Set(profile.answers.cardsHeld);
    if (held) set.add(cardId);
    else set.delete(cardId);
    await db
      .update(userProfile)
      .set({ answers: { ...profile.answers, cardsHeld: [...set].sort() }, updatedAt: new Date() })
      .where(eq(userProfile.userId, userId));
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** sha256 of the answers + held cards, key-order independent (D6). */
export function profileHash(answers: QuizAnswersV2, heldIds: string[], realSpend?: unknown): string {
  return createHash("sha256")
    .update(stableStringify({ ...answers, cardsHeld: [...heldIds].sort(), ...(realSpend ? { realSpend } : {}) }))
    .digest("hex");
}

export interface ComputedResults {
  response: ResultsResponse;
  cardsVersion: string;
}

/**
 * Ranks the catalogue for the user's stored answers and current arsenal,
 * keeps the recommendations table in step, and returns the cached Ember
 * explanation when the Top Pick hasn't changed (handoff §1.3: a new
 * explanation only when the Top Pick changes).
 */
export async function computeResults(userId: string): Promise<ComputedResults | null> {
  const profile = await getProfile(userId);
  if (!profile) return null;
  const [catalogue, held, spendSource, available] = await Promise.all([loadCatalogue(), getHeldCardIds(userId), getSpendSource(userId), statementSpend(userId)]);
  const answers = { ...profile.answers, cardsHeld: held };
  const synced = spendSource.source === "statements" ? spendSource.synced : null;
  const result = recommend(answers, catalogue, {
    heldCardIds: held,
    ...(synced ? { spendOverride: { spend: synced.spend, statementCount: synced.statementCount, dataThrough: synced.dataThrough } } : {}),
  });
  // Real spend is part of the hash, so switching re-ranks and a new Top Pick gets a new explanation.
  const hash = profileHash(answers, held, synced?.spend);
  const cardsVersion = catalogueVersion(catalogue);

  const [stored] = await db
    .select({
      cardId: recommendations.cardId,
      explanation: recommendations.explanation,
      explanationSource: recommendations.explanationSource,
      profileHash: recommendations.profileHash,
    })
    .from(recommendations)
    .where(and(eq(recommendations.userId, userId), eq(recommendations.rank, 1)))
    .orderBy(desc(recommendations.createdAt))
    .limit(1);

  const top = result.ranked[0];
  const keepExplanation =
    !!stored && !!top && stored.cardId === top.cardId && stored.explanationSource !== "template";

  if (!stored || stored.profileHash !== hash) {
    await persistRanking(userId, answers, result, hash, cardsVersion, keepExplanation ? stored : null);
  }

  return {
    cardsVersion,
    response: {
      answers,
      spendSync: {
        source: synced ? "statements" : "quiz",
        available: available.statementCount > 0,
        statementCount: synced?.statementCount ?? available.statementCount,
        dataThrough: synced?.dataThrough ?? available.dataThrough,
      },
      needsConfirmation: profile.needsConfirmation,
      result,
      profileHash: hash,
      explanation:
        keepExplanation && stored
          ? { text: stored.explanation, source: "cached", topCardId: stored.cardId }
          : null,
    },
  };
}

/** D14: delete-and-replace the user's recommendation rows. */
async function persistRanking(
  userId: string,
  answers: QuizAnswersV2,
  result: RecommendationResult,
  hash: string,
  cardsVersion: string,
  carried: { explanation: string; explanationSource: string } | null
) {
  await db.delete(recommendations).where(eq(recommendations.userId, userId));
  const rows = result.ranked.slice(0, MAX_STORED).map((c) => ({
    userId,
    cardId: c.cardId,
    rank: c.rank,
    score: String(c.ongoingValue),
    explanation: c.rank === 1 && carried ? carried.explanation : c.reason,
    explanationSource: c.rank === 1 && carried ? carried.explanationSource : "template",
    profileSnapshot: answers,
    profileHash: hash,
    cardsVersion,
    cardSourceMode: "catalogue",
    year1Value: c.year1Value,
    ongoingValue: c.ongoingValue,
    breakdown: c.breakdown,
  }));
  if (rows.length) await db.insert(recommendations).values(rows);
}

/** Stores Ember's explanation for the current Top Pick. */
export async function saveExplanation(
  userId: string,
  topCardId: string,
  text: string,
  source: "gemini" | "fallback_template"
): Promise<void> {
  await db
    .update(recommendations)
    .set({ explanation: text, explanationSource: source })
    .where(and(eq(recommendations.userId, userId), eq(recommendations.cardId, topCardId), eq(recommendations.rank, 1)));
}

