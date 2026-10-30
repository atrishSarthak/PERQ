"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import {
  canContinue,
  currentStep,
  FEE_OPTIONS,
  INCOME_OPTIONS,
  initialQuizState,
  isLastStep,
  OCCUPATION_OPTIONS,
  PRIORITY_OPTIONS,
  QUIZ_QUESTIONS,
  quizReducer,
  quizSteps,
  SPEND_CATEGORY_QUESTIONS,
  SPEND_OPTIONS,
  toAnswers,
  TRAVEL_OPTIONS,
  type CardSummary,
  type Draft,
  type QuizAction,
  type QuizAnswersV2,
} from "@perq/shared";

// Quiz v2 on the web (handoff §1.7): the same shared reducer as the mobile
// app, one question per step. Used by the public card finder on the landing
// page and by the signed-in /quiz page.

function Option({ label, selected, onClick, multi }: { label: string; selected: boolean; onClick: () => void; multi?: boolean }) {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onClick}
      className={`flex min-h-12 w-full items-center justify-between rounded-md border px-4 py-3 text-left font-body text-body transition-colors ${
        selected ? "border-link bg-bg-surface-2 text-text-primary" : "border-border bg-bg-surface text-text-primary hover:bg-bg-surface-2"
      }`}
    >
      <span>{label}</span>
      <span aria-hidden className={`ml-3 h-5 w-5 rounded-full border-2 ${selected ? "border-link bg-link" : "border-text-secondary"}`} />
    </button>
  );
}

function Pill({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`min-h-10 rounded-full border px-3 font-body text-body-sm ${
        selected ? "border-primary bg-primary text-on-primary" : "border-border bg-bg-surface text-text-primary hover:bg-bg-surface-2"
      }`}
    >
      {label}
    </button>
  );
}

function CardPicker({ draft, dispatch }: { draft: Draft; dispatch: (a: QuizAction) => void }) {
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [query, setQuery] = useState("");
  useEffect(() => {
    fetch("/api/cards")
      .then((r) => r.json())
      .then((d) => setCards(d.cards ?? []))
      .catch(() => setCards([]));
  }, []);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? cards.filter((c) => `${c.name} ${c.issuer}`.toLowerCase().includes(q)) : cards;
    return [...list].sort((a, b) => Number(draft.cardsHeld.includes(b.id)) - Number(draft.cardsHeld.includes(a.id))).slice(0, q ? 40 : 10);
  }, [cards, query, draft.cardsHeld]);
  return (
    <div className="flex flex-col gap-3">
      <input
        aria-label="Search cards"
        placeholder="Search, e.g. Millennia, SBI, Amazon"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="min-h-12 rounded-md border border-border bg-bg-surface px-4 font-body text-body text-text-primary placeholder:text-text-secondary"
      />
      <p className="font-body text-body-sm text-text-secondary">
        {draft.cardsHeld.length ? `${draft.cardsHeld.length} selected` : "None selected: fine if you don't have one yet."}
      </p>
      {shown.map((c) => (
        <Option key={c.id} multi label={`${c.name} · ${c.issuer}`} selected={draft.cardsHeld.includes(c.id)} onClick={() => dispatch({ type: "toggleCard", cardId: c.id })} />
      ))}
    </div>
  );
}

