import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });

import { and, eq, inArray, notInArray } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/schema";
import { cardSourceFileSchema } from "./cardSourceSchema";
import { fieldsEqual } from "./cardDiff";

/**
 * PRD §7: upserts structured source data into the cards table. No admin
 * UI — updating a card's terms means editing the source JSON and
 * re-running this script.
 *
 *   pnpm db:seed-cards path/to/cards.json
 *
 * 2C: a card missing from the source file is marked 'discontinued', never
 * hard-deleted — preserves arsenal/recommendation history instead of
 * breaking on a dangling reference.
 *
 * D10: source_updated_at only bumps for cards whose fields actually
 * changed (diffed against the current row via fieldsEqual, cardDiff.ts) —
 * re-running the same source file with no real changes must NOT
 * invalidate every user's explanation cache for nothing.
 */

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: pnpm db:seed-cards path/to/cards.json");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const raw = JSON.parse(readFileSync(resolve(process.cwd(), filePath), "utf-8"));
  const parsed = cardSourceFileSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("Invalid source file:", parsed.error.issues);
    process.exit(1);
  }
  const sourceCards = parsed.data;
  const sourceIds = sourceCards.map((c) => c.id);

  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql, { schema });

  const existingRows = await db
    .select()
    .from(schema.cards)
    .where(inArray(schema.cards.id, sourceIds));
  const existingById = new Map(existingRows.map((r) => [r.id, r]));

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const card of sourceCards) {
    const existing = existingById.get(card.id);
    const now = new Date();

    if (!existing) {
      await db.insert(schema.cards).values({
        id: card.id,
        name: card.name,
        issuer: card.issuer,
        network: card.network,
        tier: card.tier ?? null,
        joiningFee: card.joiningFee.toString(),
        annualFee: card.annualFee.toString(),
        feeWaiverCondition: card.feeWaiverCondition ?? null,
        rewardRates: card.rewardRates,
        milestoneBenefits: card.milestoneBenefits,
        welcomeBonus: card.welcomeBonus ?? null,
        loungeAccess: card.loungeAccess ?? null,
        forexMarkupPct: card.forexMarkupPct?.toString() ?? null,
        redemptionValue: card.redemptionValue?.toString() ?? null,
        minIncomeEligibility: card.minIncomeEligibility?.toString() ?? null,
        coBrandPartner: card.coBrandPartner ?? null,
        status: "active",
        sourceUpdatedAt: now,
      });
      inserted++;
      continue;
    }

    if (fieldsEqual(existing, card)) {
      unchanged++;
      continue;
    }

    await db
      .update(schema.cards)
      .set({
        name: card.name,
        issuer: card.issuer,
        network: card.network,
        tier: card.tier ?? null,
        joiningFee: card.joiningFee.toString(),
        annualFee: card.annualFee.toString(),
        feeWaiverCondition: card.feeWaiverCondition ?? null,
        rewardRates: card.rewardRates,
        milestoneBenefits: card.milestoneBenefits,
        welcomeBonus: card.welcomeBonus ?? null,
        loungeAccess: card.loungeAccess ?? null,
        forexMarkupPct: card.forexMarkupPct?.toString() ?? null,
        redemptionValue: card.redemptionValue?.toString() ?? null,
        minIncomeEligibility: card.minIncomeEligibility?.toString() ?? null,
        coBrandPartner: card.coBrandPartner ?? null,
        status: "active",
        sourceUpdatedAt: now,
      })
      .where(eq(schema.cards.id, card.id));
    updated++;
  }

  // 2C: soft-delete — active cards not present in this source file are
  // discontinued, never hard-deleted. Scoped to status='active' so this
  // is idempotent (never re-touches already-discontinued rows).
  const discontinuedResult = await db
    .update(schema.cards)
    .set({ status: "discontinued" })
    .where(
      and(
        eq(schema.cards.status, "active"),
        sourceIds.length > 0 ? notInArray(schema.cards.id, sourceIds) : undefined
      )
    )
    .returning({ id: schema.cards.id });

  console.log(
    `Seed complete: ${inserted} inserted, ${updated} updated, ${unchanged} unchanged, ${discontinuedResult.length} discontinued.`
  );
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
