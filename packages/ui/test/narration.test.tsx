import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Narration } from "../src/narration/Narration";
import type { NarrationStep } from "../src/narration/types";

describe("Narration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders an aria-live=polite region (DR9)", () => {
    const steps: NarrationStep[] = [{ id: "1", label: "MIMIR checked your profile" }];
    render(<Narration steps={steps} />);
    const list = document.querySelector(".perq-narration-list");
    expect(list).toHaveAttribute("aria-live", "polite");
  });

  it("reveals nothing before the first pacing-floor tick", () => {
    const steps: NarrationStep[] = [{ id: "1", label: "MIMIR checked your profile" }];
    render(<Narration steps={steps} minStepDurationMs={400} />);
    expect(screen.queryByText("MIMIR checked your profile")).not.toBeInTheDocument();
  });

  it("reveals the first step after the pacing floor elapses", () => {
    const steps: NarrationStep[] = [{ id: "1", label: "MIMIR checked your profile" }];
    render(<Narration steps={steps} minStepDurationMs={400} />);
    act(() => { vi.advanceTimersByTime(400); });
    expect(screen.getByText("MIMIR checked your profile")).toBeInTheDocument();
  });

  it("holds each step for the minimum duration even when all steps arrive instantly (cache-hit / DR5)", () => {
    const steps: NarrationStep[] = [
      { id: "1", label: "MIMIR checked your profile" },
      { id: "2", label: "MIMIR scored 118 cards" },
      { id: "3", label: "MIMIR is writing your recommendation" },
    ];
    render(<Narration steps={steps} minStepDurationMs={400} />);

    // All three steps are already available in props (simulating a fast
    // cache-hit response), but only one should reveal per floor tick.
    act(() => { vi.advanceTimersByTime(400); });
    expect(screen.getByText("MIMIR checked your profile")).toBeInTheDocument();
    expect(screen.queryByText("MIMIR scored 118 cards")).not.toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(400); });
    expect(screen.getByText("MIMIR scored 118 cards")).toBeInTheDocument();
    expect(
      screen.queryByText("MIMIR is writing your recommendation")
    ).not.toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(400); });
    expect(
      screen.getByText("MIMIR is writing your recommendation")
    ).toBeInTheDocument();
  });

  it("handles an arbitrary event sequence, not a fixed script (D3 revised) — e.g. multiple card lookups", () => {
    const steps: NarrationStep[] = [
      { id: "1", label: "MIMIR checked your profile" },
      { id: "2", label: "MIMIR scored 118 cards" },
      { id: "3", label: "MIMIR is looking up Axis Airtel" },
      { id: "4", label: "MIMIR is looking up HDFC Regalia" },
      { id: "5", label: "MIMIR is looking up SBI Cashback" },
      { id: "6", label: "MIMIR is writing your recommendation" },
    ];
    render(<Narration steps={steps} minStepDurationMs={100} />);

    // Advance one floor-tick at a time so each reveal's own useEffect has a
    // chance to commit and reschedule the next timer before it fires.
    for (let i = 0; i < steps.length; i++) {
      act(() => {
        vi.advanceTimersByTime(100);
      });
    }
    for (const step of steps) {
      expect(screen.getByText(step.label)).toBeInTheDocument();
    }
  });

  it("marks all but the current step as complete (checkmark), current step distinct", () => {
    const steps: NarrationStep[] = [
      { id: "1", label: "Step one" },
      { id: "2", label: "Step two" },
    ];
    render(<Narration steps={steps} minStepDurationMs={100} />);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    const items = document.querySelectorAll(".perq-narration-step");
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain("✓");
    expect(items[1]?.textContent).not.toContain("✓");
  });
});
