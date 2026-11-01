import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { addDays, formatDay, formatInr } from "@perq/finance-engine";
import {
  inferPlanCategory,
  parseRupeeInput,
  TXN_CATEGORY_LABELS,
  type EmiSpec,
  type OfferSpec,
  type PartialPlanInput,
  type PlanInput,
  type TxnCategory,
} from "@perq/shared";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Segmented } from "@/components/Segmented";
import { Text } from "@/components/Text";
import { TextField } from "@/components/TextField";
import { useTheme } from "@/theme/ThemeProvider";

// Plan input (Step 3 §10.2) and the confirm screen for extracted details
// (§10.3): the same editable fields. Nothing runs until the user taps
// Continue, so the engine only ever sees numbers the user confirmed (§2).

const CATEGORIES: TxnCategory[] = ["online_shopping", "travel", "entertainment", "dining", "groceries", "health", "education", "bills", "fuel", "other"];

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      hitSlop={4}
      style={{
        paddingHorizontal: t.spacing[3],
        paddingVertical: t.spacing[2],
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? t.colors.primary : t.colors.border,
        backgroundColor: selected ? t.colors.surface2 : t.colors.surface,
      }}
    >
      <Text variant="small" tone={selected ? "default" : "muted"}>
        {label}
      </Text>
    </Pressable>
  );
}

const digits = (s: string) => s.replace(/[^\d]/g, "");
const amountText = (n: number | undefined) => (n ? String(n) : "");

function offerLine(o: OfferSpec): string {
  return o.rawText;
}
function emiLine(e: EmiSpec): string {
  const kind = e.noCost ? "No-cost EMI" : `EMI at ${e.interestRatePa}% a year`;
  return `${kind}, ${e.tenureMonths} months${e.processingFee ? `, ${formatInr(e.processingFee)} fee` : ""}${e.bankName ? ` (${e.bankName})` : ""}`;
}

function OfferEditor({ onAdd, onCancel }: { onAdd: (o: OfferSpec) => void; onCancel: () => void }) {
  const t = useTheme();
  const [type, setType] = useState<"instant_discount" | "cashback" | "coupon">("instant_discount");
  const [bank, setBank] = useState("");
  const [mode, setMode] = useState<"flat" | "percent">("flat");
  const [value, setValue] = useState("");
  const [cap, setCap] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [emiOnly, setEmiOnly] = useState(false);
  const n = Number(value.replace(/[^\d.]/g, ""));
  const valid = n > 0 && (mode === "flat" || n <= 100);
  const add = () => {
    const capN = parseRupeeInput(cap) ?? undefined;
    const minN = parseRupeeInput(minOrder) ?? undefined;
    const what = mode === "flat" ? `${formatInr(n)} off` : `${n}% ${type === "cashback" ? "cashback" : "off"}${capN ? ` up to ${formatInr(capN)}` : ""}`;
    const who = bank.trim() ? ` on ${bank.trim()} cards` : "";
    onAdd({
      type,
      ...(bank.trim() ? { bank: bank.trim() } : {}),
      ...(mode === "flat" ? { flat: Math.round(n) } : { percent: n }),
      ...(capN && mode === "percent" ? { maxDiscount: capN } : {}),
      ...(minN ? { minOrder: minN } : {}),
      ...(emiOnly ? { emiOnly: true } : {}),
      rawText: `${type === "coupon" ? "Coupon: " : ""}${what}${who}${minN ? ` on orders over ${formatInr(minN)}` : ""}${emiOnly ? " (EMI only)" : ""}`,
    });
  };
  return (
    <Card>
      <Segmented
        options={[
          { value: "instant_discount", label: "Bank offer" },
          { value: "cashback", label: "Cashback" },
          { value: "coupon", label: "Coupon" },
        ]}
        value={type}
        onChange={setType}
      />
      {type !== "coupon" ? <TextField label="Which bank's cards (leave empty for any)" value={bank} onChangeText={setBank} placeholder="e.g. HDFC" autoCapitalize="characters" /> : null}
      <Segmented options={[{ value: "flat", label: "₹ off" }, { value: "percent", label: "% off" }]} value={mode} onChange={setMode} />
      <TextField label={mode === "flat" ? "Amount (₹)" : "Percent"} value={value} onChangeText={setValue} keyboardType="decimal-pad" />
      {mode === "percent" ? <TextField label="Up to (₹, optional)" value={cap} onChangeText={(s) => setCap(digits(s))} keyboardType="number-pad" /> : null}
      <TextField label="Minimum order (₹, optional)" value={minOrder} onChangeText={(s) => setMinOrder(digits(s))} keyboardType="number-pad" />
      <Chip label="Only when paying by EMI" selected={emiOnly} onPress={() => setEmiOnly((v) => !v)} />
      <View style={{ flexDirection: "row", gap: t.spacing[3] }}>
        <Button label="Add offer" onPress={add} disabled={!valid} style={{ flex: 1 }} />
        <Button label="Cancel" kind="ghost" onPress={onCancel} />
      </View>
    </Card>
  );
}

