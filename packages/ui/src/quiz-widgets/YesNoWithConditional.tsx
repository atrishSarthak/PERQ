export interface YesNoWithConditionalValue {
  active: boolean;
  amount: number | null;
}

export interface YesNoWithConditionalProps {
  value: YesNoWithConditionalValue;
  onChange: (value: YesNoWithConditionalValue) => void;
  // Omit for a plain yes/no question with no follow-up amount (Q11) — the
  // conditional input only renders when a label is provided (Q5).
  conditionalLabel?: string;
  name: string;
}

/**
 * DR1 widget 4/4: yes-no-with-conditional — Q5 (gym membership + monthly
 * cost) and Q11 (recurring bills by card, plain yes/no — no conditionalLabel
 * passed, so the amount field never renders; both share the same toggle
 * mechanism per the DR1 mapping).
 */
export function YesNoWithConditional({
  value,
  onChange,
  conditionalLabel,
  name,
}: YesNoWithConditionalProps) {
  return (
    <div aria-label={name} className="space-y-3">
      <div role="radiogroup" className="flex gap-2">
        {[
          { label: "Yes", val: true },
          { label: "No", val: false },
        ].map(({ label, val }) => (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={value.active === val}
            onClick={() => onChange({ active: val, amount: val ? value.amount : null })}
            className="rounded-md border px-4 py-2 font-body text-body"
            style={{
              borderColor: "var(--border)",
              backgroundColor: value.active === val ? "var(--accent)" : "var(--bg-base)",
              color: value.active === val ? "#fff" : "var(--text-primary)",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {value.active && conditionalLabel && (
        <label className="flex flex-col gap-1 font-body text-body-sm text-text-secondary">
          {conditionalLabel}
          <input
            type="number"
            min={0}
            value={value.amount ?? ""}
            onChange={(e) =>
              onChange({ active: true, amount: e.target.value === "" ? null : Number(e.target.value) })
            }
            className="rounded-md border px-3 py-1.5 font-body text-body text-text-primary"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-base)" }}
          />
        </label>
      )}
    </div>
  );
}
