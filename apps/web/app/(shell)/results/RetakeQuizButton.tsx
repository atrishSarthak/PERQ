"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@perq/ui";
import { QuizWizard, type CardOption } from "../quiz/QuizWizard";

/**
 * Task 2: "Retake the Quiz" — a destructive action (clears the saved quiz
 * profile and its recommendations) so it's gated behind an explicit
 * confirmation, never a single accidental click. On confirm, resets via
 * /api/profile/reset (which deliberately leaves user_card_arsenal alone —
 * see that route's comment) and drops the user straight into the same
 * QuizWizard used for new-user onboarding, starting fresh at question 1.
 */
export function RetakeQuizButton({ cardOptions }: { cardOptions: CardOption[] }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [retaking, setRetaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmRetake() {
    setResetting(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/reset", { method: "POST" });
      if (!res.ok) throw new Error();
      setConfirming(false);
      setRetaking(true);
    } catch {
      setError("Couldn't start over — try again.");
    } finally {
      setResetting(false);
    }
  }

  if (retaking) {
    return (
      <QuizWizard
        cardOptions={cardOptions}
        onComplete={() => {
          setRetaking(false);
          router.refresh();
        }}
      />
    );
  }

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        className="rounded-md border border-border px-3 py-1.5 font-body text-body-sm text-text-primary"
      >
        Retake the Quiz
      </button>

      <Modal
        open={confirming}
        onClose={resetting ? undefined : () => setConfirming(false)}
        ariaLabel="Confirm retaking the quiz"
        maxWidthClassName="max-w-sm"
      >
        <div className="space-y-4">
          <h2 className="font-display text-h2 text-text-primary">Retake the quiz?</h2>
          <p className="font-body text-body text-text-secondary">
            This clears your current answers and recommendations — you&apos;ll retake the quiz
            from question 1. Continue?
          </p>
          {error && <p className="font-body text-body-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConfirming(false)}
              disabled={resetting}
              className="rounded-md border border-border px-3 py-1.5 font-body text-body-sm text-text-primary disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => void confirmRetake()}
              disabled={resetting}
              className="rounded-md px-3 py-1.5 font-body text-body-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--danger)" }}
            >
              {resetting ? "Clearing…" : "Clear and retake"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
