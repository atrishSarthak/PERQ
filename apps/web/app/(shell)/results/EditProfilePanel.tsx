"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SingleSelectScale, PickUpToNChips } from "@perq/ui";
import type { QuizAnswers } from "@perq/scoring-engine";
import { QUESTIONS } from "../quiz/questions";
import { CardSearchField, type CardSearchOption } from "../quiz/CardSearchField";
import { FINANCIAL_CONTEXT_QUESTIONS } from "./financialContextQuestions";
import { NumberField } from "./NumberField";

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
  cardOptions: CardSearchOption[];
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
              {q.type === "card-search" && (
                <CardSearchField
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
                  noneOption={q.noneOption}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Feature 3 §11: a distinct sub-section for the 6 new financial-
          context/billing-cycle fields, same panel (not a separate surface)
          per PRD §11's requirement — the exact sub-section split was left
          to Claude Code's design judgment. */}
      <div className="space-y-6 border-t border-border pt-6">
        <h3 className="font-display text-body-lg font-semibold text-text-primary">
          Financial context
        </h3>
        <p className="font-body text-body-sm text-text-secondary">
          Powers MIMIR&rsquo;s billing-cycle timing advice on goal searches — e.g. suggesting you
          wait a few days for your statement to close. Fully optional and self-reported, same as
          everything else in your profile.
        </p>
        {FINANCIAL_CONTEXT_QUESTIONS.map((q) => {
          const currentValue = (answers as unknown as Record<string, unknown>)[q.key];
          const saving = savingKey === q.key;

          return (
            <div key={q.key} className={saving ? "opacity-60" : ""}>
              <p className="mb-2 font-body text-body-sm text-text-secondary">{q.prompt}</p>
              {q.type === "select" && (
                <SingleSelectScale
                  options={q.options}
                  value={(currentValue as string) ?? null}
                  onChange={(v) => saveField(q.key, v)}
                  name={q.key}
                />
              )}
              {(q.type === "day-of-month" || q.type === "rupee-amount") && (
                <NumberField
                  value={(currentValue as number) ?? null}
                  onSave={(v) => saveField(q.key, v)}
                  min={q.type === "day-of-month" ? 1 : 0}
                  max={q.type === "day-of-month" ? 31 : undefined}
                  prefix={q.type === "rupee-amount" ? "₹" : undefined}
                  placeholder={q.type === "day-of-month" ? "e.g. 15" : "e.g. 25000"}
                  name={q.key}
                />
              )}
              {q.type === "day-of-month" && "subtext" in q && q.subtext && (
                <p className="mt-1 font-body text-caption text-text-secondary">{q.subtext}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
