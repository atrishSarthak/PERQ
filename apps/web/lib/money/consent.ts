import { and, desc, eq } from "drizzle-orm";
import { consents, db } from "@perq/db";
import type { ConsentSource } from "@perq/shared";

/** The latest consent row per source decides (consents is append-only). */
export async function hasConsent(userId: string, source: ConsentSource): Promise<boolean> {
  const [row] = await db
    .select({ granted: consents.granted })
    .from(consents)
    .where(and(eq(consents.userId, userId), eq(consents.source, source)))
    .orderBy(desc(consents.createdAt))
    .limit(1);
  return row?.granted ?? false;
}

export async function recordConsent(userId: string, source: ConsentSource, granted: boolean, noticeVersion: string) {
  await db.insert(consents).values({ userId, source, granted, noticeVersion });
}
