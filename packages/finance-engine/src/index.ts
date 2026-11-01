// Pure money math for PERQ (handoff §0.5). No I/O, no Node or Next APIs:
// consumed by the web API and by the Expo app alike. All returned money is
// integer rupees, rounded once at the end of a calculation.
export * from "./types";
export * from "./finance";
export { formatInr } from "./format";
export { reconcile, reconcileTolerance, type ReconcileInput, type ReconcileResult } from "./reconcile";
