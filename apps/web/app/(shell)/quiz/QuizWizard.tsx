"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SearchableMultiSelect,
  SingleSelectScale,
  PickUpToNChips,
  YesNoWithConditional,
  Narration,
  type NarrationStep,
} from "@perq/ui";
import type { QuizAnswers } from "@perq/scoring-engine";
import { QUESTIONS } from "./questions";
import { parseSSEStream } from "./parseSSEStream";

export interface CardOption {
  value: string;
  label: string;
}

type Answers = Partial<Record<string, unknown>>;

function isAnswered(key: string, answers: Answers): boolean {
  const q = QUESTIONS.find((q) => q.key === key);
  if (!q) return false;
  switch (q.type) {
    case "searchable-multi-select":
    case "pick-up-to-n-chips":
      return true; // 0 selections is a valid answer (empty arsenal / no preference)
    case "single-select-scale":
      return answers[key] !== undefined;
    case "yes-no-with-conditional":
      return typeof (answers[key] as { active?: boolean } | undefined)?.active === "boolean";
  }
}

export function QuizWizard({ cardOptions }: { cardOptions: CardOption[] }) {
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

  async function submit() {
    setPhase("submitting");
    setErrorMessage(null);
    try {
      const payload: QuizAnswers = {
        heldCardIds: (answers.heldCardIds as string[]) ?? [],
        annualIncome: answers.annualIncome as QuizAnswers["annualIncome"],
        flightFrequency: answers.flightFrequency as QuizAnswers["flightFrequency"],
        hotelFrequency: answers.hotelFrequency as QuizAnswers["hotelFrequency"],
        // The YesNoWithConditional widget's value shape is {active, amount}
        // (packages/ui, generic — no knowledge of QuizAnswers' field names).
        // QuizAnswers.gymMembership is {active, monthlyCost}. This must be
        // an explicit field mapping, not a cast — casting silently drops
        // monthlyCost from the payload entirely, which is exactly the bug
        // that produced a real "Quiz submission failed" for a real user:
        // the server's zod schema requires monthlyCost and got undefined.
        gymMembership: {
          active: (answers.gymMembership as { active?: boolean } | undefined)?.active ?? false,
          monthlyCost:
            (answers.gymMembership as { amount?: number | null } | undefined)?.amount ?? null,
        },
        foodDeliverySpend: answers.foodDeliverySpend as QuizAnswers["foodDeliverySpend"],
        ecommerceSpend: answers.ecommerceSpend as QuizAnswers["ecommerceSpend"],
        grocerySpend: answers.grocerySpend as QuizAnswers["grocerySpend"],
        diningOutSpend: answers.diningOutSpend as QuizAnswers["diningOutSpend"],
        fuelSpend: answers.fuelSpend as QuizAnswers["fuelSpend"],
        recurringBillsByCard:
          (answers.recurringBillsByCard as { active: boolean } | undefined)?.active ?? false,
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
          router.push("/results");
        }
      }
    } catch (err) {
      setPhase("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (phase !== "answering") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
        {phase === "error" ? (
          <>
            <p className="font-body text-body text-danger">{errorMessage}</p>
            <button
              onClick={() => setPhase("answering")}
              className="rounded-md bg-accent px-3 py-1.5 font-body text-body-sm text-white"
            >
              Back to quiz
            </button>
          </>
        ) : (
          <Narration steps={narrationSteps} />
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 p-8"
    >
      <p className="font-body text-caption text-text-secondary">
        Question {index + 1} of {QUESTIONS.length}
      </p>
      <h1 className="font-display text-h2 text-text-primary">{question.prompt}</h1>

      {question.type === "searchable-multi-select" && (
        <SearchableMultiSelect
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
        />
      )}
      {question.type === "yes-no-with-conditional" && (
        <YesNoWithConditional
          value={(answers[question.key] as { active: boolean; amount: number | null }) ?? {
            active: undefined as unknown as boolean,
            amount: null,
          }}
          onChange={(v) => setAnswer(question.key, v)}
          conditionalLabel={question.conditionalLabel}
          name={question.key}
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
          {isLast ? "See my recommendations" : "Next"}
        </button>
      </div>
    </div>
  );
}
