import { useMemo, useState } from "react";

export interface MultiSelectOption {
  value: string;
  label: string;
}

export interface SearchableMultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  name: string;
  emptyOptionLabel: string; // "I don't have any yet" (Q1)
}

/**
 * DR1 widget 1/4: searchable-multi-select — Q1 (which cards do you hold),
 * the only question needing search over a large option set (the full card
 * database). A dedicated "I don't have any yet" action clears the
 * selection rather than being just another list item, since it's a
 * distinct state (empty arsenal, DR3), not one card among many.
 */
export function SearchableMultiSelect({
  options,
  value,
  onChange,
  name,
  emptyOptionLabel,
}: SearchableMultiSelectProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function toggle(optValue: string) {
    onChange(value.includes(optValue) ? value.filter((v) => v !== optValue) : [...value, optValue]);
  }

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
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {filtered.map((opt) => {
          const selected = value.includes(opt.value);
          return (
            <li key={opt.value}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => toggle(opt.value)}
                className="w-full rounded-md border px-3 py-2 text-left font-body text-body"
                style={{
                  borderColor: "var(--border)",
                  backgroundColor: selected ? "var(--bg-surface)" : "var(--bg-base)",
                  color: "var(--text-primary)",
                }}
              >
                {selected ? "✓ " : ""}
                {opt.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
