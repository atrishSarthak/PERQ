import {
  activityResponseSchema,
  budgetResponseSchema,
  goalsResponseSchema,
  type BudgetPut,
  cardAccountDetailSchema,
  cardAccountsResponseSchema,
  stateResponseSchema,
  statementsResponseSchema,
  transactionsResponseSchema,
  type CardAccountPatch,
  type TxnCategory,
  confirmStatementResponseSchema,
  consentsResponseSchema,
  NOTICE_VERSIONS,
  nudgesResponseSchema,
  nudgeWhySchema,
  upcomingNudgesSchema,
  type ConfirmStatementRequest,
  type EmberEvent,
} from "@perq/shared";
import { z } from "zod";
import { http, streamEmber } from "./api";

// Money Manager API calls (handoff §11). Every response is zod-parsed.
export const moneyApi = {
  consents: () => http.request("/api/consents", { schema: consentsResponseSchema }),
  giveConsent: (source: "statements" | "notifications", granted: boolean) =>
    http.request("/api/consents", {
      method: "POST",
      body: { source, granted, noticeVersion: NOTICE_VERSIONS[source] },
      schema: z.object({ ok: z.boolean() }),
    }),
  confirmStatement: (body: ConfirmStatementRequest) =>
    http.request("/api/statements/confirm", { method: "POST", body, schema: confirmStatementResponseSchema }),
  nudges: () => http.request("/api/nudges", { schema: nudgesResponseSchema }),
  markNudge: (id: string, status: "opened" | "acted" | "dismissed" | "remind") =>
    http.request(`/api/nudges/${encodeURIComponent(id)}`, { method: "PATCH", body: { status }, schema: z.object({ ok: z.boolean() }) }),
  nudgeWhy: (id: string) => http.request(`/api/nudges/${encodeURIComponent(id)}/why`, { schema: nudgeWhySchema }),
  upcomingNudges: () => http.request("/api/nudges/upcoming", { schema: upcomingNudgesSchema }),
  state: () => http.request("/api/state", { schema: stateResponseSchema }),
  cardAccounts: () => http.request("/api/card-accounts", { schema: cardAccountsResponseSchema }),
  cardAccount: (id: string) => http.request(`/api/card-accounts/${encodeURIComponent(id)}`, { schema: cardAccountDetailSchema }),
  patchCardAccount: (id: string, body: CardAccountPatch) =>
    http.request(`/api/card-accounts/${encodeURIComponent(id)}`, { method: "PATCH", body, schema: z.object({ ok: z.boolean() }) }),
  transactions: (f: { cardAccountId?: string; category?: string; from?: string; to?: string; q?: string; limit?: number }) => {
    const qs = Object.entries(f)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
    return http.request(`/api/transactions${qs ? `?${qs}` : ""}`, { schema: transactionsResponseSchema });
  },
  recategorise: (id: string, category: TxnCategory, rememberForMerchant = true) =>
    http.request(`/api/transactions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { category, rememberForMerchant },
      schema: z.object({ ok: z.boolean(), updated: z.number() }),
    }),
  statements: (cardAccountId?: string) =>
    http.request(`/api/statements${cardAccountId ? `?cardAccountId=${encodeURIComponent(cardAccountId)}` : ""}`, { schema: statementsResponseSchema }),
  deleteStatement: (id: string) => http.request(`/api/statements/${encodeURIComponent(id)}`, { method: "DELETE", schema: z.object({ deleted: z.boolean() }) }),
  budget: () => http.request("/api/budgets", { schema: budgetResponseSchema }),
  saveBudget: (body: BudgetPut) => http.request("/api/budgets", { method: "PUT", body, schema: z.object({ ok: z.boolean() }) }),
  goals: () => http.request("/api/goals", { schema: goalsResponseSchema }),
  createGoal: (body: { name: string; targetAmount: number; targetDate?: string | null; savedAmount?: number }) =>
    http.request("/api/goals", { method: "POST", body, schema: z.object({ ok: z.boolean(), id: z.string() }) }),
  patchGoal: (id: string, body: { savedAmount?: number; status?: "active" | "done" | "archived"; name?: string; targetAmount?: number; targetDate?: string | null }) =>
    http.request(`/api/goals/${encodeURIComponent(id)}`, { method: "PATCH", body, schema: z.object({ ok: z.boolean() }) }),
  activity: () => http.request("/api/activity", { schema: activityResponseSchema }),
  deleteFinancialData: () => http.request("/api/me/financial-data", { method: "DELETE", schema: z.object({ deleted: z.boolean() }) }),
  deleteAccount: () => http.request("/api/me", { method: "DELETE", schema: z.object({ deleted: z.boolean() }) }),
  demoLoad: () =>
    http.request("/api/demo/load", { method: "POST", schema: z.object({ transactions: z.number(), nudgesSent: z.number(), now: z.string() }) }),
  demoReset: () => http.request("/api/demo/reset", { method: "POST", schema: z.object({ reset: z.boolean() }) }),
  demoClock: () => http.request("/api/demo/clock", { schema: z.object({ isDemo: z.boolean(), now: z.string() }) }),
  demoTravel: (body: { days: number } | { date: string } | { reset: true }) =>
    http.request("/api/demo/clock", { method: "POST", body, schema: z.object({ now: z.string(), nudgesSent: z.number(), quietHours: z.boolean() }) }),
  markPaid: (cardAccountId: string) =>
    http.request(`/api/card-accounts/${encodeURIComponent(cardAccountId)}`, { method: "PATCH", body: { markPaid: true }, schema: z.object({ ok: z.boolean() }) }),
  deleteCardAccount: (cardAccountId: string) =>
    http.request(`/api/card-accounts/${encodeURIComponent(cardAccountId)}`, { method: "DELETE", schema: z.object({ deleted: z.boolean() }) }),
  registerPush: (token: string, platform: "ios" | "android") =>
    http.request("/api/push/register", { method: "POST", body: { token, platform }, schema: z.object({ ok: z.boolean() }) }),
  /** Streams narration then a draft (or an error with a code). */
  parseStatement: (fileBase64: string, password: string | undefined, onEvent: (e: EmberEvent) => void, signal?: AbortSignal) =>
    streamEmber("/api/statements/parse", { fileBase64, password }, onEvent, signal),
};
