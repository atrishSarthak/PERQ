"use client";

import { useState } from "react";
import { formatInr } from "@perq/finance-engine";
import type { RecommendationResult, ScoredCardV2 } from "@perq/shared";

// Ranked cards on the web (handoff §1.7). Every ₹ figure is from
// finance-engine via the API; this component only lays them out.

function Flags({ card }: { card: ScoredCardV2 }) {
  const flags = [
    card.flags.held && "You have this",
    card.flags.upi && "Works on UPI",
    card.flags.lifetimeFree && "Lifetime free",
    card.flags.fdBacked && "FD-backed",
  ].filter(Boolean) as string[];
  if (!flags.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {flags.map((f) => (
        <span key={f} className="rounded border border-border px-2 py-0.5 font-body text-caption text-text-secondary">
          {f}
        </span>
      ))}
    </div>
  );
}

export function TheMath({ card }: { card: ScoredCardV2 }) {
  const lines = card.breakdown.filter((b) => b.monthlySpend > 0 || b.annualReward > 0);
  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3 font-body text-body-sm text-text-primary">
      <table className="w-full">
        <thead className="text-caption text-text-secondary">
          <tr>
            <th className="text-left font-normal">Category</th>
            <th className="text-right font-normal">You spend /mo</th>
            <th className="text-right font-normal">Rate</th>
            <th className="text-right font-normal">₹ / year</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((b) => (
            <tr key={b.category}>
              <td className="py-1">
                {b.label}
                {b.capApplied ? <span className="ml-1 text-caption text-text-secondary">(capped)</span> : null}
              </td>
              <td className="text-right">{formatInr(b.monthlySpend)}</td>
              <td className="text-right">{b.ratePct}%</td>
              <td className="text-right font-semibold">{formatInr(b.annualReward)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {card.milestoneValue ? <p>Milestone benefits: {formatInr(card.milestoneValue)} a year</p> : null}
      <p>
        {card.flags.lifetimeFree
          ? "No joining or annual fee, ever."
          : `Renewal fee ${formatInr(card.fee.annualFee)} incl. GST${
              card.fee.waiverSpend !== null
                ? `, waived at ${formatInr(card.fee.waiverSpend)} a year (your answers: ${formatInr(card.fee.qualifyingSpend)}, so ${card.fee.waived ? "waived" : "not waived"})`
                : ""
            }.`}
      </p>
      <p className="font-semibold">
        Ongoing: {formatInr(card.rewards)} − {formatInr(card.fee.payable)} = {formatInr(card.ongoingValue)} a year · Year 1:{" "}
        {formatInr(card.year1Value)}
      </p>
      <p className="text-text-secondary">{card.eligibilityReason}</p>
      <p className="text-text-secondary">{card.rewardNotes}</p>
      <a href={card.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-link underline">
        Bank&apos;s page · terms checked on {card.sourceUpdatedAt}
      </a>
    </div>
  );
}

function CardRow({ card, onToggleHeld }: { card: ScoredCardV2; onToggleHeld?: (held: boolean) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-lg border border-border bg-bg-surface p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-body text-caption text-text-secondary">
            #{card.rank} · {card.issuer}
          </p>
          <p className="font-body text-body font-semibold text-text-primary">{card.name}</p>
          <p className="mt-1 font-body text-body-sm text-text-secondary">{card.reason}</p>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} className="shrink-0 text-right" aria-expanded={open}>
          <span className="block font-display text-h2 font-bold text-text-primary">{formatInr(card.ongoingValue)}</span>
          <span className="block font-body text-caption text-link">{open ? "Hide the math" : "See the math"}</span>
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <Flags card={card} />
        {onToggleHeld ? (
          <label className="flex items-center gap-2 font-body text-body-sm text-text-primary">
            <input type="checkbox" checked={card.flags.held} onChange={(e) => onToggleHeld(e.target.checked)} />I have this card
          </label>
        ) : null}
      </div>
      {open ? <TheMath card={card} /> : null}
    </li>
  );
}

export function ResultsV2({
  result,
  explanation,
  emberStep,
  limit,
  onToggleHeld,
}: {
  result: RecommendationResult;
  explanation: string | null;
  emberStep?: string | null;
  limit?: number;
  onToggleHeld?: (cardId: string, held: boolean) => void;
}) {
  const [top, ...rest] = result.ranked;
  const shown = limit ? rest.slice(0, limit - 1) : rest;
  const leaking = result.leakage.hasCards && !result.leakage.holdsBest && result.leakage.amount > 0;

  return (
    <div className="flex flex-col gap-4">
      <p className={`rounded-md border-l-4 bg-bg-surface-2 p-4 font-body text-body font-semibold text-text-primary ${leaking ? "border-danger" : "border-success"}`}>
        {result.leakage.message}
      </p>
      {top ? (
        <section className="rounded-lg border-2 border-ember bg-bg-surface p-5" aria-label="Ember's pick">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-ember px-3 py-1 font-body text-caption font-semibold text-on-ember">EMBER&apos;S PICK</span>
            <span className="font-body text-caption text-text-secondary">{top.issuer}</span>
          </div>
          <h3 className="mt-3 font-display text-h2 font-bold text-text-primary">{top.name}</h3>
          <p className="font-display text-display font-extrabold text-ember-text">
            {formatInr(top.ongoingValue)}
            <span className="font-body text-body font-normal text-text-secondary"> / yr</span>
          </p>
          <p className="font-body text-body-sm text-text-secondary">Year 1: {formatInr(top.year1Value)}</p>
          <p className="mt-3 whitespace-pre-line font-body text-body text-text-primary">{explanation ?? top.reason}</p>
          {!explanation && emberStep ? <p className="mt-1 font-body text-body-sm text-ember-text">Ember: {emberStep}…</p> : null}
          <div className="mt-2">
            <Flags card={top} />
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer font-body text-body-sm font-semibold text-link">See the math</summary>
            <TheMath card={top} />
          </details>
          {onToggleHeld ? (
            <label className="mt-3 flex items-center gap-2 font-body text-body-sm text-text-primary">
              <input type="checkbox" checked={top.flags.held} onChange={(e) => onToggleHeld(top.cardId, e.target.checked)} />I have this card
            </label>
          ) : null}
        </section>
      ) : null}
      <ul className="flex flex-col gap-3">
        {shown.map((c) => (
          <CardRow key={c.cardId} card={c} onToggleHeld={onToggleHeld ? (held) => onToggleHeld(c.cardId, held) : undefined} />
        ))}
      </ul>
      <p className="font-body text-caption text-text-secondary">
        Ranked from {result.catalogue.verified} cards whose terms PERQ checked on the banks&apos; own pages ({result.catalogue.checkedOn}). Fees include 18% GST.
        Ranking uses only your answers and card terms; no bank pays for placement.
      </p>
    </div>
  );
}
