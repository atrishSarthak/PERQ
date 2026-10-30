import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ResultsResponse } from "@perq/shared";
import { streamEmber } from "@/lib/api";
import { RESULTS_KEY } from "@/lib/queries";

/**
 * When the Top Pick changes (after an edit or a held toggle) and has no
 * Ember explanation yet, ask for one in the background (handoff §1.3: a new
 * explanation only when the Top Pick changes). Returns the latest narration
 * step while Ember works.
 */
export function useExplanation(data: ResultsResponse | null | undefined): string | null {
  const qc = useQueryClient();
  const requested = useRef<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const topId = data?.result.ranked[0]?.cardId;
  const has = !!topId && data?.explanation?.topCardId === topId;

  useEffect(() => {
    if (!topId || has || requested.current === topId) return;
    requested.current = topId;
    const controller = new AbortController();
    streamEmber(
      "/api/recommender/explain",
      {},
      (e) => {
        if (e.type === "step") setStep(e.label);
        if (e.type === "explanation" && e.topCardId === topId) {
          qc.setQueryData<ResultsResponse | null>(RESULTS_KEY, (prev) =>
            prev
              ? { ...prev, explanation: { text: e.text, source: e.source === "gemini" ? "gemini" : e.source === "cached" ? "cached" : "fallback_template", topCardId: e.topCardId } }
              : prev
          );
        }
        if (e.type === "done" || e.type === "error") setStep(null);
      },
      controller.signal
    ).catch(() => setStep(null));
    return () => controller.abort();
  }, [topId, has, qc]);

  return has ? null : step;
}
