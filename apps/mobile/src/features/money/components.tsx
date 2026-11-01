import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { formatInr } from "@perq/finance-engine";
import { TXN_CATEGORY_LABELS, type CardStateView, type TxnCategory } from "@perq/shared";
import { Text } from "@/components/Text";
import { useTheme } from "@/theme/ThemeProvider";

// Money Manager building blocks (handoff §10). Every ₹ figure comes from
// the API's financial state and, where it has one, taps through to its source.

export const categoryLabel = (c: string) => TXN_CATEGORY_LABELS[c as TxnCategory] ?? c;

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function monthName(key: string): string {
  return new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", timeZone: "UTC" });
}

/** A ₹ amount that opens where it came from. */
export function Amount({ value, href, variant = "bodyStrong", tone }: { value: number; href?: string; variant?: "display" | "heading" | "bodyStrong" | "body" | "small"; tone?: "ember" | "muted" | "danger" | "default" }) {
  // Tappable amounts use the link colour (an underline read like a strikethrough).
  const text = (
    <Text variant={variant} tone={href && !tone ? "link" : tone}>
      {formatInr(value)}
    </Text>
  );
  if (!href) return text;
  return (
    <Pressable onPress={() => router.push(href as never)} accessibilityRole="link" accessibilityHint="Shows where this number comes from" hitSlop={6}>
      {text}
    </Pressable>
  );
}

export function UtilisationBar({ pct }: { pct: number | null }) {
  const t = useTheme();
  if (pct === null) return null;
  const color = pct >= 70 ? t.colors.danger : pct >= 30 ? t.colors.warning : t.colors.success;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: t.colors.surface2, overflow: "hidden" }}>
        <View style={{ width: `${Math.min(100, pct)}%`, height: 8, backgroundColor: color }} />
        <View style={{ position: "absolute", left: "30%", top: 0, bottom: 0, width: 2, backgroundColor: t.colors.textMuted }} />
      </View>
      <Text variant="caption" tone="muted">
        {pct}% of limit used{pct >= 30 ? " · under 30% is healthiest" : ""}
      </Text>
    </View>
  );
}

/** Horizontal bars by category, with the budget limit as a marker when set. */
export function CategoryBars({ spend, limits }: { spend: Record<string, number>; limits?: Record<string, number> }) {
  const t = useTheme();
  const rows = Object.entries(spend)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const max = Math.max(...rows.map(([c, v]) => Math.max(v, limits?.[c] ?? 0)), 1);
  if (!rows.length) return <Text tone="muted">No spending recorded this month yet.</Text>;
  return (
    <View style={{ gap: t.spacing[3] }}>
      {rows.map(([c, v]) => {
        const limit = limits?.[c];
        const over = limit !== undefined && v > limit;
        return (
          <Pressable key={c} onPress={() => router.push(`/transactions?category=${c}` as never)} accessibilityRole="button" accessibilityLabel={`${categoryLabel(c)} ${formatInr(v)}`}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text variant="small">{categoryLabel(c)}</Text>
              <Text variant="small" tone={over ? "danger" : "default"}>
                {formatInr(v)}
                {limit !== undefined ? <Text variant="small" tone="muted"> / {formatInr(limit)}</Text> : null}
              </Text>
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: t.colors.surface2, marginTop: 4 }}>
              <View style={{ width: `${(v / max) * 100}%`, height: 8, borderRadius: 4, backgroundColor: over ? t.colors.danger : t.colors.primary }} />
              {limit !== undefined ? (
                <View style={{ position: "absolute", left: `${(limit / max) * 100}%`, top: -2, bottom: -2, width: 2, backgroundColor: t.colors.text }} />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function dueLine(c: CardStateView): string {
  const s = c.latestStatement;
  if (!s?.dueDate) return "No due date on the last statement";
  if (c.isPaidMarked) return `Marked paid · was due ${shortDate(s.dueDate)}`;
  if (c.daysToDue === null) return `Due ${shortDate(s.dueDate)}`;
  if (c.daysToDue < 0) return `Was due ${shortDate(s.dueDate)}`;
  if (c.daysToDue === 0) return "Due today";
  return `Due ${shortDate(s.dueDate)} · ${c.daysToDue} day${c.daysToDue === 1 ? "" : "s"} left`;
}
