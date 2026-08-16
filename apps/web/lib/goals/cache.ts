import { and, eq } from "drizzle-orm";
import { db, channelFetchCache } from "@perq/db";
import type { GoalCategory } from "@perq/scoring-engine";
import type { Channel } from "./channels";
import { ttlMsForCategory } from "./hash";
import { channelExtractionSchema, type ChannelExtractionResult } from "./extractionSchema";

export interface CacheHit {
  outcome: "succeeded" | "checked_empty";
  data: ChannelExtractionResult;
}

/**
 * Engineering Plan D3/D7: shared, cross-user read — a hit means a repeat
 * query against the same channel doesn't re-spend a Firecrawl credit or
 * Gemini call. Freshness checked in application code (same style as
 * Feature 1's D15 resolveCardSet, not a SQL WHERE clause) so the read stays
 * a single simple lookup by the unique (channel, query_key) index.
 *
 * A row failing zod re-validation here (e.g. a shape change since it was
 * cached) is treated as a miss, not a crash — self-healing, same spirit as
 * D5's "never partially nulled" discipline applied to cache reads too.
 */
export async function findFreshCacheEntry(
  channel: Channel,
  queryKey: string
): Promise<CacheHit | null> {
  const [row] = await db
    .select()
    .from(channelFetchCache)
    .where(
      and(eq(channelFetchCache.channel, channel), eq(channelFetchCache.queryKey, queryKey))
    )
    .limit(1);

  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;
  if (row.outcome !== "succeeded" && row.outcome !== "checked_empty") return null;

  const parsed = channelExtractionSchema.safeParse(row.extractedData);
  if (!parsed.success) return null;

  return { outcome: row.outcome, data: parsed.data };
}

/**
 * Engineering Plan D7: unique index on (channel, query_key) backs this
 * upsert — a losing racer's insert becomes a harmless update instead of a
 * duplicate row or a constraint error. Only ever called for a 'succeeded'
 * or 'checked_empty' outcome (D5) — a 'failed' fetch is never cached, since
 * there's nothing useful to reuse and caching a transient failure would
 * only make the next search wait out a TTL for no benefit.
 */
export async function upsertCacheEntry(
  channel: Channel,
  queryKey: string,
  category: GoalCategory,
  outcome: "succeeded" | "checked_empty",
  data: ChannelExtractionResult
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMsForCategory(category));

  await db
    .insert(channelFetchCache)
    .values({
      channel,
      queryKey,
      extractedData: data,
      outcome,
      fetchedAt: now,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [channelFetchCache.channel, channelFetchCache.queryKey],
      set: { extractedData: data, outcome, fetchedAt: now, expiresAt },
    });
}
