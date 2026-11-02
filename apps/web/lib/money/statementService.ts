import { and, eq, inArray } from "drizzle-orm";
import { claimHeldCardAccount } from "./heldCards";
import {
  cardAccounts,
  db,
  merchantCategories,
  statements,
  transactions,
  userMerchantOverrides,
} from "@perq/db";
import { reconcile, type TxnCategory } from "@perq/finance-engine";
import {
  categoriseTransactions,
  dayOf,
  feeAnniversaryMonth,
  matchCard,
  parseStatementPdf,
  PARSER_VERSION,
  StatementPdfError,
} from "@perq/statements";
import type { ConfirmStatementRequest, StatementParseError } from "@perq/shared";
import { loadCatalogue } from "@/lib/recommender/catalog";
import { setHeld } from "@/lib/recommender/service";
import { refreshSyncedSpend } from "@/lib/recommender/spendSync";
import { invalidateState, logActivity } from "./activity";
import { signDraft, verifyDraft, type DraftPayload } from "./parseToken";
import { statementLlm } from "./llm";
import { clearWrongPasswords, isPasswordLocked, recordWrongPassword } from "./passwordAttempts";

// Statement ingestion (handoff §5). The PDF bytes and the password exist
// only as arguments of parseForUser for the length of one request. They are
// never written, cached, logged, or put in the draft token.

export class StatementError extends Error {
  constructor(readonly code: StatementParseError, message: string) {
    super(message);
  }
}

const FRIENDLY: Record<StatementParseError, string> = {
  bad_password: "That password didn't open the statement. Check your statement email for the password format.",
  password_required: "This statement is password-protected. Enter its password.",
  image_only: "This looks like a scanned image, so there's no text to read. Download the statement as a PDF from your bank's site or email instead.",
  not_pdf: "That file isn't a PDF.",
  too_large: "That file is over 3 MB. Statements are usually much smaller; try downloading it again.",
  rate_limited: "Too many wrong passwords. Wait 10 minutes and try again.",
  consent_required: "Please agree to how PERQ reads statements first.",
  extraction_failed: "Ember couldn't read this statement's layout. Try again, or send us the bank's name so we can add it.",
};
export const friendly = (code: StatementParseError) => FRIENDLY[code];

async function sharedCacheFor(merchants: string[]) {
  if (!merchants.length) return new Map<string, TxnCategory>();
  const rows = await db.select().from(merchantCategories).where(inArray(merchantCategories.merchantNormalized, merchants));
  return new Map(rows.map((r) => [r.merchantNormalized, r.category as TxnCategory]));
}

async function userOverridesFor(userId: string) {
  const rows = await db.select().from(userMerchantOverrides).where(eq(userMerchantOverrides.userId, userId));
  return new Map(rows.map((r) => [r.merchantNormalized, r.category as TxnCategory]));
}

async function saveSharedCache(entries: Map<string, TxnCategory>) {
  for (const [merchant, category] of entries) {
    await db
      .insert(merchantCategories)
      .values({ merchantNormalized: merchant, category, source: "ai" })
      .onConflictDoNothing();
  }
}

/** Parse → reconcile → categorise → match. Returns a draft; saves nothing. */
export async function parseForUser(
  userId: string,
  pdf: Uint8Array,
  password: string | undefined,
  onStep: (label: string) => void
): Promise<{ draft: DraftPayload; parseToken: string }> {
  if (isPasswordLocked(userId)) throw new StatementError("rate_limited", FRIENDLY.rate_limited);
  const llm = statementLlm();

  let parsed;
  try {
    parsed = await parseStatementPdf(pdf, password, { llm, onStep });
  } catch (err) {
    if (err instanceof StatementPdfError) {
      if (err.code === "bad_password") recordWrongPassword(userId);
      throw new StatementError(err.code, FRIENDLY[err.code]);
    }
    throw new StatementError("extraction_failed", FRIENDLY.extraction_failed);
  }
  clearWrongPasswords(userId);
  onStep(parsed.reconcile.reconciled ? "Checked that the totals add up" : "The totals don't add up yet, so please check them");

  const lines = await categoriseTransactions(parsed.extracted.transactions, {
    sharedCacheFor,
    userOverrides: () => userOverridesFor(userId),
    saveSharedCache,
    llm,
  });
  onStep("Sorted spends into categories");

  const [catalogue, accounts] = await Promise.all([
    loadCatalogue(),
    db.select().from(cardAccounts).where(eq(cardAccounts.userId, userId)),
  ]);
  const e = parsed.extracted;
  const match = matchCard({ issuer: e.issuer, cardName: e.cardName, last4: e.last4 }, catalogue, accounts);
  const matchedName = match.catalogueCardId ? catalogue.find((c) => c.id === match.catalogueCardId)?.name ?? null : null;
  const account = match.accountId ? accounts.find((a) => a.id === match.accountId) : undefined;
  onStep(matchedName ? `Matched to your ${matchedName}` : "Found the card. Please confirm which one it is");

  const { transactions: _t, ...summary } = e;
  const draft: DraftPayload = {
    model: parsed.model,
    summary,
    transactions: lines.map((l) => ({
      date: l.date,
      description: l.descriptionRaw,
      amount: l.amount,
      direction: l.direction,
      kind: l.kind,
      category: l.category,
      categorySource: l.categorySource,
      merchant: l.merchantNormalized,
      isInternational: l.isInternational,
    })),
    reconcile: {
      reconciled: parsed.reconcile.reconciled,
      summaryOk: parsed.reconcile.summary.ok,
      linesOk: parsed.reconcile.lines.ok,
      diff: parsed.reconcile.summary.diff,
      issues: parsed.reconcile.issues,
    },
    match: {
      accountId: match.accountId,
      accountLabel: account?.cardLabel ?? null,
      catalogueCardId: match.catalogueCardId,
      catalogueCardName: matchedName,
      confidence: match.confidence,
      candidates: match.candidates.map(({ id, name, issuer }) => ({ id, name, issuer })),
    },
  };
  return { draft, parseToken: await signDraft(userId, draft) };
}

