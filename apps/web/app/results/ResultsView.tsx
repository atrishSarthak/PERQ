"use client";

import { useMemo, useState } from "react";
import type { ResultsCard } from "./types";
import { emptyFilters, filterCards, sortCards, type SortMode } from "./filterAndSort";
import { Chat } from "./Chat";

const NETWORKS = ["Visa", "Mastercard", "RuPay", "Amex"];
const CATEGORY_TAGS: { key: string; label: string }[] = [
  { key: "travel", label: "Travel" },
  { key: "general", label: "Cashback" },
  { key: "dining", label: "Dining" },
  { key: "fuel", label: "Fuel" },
  { key: "ecommerce", label: "Shopping" },
];

export function ResultsView({ cards }: { cards: ResultsCard[] }) {
  const [filters, setFilters] = useState(emptyFilters());
  const [sortMode, setSortMode] = useState<SortMode>("best-match");
  const [arsenal, setArsenal] = useState<Record<string, "held" | "not_held" | undefined>>(
    Object.fromEntries(cards.map((c) => [c.cardId, c.arsenalStatus]))
  );
  const [pendingCardId, setPendingCardId] = useState<string | null>(null);

  const issuers = useMemo(() => [...new Set(cards.map((c) => c.issuer))].sort(), [cards]);
  const hasHeldCards = useMemo(() => Object.values(arsenal).some((s) => s === "held"), [arsenal]);

  const cardsWithArsenal = useMemo(
    () => cards.map((c) => ({ ...c, arsenalStatus: arsenal[c.cardId] })),
    [cards, arsenal]
  );

  const filtered = useMemo(
    () => filterCards(cardsWithArsenal, filters),
    [cardsWithArsenal, filters]
  );
  const sorted = useMemo(() => sortCards(filtered, sortMode), [filtered, sortMode]);

  const topPick = sortMode === "best-match" ? sorted[0] : undefined;
  const listCards = topPick ? sorted.slice(1) : sorted;

  async function toggleArsenal(cardId: string, next: "held" | "not_held") {
    setPendingCardId(cardId);
    setArsenal((prev) => ({ ...prev, [cardId]: next }));
    try {
      const res = await fetch("/api/arsenal/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, status: next }),
      });
      if (!res.ok) throw new Error("toggle failed");
    } catch {
      // revert on failure — never leave the UI claiming a state the
      // server didn't confirm
      setArsenal((prev) => ({ ...prev, [cardId]: next === "held" ? "not_held" : "held" }));
    } finally {
      setPendingCardId(null);
    }
  }

  function toggleSetMember(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  return (
    <div className="flex min-h-screen flex-col gap-6 p-6 md:flex-row">
      <aside className="w-full shrink-0 space-y-6 md:w-64">
        <div>
          <h2 className="mb-2 font-body text-body-sm font-semibold text-text-primary">
            Network
          </h2>
          <div className="flex flex-wrap gap-2">
            {NETWORKS.map((n) => (
              <button
                key={n}
                onClick={() =>
                  setFilters((f) => ({ ...f, networks: toggleSetMember(f.networks, n) }))
                }
                className={`rounded-md border border-border px-2 py-1 text-body-sm ${
                  filters.networks.has(n) ? "bg-accent text-white" : "text-text-secondary"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-2 font-body text-body-sm font-semibold text-text-primary">
            Issuer
          </h2>
          <div className="flex flex-wrap gap-2">
            {issuers.map((issuer) => (
              <button
                key={issuer}
                onClick={() =>
                  setFilters((f) => ({ ...f, issuers: toggleSetMember(f.issuers, issuer) }))
                }
                className={`rounded-md border border-border px-2 py-1 text-body-sm ${
                  filters.issuers.has(issuer) ? "bg-accent text-white" : "text-text-secondary"
                }`}
              >
                {issuer}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-2 font-body text-body-sm font-semibold text-text-primary">
            Category
          </h2>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_TAGS.map((tag) => (
              <button
                key={tag.key}
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    categories: toggleSetMember(f.categories, tag.key),
                  }))
                }
                className={`rounded-md border border-border px-2 py-1 text-body-sm ${
                  filters.categories.has(tag.key) ? "bg-accent text-white" : "text-text-secondary"
                }`}
              >
                {tag.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-body-sm text-text-primary">
          <input
            type="checkbox"
            checked={filters.zeroFeeOnly}
            onChange={(e) => setFilters((f) => ({ ...f, zeroFeeOnly: e.target.checked }))}
          />
          ₹0 joining fee only
        </label>

        {/* DR3: disabled-with-helper-text empty arsenal state, not hidden */}
        <label
          className={`flex items-center gap-2 text-body-sm ${
            hasHeldCards ? "text-text-primary" : "text-text-secondary"
          }`}
        >
          <input
            type="checkbox"
            disabled={!hasHeldCards}
            checked={filters.showHeldOnly}
            onChange={(e) => setFilters((f) => ({ ...f, showHeldOnly: e.target.checked }))}
          />
          Show cards I already hold
        </label>
        {!hasHeldCards && (
          <p className="text-caption text-text-secondary">
            Add a card from your results below to start building your arsenal.
          </p>
        )}
      </aside>

      <main className="flex-1 space-y-6">
        <div className="flex gap-2" role="tablist">
          {(
            [
              ["best-match", "Best Match"],
              ["lowest-fee", "Lowest Fee"],
              ["highest-rewards", "Highest Rewards"],
            ] as [SortMode, string][]
          ).map(([mode, label]) => (
            <button
              key={mode}
              role="tab"
              aria-selected={sortMode === mode}
              onClick={() => setSortMode(mode)}
              className={`rounded-md px-3 py-1.5 font-body text-body-sm ${
                sortMode === mode
                  ? "bg-accent text-white"
                  : "border border-border text-text-secondary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {sorted.length === 0 ? (
          // DR4: inline message + one-click clear-filters, list stays in place
          <div className="rounded-lg border border-border bg-bg-surface p-6 text-center">
            <p className="mb-3 font-body text-body text-text-primary">
              No cards match these filters.
            </p>
            <button
              onClick={() => setFilters(emptyFilters())}
              className="rounded-md bg-accent px-3 py-1.5 font-body text-body-sm text-white"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            {topPick && (
              <CardRow
                card={topPick}
                pending={pendingCardId === topPick.cardId}
                onToggleArsenal={toggleArsenal}
                isTopPick
              />
            )}
            <ul className="space-y-3">
              {listCards.map((card) => (
                <li key={card.cardId}>
                  <CardRow
                    card={card}
                    pending={pendingCardId === card.cardId}
                    onToggleArsenal={toggleArsenal}
                  />
                </li>
              ))}
            </ul>
          </>
        )}

        <Chat />
      </main>
    </div>
  );
}

function CardRow({
  card,
  pending,
  onToggleArsenal,
  isTopPick,
}: {
  card: ResultsCard;
  pending: boolean;
  onToggleArsenal: (cardId: string, next: "held" | "not_held") => void;
  isTopPick?: boolean;
}) {
  const held = card.arsenalStatus === "held";

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        // DR6: held cards get a subtle bg-surface tint, locked tokens only.
        // Top Pick is visually distinct (border weight) but deliberately
        // NOT ad-styled — no badge, no highlight color.
        backgroundColor: held ? "var(--bg-surface)" : "var(--bg-base)",
        borderColor: "var(--border)",
        borderWidth: isTopPick ? 2 : 1,
      }}
    >
      {isTopPick && (
        <p className="mb-1 font-display text-body-sm text-accent">MIMIR&apos;s Top Pick</p>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-body text-body font-semibold text-text-primary">
            {card.issuer} {card.name}
          </p>
          <p className="font-body text-body-sm text-text-secondary">
            {card.recommendation?.explanation ?? "Not yet scored for your profile."}
          </p>
          <p className="mt-1 font-body text-caption text-text-secondary">
            Annual fee: ₹{card.annualFee}
          </p>
        </div>
        <button
          disabled={pending}
          onClick={() => onToggleArsenal(card.cardId, held ? "not_held" : "held")}
          className="shrink-0 rounded-md border border-border px-2 py-1 text-body-sm text-text-primary disabled:opacity-50"
        >
          {held ? "✓ In My Arsenal" : "Add to My Arsenal"}
        </button>
      </div>
    </div>
  );
}