function EmiEditor({ onAdd, onCancel }: { onAdd: (e: EmiSpec) => void; onCancel: () => void }) {
  const t = useTheme();
  const [tenure, setTenure] = useState(6);
  const [noCost, setNoCost] = useState(true);
  const [rate, setRate] = useState("");
  const [fee, setFee] = useState("");
  const [bank, setBank] = useState("");
  const r = Number(rate.replace(/[^\d.]/g, ""));
  const valid = noCost || (rate.trim() !== "" && r >= 0 && r <= 60);
  return (
    <Card>
      <Text variant="small" tone="muted">
        Months
      </Text>
      <View style={{ flexDirection: "row", gap: t.spacing[2], flexWrap: "wrap" }}>
        {[3, 6, 9, 12, 18, 24].map((m) => (
          <Chip key={m} label={`${m}`} selected={tenure === m} onPress={() => setTenure(m)} />
        ))}
      </View>
      <Segmented options={[{ value: "nocost", label: "No-cost EMI" }, { value: "regular", label: "With interest" }]} value={noCost ? "nocost" : "regular"} onChange={(v) => setNoCost(v === "nocost")} />
      <TextField label={noCost ? "Interest rate (% a year, if shown)" : "Interest rate (% a year)"} value={rate} onChangeText={setRate} keyboardType="decimal-pad" />
      <TextField label="Processing fee (₹, before GST)" value={fee} onChangeText={(s) => setFee(digits(s))} keyboardType="number-pad" />
      <TextField label="Bank (leave empty for any card)" value={bank} onChangeText={setBank} autoCapitalize="characters" />
      <View style={{ flexDirection: "row", gap: t.spacing[3] }}>
        <Button
          label="Add EMI option"
          disabled={!valid}
          style={{ flex: 1 }}
          onPress={() =>
            onAdd({
              tenureMonths: tenure,
              ...(noCost ? { noCost: true } : {}),
              ...(rate.trim() ? { interestRatePa: r } : {}),
              ...(fee ? { processingFee: Number(fee) } : {}),
              ...(bank.trim() ? { bankName: bank.trim() } : {}),
            })
          }
        />
        <Button label="Cancel" kind="ghost" onPress={onCancel} />
      </View>
    </Card>
  );
}

