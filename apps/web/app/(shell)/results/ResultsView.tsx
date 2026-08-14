"use client";

import { useMemo, useState } from "react";
import type { QuizAnswers } from "@perq/scoring-engine";
import type { ResultsCard } from "./types";
import {
  emptyFilters,
  filterCards,
  sortCards,
  type AnnualFeeBucket,
  type ResultsFilters,
  type SortMode,
} from "./filterAndSort";
import { Chat } from "./Chat";
import { EditProfilePanel } from "./EditProfilePanel";
import { ResultCard } from "./ResultCard";
import { DarkModeToggle } from "./DarkModeToggle";

const ANNUAL_FEE_BUCKETS: { key: AnnualFeeBucket; label: string }[] = [
  { key: "free", label: "Free (₹0)" },
  { key: "under1000", label: "Under ₹1,000" },
  { key: "1000plus", label: "₹1,000+" },
];

const NETWORKS: { value: string; label: string }[] = [
  { value: "Visa", label: "Visa" },
  { value: "Mastercard", label: "Mastercard" },
  { value: "Amex", label: "American Express" },
  { value: "RuPay", label: "RuPay" },
];

const REWARD_TYPES: { key: string; label: string }[] = [
  { key: "general", label: "Cashback" },
  { key: "travel", label: "Travel points" },
  { key: "fuel", label: "Fuel surcharge waiver" },
];

const SORT_TABS: [SortMode, string][] = [
  ["best-match", "Best Match"],
  ["lowest-fee", "Lowest Fee"],
  ["highest-rewards", "Highest Rewards"],
];

