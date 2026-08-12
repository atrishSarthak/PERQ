export interface ScaleOption {
  value: string;
  label: string;
}

export interface SingleSelectScaleProps {
  options: ScaleOption[];
  value: string | null;
  onChange: (value: string) => void;
  name: string;
}

/**
 * DR1 widget 2/4: single-select-scale — Q2/Q3/Q4/Q6-Q10/Q12 (income
 * bracket, flight/hotel frequency, spend buckets, fee tolerance). A row of
 * selectable buttons, not a native <select> — keeps every option visible
 * at once (billboard design: scan, don't hunt in a dropdown) and each
 * option is independently focusable/keyboard-operable (DR10).
 */
export function SingleSelectScale({ options, value, onChange, name }: SingleSelectScaleProps) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className="rounded-md border px-4 py-2 font-body text-body"
          style={{
            borderColor: "var(--border)",
            backgroundColor: value === opt.value ? "var(--accent)" : "var(--bg-base)",
            color: value === opt.value ? "#fff" : "var(--text-primary)",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
