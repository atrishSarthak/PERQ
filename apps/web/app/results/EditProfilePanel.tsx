"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  SearchableMultiSelect,
  SingleSelectScale,
  PickUpToNChips,
  YesNoWithConditional,
} from "@perq/ui";
import type { QuizAnswers } from "@perq/scoring-engine";
import { QUESTIONS } from "../quiz/questions";

/**
 * PRD §11: "Edit my profile" panel — all 13 quiz answers individually
 * editable. Reuses the same widget types (DR1/T15) and question
 * definitions (T13) as the quiz itself, so a returning user sees a
 * consistent editing experience rather than a second, differently-built
 * form. Editing one answer re-scores immediately with no loading state
 * (§11) — a successful PATCH triggers router.refresh() to pull the
 * server-rendered recommendations/arsenal state fresh, rather than
 * hand-rolling client-side score recomputation that would duplicate
 * packages/scoring-engine's logic.
 */
export function EditProfilePanel({
  answers,
  cardOptions,
}: {
  answers: QuizAnswers;
  cardOptions: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveField(key: string, value: unknown) {
    setSavingKey(key);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: key, value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // 2D: explicit error, prior results/answer stay visible — never
        // silent, never a stale-looking success.
        setError(data.error ?? "Couldn't update your results — try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't update your results — try again.");
    } finally {
      setSavingKey(null);
    }
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="rounded-md border border-border px-3 py-1.5 font-body text-body-sm text-text-primary"
      >
        Edit my profile
      </button>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-h2 text-text-primary">Edit my profile</h2>
        <button
          onClick={() => setExpanded(false)}
          className="rounded-md border border-border px-3 py-1.5 font-body text-body-sm text-text-primary"
        >
          Done
        </button>
      </div>

      {error && <p className="font-body text-body-sm text-danger">{error}</p>}

      <div className="space-y-6">
        {QUESTIONS.map((q) => {
          const currentValue = (answers as unknown as Record<string, unknown>)[q.key];
          const saving = savingKey === q.key;

          return (
            <div key={q.key} className={saving ? "opacity-60" : ""}>
              <p className="mb-2 font-body text-body-sm text-text-secondary">{q.prompt}</p>
              {q.type === "searchable-multi-select" && (
                <SearchableMultiSelect
                  options={cardOptions}
                  value={(currentValue as string[]) ?? []}
                  onChange={(v) => saveField(q.key, v)}
                  name={q.key}
                  emptyOptionLabel="I don't have any yet"
                />
              )}
              {q.type === "single-select-scale" && (
                <SingleSelectScale
                  options={q.options}
                  value={
                    q.key === "feeTolerant"
                      ? String(currentValue)
                      : ((currentValue as string) ?? null)
                  }
                  onChange={(v) =>
                    saveField(q.key, q.key === "feeTolerant" ? v === "true" : v)
                  }
                  name={q.key}
                />
              )}
              {q.type === "pick-up-to-n-chips" && (
                <PickUpToNChips
                  options={q.options}
                  value={(currentValue as string[]) ?? []}
                  onChange={(v) => saveField(q.key, v)}
                  max={q.max}
                  name={q.key}
                />
              )}
              {q.type === "yes-no-with-conditional" && (
                <YesNoWithConditional
                  value={
                    q.key === "recurringBillsByCard"
                      ? { active: Boolean(currentValue), amount: null }
                      : (currentValue as { active: boolean; amount: number | null })
                  }
                  onChange={(v) =>
                    saveField(q.key, q.key === "recurringBillsByCard" ? v.active : v)
                  }
                  conditionalLabel={q.conditionalLabel}
                  name={q.key}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
