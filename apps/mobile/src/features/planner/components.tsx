import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { formatDay, formatInr } from "@perq/finance-engine";
import { MISSING_DATA_FIX, type OptionResult, type PlanResult, type Verdict } from "@perq/shared";
import { Card } from "@/components/Card";
import { Text } from "@/components/Text";
import { useTheme } from "@/theme/ThemeProvider";

// Result building blocks (Step 3 §10.5). Every ₹ figure comes from the
// engine's PlanResult.

export const VERDICT_TONE: Record<Verdict, "success" | "ember" | "danger" | "default"> = {
  go: "success",
  go_with_timing: "success",
  wait: "ember",
  rethink_payment: "ember",
};

export function VerdictChip({ result }: { result: PlanResult }) {
  const t = useTheme();
  const color = { success: t.colors.success, ember: t.colors.ember, danger: t.colors.danger, default: t.colors.text }[VERDICT_TONE[result.verdict]];
  return (
    <View style={{ alignSelf: "flex-start", borderRadius: 999, borderWidth: 1, borderColor: color, paddingHorizontal: t.spacing[3], paddingVertical: 4 }} accessibilityRole="text" accessibilityLabel={`Verdict: ${result.headline}`}>
      <Text variant="bodyStrong" style={{ color }}>
        {result.headline}
      </Text>
    </View>
  );
}

export function optionWhen(o: OptionResult, today: string): string {
  if (o.kind === "upi") return "Pay now";
  if (o.kind === "card_emi") return o.emi ? `${formatInr(o.emi.monthlyInstalment)} a month for ${o.emi.tenureMonths} months` : "EMI";
  const day = o.purchaseDate === today ? "Buy today" : `Buy on ${formatDay(o.purchaseDate)}`;
  return o.interestFreeDays !== null ? `${day} · ${o.interestFreeDays} interest-free days` : day;
}

export function RecommendedCard({ result }: { result: PlanResult }) {
  const t = useTheme();
  const o = result.recommended;
  return (
    <Card style={{ borderColor: t.colors.ember, borderWidth: 1 }}>
      <Text variant="caption" tone="ember">
        RECOMMENDED
      </Text>
      <Text variant="heading">{o.label}</Text>
      <Text tone="muted" variant="small">
        {optionWhen(o, result.asOf)}
      </Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
        <View>
          <Text variant="caption" tone="muted">
            NET COST
          </Text>
          <Text variant="display">{formatInr(o.netCost)}</Text>
        </View>
        {o.savingVsUpi > 0 ? (
          <Text tone="success" variant="bodyStrong">
            {formatInr(o.savingVsUpi)} less than UPI
          </Text>
        ) : null}
      </View>
      <Text variant="caption" tone="muted">
        {formatInr(o.stickerPrice)} price{o.offerDiscount ? ` − ${formatInr(o.offerDiscount)} offers` : ""}
        {o.rewards ? ` − ${formatInr(o.rewards)} rewards` : ""}
        {o.extraCosts ? ` + ${formatInr(o.extraCosts)} EMI costs` : ""}
      </Text>
    </Card>
  );
}

export function MissingData({ result }: { result: PlanResult }) {
  const t = useTheme();
  if (!result.missingData.length) return null;
  const seen = new Set<string>();
  return (
    <Card>
      <Text variant="heading">What Ember couldn't check</Text>
      {result.missingData.map((m, i) => {
        const fix = MISSING_DATA_FIX[m.code];
        const showFix = !seen.has(fix.href);
        seen.add(fix.href);
        return (
          <View key={`${m.code}-${i}`} style={{ gap: 2 }}>
            <Text variant="small">{m.text}</Text>
            {showFix ? (
              <Pressable onPress={() => router.push(fix.href as never)} accessibilityRole="link" hitSlop={6}>
                <Text variant="small" tone="link">
                  {fix.label} ›
                </Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
      <View style={{ height: t.spacing[1] }} />
    </Card>
  );
}

/**
 * A ₹ figure you can tap to see where it comes from (§10): a screen that
 * holds the source (budget, card account), or the sum behind it inline.
 */
export function Figure({
  value,
  how,
  href,
  variant = "bodyStrong",
  tone,
}: {
  value: number;
  how?: string;
  href?: string;
  variant?: "display" | "heading" | "bodyStrong" | "body" | "small";
  tone?: "ember" | "muted" | "danger" | "success" | "default";
}) {
  const [open, setOpen] = useState(false);
  const text = (
    <Text variant={variant} tone={tone ?? (href || how ? "link" : "default")}>
      {formatInr(value)}
    </Text>
  );
  if (!href && !how) return text;
  return (
    <Pressable
      onPress={() => (href ? router.push(href as never) : setOpen((o) => !o))}
      accessibilityRole={href ? "link" : "button"}
      accessibilityHint="Shows where this number comes from"
      hitSlop={6}
    >
      {text}
      {open && how ? (
        <Text variant="caption" tone="muted">
          {how}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** The sum behind an option's net cost. */
export function netCostHow(o: OptionResult): string {
  let s = `${formatInr(o.stickerPrice)} price`;
  if (o.offerDiscount) s += ` − ${formatInr(o.offerDiscount)} offers`;
  if (o.rewards) s += ` − ${formatInr(o.rewards)} rewards`;
  if (o.extraCosts) s += ` + ${formatInr(o.extraCosts)} EMI costs`;
  return `${s} = ${formatInr(o.netCost)}`;
}

/** A result section that opens and closes (§10.5). */
export function Section({ title, summary, defaultOpen = false, children }: { title: string; summary?: string; defaultOpen?: boolean; children: ReactNode }) {
  const t = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={summary ? `${title}, ${summary}` : title}
        style={{ flexDirection: "row", alignItems: "center", gap: t.spacing[3] }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading">{title}</Text>
          {summary && !open ? (
            <Text variant="small" tone="muted" numberOfLines={1}>
              {summary}
            </Text>
          ) : null}
        </View>
        <Text tone="muted">{open ? "▴" : "▾"}</Text>
      </Pressable>
      {open ? <View style={{ gap: t.spacing[3] }}>{children}</View> : null}
    </Card>
  );
}
