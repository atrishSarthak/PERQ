"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { NarrationStep } from "@perq/ui";
import { parseSSEStream } from "../quiz/parseSSEStream";
import { MimirLoadingSequence } from "../quiz/MimirLoadingSequence";

interface ClarificationTurn {
  question: string;
  answer: string;
}

type Phase =
  | "entering"
  | "submitting"
  | "clarifying"
  | "error"
  | "unsupported"
  | "no_listings_found"
  | "total_failure";

type GoalSSEEvent =
  | { type: "step"; label: string }
  | { type: "error"; message: string }
  | { type: "clarifying_question"; goalId: string; question: string }
  | {
      type: "done";
      outcome: "success" | "unsupported" | "total_failure" | "no_listings_found";
    };

/**
 * A dedicated goal entry point (not buried in the follow-up chat),
 * placeholder copy in MIMIR's voice, transitioning into the same branded
 * narrated-loading pattern as the quiz (reusing MimirLoadingSequence/
 * parseSSEStream as-is). On a real recommendation, redirects to
 * /goal/results since goal_recommendations rows are DB-persisted, not just
 * client state.
 *
 * v2 (open-ended web-search redesign): when the goal is ambiguous, MIMIR
 * asks a single clarifying follow-up question inline instead of declining
 * and asking the user to retype — the "clarifying" phase captures the
 * answer and resubmits, continuing the same session via goalId, up to
 * MAX_CLARIFYING_ROUNDS rounds (enforced server-side).
 */
export function GoalWizard() {
  const router = useRouter();
  const [goalText, setGoalText] = useState("");
  const [phase, setPhase] = useState<Phase>("entering");
  const [narrationSteps, setNarrationSteps] = useState<NarrationStep[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [goalId, setGoalId] = useState<string | null>(null);
  const [clarificationHistory, setClarificationHistory] = useState<ClarificationTurn[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");

  function reset() {
    setPhase("entering");
    setNarrationSteps([]);
    setErrorMessage(null);
    setGoalId(null);
    setClarificationHistory([]);
    setCurrentQuestion(null);
    setAnswerText("");
  }

  async function runSearch(body: unknown) {
    setPhase("submitting");
    setNarrationSteps([]);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/goals/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 429 || res.status === 400) {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.error ?? "Couldn't start that search.");
        setPhase("error");
        return;
      }

      if (!res.ok || !res.body) {
        throw new Error("Couldn't start that search.");
      }

      for await (const event of parseSSEStream(res.body)) {
        const e = event as GoalSSEEvent;

        if (e.type === "step") {
          setNarrationSteps((prev) => [...prev, { id: `${prev.length}`, label: e.label }]);
        } else if (e.type === "error") {
          throw new Error(e.message ?? "Something went wrong");
        } else if (e.type === "clarifying_question") {
          setGoalId(e.goalId);
          setCurrentQuestion(e.question);
          setAnswerText("");
          setPhase("clarifying");
        } else if (e.type === "done") {
          if (e.outcome === "success") {
            router.push("/goal/results");
          } else {
            setPhase(e.outcome);
          }
        }
      }
    } catch (err) {
      setPhase("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function submit() {
    if (!goalText.trim()) return;
    await runSearch({ goalText: goalText.trim() });
  }

  async function submitClarificationAnswer() {
    if (!answerText.trim() || !currentQuestion || !goalId) return;
    const nextHistory = [...clarificationHistory, { question: currentQuestion, answer: answerText.trim() }];
    setClarificationHistory(nextHistory);
    await runSearch({ goalId, clarification: nextHistory });
  }

  if (phase === "submitting") {
    return <MimirLoadingSequence steps={narrationSteps} />;
  }

  if (phase === "clarifying") {
    return (
      <div className="flex flex-col gap-4">
        <p className="font-body text-body-sm text-text-secondary">MIMIR needs one more thing:</p>
        <h1 className="font-display text-h2 text-text-primary">{currentQuestion}</h1>
        <textarea
          value={answerText}
          onChange={(e) => setAnswerText(e.target.value)}
          placeholder="Type your answer…"
          rows={2}
          autoFocus
          className="rounded-md border border-border bg-transparent p-3 font-body text-body text-text-primary placeholder:text-text-secondary"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submitClarificationAnswer();
            }
          }}
        />
        <button
          onClick={() => void submitClarificationAnswer()}
          disabled={!answerText.trim()}
          className="w-fit rounded-md bg-accent px-4 py-2 font-body text-body-sm text-white disabled:opacity-40"
        >
          Continue
        </button>
      </div>
    );
  }

  if (phase === "unsupported") {
    return (
      <ResultMessage
        heading="Not quite in MIMIR's lane yet"
        body="MIMIR helps you decide where and how to buy something — this doesn't look like that kind of question yet. Try rephrasing it as a purchase you're trying to make."
        onTryAgain={reset}
      />
    );
  }

  if (phase === "no_listings_found") {
    return (
      <ResultMessage
        heading="Nothing found"
        body="MIMIR searched the web for this, but couldn't find a matching listing with a real price right now. Try again with more specific details, or check back later."
        onTryAgain={reset}
      />
    );
  }

  if (phase === "total_failure" || phase === "error") {
    return (
      <ResultMessage
        heading="MIMIR couldn't complete this search right now"
        body={errorMessage ?? "Something went wrong searching for this. Try again in a moment."}
        onTryAgain={reset}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-h1 text-text-primary">
        What are you trying to buy?
      </h1>
      <p className="font-body text-body-sm text-text-secondary">
        MIMIR searches the web and tells you where to buy and how to pay — one clear answer, not
        ten open tabs.
      </p>
      <textarea
        value={goalText}
        onChange={(e) => setGoalText(e.target.value)}
        placeholder="I want to book a ticket to…"
        rows={3}
        className="rounded-md border border-border bg-transparent p-3 font-body text-body text-text-primary placeholder:text-text-secondary"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <button
        onClick={() => void submit()}
        disabled={!goalText.trim()}
        className="w-fit rounded-md bg-accent px-4 py-2 font-body text-body-sm text-white disabled:opacity-40"
      >
        Ask MIMIR
      </button>
    </div>
  );
}

function ResultMessage({
  heading,
  body,
  onTryAgain,
}: {
  heading: string;
  body: string;
  onTryAgain: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <h1 className="font-display text-h2 text-text-primary">{heading}</h1>
      <p className="max-w-md font-body text-body text-text-secondary">{body}</p>
      <button
        onClick={onTryAgain}
        className="rounded-md bg-accent px-3 py-1.5 font-body text-body-sm text-white"
      >
        Try again
      </button>
    </div>
  );
}
