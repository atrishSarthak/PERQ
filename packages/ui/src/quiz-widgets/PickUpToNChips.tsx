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
}

/**
 * DR1 widget 3/4: pick-up-to-N-chips — Q13 (top priority, up to 2). Chips
 * disable once max is reached, except already-selected ones (which stay
 * togglable so the user can swap a pick without deselecting first).
 */
export function PickUpToNChips({ options, value, onChange, max, name }: PickUpToNChipsProps) {
  const atMax = value.length >= max;

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
    </div>
  );
}
