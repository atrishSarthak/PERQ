import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { formatInr } from "@perq/finance-engine";
import { Button } from "@/components/Button";
import { SurfaceFill } from "@/components/Card";
import { Text } from "@/components/Text";
import { useCartAction, useSwiggyCart, useSwiggyStatus } from "@/lib/swiggyApi";
import { useTheme } from "@/theme/ThemeProvider";

const SHOWN = 5;

/**
 * An Instamart cart Ember prepared (Step 4). Nothing is ordered until the
 * user taps Confirm; Edit hands the conversation back to them.
 */
export function SwiggyCartCard({ cartId, onEdit, onReady }: { cartId: string; onEdit?: () => void; onReady?: () => void }) {
  const t = useTheme();
  const cart = useSwiggyCart(cartId);
  const swiggy = useSwiggyStatus();
  const action = useCartAction(cartId);
  const [all, setAll] = useState(false);
  const c = cart.data;
  // The card arrives after its message, and changes size on Confirm or Cancel:
  // keep the thread scrolled to it.
  const status = c?.status;
  useEffect(() => {
    if (status) onReady?.();
  }, [status, onReady]);
  if (!c) return null;
  const demo = swiggy.data?.mode !== "live";
  const lines = all ? c.lines : c.lines.slice(0, SHOWN);
  const row = (label: string, value: string, strong = false) => (
    <View key={label} style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text variant={strong ? "bodyStrong" : "small"} tone={strong ? "default" : "muted"}>
        {label}
      </Text>
      <Text variant={strong ? "bodyStrong" : "small"} tone={strong ? "default" : "muted"}>
        {value}
      </Text>
    </View>
  );

  return (
    <View style={{ padding: t.spacing[4], borderRadius: t.radii.md, borderWidth: 1, borderColor: t.colors.border, overflow: "hidden", gap: t.spacing[3] }}>
      <SurfaceFill />
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text variant="caption" tone="ember" style={{ letterSpacing: 0.8 }}>
          INSTAMART CART{demo ? " · DEMO" : ""}
        </Text>
        <Text variant="caption" tone="muted">
          Budget {formatInr(c.budget)}
        </Text>
      </View>

      <View style={{ gap: 6 }}>
        {lines.map((l) => (
          <View key={l.productId} style={{ flexDirection: "row", gap: t.spacing[2] }}>
            <Text variant="small" style={{ flex: 1 }} numberOfLines={1}>
              {l.qty} × {l.name} <Text variant="small" tone="muted">{l.unit}</Text>
            </Text>
            <Text variant="small">{formatInr(l.price * l.qty)}</Text>
          </View>
        ))}
        {c.lines.length > SHOWN ? (
          <Pressable onPress={() => setAll((v) => !v)} accessibilityRole="button" hitSlop={6}>
            <Text variant="small" tone="link">
              {all ? "Show fewer" : `Show all ${c.lines.length} items`}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={{ gap: 4, borderTopWidth: 1, borderTopColor: t.colors.border, paddingTop: t.spacing[3] }}>
        {row("Items", formatInr(c.itemTotal))}
        {c.fees.map((f) => row(f.label, formatInr(f.amount)))}
        {row("Total", formatInr(c.total), true)}
        <Text variant="small" tone={c.withinBudget ? "success" : "danger"}>
          {c.withinBudget ? `Within your ${formatInr(c.budget)} budget · ${formatInr(c.budget - c.total)} to spare` : `Over your ${formatInr(c.budget)} budget`}
        </Text>
        {c.skipped.length ? (
          <Text variant="caption" tone="muted">
            Left out: {c.skipped.map((s) => `${s.query} (${s.reason === "over_budget" ? "over budget" : "not found"})`).join(", ")}
          </Text>
        ) : null}
      </View>

      {c.status === "placed" ? (
        <Text variant="bodyStrong" tone="success" accessibilityLiveRegion="polite">
          ✓ Order placed{demo ? " (demo)" : ""} · {c.orderId}
        </Text>
      ) : c.status === "cancelled" ? (
        <Text variant="small" tone="muted">
          Cancelled. Nothing was ordered.
        </Text>
      ) : (
        <>
          <Button label={`Confirm · ${formatInr(c.total)}`} loading={action.isPending && action.variables === "checkout"} disabled={action.isPending} onPress={() => action.mutate("checkout")} accessibilityHint={demo ? "Places a demo order; nothing is really bought" : "Places this order on Swiggy Instamart"} />
          <View style={{ flexDirection: "row", gap: t.spacing[2] }}>
            <Button kind="secondary" label="Edit" style={{ flex: 1 }} disabled={action.isPending} onPress={onEdit} />
            <Button kind="ghost" label="Cancel" style={{ flex: 1 }} disabled={action.isPending} onPress={() => action.mutate("cancel")} />
          </View>
          <Text variant="caption" tone="muted">
            Nothing is ordered until you tap Confirm.
          </Text>
        </>
      )}
      {action.error ? (
        <Text variant="small" tone="danger">
          {action.error.message}
        </Text>
      ) : null}
    </View>
  );
}
