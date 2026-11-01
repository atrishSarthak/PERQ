import type { PlanDetailResponse } from "@perq/shared";

// Plan actions (§8) arrive in checkpoint 9.
export function PlanActions(_: { plan: PlanDetailResponse }) {
  return null;
}
