import { NextResponse } from "next/server";
import { and, count, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { db, transactions } from "@perq/db";
import { txnCategorySchema } from "@perq/shared";
import { isAuthed, requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX = 200;

/** GET /api/transactions?cardAccountId=&category=&from=&to=&q=&limit=: newest first. */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const q = new URL(req.url).searchParams;
  const category = q.get("category") ? txnCategorySchema.safeParse(q.get("category")) : null;
  if (category && !category.success) return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  const date = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(q.get(k) ?? "") ? q.get(k)! : null);
  const search = (q.get("q") ?? "").trim().slice(0, 40).replace(/[%_\\]/g, "");
  const where = and(
    eq(transactions.userId, auth.id),
    q.get("cardAccountId") ? eq(transactions.cardAccountId, q.get("cardAccountId")!) : undefined,
    category?.success ? eq(transactions.category, category.data) : undefined,
    date("from") ? gte(transactions.txnDate, date("from")!) : undefined,
    date("to") ? lte(transactions.txnDate, date("to")!) : undefined,
    search ? or(ilike(transactions.merchantNormalized, `%${search}%`), ilike(transactions.descriptionRaw, `%${search}%`)) : undefined
  );
  const limit = Math.min(MAX, Math.max(1, Number(q.get("limit")) || 100));
  const [rows, [total]] = await Promise.all([
    db.select().from(transactions).where(where).orderBy(desc(transactions.txnDate), desc(transactions.amount)).limit(limit),
    db.select({ n: count() }).from(transactions).where(where),
  ]);
  return NextResponse.json({
    total: total?.n ?? 0,
    transactions: rows.map((t) => ({
      id: t.id,
      cardAccountId: t.cardAccountId,
      statementId: t.statementId,
      date: t.txnDate,
      description: t.descriptionRaw,
      merchant: t.merchantNormalized,
      amount: t.amount,
      direction: t.direction,
      kind: t.kind,
      category: t.category,
      categorySource: t.categorySource,
      isInternational: t.isInternational,
    })),
  });
}
