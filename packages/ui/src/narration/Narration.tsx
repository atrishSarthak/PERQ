"use client";

import { useEffect, useState } from "react";
import type { NarrationStep } from "./types";

export interface NarrationProps {
  /**
   * Steps revealed so far, in order. Append-only from the caller's side —
   * as real tool-call events resolve (D3, revised), push a new step onto
   * this array. The component decides its own reveal pacing independently
   * of how fast new steps arrive.
   */
  steps: NarrationStep[];
  /**
   * Minimum time (ms) each step stays the "current" one before the next
   * revealed step advances, even if the underlying event that produced it
   * resolved faster (DR5) — e.g. a D6/D10 explanation-cache hit. Every
   * revealed step still corresponds to a real event; this only floors the
   * display duration so the narration doesn't flash by unreadably.
   */
  minStepDurationMs?: number;
}

const DEFAULT_MIN_STEP_DURATION_MS = 400;

/**
 * The "MIMIR is working" narration component (PRD §9.3, Design System §5).
 * A structured, visible step-list — never a silent spinner. The list itself
 * is an aria-live="polite" region (DR9) so screen-reader users hear each
 * step as it's announced, not silence through the whole wait.
 */
export function Narration({
  steps,
  minStepDurationMs = DEFAULT_MIN_STEP_DURATION_MS,
}: NarrationProps) {
  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    if (revealedCount >= steps.length) return;
    const timer = setTimeout(() => {
      setRevealedCount((count) => count + 1);
    }, minStepDurationMs);
    return () => clearTimeout(timer);
  }, [revealedCount, steps.length, minStepDurationMs]);

  const revealed = steps.slice(0, revealedCount);
  const currentIndex = revealed.length - 1;

  return (
    <div className="perq-narration">
      <ol
        className="perq-narration-list"
        aria-live="polite"
        aria-atomic="false"
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
        }}
      >
        {revealed.map((step, index) => {
          const isCurrent = index === currentIndex;
          return (
            <li
              key={step.id}
              className="perq-narration-step"
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "var(--text-body-size)",
                color: isCurrent ? "var(--accent)" : "var(--text-secondary)",
              }}
            >
              {!isCurrent && (
                <span aria-hidden="true" style={{ color: "var(--success)" }}>
                  {"✓ "}
                </span>
              )}
              {step.label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
