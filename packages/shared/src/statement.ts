import { z } from "zod";

// One schema for every bank (handoff §5.3): what extraction returns from a
// statement's text. Numbers are copied as printed (₹, may have paise);
// amounts are positive with direction separate; null when not printed.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date YYYY-MM-DD");
const money = z.number().nonnegative();

export const extractedTransactionSchema = z.object({
  date: isoDate,
  description: z.string().min(1),
  amount: money,
  direction: z.enum(["debit", "credit"]),
});
export type ExtractedTransaction = z.infer<typeof extractedTransactionSchema>;

export const extractedPointsSchema = z.object({
  opening: z.number().nullable(),
  earned: z.number().nullable(),
  redeemed: z.number().nullable(),
  closing: z.number().nullable(),
  expiring: z.number().nullable(),
  expiryDate: isoDate.nullable(),
});

export const extractedStatementSchema = z.object({
  issuer: z.string().nullable(),
  cardName: z.string().nullable(), // as printed
  last4: z.string().regex(/^\d{4}$/).nullable(),
  statementDate: isoDate.nullable(),
  periodStart: isoDate.nullable(),
  periodEnd: isoDate.nullable(),
  dueDate: isoDate.nullable(),
  totalDue: money.nullable(),
  minimumDue: money.nullable(),
  previousBalance: money.nullable(),
  paymentsCredits: money.nullable(),
  purchasesDebits: money.nullable(),
  feesCharges: money.nullable(),
  financeCharges: money.nullable(),
  creditLimit: money.nullable(),
  availableLimit: money.nullable(),
  points: extractedPointsSchema.nullable(),
  transactions: z.array(extractedTransactionSchema),
});
export type ExtractedStatement = z.infer<typeof extractedStatementSchema>;

/** Statement-parse failures the app handles specifically (§5.2). */
export const statementParseErrorSchema = z.enum([
  "bad_password",
  "password_required",
  "image_only",
  "not_pdf",
  "too_large",
  "rate_limited",
  "consent_required",
  "extraction_failed",
]);
export type StatementParseError = z.infer<typeof statementParseErrorSchema>;
