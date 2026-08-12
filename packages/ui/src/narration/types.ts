// Generic step-list narration — deliberately has no knowledge of MIMIR,
// Gemini, or tools (Design System §5: "Build this once in packages/ui in
// Feature 1; Feature 2 and 3 reuse it for their own multi-step agentic
// actions"). The caller (apps/web/lib/mimir for Feature 1) is responsible
// for turning real tool-call events into these labels.

export interface NarrationStep {
  /** Unique per step instance — used as the React key, must not repeat. */
  id: string;
  label: string;
}
