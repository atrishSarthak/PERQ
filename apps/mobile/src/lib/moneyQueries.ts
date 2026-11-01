import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { moneyApi } from "./moneyApi";

// React Query hooks for the Money Manager. Any money write invalidates the
// state-derived queries together so every screen agrees.
export const MONEY_KEYS = ["state", "card-accounts", "card-account", "transactions", "statements", "nudges", "activity"] as const;

export function useInvalidateMoney() {
  const qc = useQueryClient();
  return () => Promise.all(MONEY_KEYS.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

export const useMoneyState = () => useQuery({ queryKey: ["state"], queryFn: async () => (await moneyApi.state()).state });
export const useNudges = () => useQuery({ queryKey: ["nudges"], queryFn: moneyApi.nudges });
export const useCardAccount = (id: string) => useQuery({ queryKey: ["card-account", id], queryFn: () => moneyApi.cardAccount(id) });
export const useTransactions = (f: Parameters<typeof moneyApi.transactions>[0]) =>
  useQuery({ queryKey: ["transactions", f], queryFn: () => moneyApi.transactions(f) });

export function useMarkPaid() {
  const invalidate = useInvalidateMoney();
  return useMutation({ mutationFn: (cardAccountId: string) => moneyApi.markPaid(cardAccountId), onSuccess: invalidate });
}

/** Saves an Ember proposal (level 3) once the user taps Confirm. */
export function useConfirmProposal() {
  const invalidate = useInvalidateMoney();
  const qc = useQueryClient();
  return async (p: { kind: "budget"; total: number | null; categories: Record<string, number> } | { kind: "goal"; name: string; target: number; date: string | null }) => {
    if (p.kind === "budget") await moneyApi.saveBudget({ month: null, totalLimit: p.total, categoryLimits: p.categories as never });
    else await moneyApi.createGoal({ name: p.name, targetAmount: p.target, targetDate: p.date });
    await invalidate();
    await qc.invalidateQueries({ queryKey: ["budget"] });
    await qc.invalidateQueries({ queryKey: ["goals"] });
  };
}
