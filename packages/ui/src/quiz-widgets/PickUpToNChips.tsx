export interface ChipOption {
  value: string;
  label: string;
}

export interface PickUpToNChipsProps {
  options: ChipOption[];
  value: string[];
  onChange: (value: string[]) => void;
  max: number;
  name: string;
  // Q13's "No strong preference" — same "empty selection is itself a valid,
  // explicit answer" pattern as SearchableMultiSelect's emptyOptionLabel
  // (Q1's "I don't have any yet"): clicking it clears the selection, and it
  // reads as selected whenever the array is empty. No sentinel value is
  // added to `value` — priorityCategories stays SpendCategory[], never
  // gains a fake "none" category.
  noneOption?: ChipOption;
}

/**
 * DR1 widget 3/4: pick-up-to-N-chips — Q13 (top priority, up to 2). Chips
 * disable once max is reached, except already-selected ones (which stay
 * togglable so the user can swap a pick without deselecting first).
 */
export function PickUpToNChips({
  options,
  value,
  onChange,
  max,
  name,
  noneOption,
}: PickUpToNChipsProps) {
  const atMax = value.length >= max;
  const noneSelected = value.length === 0;

  function toggle(optValue: string) {
    if (value.includes(optValue)) {
      onChange(value.filter((v) => v !== optValue));
    } else if (!atMax) {
      onChange([...value, optValue]);
    }
  }

  return (
    <div aria-label={name} className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const selected = value.includes(opt.value);
        const disabled = !selected && atMax;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => toggle(opt.value)}
            className="rounded-md border px-3 py-1.5 font-body text-body-sm disabled:opacity-40"
            style={{
              borderColor: "var(--border)",
              backgroundColor: selected ? "var(--accent)" : "var(--bg-base)",
              color: selected ? "#fff" : "var(--text-primary)",
            }}
          >
            {opt.label}
          </button>
        );
      })}
      {noneOption && (
        <button
          type="button"
          aria-pressed={noneSelected}
          onClick={() => onChange([])}
          className="rounded-md border px-3 py-1.5 font-body text-body-sm"
          style={{
            borderColor: "var(--border)",
            backgroundColor: noneSelected ? "var(--accent)" : "var(--bg-base)",
            color: noneSelected ? "#fff" : "var(--text-primary)",
          }}
        >
          {noneOption.label}
        </button>
      )}
    </div>
  );
}
