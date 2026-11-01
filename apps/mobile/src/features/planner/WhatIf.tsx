import { useState } from "react";
import { View } from "react-native";
import { formatDay, formatInr } from "@perq/finance-engine";
import { parseRupeeInput, type PlanDetailResponse, type PlanResult, type PlanWhatIfRequest } from "@perq/shared";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Text } from "@/components/Text";
import { TextField } from "@/components/TextField";
import { useTheme } from "@/theme/ThemeProvider";
import { Chip } from "./PlanForm";

// What if… (§9): try another card, day, EMI or price on fresh numbers.
// Nothing is saved until the user keeps the version.

export type WhatIfChanges = PlanWhatIfRequest["changes"];

export function whatIfChips(plan: PlanDetailResponse, r: PlanResult): { label: string; changes: WhatIfChanges }[] {
  const rec = r.recommended;
  const out: { label: string; changes: WhatIfChanges }[] = [];
  if (rec.kind !== "upi") out.push({ label: "Pay by UPI", changes: { cardAccountId: "upi" } });
  if (rec.kind === "card_full" && rec.cardAccountId && rec.purchaseDate !== r.asOf) out.push({ label: "Buy today instead", changes: { cardAccountId: rec.cardAccountId, purchaseDate: r.asOf } });
  const seen = new Set([rec.cardAccountId]);
  for (const o of r.options) {
    if (o.kind !== "card_full" || !o.cardAccountId || seen.has(o.cardAccountId)) continue;
    seen.add(o.cardAccountId);
    out.push({ label: `Use my ${o.label}`, changes: { cardAccountId: o.cardAccountId } });
  }
  const tenures = [...new Set(plan.plan.input.emiOptions.map((e) => e.tenureMonths))];
  for (const n of tenures) if (!(rec.kind === "card_emi" && rec.emi?.tenureMonths === n)) out.push({ label: `EMI for ${n} months`, changes: { emiTenure: n } });
  return out;
}

export function WhatIfPanel({ plan, result, onRun, busy, error }: { plan: PlanDetailResponse; result: PlanResult; onRun: (c: WhatIfChanges, label: string) => void; busy: boolean; error: string | null }) {
  const t = useTheme();
  const [price, setPrice] = useState("");
  const parsed = parseRupeeInput(price);
  return (
    <Card>
      <Text variant="heading">What if…</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing[2] }}>
        {whatIfChips(plan, result).map((c) => (
          <Chip key={c.label} label={c.label} selected={false} onPress={() => !busy && onRun(c.changes, c.label)} />
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: t.spacing[2], alignItems: "flex-end" }}>
        <TextField label="A different price" value={price} onChangeText={setPrice} keyboardType="number-pad" placeholder="₹" style={{ flex: 1 }} />
        <Button
          label="Try"
          kind="secondary"
          disabled={!parsed || busy}
          onPress={() => parsed && onRun({ price: parsed }, `At ${formatInr(parsed)}`)}
        />
      </View>
      {busy ? (
        <Text variant="small" tone="muted">
          Working it out…
        </Text>
      ) : null}
      {error ? (
        <Text variant="small" tone="danger">
          {error}
        </Text>
      ) : null}
      <Text variant="caption" tone="muted">
        Uses your numbers as of {formatDay(result.asOf)}. Nothing changes until you keep a version.
      </Text>
    </Card>
  );
}
