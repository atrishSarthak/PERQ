import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MONEY_KEYS } from "./moneyQueries";
import type { ProfilePatch, QuizAnswersV2, ResultsResponse } from "@perq/shared";
import { api, ApiError } from "./api";

export const RESULTS_KEY = ["results"] as const;

/** Ranked results; `null` means the user hasn't taken the quiz yet (404). */
export function useResults() {
  return useQuery({
    queryKey: RESULTS_KEY,
    queryFn: async (): Promise<ResultsResponse | null> => {
      try {
        return await api.results();
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  });
}

export function useCatalogue() {
  return useQuery({ queryKey: ["cards"], queryFn: api.cards, staleTime: 10 * 60_000 });
}

export function useSaveAnswers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (answers: QuizAnswersV2) => api.saveAnswers(answers),
    onSuccess: (data) => qc.setQueryData(RESULTS_KEY, data),
  });
}

export function useEditAnswer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfilePatch) => api.editAnswer(patch),
    onSuccess: (data) => qc.setQueryData(RESULTS_KEY, data),
  });
}

/** Held toggle: optimistic flag flip, then a fresh ranking (leakage changes). */
export function useSetHeld() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId, held }: { cardId: string; held: boolean }) => api.setHeld(cardId, held),
    onMutate: async ({ cardId, held }) => {
      await qc.cancelQueries({ queryKey: RESULTS_KEY });
      const prev = qc.getQueryData<ResultsResponse | null>(RESULTS_KEY);
      if (prev) {
        qc.setQueryData<ResultsResponse>(RESULTS_KEY, {
          ...prev,
          answers: {
            ...prev.answers,
            cardsHeld: held
              ? [...new Set([...prev.answers.cardsHeld, cardId])]
              : prev.answers.cardsHeld.filter((id) => id !== cardId),
          },
          result: {
            ...prev.result,
            ranked: prev.result.ranked.map((c) => (c.cardId === cardId ? { ...c, flags: { ...c.flags, held } } : c)),
          },
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev !== undefined && qc.setQueryData(RESULTS_KEY, ctx.prev),
    // The card also joins or leaves My cards (and so plans and Home).
    onSettled: () => Promise.all([RESULTS_KEY, ...MONEY_KEYS.map((k) => [k]), ["plans"]].map((queryKey) => qc.invalidateQueries({ queryKey }))),
  });
}

/** Step 2 §9: rank on real statement spend, or back on quiz answers. */
export function useSyncSpend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (source: "statements" | "quiz") => api.syncSpend(source),
    onSuccess: (data) => qc.setQueryData(RESULTS_KEY, data),
  });
}
