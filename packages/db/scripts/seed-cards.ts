import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });

import { and, eq, inArray, notInArray } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { catalogFileSchema } from "@perq/shared";
import * as schema from "../src/schema";
import { catalogCardToRow, rowToCatalogCard } from "../src/catalog";
import { sameCatalogCard } from "./cardDiff";

/**
 * Loads the curated card catalogue (handoff §1.2) into `cards`.
 *
 *   pnpm db:seed-cards [path/to/cards.json]   (defaults to data/cards.json)
 *
 * - Upserts by the card's stable slug id, so arsenal and recommendation rows
 *   keep pointing at the same card across re-seeds.
 * - Only writes rows whose content actually changed (D10: a no-op re-seed
 *   must not invalidate every cached explanation).
 * - source_updated_at is the date the terms were checked on the bank's page.
 * - 2C: any active card not in the file is marked 'discontinued', never
 *   deleted. That includes the retired D15 web-search rows: ranking now uses
 *   only this curated, source-linked catalogue.
 */
async function main() {
  const filePath = process.argv[2] ?? resolve(__dirname, "../data/cards.json");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

  const parsed = catalogFileSchema.safeParse(JSON.parse(readFileSync(resolve(process.cwd(), filePath), "utf-8")));
  if (!parsed.success) {
    console.error("Invalid card file:", parsed.error.issues.slice(0, 10));
    process.exit(1);
  }
  const cards = parsed.data;
  const ids = cards.map((c) => c.id);

  const db = drizzle(neon(process.env.DATABASE_URL), { schema });
  const existing = await db.select().from(schema.cards).where(inArray(schema.cards.id, ids));
  const existingById = new Map(existing.map((r) => [r.id, r]));

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  for (const card of cards) {
    const row = catalogCardToRow(card, new Date(`${card.sourceUpdatedAt}T00:00:00.000Z`));
    const current = existingById.get(card.id);
    if (!current) {
      await db.insert(schema.cards).values(row);
      inserted++;
    } else if (current.status === "active" && sameCatalogCard(rowToCatalogCard(current), card)) {
      unchanged++;
    } else {
      await db.update(schema.cards).set(row).where(eq(schema.cards.id, card.id));
      updated++;
    }
  }

  const discontinued = await db
    .update(schema.cards)
    .set({ status: "discontinued" })
    .where(and(eq(schema.cards.status, "active"), notInArray(schema.cards.id, ids)))
    .returning({ id: schema.cards.id });

  const verified = cards.filter((c) => c.verified).length;
  console.log(
    `Seed complete: ${inserted} inserted, ${updated} updated, ${unchanged} unchanged, ` +
      `${discontinued.length} discontinued. ${verified}/${cards.length} verified (ranked).`
  );
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
