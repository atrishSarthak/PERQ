import { eq } from "drizzle-orm";
import { db, users } from "@perq/db";

// The clock is injectable (handoff §2). Real users always get the real time.
// Demo users can be "time travelled" from Diagnostics (§13.4): an offset is
// added to the real clock, so time keeps moving from the chosen moment.
export async function nowFor(userId: string): Promise<Date> {
  const [u] = await db.select({ isDemo: users.isDemo, offset: users.demoClockOffsetMs }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.isDemo && u.offset ? new Date(Date.now() + u.offset) : new Date();
}

/** Set a demo user's clock to `at` (no-op for real users). */
export async function setDemoClock(userId: string, at: Date | null): Promise<void> {
  await db
    .update(users)
    .set({ demoClockOffsetMs: at ? at.getTime() - Date.now() : null })
    .where(eq(users.id, userId));
}

export const demoEnabled = () => process.env.DEMO_ENABLED === "true";