export function ResultsView({ cards, answers }: { cards: ResultsCard[]; answers: QuizAnswers }) {
  const [filters, setFilters] = useState(emptyFilters());
  const [sortMode, setSortMode] = useState<SortMode>("best-match");
  const [arsenal, setArsenal] = useState<Record<string, "held" | "not_held" | undefined>>(
    Object.fromEntries(cards.map((c) => [c.cardId, c.arsenalStatus]))
  );
  const [pendingCardId, setPendingCardId] = useState<string | null>(null);
  // DR8: below 768px, the sidebar becomes a "Filters" button opening a
  // bottom-sheet drawer instead — irrelevant at md+ where the aside is
  // always visible inline, so this state simply has no effect there.
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  const activeFilterCount =
    filters.networks.size +
    filters.issuers.size +
    filters.categories.size +
    filters.annualFeeBuckets.size +
    (filters.showHeldOnly ? 1 : 0);

  const cardOptions = useMemo(
    () => cards.map((c) => ({ value: c.cardId, label: `${c.issuer} ${c.name}` })),
    [cards]
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Desktop: always-visible sidebar (DR8 — unaffected below md, where
          it's hidden in favor of the drawer). */}
      <aside
        className="hidden shrink-0 border-r border-border p-6 md:block md:w-64"
        style={{ backgroundColor: "var(--bg-surface)" }}
      >
        <PerqWordmark />
        <FiltersPanel
          filters={filters}
          setFilters={setFilters}
          issuers={issuers}
          hasHeldCards={hasHeldCards}
        />
      </aside>

      <main className="flex-1 space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-display font-bold text-text-primary">
              {sorted.length} cards matched
            </h1>
            <p className="mt-1 font-body text-body text-text-secondary">
              Ranked by MIMIR for your spending profile
            </p>
          </div>
          <DarkModeToggle />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2" role="tablist">
            {SORT_TABS.map(([mode, label]) => (
              <button
                key={mode}
                role="tab"
                aria-selected={sortMode === mode}
                onClick={() => setSortMode(mode)}
                className="rounded-full px-4 py-1.5 font-body text-body-sm font-semibold"
                style={
                  sortMode === mode
                    ? { backgroundColor: "var(--text-primary)", color: "var(--bg-base)" }
                    : { border: "1px solid var(--border)", color: "var(--text-secondary)" }
                }
              >
                {label}
              </button>
            ))}
          </div>

          {/* DR8: mobile-only "Filters" button, opens the bottom-sheet drawer. */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="rounded-md border border-border px-3 py-1.5 font-body text-body-sm text-text-primary md:hidden"
          >
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
        </div>

        <EditProfilePanel answers={answers} cardOptions={cardOptions} />

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
              <div>
                <p className="mb-3 flex items-center gap-1.5 font-body text-caption font-semibold uppercase tracking-wide text-accent">
                  <span aria-hidden="true">✦</span> MIMIR&apos;s Top Pick
                </p>
                <ResultCard
                  card={topPick}
                  pending={pendingCardId === topPick.cardId}
                  onToggleArsenal={toggleArsenal}
                  isTopPick
                />
              </div>
            )}

            {listCards.length > 0 && (
              <div>
                <p className="mb-3 font-body text-caption font-semibold uppercase tracking-wide text-text-secondary">
                  More Matches
                </p>
                <ul className="space-y-4">
                  {listCards.map((card) => (
                    <li key={card.cardId}>
                      <ResultCard
                        card={card}
                        pending={pendingCardId === card.cardId}
                        onToggleArsenal={toggleArsenal}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <Chat />
      </main>

      {/* DR8: mobile bottom-sheet drawer. md:hidden keeps this entirely out
          of the desktop layout regardless of drawerOpen. */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-label="Filters"
            className="absolute inset-x-0 bottom-0 overflow-y-auto rounded-t-lg p-4"
            style={{ height: "80vh", backgroundColor: "var(--bg-base)" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-h2 text-text-primary">Filters</h2>
              <button
                onClick={() => setDrawerOpen(false)}
                className="rounded-md border border-border px-3 py-1.5 font-body text-body-sm text-text-primary"
              >
                Done
              </button>
            </div>
            <FiltersPanel
              filters={filters}
              setFilters={setFilters}
              issuers={issuers}
              hasHeldCards={hasHeldCards}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PerqWordmark() {
  return <p className="mb-6 font-display text-h1 font-bold text-text-primary">PERQ</p>;
}

function toggleSetMember<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function FilterGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 font-body text-caption font-semibold uppercase tracking-wide text-text-secondary">
      {children}
    </h2>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-2 py-1 font-body text-body ${
        disabled ? "text-text-secondary" : "text-text-primary"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="h-4 w-4 rounded accent-[var(--accent)]"
      />
      {label}
    </label>
  );
}

function FiltersPanel({
  filters,
  setFilters,
  issuers,
  hasHeldCards,
}: {
  filters: ResultsFilters;
  setFilters: (updater: (f: ResultsFilters) => ResultsFilters) => void;
  issuers: string[];
  hasHeldCards: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <FilterGroupLabel>Annual Fee</FilterGroupLabel>
        {ANNUAL_FEE_BUCKETS.map((bucket) => (
          <CheckboxRow
            key={bucket.key}
            label={bucket.label}
            checked={filters.annualFeeBuckets.has(bucket.key)}
            onChange={() =>
              setFilters((f) => ({
                ...f,
                annualFeeBuckets: toggleSetMember(f.annualFeeBuckets, bucket.key),
              }))
            }
          />
        ))}
      </div>

      <div className="border-t border-border pt-6">
        <FilterGroupLabel>Network</FilterGroupLabel>
        {NETWORKS.map((network) => (
          <CheckboxRow
            key={network.value}
            label={network.label}
            checked={filters.networks.has(network.value)}
            onChange={() =>
              setFilters((f) => ({ ...f, networks: toggleSetMember(f.networks, network.value) }))
            }
          />
        ))}
      </div>

      <div className="border-t border-border pt-6">
        <FilterGroupLabel>Reward Type</FilterGroupLabel>
        {REWARD_TYPES.map((tag) => (
          <CheckboxRow
            key={tag.key}
            label={tag.label}
            checked={filters.categories.has(tag.key)}
            onChange={() =>
              setFilters((f) => ({ ...f, categories: toggleSetMember(f.categories, tag.key) }))
            }
          />
        ))}
      </div>

      <div className="border-t border-border pt-6">
        <FilterGroupLabel>Issuer</FilterGroupLabel>
        {issuers.map((issuer) => (
          <CheckboxRow
            key={issuer}
            label={issuer}
            checked={filters.issuers.has(issuer)}
            onChange={() =>
              setFilters((f) => ({ ...f, issuers: toggleSetMember(f.issuers, issuer) }))
            }
          />
        ))}
      </div>

      <div className="border-t border-border pt-6">
        {/* DR3: disabled-with-helper-text empty arsenal state, not hidden */}
        <CheckboxRow
          label="Show cards I already hold"
          checked={filters.showHeldOnly}
          disabled={!hasHeldCards}
          onChange={() => setFilters((f) => ({ ...f, showHeldOnly: !f.showHeldOnly }))}
        />
        {!hasHeldCards && (
          <p className="mt-1 font-body text-caption text-text-secondary">
            Add a card from your results below to start building your arsenal.
          </p>
        )}
      </div>
    </div>
  );
}
