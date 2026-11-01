import { z } from "zod";
import { categorySourceSchema, txnCategorySchema, txnKindSchema } from "./money";

// Statement upload API (handoff §5.1, §11). The PDF travels as base64 in a
// JSON body: Vercel caps request bodies at ~4.5 MB, so the PDF limit is 3 MB
// (base64 adds a third). Nothing here is ever stored except via confirm.

export const MAX_STATEMENT_BYTES = 3 * 1024 * 1024;

export const parseStatementRequestSchema = z.object({
  fileBase64: z.string().min(100).max(Math.ceil((MAX_STATEMENT_BYTES * 4) / 3) + 16),
  password: z.string().max(64).optional(),
});

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rupees = z.number().nonnegative();

export const draftSummarySchema = z.object({
  issuer: z.string().nullable(),
  cardName: z.string().nullable(),
  last4: z.string().nullable(),
  statementDate: iso.nullable(),
  periodStart: iso.nullable(),
  periodEnd: iso.nullable(),
  dueDate: iso.nullable(),
  totalDue: rupees.nullable(),
  minimumDue: rupees.nullable(),
  previousBalance: rupees.nullable(),
  paymentsCredits: rupees.nullable(),
  purchasesDebits: rupees.nullable(),
  feesCharges: rupees.nullable(),
  financeCharges: rupees.nullable(),
  creditLimit: rupees.nullable(),
  availableLimit: rupees.nullable(),
  points: z
    .object({
      opening: z.number().nullable(),
      earned: z.number().nullable(),
      redeemed: z.number().nullable(),
      closing: z.number().nullable(),
      expiring: z.number().nullable(),
      expiryDate: iso.nullable(),
    })
    .nullable(),
});
export type DraftSummary = z.infer<typeof draftSummarySchema>;

export const draftTransactionSchema = z.object({
  date: iso,
  description: z.string(), // card numbers already stripped
  amount: rupees,
  direction: z.enum(["debit", "credit"]),
  kind: txnKindSchema,
  category: txnCategorySchema,
  categorySource: categorySourceSchema,
  merchant: z.string(), // normalised merchant name
  isInternational: z.boolean(),
});

export const statementDraftSchema = z.object({
  parseToken: z.string(),
  model: z.enum(["heuristic", "gemini"]),
  summary: draftSummarySchema,
  transactions: z.array(draftTransactionSchema),
  reconcile: z.object({
    reconciled: z.boolean(),
    summaryOk: z.boolean(),
    linesOk: z.boolean(),
    diff: z.number().nullable(),
    issues: z.array(z.string()),
  }),
  match: z.object({
    accountId: z.string().nullable(),
    accountLabel: z.string().nullable(),
    catalogueCardId: z.string().nullable(),
    catalogueCardName: z.string().nullable(),
    confidence: z.number(),
    candidates: z.array(z.object({ id: z.string(), name: z.string(), issuer: z.string() })),
  }),
});
export type StatementDraft = z.infer<typeof statementDraftSchema>;

export const confirmStatementRequestSchema = z.object({
  parseToken: z.string(),
  edits: z
    .object({
      /** null = "My card isn't listed" (keeps card_id null). */
      catalogueCardId: z.string().nullable().optional(),
      cardLabel: z.string().min(1).max(60).optional(),
      statementDate: iso.optional(),
      dueDate: iso.optional(),
      totalDue: rupees.optional(),
      minimumDue: rupees.optional(),
      previousBalance: rupees.optional(),
      paymentsCredits: rupees.optional(),
      purchasesDebits: rupees.optional(),
      feesCharges: rupees.optional(),
      financeCharges: rupees.optional(),
      creditLimit: rupees.optional(),
    })
    .default({}),
});
export type ConfirmStatementRequest = z.infer<typeof confirmStatementRequestSchema>;

export const confirmStatementResponseSchema = z.object({
  statementId: z.string(),
  cardAccountId: z.string(),
  reconciled: z.boolean(),
  transactionCount: z.number().int(),
  replaced: z.boolean(),
});

export const consentRequestSchema = z.object({
  source: z.enum(["statements", "notifications"]),
  granted: z.boolean(),
  noticeVersion: z.string().min(1),
});
export const consentsResponseSchema = z.object({
  consents: z.array(z.object({ source: z.string(), granted: z.boolean(), noticeVersion: z.string(), createdAt: z.string() })),
  current: z.object({ statements: z.boolean(), notifications: z.boolean() }),
});

/** Current privacy notice versions (bump when the wording changes). */
export const NOTICE_VERSIONS = { statements: "2026-11-01", notifications: "2026-11-01" } as const;
