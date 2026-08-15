"use client";

import { useEffect, useMemo, useState } from "react";
import { Skeleton } from "@perq/ui";
import { MiniCardVisual } from "./MiniCardVisual";

export interface CardSearchOption {
  value: string;
  label: string; // "{issuer} {name}" — what search matches against
  name: string;
  issuer: string;
  network: string;
}

export interface CardSearchFieldProps {
  options: CardSearchOption[];
  value: string[];
  onChange: (value: string[]) => void;
  name: string;
  emptyOptionLabel: string; // "I don't have any yet"
}

const SEARCH_DEBOUNCE_MS = 300;

interface WebFoundCard {
  id: string;
  name: string;
  issuer: string;
  network: string;
}

/**
 * Q1's CARD SEARCH widget (Task 1 spec) — debounced local filter over the
 * ~100-120 card database, rendered as selectable mini card-visual tiles; a
 * web-search fallback when nothing local matches, offering the found card
 * as a clearly "limited data" add-anyway option. Replaces the generic
 * SearchableMultiSelect for this one field in both the quiz and the
 * results-page "Edit my profile" panel — the only question that needs
 * search over a large option set.
 */
export function CardSearchField({
  options,
  value,
  onChange,
  name,
  emptyOptionLabel,
}: CardSearchFieldProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [webSearching, setWebSearching] = useState(false);
  const [webResult, setWebResult] = useState<WebFoundCard | null | "not-found">(null);
  // Ad-hoc cards added via the web-search fallback — not in `options`, so
  // this is the only place their name/issuer/network is known once
  // selected (e.g. needed to keep rendering their tile after the search
  // query is cleared or the user navigates back to this question).
  const [webAddedById, setWebAddedById] = useState<Record<string, WebFoundCard>>({});

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, debouncedQuery]);

  // Local match empty + a real search term => try the web fallback.
  useEffect(() => {
    if (!debouncedQuery || filtered.length > 0) {
      setWebSearching(false);
      setWebResult(null);
      return;
    }
    let cancelled = false;
    setWebSearching(true);
    setWebResult(null);
    fetch("/api/quiz/card-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: debouncedQuery }),
    })
      .then((res) => (res.ok ? res.json() : { card: null }))
      .then((data: { card: WebFoundCard | null }) => {
        if (cancelled) return;
        setWebResult(data.card ?? "not-found");
      })
      .catch(() => {
        if (!cancelled) setWebResult("not-found");
      })
      .finally(() => {
        if (!cancelled) setWebSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, filtered.length]);

  function toggle(cardId: string) {
    onChange(value.includes(cardId) ? value.filter((v) => v !== cardId) : [...value, cardId]);
  }

  function addWebResult(card: WebFoundCard) {
    setWebAddedById((prev) => ({ ...prev, [card.id]: card }));
    onChange([...value, card.id]);
  }

  const selectedWebCards = value
    .map((id) => webAddedById[id])
    .filter((c): c is WebFoundCard => Boolean(c));

  return (
    <div aria-label={name} className="space-y-3">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search cards…"
        className="w-full rounded-md border px-3 py-2 font-body text-body text-text-primary"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-base)" }}
      />
      <button
        type="button"
        onClick={() => onChange([])}
        className="rounded-md border px-3 py-1.5 font-body text-body-sm"
        style={{
          borderColor: "var(--border)",
          backgroundColor: value.length === 0 ? "var(--accent)" : "var(--bg-base)",
          color: value.length === 0 ? "#fff" : "var(--text-primary)",
        }}
      >
        {emptyOptionLabel}
      </button>

      {/* Already-selected ad-hoc (web-found) cards stay visible even once
          the search query that found them is cleared. */}
      {selectedWebCards.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {selectedWebCards.map((card) => (
            <CardTile
              key={card.id}
              card={card}
              selected
              limitedData
              onClick={() => toggle(card.id)}
            />
          ))}
        </div>
      )}

      <div className="max-h-72 overflow-y-auto">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {filtered.map((opt) => (
            <CardTile
              key={opt.value}
              card={{ name: opt.name, issuer: opt.issuer, network: opt.network }}
              selected={value.includes(opt.value)}
              onClick={() => toggle(opt.value)}
            />
          ))}
        </div>

        {debouncedQuery && filtered.length === 0 && (
          <div className="mt-3">
            {webSearching ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Skeleton radius="md" className="aspect-[1.75/1] w-full" />
              </div>
            ) : webResult && webResult !== "not-found" && !webAddedById[webResult.id] ? (
              <div>
                <p className="mb-2 font-body text-body-sm text-text-secondary">
                  Not in our database yet — found this on the web:
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <CardTile
                    card={webResult}
                    selected={false}
                    limitedData
                    onClick={() => addWebResult(webResult)}
                    actionLabel="Add anyway"
                  />
                </div>
              </div>
            ) : webResult === "not-found" ? (
              <p className="font-body text-body-sm text-text-secondary">
                No matching card found — try a different search.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function CardTile({
  card,
  selected,
  limitedData,
  onClick,
  actionLabel,
}: {
  card: { name: string; issuer: string; network: string };
  selected: boolean;
  limitedData?: boolean;
  onClick: () => void;
  actionLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className="relative rounded-md text-left outline-none"
      style={{
        boxShadow: selected ? "0 0 0 2px var(--accent)" : "0 0 0 1px var(--border)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <MiniCardVisual issuer={card.issuer} network={card.network} name={card.name} />
      {selected && (
        <span
          aria-hidden="true"
          className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: "var(--accent)" }}
        >
          ✓
        </span>
      )}
      {limitedData && (
        <span
          className="absolute bottom-1.5 left-1.5 rounded px-1.5 py-0.5 font-body text-[9px] font-semibold uppercase tracking-wide text-white"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
        >
          Limited data
        </span>
      )}
      {actionLabel && (
        <p className="mt-1 font-body text-caption font-semibold text-accent">{actionLabel}</p>
      )}
    </button>
  );
}
