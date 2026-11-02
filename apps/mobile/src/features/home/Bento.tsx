import type { ReactNode } from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router, type Href } from "expo-router";
import { formatInr } from "@perq/finance-engine";
import { Card } from "@/components/Card";
import { EmberAvatar } from "@/components/EmberAvatar";
import { Text } from "@/components/Text";
import { useTheme } from "@/theme/ThemeProvider";

// Home's bento grid: one tile per feature, each with its headline number.
// Every figure comes straight from the financial state; tiles only lay it out.

/** ₹12.4k / ₹1.2L for chart labels, where a full figure doesn't fit. */
export function compactInr(v: number): string {
  if (Math.abs(v) >= 100_000) return `₹${(v / 100_000).toFixed(1).replace(/\.0$/, "")}L`;
  if (Math.abs(v) >= 1_000) return `₹${(v / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return formatInr(v);
}

export function Tile({ children, href, onPress, style, label }: { children: ReactNode; href?: Href; onPress?: () => void; style?: ViewStyle; label?: string }) {
  const t = useTheme();
  const card = <Card style={{ flex: 1, padding: t.spacing[4], gap: t.spacing[2], borderRadius: 22 }}>{children}</Card>;
  // Without an action it's a plain container, so it can hold its own buttons.
  if (!onPress && !href) return <View style={[{ flex: 1 }, style]}>{card}</View>;
  return (
    <Pressable
      onPress={onPress ?? (href ? () => router.push(href) : undefined)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.85 : 1 }, style]}
    >
      {card}
    </Pressable>
  );
}

export function Row({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <View style={{ flexDirection: "row", gap: t.spacing[3] }}>{children}</View>;
}

export function Caption({ children, tone = "muted", lines = 1 }: { children: ReactNode; tone?: "muted" | "ember" | "onEmber"; lines?: number }) {
  return (
    <Text variant="caption" tone={tone} style={{ letterSpacing: 0.8 }} numberOfLines={lines}>
      {children}
    </Text>
  );
}

export function Meter({ pct, color }: { pct: number; color: string }) {
  const t = useTheme();
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: t.colors.surface2, overflow: "hidden" }}>
      <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: 6, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

/** Vertical bars with the amount on top and a label under; the biggest bar is red. */
export function Bars({ items, height = 132 }: { items: { key: string; label: string; value: number; a11y?: string }[]; height?: number }) {
  const t = useTheme();
  const max = Math.max(...items.map((i) => i.value), 1);
  const top = items.reduce((best, i) => (i.value > best.value ? i : best), items[0]!);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: t.spacing[2], height: height + 44, marginTop: t.spacing[2] }}>
      {items.map((i) => {
        const hot = i.key === top.key && i.value > 0;
        return (
          <View key={i.key} style={{ flex: 1, alignItems: "center", gap: 6 }} accessible accessibilityLabel={i.a11y ?? `${i.label} ${formatInr(i.value)}`}>
            <Text variant="caption" tone={hot ? "default" : "muted"} numberOfLines={1} style={{ fontSize: 11 }}>
              {i.value > 0 ? compactInr(i.value) : ""}
            </Text>
            <LinearGradient
              colors={hot ? [t.colors.ember, "#5A0B0A"] : [t.colors.surface2, t.colors.surfaceDeep]}
              style={{ width: "100%", height: Math.max(6, (i.value / max) * height), borderRadius: 10, borderWidth: hot ? 0 : 1, borderColor: t.colors.border }}
            />
            <Text variant="caption" tone={hot ? "default" : "muted"} numberOfLines={1} style={{ fontSize: 11 }}>
              {i.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** The planner's way in: the one red tile on Home. */
export function CanIBuyTile({ openPlans, tall }: { openPlans: number; tall?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <LinearGradient
        colors={[t.colors.ember, "#4A0908"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={{ flex: 1, minHeight: tall ? 220 : 150, borderRadius: 22, padding: t.spacing[4], justifyContent: "space-between" }}
      >
        <Pressable onPress={() => router.push("/plan/new")} accessibilityRole="button" accessibilityHint="Ember checks your budget, cards and statement dates" style={{ gap: t.spacing[2] }}>
          <Caption tone="onEmber">PLANNER</Caption>
          <Text variant="heading" tone="onEmber">
            Can I buy it?
          </Text>
          <Text variant="small" tone="onEmber" style={{ opacity: 0.8 }}>
            Ember checks your budget, cards and statement dates.
          </Text>
        </Pressable>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Pressable onPress={() => router.push(openPlans ? "/plans" : "/plan/new")} accessibilityRole="button" hitSlop={8}>
            <Text variant="caption" tone="onEmber" style={{ opacity: 0.85 }}>
              {openPlans ? `${openPlans} open plan${openPlans === 1 ? "" : "s"} ›` : "Ask Ember"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/plan/new")}
            accessibilityRole="button"
            accessibilityLabel="Can I buy it?"
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}
          >
            <Text variant="bodyStrong" tone="onEmber">
              →
            </Text>
          </Pressable>
        </View>
      </LinearGradient>
    </View>
  );
}

export function NudgeStrip({ id, title, body }: { id: string; title: string; body: string }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => router.push(`/nudge/${id}`)} accessibilityRole="button" accessibilityHint="Opens a chat with Ember about this">
      <Card style={{ flexDirection: "row", alignItems: "center", gap: t.spacing[3], padding: t.spacing[4], borderRadius: 22, borderColor: t.colors.ember }}>
        <EmberAvatar size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <Caption tone="ember">EMBER NOTICED</Caption>
          <Text variant="bodyStrong" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="small" tone="muted" numberOfLines={3}>
            {body}
          </Text>
        </View>
        <Text tone="muted">›</Text>
      </Card>
    </Pressable>
  );
}