function Body({ draft, dispatch, step }: { draft: Draft; dispatch: (a: QuizAction) => void; step: ReturnType<typeof currentStep> }) {
  const set = (key: keyof Draft, value: unknown) => dispatch({ type: "set", key, value });
  const list = "flex flex-col gap-3";
  switch (step) {
    case "cardsHeld":
      return <CardPicker draft={draft} dispatch={dispatch} />;
    case "occupation":
      return <div className={list} role="radiogroup">{OCCUPATION_OPTIONS.map((o) => <Option key={o.value} label={o.label} selected={draft.occupation === o.value} onClick={() => set("occupation", o.value)} />)}</div>;
    case "monthlyIncome":
      return <div className={list} role="radiogroup">{INCOME_OPTIONS.map((o) => <Option key={o.value} label={o.label} selected={draft.monthlyIncome === o.value} onClick={() => set("monthlyIncome", o.value)} />)}</div>;
    case "monthlySpend":
      return (
        <div className="flex flex-col gap-5">
          {SPEND_CATEGORY_QUESTIONS.map((q) => (
            <div key={q.key} role="radiogroup" aria-label={q.label} className="flex flex-col gap-2">
              <span className="font-body text-body font-semibold text-text-primary">{q.label}</span>
              <div className="flex flex-wrap gap-2">
                {SPEND_OPTIONS.map((o) => (
                  <Pill key={o.value} label={o.label} selected={draft.monthlySpend[q.key] === o.value} onClick={() => dispatch({ type: "setSpend", category: q.key, value: o.value })} />
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    case "travelPerYear":
      return <div className={list} role="radiogroup">{TRAVEL_OPTIONS.map((o) => <Option key={o.value} label={o.label} selected={draft.travelPerYear === o.value} onClick={() => set("travelPerYear", o.value)} />)}</div>;
    case "feeTolerance":
      return <div className={list} role="radiogroup">{FEE_OPTIONS.map((o) => <Option key={o.value} label={o.label} selected={draft.feeTolerance === o.value} onClick={() => set("feeTolerance", o.value)} />)}</div>;
    case "priorities":
      return (
        <div className={list}>
          {PRIORITY_OPTIONS.map((o) => (
            <Option key={o.value} multi label={o.label} selected={draft.priorities.includes(o.value)} onClick={() => dispatch({ type: "togglePriority", value: o.value })} />
          ))}
          <Option multi label="No preference" selected={draft.priorities.length === 0} onClick={() => dispatch({ type: "togglePriority", value: "none" })} />
        </div>
      );
    case "openToSecured":
      return (
        <div className={list} role="radiogroup">
          <Option label="Yes, show FD-backed cards too" selected={draft.openToSecured === true} onClick={() => set("openToSecured", true)} />
          <Option label="No" selected={draft.openToSecured === false} onClick={() => set("openToSecured", false)} />
        </div>
      );
  }
}

export function QuizV2Wizard({
  initial,
  submitLabel = "See my cards",
  onComplete,
}: {
  initial?: Partial<Draft>;
  submitLabel?: string;
  onComplete: (answers: QuizAnswersV2) => Promise<void>;
}) {
  const [state, dispatch] = useReducer(quizReducer, initial, initialQuizState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const steps = quizSteps(state.draft);
  const step = currentStep(state);
  const question = QUIZ_QUESTIONS.find((q) => q.key === step)!;
  const last = isLastStep(state);

  async function next() {
    if (!last) return dispatch({ type: "next" });
    const answers = toAnswers(state.draft);
    if (!answers) return;
    setBusy(true);
    setError(null);
    try {
      await onComplete(answers);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between font-body text-body-sm text-text-secondary">
        {state.index > 0 ? (
          <button type="button" onClick={() => dispatch({ type: "back" })} className="font-semibold text-link">
            ‹ Back
          </button>
        ) : (
          <span />
        )}
        <span aria-live="polite">
          {state.index + 1} of {steps.length}
        </span>
      </div>
      <div className="h-1 rounded bg-bg-surface-2">
        <div className="h-1 rounded bg-link transition-all" style={{ width: `${((state.index + 1) / steps.length) * 100}%` }} />
      </div>
      <h2 className="font-display text-h2 font-bold text-text-primary">{question.title}</h2>
      {question.hint ? <p className="-mt-3 font-body text-body text-text-secondary">{question.hint}</p> : null}
      <Body draft={state.draft} dispatch={dispatch} step={step} />
      {error ? <p className="font-body text-body-sm text-danger">{error}</p> : null}
      <button
        type="button"
        disabled={!canContinue(state) || busy}
        onClick={next}
        className="min-h-12 rounded-md bg-primary px-4 font-body text-body font-semibold text-on-primary hover:bg-primary-pressed disabled:opacity-50"
      >
        {busy ? "Working…" : last ? submitLabel : step === "cardsHeld" && state.draft.cardsHeld.length === 0 ? "I don't have one yet" : "Continue"}
      </button>
    </div>
  );
}