const toInt = (n: number | null | undefined) => (n === null || n === undefined ? null : Math.round(n));

/** Save a reviewed draft (with the user's edits). Re-upload of the same statement replaces it. */
export async function confirmForUser(userId: string, req: ConfirmStatementRequest) {
  const draft = await verifyDraft(userId, req.parseToken);
  if (!draft) throw new StatementError("extraction_failed", "This review expired. Upload the statement again.");
  const ed = req.edits;
  const s = { ...draft.summary, ...stripUndefined(ed) };
  if (!s.statementDate) throw new StatementError("extraction_failed", "Add the statement date to save it.");

  // The user may correct summary figures; reconciliation is re-run on what's saved.
  const rec = reconcile({ ...s, transactions: draft.transactions });

  const issuer = s.issuer ?? "Unknown issuer";
  const last4 = s.last4 ?? "0000";
  const catalogueCardId = ed.catalogueCardId !== undefined ? ed.catalogueCardId : draft.match.catalogueCardId;
  const catalogue = await loadCatalogue();
  const catalogueName = catalogueCardId ? catalogue.find((c) => c.id === catalogueCardId)?.name : null;
  const label = ed.cardLabel ?? catalogueName ?? s.cardName ?? `${issuer} card`;

  const accountValues = {
    userId,
    issuer,
    last4,
    cardId: catalogueCardId ?? null,
    cardLabel: label,
    statementDay: dayOf(s.statementDate),
    dueDay: dayOf(s.dueDate ?? null),
    creditLimit: toInt(s.creditLimit),
    ...(feeAnniversaryMonth(draft.transactions) ? { feeAnniversaryMonth: feeAnniversaryMonth(draft.transactions) } : {}),
  };
  await claimHeldCardAccount(userId, catalogueCardId ?? null, issuer, last4);
  const [account] = await db
    .insert(cardAccounts)
    .values(accountValues)
    .onConflictDoUpdate({
      target: [cardAccounts.userId, cardAccounts.issuer, cardAccounts.last4],
      set: { ...accountValues, isActive: true },
    })
    .returning({ id: cardAccounts.id });
  const cardAccountId = account!.id;

  // Re-upload replaces (unique card_account_id + statement_date); transactions cascade.
  const existing = await db
    .delete(statements)
    .where(and(eq(statements.cardAccountId, cardAccountId), eq(statements.statementDate, s.statementDate)))
    .returning({ id: statements.id });

  const [saved] = await db
    .insert(statements)
    .values({
      userId,
      cardAccountId,
      statementDate: s.statementDate,
      periodStart: s.periodStart ?? null,
      periodEnd: s.periodEnd ?? null,
      dueDate: s.dueDate ?? null,
      totalDue: toInt(s.totalDue),
      minimumDue: toInt(s.minimumDue),
      previousBalance: toInt(s.previousBalance),
      paymentsCredits: toInt(s.paymentsCredits),
      purchasesDebits: toInt(s.purchasesDebits),
      feesCharges: toInt(s.feesCharges),
      financeCharges: toInt(s.financeCharges),
      creditLimit: toInt(s.creditLimit),
      availableLimit: toInt(s.availableLimit),
      pointsOpening: toInt(s.points?.opening),
      pointsEarned: toInt(s.points?.earned),
      pointsRedeemed: toInt(s.points?.redeemed),
      pointsClosing: toInt(s.points?.closing),
      pointsExpiring: toInt(s.points?.expiring),
      pointsExpiryDate: s.points?.expiryDate ?? null,
      reconciled: rec.reconciled,
      reconcileDiff: rec.summary.diff === null ? null : Math.round(rec.summary.diff),
      parserVersion: PARSER_VERSION,
      model: draft.model,
    })
    .returning({ id: statements.id });
  const statementId = saved!.id;

  if (draft.transactions.length) {
    await db.insert(transactions).values(
      draft.transactions.map((t) => ({
        userId,
        statementId,
        cardAccountId,
        txnDate: t.date,
        descriptionRaw: t.description,
        merchantNormalized: t.merchant,
        amount: Math.max(1, Math.round(t.amount)),
        direction: t.direction,
        kind: t.kind,
        category: t.category,
        categorySource: t.categorySource,
        isInternational: t.isInternational,
      }))
    );
  }

  if (catalogueCardId) await setHeld(userId, catalogueCardId, true);
  await refreshSyncedSpend(userId);
  await invalidateState(userId);
  await logActivity(
    userId,
    "statement_parsed",
    `Read your ${label} statement (${draft.transactions.length} transactions)${rec.reconciled ? "" : ", totals not yet matching"}`,
    { table: "statements", id: statementId }
  );
  return { statementId, cardAccountId, reconciled: rec.reconciled, transactionCount: draft.transactions.length, replaced: existing.length > 0 };
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
