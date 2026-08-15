"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SingleSelectScale,
  PickUpToNChips,
  Modal,
  type NarrationStep,
} from "@perq/ui";
import type { QuizAnswers } from "@perq/scoring-engine";
import { QUESTIONS } from "./questions";
import { parseSSEStream } from "./parseSSEStream";
import { CardSearchField, type CardSearchOption } from "./CardSearchField";
import { MimirLoadingSequence } from "./MimirLoadingSequence";

export type CardOption = CardSearchOption;

type Answers = Partial<Record<string, unknown>>;

function isAnswered(key: string, answers: Answers): boolean {
  const q = QUESTIONS.find((q) => q.key === key);
  if (!q) return false;
  switch (q.type) {
    case "card-search":
    case "pick-up-to-n-chips":
      return true; // 0 selections is a valid answer (empty arsenal / no preference)
    case "single-select-scale":
      return answers[key] !== undefined;
  }
}

/**
 * The onboarding quiz — a shadcn-style Questionnaire in a Dialog (Task 1):
 * one question per step inside a modal, progress indicator, Prev/Next, a
 * Submit that transitions into MIMIR's branded loading sequence before
 * dismissing into the results page underneath. Reused as-is by Task 2's
 * "Retake the Quiz" — the results page opens this same component in place,
 * passing an onComplete that closes the modal and refreshes instead of
 * navigating (it's already on /results).
 */
export function QuizWizard({
  cardOptions,
  onComplete,
}: {
  cardOptions: CardOption[];
  onComplete?: () => void;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [phase, setPhase] = useState<"answering" | "submitting" | "error">("answering");
  const [narrationSteps, setNarrationSteps] = useState<NarrationStep[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const question = QUESTIONS[index]!;
  const isLast = index === QUESTIONS.length - 1;
  const answered = isAnswered(question.key, answers);

  // DR10: primary input auto-focuses on screen entry; focus moves to the
  // new question after navigation, never lost to the document body.
  useEffect(() => {
    if (phase !== "answering") return;
    const el = containerRef.current?.querySelector<HTMLElement>(
      'input, button[role="radio"], button[aria-pressed]'
    );
    el?.focus();
  }, [index, phase]);

  function goNext() {
    if (isLast) {
      void submit();
    } else if (answered) {
      setIndex((i) => i + 1);
    }
  }

  function goBack() {
    if (index > 0) setIndex((i) => i - 1);
  }

  // DR10: Enter advances (where valid), Escape/Alt+Left goes back.
  function handleKeyDown(e: React.KeyboardEvent) {
    if (phase !== "answering") return;
    if (e.key === "Enter" && answered) {
      e.preventDefault();
      goNext();
    } else if (e.key === "Escape" || (e.altKey && e.key === "ArrowLeft")) {
      e.preventDefault();
      goBack();
    }
  }

  function setAnswer(key: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function complete() {
    if (onComplete) onComplete();
    else router.push("/results");
  }

  async function submit() {
    setPhase("submitting");
    setErrorMessage(null);
    try {
      const payload: QuizAnswers = {
        heldCardIds: (answers.heldCardIds as string[]) ?? [],
        annualIncome: answers.annualIncome as QuizAnswers["annualIncome"],
        flightFrequency: answers.flightFrequency as QuizAnswers["flightFrequency"],
        hotelFrequency: answers.hotelFrequency as QuizAnswers["hotelFrequency"],
        gymMembership: answers.gymMembership as QuizAnswers["gymMembership"],
        foodDeliverySpend: answers.foodDeliverySpend as QuizAnswers["foodDeliverySpend"],
        ecommerceSpend: answers.ecommerceSpend as QuizAnswers["ecommerceSpend"],
        grocerySpend: answers.grocerySpend as QuizAnswers["grocerySpend"],
        diningOutSpend: answers.diningOutSpend as QuizAnswers["diningOutSpend"],
        fuelSpend: answers.fuelSpend as QuizAnswers["fuelSpend"],
        recurringBillsByCard: answers.recurringBillsByCard as QuizAnswers["recurringBillsByCard"],
        feeTolerant: answers.feeTolerant === "true",
        priorityCategories: (answers.priorityCategories as QuizAnswers["priorityCategories"]) ?? [],
      };

      const res = await fetch("/api/quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok || !res.body) {
        throw new Error("Quiz submission failed");
      }

      for await (const event of parseSSEStream(res.body)) {
        const e = event as { type: string; label?: string; message?: string };
        if (e.type === "step" && e.label) {
          setNarrationSteps((prev) => [...prev, { id: `${prev.length}`, label: e.label! }]);
        } else if (e.type === "error") {
          throw new Error(e.message ?? "Something went wrong");
        } else if (e.type === "done") {
          complete();
        }
      }
    } catch (err) {
      setPhase("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <Modal open ariaLabel="PERQ onboarding quiz" maxWidthClassName="max-w-xl">
      {phase !== "answering" ? (
        phase === "error" ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <p className="font-body text-body text-danger">{errorMessage}</p>
            <button
              onClick={() => setPhase("answering")}
              className="rounded-md bg-accent px-3 py-1.5 font-body text-body-sm text-white"
            >
              Back to quiz
            </button>
          </div>
        ) : (
          <MimirLoadingSequence steps={narrationSteps} />
        )
      ) : (
        <div ref={containerRef} onKeyDown={handleKeyDown} className="flex flex-col gap-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-body text-caption text-text-secondary">
                Question {index + 1} of {QUESTIONS.length}
              </p>
            </div>
            <div
              className="h-1 w-full overflow-hidden rounded-full"
              style={{ backgroundColor: "var(--bg-surface-2)" }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${((index + 1) / QUESTIONS.length) * 100}%`,
                  backgroundColor: "var(--accent)",
                }}
              />
            </div>
          </div>

          <div className="space-y-1">
            <h1 className="font-display text-h2 text-text-primary">{question.prompt}</h1>
            {question.subtext && (
              <p className="font-body text-body-sm text-text-secondary">{question.subtext}</p>
            )}
          </div>

          {question.type === "card-search" && (
            <CardSearchField
              options={cardOptions}
              value={(answers[question.key] as string[]) ?? []}
              onChange={(v) => setAnswer(question.key, v)}
              name={question.key}
              emptyOptionLabel="I don't have any yet"
            />
          )}
          {question.type === "single-select-scale" && (
            <SingleSelectScale
              options={question.options}
              value={(answers[question.key] as string) ?? null}
              onChange={(v) => setAnswer(question.key, v)}
              name={question.key}
            />
          )}
          {question.type === "pick-up-to-n-chips" && (
            <PickUpToNChips
              options={question.options}
              value={(answers[question.key] as string[]) ?? []}
              onChange={(v) => setAnswer(question.key, v)}
              max={question.max}
              name={question.key}
              noneOption={question.noneOption}
            />
          )}

          <div className="flex justify-between">
            <button
              onClick={goBack}
              disabled={index === 0}
              className="rounded-md border border-border px-3 py-1.5 font-body text-body-sm text-text-primary disabled:opacity-40"
            >
              Back
            </button>
            <button
              onClick={goNext}
              disabled={!answered}
              className="rounded-md bg-accent px-3 py-1.5 font-body text-body-sm text-white disabled:opacity-40"
            >
              {isLast ? "Submit" : "Next"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