export function PlanForm({
  initial,
  today,
  confirming,
  notes,
  onContinue,
  extra,
}: {
  initial: PartialPlanInput;
  /** IST day (the server's, so demo time travel applies). */
  today: string;
  /** Details came from a screenshot or chat: say so and ask the user to check them. */
  confirming?: boolean;
  notes?: string[];
  onContinue: (input: PlanInput) => void;
  /** Screenshot / link buttons, shown under the price. */
  extra?: React.ReactNode;
}) {
  const t = useTheme();
  const [name, setName] = useState(initial.item?.name ?? "");
  const [category, setCategory] = useState<TxnCategory>(initial.item?.category ?? (initial.item?.name ? inferPlanCategory(initial.item.name) : "online_shopping"));
  const [categoryTouched, setCategoryTouched] = useState(!!initial.item?.category);
  const [price, setPrice] = useState(amountText(initial.price));
  const [merchant, setMerchant] = useState(initial.merchant ?? "");
  const [needBy, setNeedBy] = useState<string | null>(initial.needBy ?? null);
  const [offers, setOffers] = useState<OfferSpec[]>(initial.offers ?? []);
  const [emis, setEmis] = useState<EmiSpec[]>(initial.emiOptions ?? []);
  const [open, setOpen] = useState(offers.length > 0 || emis.length > 0);
  const [adding, setAdding] = useState<"offer" | "emi" | null>(null);

  const priceN = parseRupeeInput(price);
  const ready = name.trim().length > 0 && !!priceN && priceN <= 10_000_000;
  const needByChoices = useMemo(
    () => [
      { label: "No date", value: null },
      { label: "This week", value: addDays(today, 7) },
      { label: "In 2 weeks", value: addDays(today, 14) },
      { label: "This month", value: `${today.slice(0, 8)}${String(new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate()).padStart(2, "0")}` },
      { label: "In a month", value: addDays(today, 30) },
    ],
    [today]
  );

  const submit = () => {
    if (!ready) return;
    onContinue({
      item: { name: name.trim(), category },
      price: priceN!,
      ...(merchant.trim() ? { merchant: merchant.trim() } : {}),
      ...(needBy ? { needBy } : {}),
      offers,
      emiOptions: emis,
    });
  };

  return (
    <View style={{ gap: t.spacing[4] }}>
      {confirming ? (
        <Card style={{ borderColor: t.colors.ember }}>
          <Text variant="bodyStrong">Check these before Ember plans</Text>
          <Text variant="small" tone="muted">
            I read these from what you shared. Fix anything that's wrong; I'll only use what you confirm.
          </Text>
          {notes?.map((n) => (
            <Text key={n} variant="small" tone="muted">
              · {n}
            </Text>
          ))}
        </Card>
      ) : null}

      <TextField
        label="What are you buying?"
        value={name}
        onChangeText={(s) => {
          setName(s);
          if (!categoryTouched) setCategory(inferPlanCategory(s));
        }}
        placeholder="e.g. iPhone 15"
        maxLength={120}
      />

      <View style={{ gap: t.spacing[2] }}>
        <TextField
          label="Price (₹)"
          value={price}
          onChangeText={(s) => setPrice(digits(s))}
          keyboardType="number-pad"
          placeholder="0"
          style={{ fontSize: 34, minHeight: 64, fontFamily: t.fonts.displayExtra }}
        />
        {priceN ? (
          <Text variant="small" tone="muted">
            {formatInr(priceN)}
          </Text>
        ) : null}
      </View>

      {extra}

      <View style={{ gap: t.spacing[2] }}>
        <Text variant="small" tone="muted">
          Category
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.spacing[2] }}>
          {CATEGORIES.map((c) => (
            <Chip
              key={c}
              label={TXN_CATEGORY_LABELS[c]}
              selected={category === c}
              onPress={() => {
                setCategory(c);
                setCategoryTouched(true);
              }}
            />
          ))}
        </ScrollView>
      </View>

      <TextField label="Shop (optional)" value={merchant} onChangeText={setMerchant} placeholder="e.g. Flipkart" maxLength={80} />

      <View style={{ gap: t.spacing[2] }}>
        <Text variant="small" tone="muted">
          Need it by (optional){needBy ? ` · ${formatDay(needBy)}` : ""}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing[2] }}>
          {needByChoices.map((c) => (
            <Chip key={c.label} label={c.label} selected={needBy === c.value} onPress={() => setNeedBy(c.value)} />
          ))}
        </View>
      </View>

      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Text variant="bodyStrong" tone="link">
          {open ? "▾" : "▸"} Offers and EMI{offers.length + emis.length ? ` (${offers.length + emis.length})` : ""}
        </Text>
      </Pressable>
      {open ? (
        <View style={{ gap: t.spacing[3] }}>
          {offers.map((o, i) => (
            <View key={`o${i}`} style={{ flexDirection: "row", alignItems: "center", gap: t.spacing[3] }}>
              <Text variant="small" style={{ flex: 1 }}>
                {offerLine(o)}
              </Text>
              <Pressable onPress={() => setOffers((l) => l.filter((_, j) => j !== i))} accessibilityLabel={`Remove ${o.rawText}`} hitSlop={8}>
                <Text tone="link">Remove</Text>
              </Pressable>
            </View>
          ))}
          {emis.map((e, i) => (
            <View key={`e${i}`} style={{ flexDirection: "row", alignItems: "center", gap: t.spacing[3] }}>
              <Text variant="small" style={{ flex: 1 }}>
                {emiLine(e)}
              </Text>
              <Pressable onPress={() => setEmis((l) => l.filter((_, j) => j !== i))} accessibilityLabel="Remove EMI option" hitSlop={8}>
                <Text tone="link">Remove</Text>
              </Pressable>
            </View>
          ))}
          {adding === "offer" ? (
            <OfferEditor
              onAdd={(o) => {
                setOffers((l) => [...l, o].slice(0, 5));
                setAdding(null);
              }}
              onCancel={() => setAdding(null)}
            />
          ) : adding === "emi" ? (
            <EmiEditor
              onAdd={(e) => {
                setEmis((l) => [...l, e].slice(0, 5));
                setAdding(null);
              }}
              onCancel={() => setAdding(null)}
            />
          ) : (
            <View style={{ flexDirection: "row", gap: t.spacing[3] }}>
              <Button kind="secondary" label="Add an offer" onPress={() => setAdding("offer")} disabled={offers.length >= 5} style={{ flex: 1 }} />
              <Button kind="secondary" label="Add an EMI option" onPress={() => setAdding("emi")} disabled={emis.length >= 5} style={{ flex: 1 }} />
            </View>
          )}
        </View>
      ) : null}

      <Button label={confirming ? "These are right, plan it" : "Continue"} onPress={submit} disabled={!ready || adding !== null} />
      {!ready ? (
        <Text variant="caption" tone="muted">
          Add the item and its price to continue.
        </Text>
      ) : null}
    </View>
  );
}
