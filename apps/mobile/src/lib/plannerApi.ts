import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  planDetailResponseSchema,
  planExtractResponseSchema,
  planListResponseSchema,
  planWhatIfResponseSchema,
  type EmberEvent,
  type PlanExtractRequest,
  type PartialPlanInput,
  type PlanInput,
  type PlanPatch,
  type PlanSource,
  type PlanWhatIfRequest,
} from "@perq/shared";
import { http, streamEmber } from "./api";

// Purchase Planner API (Step 3 §9). Every response is zod-parsed.
export const plannerApi = {
  list: () => http.request("/api/plans", { schema: planListResponseSchema }),
  detail: (id: string) => http.request(`/api/plans/${encodeURIComponent(id)}`, { schema: planDetailResponseSchema }),
  patch: (id: string, body: PlanPatch) => http.request(`/api/plans/${encodeURIComponent(id)}`, { method: "PATCH", body, schema: planDetailResponseSchema }),
  remove: (id: string) => http.request(`/api/plans/${encodeURIComponent(id)}`, { method: "DELETE", schema: z.object({ ok: z.boolean() }) }),
  whatIf: (id: string, body: PlanWhatIfRequest) =>
    http.request(`/api/plans/${encodeURIComponent(id)}/what-if`, { method: "POST", body, schema: planWhatIfResponseSchema }),
  match: (id: string, transactionId: string) =>
    http.request(`/api/plans/${encodeURIComponent(id)}/match`, { method: "POST", body: { transactionId }, schema: planDetailResponseSchema }),
  extract: (body: PlanExtractRequest) => http.request("/api/plans/extract", { method: "POST", body, schema: planExtractResponseSchema }),
  run: (input: PlanInput, source: PlanSource, onEvent: (e: EmberEvent) => void, signal?: AbortSignal, opts: { postToChat?: boolean } = {}) =>
    streamEmber("/api/plans/run", { input, source, ...opts }, onEvent, signal),
};

export const usePlans = () => useQuery({ queryKey: ["plans"], queryFn: plannerApi.list });
export const usePlan = (id: string) => useQuery({ queryKey: ["plan", id], queryFn: () => plannerApi.detail(id) });

export function usePatchPlan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PlanPatch) => plannerApi.patch(id, body),
    onSuccess: (data) => {
      qc.setQueryData(["plan", id], data);
      qc.invalidateQueries({ queryKey: ["plans"] });
      qc.invalidateQueries({ queryKey: ["nudges"] });
    },
  });
}

// The confirmed draft handed from the input screen to the planning screen.
// In memory only: it's the user's own typed numbers, nothing else.
let pending: { input: PlanInput; source: PlanSource } | null = null;
export const setPendingPlan = (p: { input: PlanInput; source: PlanSource }) => {
  pending = p;
};
export const takePendingPlan = () => {
  const p = pending;
  pending = null;
  return p;
};

// Details read from a screenshot, link or chat, waiting for the user to confirm them.
let draft: { draft: PartialPlanInput; source: PlanSource; notes: string[] } | null = null;
export const setDraftToConfirm = (d: { draft: PartialPlanInput; source: PlanSource; notes: string[] }) => {
  draft = d;
};
export const takeDraftToConfirm = () => {
  const d = draft;
  draft = null;
  return d;
};

/** What-ifs (§9): unsaved unless `save` is set, which updates the plan in place. */
export function useWhatIf(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PlanWhatIfRequest) => plannerApi.whatIf(id, body),
    // A kept version: wait for the saved plan so the screen never flashes the old one.
    onSuccess: async (_data, body) => {
      if (!body.save) return;
      qc.invalidateQueries({ queryKey: ["plans"] });
      await qc.refetchQueries({ queryKey: ["plan", id] });
    },
  });
}
