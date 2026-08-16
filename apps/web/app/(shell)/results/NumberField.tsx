"use client";

import { useState, useEffect } from "react";

/**
 * Feature 3 §11's 4 numeric fields (statement/due date, outstanding
 * balance, credit limit) have no existing quiz-widget type — the shared
 * QuestionDef union (../quiz/questions.ts) is entirely select/chip-based,
 * used by the 13-question onboarding quiz these fields are deliberately
 * NOT part of. Rather than extending that shared contract for 4 one-off
 * fields, this is a small bespoke input local to the profile-edit panel.
 * Saves on blur (not per keystroke) — a PATCH per digit typed would be
 * wasteful and would fight the user mid-edit.
 */
export function NumberField({
  value,
  onSave,
  min,
  max,
  prefix,
  placeholder,
  name,
}: {
  value: number | null;
  onSave: (value: number) => void;
  min?: number;
  max?: number;
  prefix?: string;
  placeholder?: string;
  name: string;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));

  // Keep the field in sync if the server-confirmed value changes out from
  // under it (e.g. router.refresh() after another field's save).
  useEffect(() => {
    setDraft(value === null ? "" : String(value));
  }, [value]);

  function commit() {
    const parsed = Number(draft);
    if (draft.trim() === "" || Number.isNaN(parsed)) return;
    if (min !== undefined && parsed < min) return;
    if (max !== undefined && parsed > max) return;
    if (parsed !== value) onSave(parsed);
  }

  return (
    <div className="flex max-w-[200px] items-center gap-2 rounded-md border border-border px-3 py-2">
      {prefix && <span className="font-body text-body text-text-secondary">{prefix}</span>}
      <input
        type="number"
        inputMode="numeric"
        aria-label={name}
        value={draft}
        min={min}
        max={max}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="w-full bg-transparent font-body text-body text-text-primary outline-none"
      />
    </div>
  );
}
