"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { NarrationStep } from "@perq/ui";
import { parseSSEStream } from "../quiz/parseSSEStream";
import { MimirLoadingSequence } from "../quiz/MimirLoadingSequence";

type Phase =
  | "entering"
  | "submitting"
  | "error"
  | "unsupported"
  | "missing_info"
  | "no_listings_found"
  | "total_failure";

type GoalSSEEvent =
  | { type: "step"; label: string }
  | { type: "error"; message: string }
  | {
      type: "done";
      outcome: "success" | "unsupported" | "missing_info" | "total_failure" | "no_listings_found";
      missingField?: string;
    };

/**
 * PRD §13: a dedicated goal entry point (not buried in the follow-up
 * chat), placeholder copy in MIMIR's voice, transitioning into the same
 * branded narrated-loading pattern as the quiz (§10, reusing
 * MimirLoadingSequence/parseSSEStream as-is per Engineering Plan §9 —
 * "what already exists"). On a real recommendation, redirects to
 * /goal/results (mirrors QuizWizard's complete() → router.push("/results")
 * pattern) since goal_recommendations rows are DB-persisted, not just
 * client state. On every other outcome (D6's honest declines, D9's
 * total-failure path), the message is shown inline here — never a
 * redirect to a page with nothing to show (PRD §16: no persistent goal
 * history to land on).
 */
export function GoalWizard() {
  const router = useRouter();
  const [goalText, setGoalText] = useState("");
  const [phase, setPhase] = useState<Phase>("entering");
  const [narrationSteps, setNarrationSteps] = useState<NarrationStep[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [missingField, setMissingField] = useState<string | null>(null);

  function reset() {
    setPhase("entering");
    setNarrationSteps([]);
    setErrorMessage(null);
    setMissingField(null);
  }

  async function submit() {
    if (!goalText.trim()) return;
    setPhase("submitting");
    setNarrationSteps([]);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/goals/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalText: goalText.trim() }),
      });

      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.error ?? "You've hit today's search limit.");
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
        } else if (e.type === "done") {
          if (e.outcome === "success") {
            router.push("/goal/results");
          } else if (e.outcome === "missing_info") {
            setMissingField(e.missingField ?? null);
            setPhase("missing_info");
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

  if (phase === "submitting") {
    return <MimirLoadingSequence steps={narrationSteps} />;
  }

  if (phase === "unsupported") {
    return (
      <ResultMessage
        heading="Not quite in MIMIR's lane yet"
        body="MIMIR checks movies, travel/attraction tickets, and electronics right now — this one doesn't clearly fit any of those. Try rephrasing, or ask about one of those three."
        onTryAgain={reset}
      />
    );
  }

  if (phase === "missing_info") {
    return (
      <ResultMessage
        heading="MIMIR needs a bit more"
        body={`Almost there — MIMIR needs to know the ${missingField ?? "specific details"} to check real listings. Add that and try again.`}
        onTryAgain={reset}
      />
    );
  }

  if (phase === "no_listings_found") {
    return (
      <ResultMessage
        heading="Nothing found"
        body="MIMIR checked the real channels for this, but couldn't find a matching listing right now. Try again with more specific details, or check back later."
        onTryAgain={reset}
      />
    );
  }

  if (phase === "total_failure" || phase === "error") {
    return (
      <ResultMessage
        heading="MIMIR couldn't complete this search right now"
        body={errorMessage ?? "Something went wrong reaching the channels MIMIR checks. Try again in a moment."}
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
        MIMIR checks real channels and tells you where to buy and how to pay — one clear answer,
        not ten open tabs.
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
