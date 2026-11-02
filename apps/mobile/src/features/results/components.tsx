import { Modal, Pressable, ScrollView, Switch, View } from "react-native";
import { router } from "expo-router";
import { formatInr } from "@perq/finance-engine";
import type { LeakageResult, ScoredCardV2 } from "@perq/shared";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { CARD_INK_MUTED, CreditCardFace } from "@/components/CreditCardFace";
import { Pill } from "@/components/Choice";
import { EmberAvatar } from "@/components/EmberAvatar";
import { Notice } from "@/components/Notice";
import { Text } from "@/components/Text";
import { useTheme } from "@/theme/ThemeProvider";
import { type FeeRange, type Filters, EMPTY_FILTERS } from "./filterSort";

const openMath = (cardId: string) => router.push({ pathname: "/card/[id]", params: { id: cardId } });

export function LeakageBanner({ leakage }: { leakage: LeakageResult }) {
  const leaking = leakage.hasCards && !leakage.holdsBest && leakage.amount > 0;
  const best = leakage.bestCardId;
  return (
    <Notice
      tone={leaking ? "danger" : "success"}
      title={leakage.message}
      onPress={best ? () => openMath(best) : undefined}
      accessibilityHint={best ? "Opens the math for the best card" : undefined}
    />
  );
}

function Flags({ card }: { card: ScoredCardV2 }) {
  const t = useTheme();
  const flags = [
    card.flags.held && "You have this",
    card.flags.upi && "Works on UPI",
    card.flags.lifetimeFree && "Lifetime free",
    card.flags.fdBacked && "FD-backed",
  ].filter(Boolean) as string[];
  if (!flags.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing[2] }}>
      {flags.map((f) => (
        <View key={f} style={{ paddingHorizontal: t.spacing[2], paddingVertical: 2, borderRadius: t.radii.sm, borderWidth: 1, borderColor: t.colors.border }}>
          <Text variant="caption" tone="muted">
            {f}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** The Top Pick: an Ember recommendation shown as the card itself, with the
 * value and Ember's reason under it (deliberately plain, not an ad). */
export function TopPickCard({
  card,
  explanation,
  working,
  onToggleHeld,
}: {
  card: ScoredCardV2;
  explanation: string | null;
  working?: string | null;
  onToggleHeld: (held: boolean) => void;
}) {
  const t = useTheme();
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing[2] }}>
        <EmberAvatar size={24} />
        <Text variant="caption" tone="ember" style={{ letterSpacing: 0.8 }}>
          EMBER'S PICK FOR YOU
        </Text>
      </View>
      <Pressable onPress={() => openMath(card.cardId)} accessibilityRole="button" accessibilityLabel={`${card.name} by ${card.issuer}. See the math`}>
        <CreditCardFace
          issuer={card.issuer}
          name={card.name}
          networks={card.networks}
          footer={
            <Text variant="caption" style={{ color: CARD_INK_MUTED }}>
              {card.flags.lifetimeFree ? "Lifetime free" : card.fee.waived ? "Fee waived for you" : `Fee ${formatInr(card.fee.payable)} a year`}
            </Text>
          }
        />
      </Pressable>
      <Pressable onPress={() => openMath(card.cardId)} accessibilityRole="button" accessibilityLabel={`${formatInr(card.ongoingValue)} a year. See the math`}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
          <Text variant="display" tone="ember">
            {formatInr(card.ongoingValue)}
            <Text variant="body" tone="muted">
              {" "}
              / yr
            </Text>
          </Text>
          <Text variant="small" tone="muted" style={{ marginBottom: 6 }}>
            Year 1: {formatInr(card.year1Value)}
          </Text>
        </View>
      </Pressable>
      <View style={{ flexDirection: "row", gap: t.spacing[3], alignItems: "flex-start" }}>
        <EmberAvatar size={28} />
        <View style={{ flex: 1, gap: t.spacing[1] }}>
          <Text>{explanation ?? card.reason}</Text>
          {!explanation && working ? (
            <Text variant="small" tone="ember" accessibilityLiveRegion="polite">
              Ember: {working}…
            </Text>
          ) : null}
        </View>
      </View>
      <Flags card={card} />
      <Button kind="secondary" label="See the math" onPress={() => openMath(card.cardId)} />
      <HeldSwitch card={card} onToggleHeld={onToggleHeld} />
    </Card>
  );
}

export function CardRow({ card, onToggleHeld }: { card: ScoredCardV2; onToggleHeld: (held: boolean) => void }) {
  const t = useTheme();
  const fee = card.flags.lifetimeFree ? "No fee" : card.fee.waived ? `Fee ${formatInr(card.fee.annualFee)}, waived for you` : `Fee ${formatInr(card.fee.payable)}/yr`;
  return (
    <Card>
      <Pressable onPress={() => openMath(card.cardId)} accessibilityRole="button" accessibilityHint="Opens the full breakdown" style={{ gap: t.spacing[2] }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: t.spacing[3] }}>
          <View style={{ flex: 1 }}>
            <Text variant="caption" tone="muted">
              #{card.rank} · {card.issuer}
            </Text>
            <Text variant="bodyStrong">{card.name}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text variant="heading" tone={card.ongoingValue >= 0 ? "default" : "danger"}>
              {formatInr(card.ongoingValue)}
            </Text>
            <Text variant="caption" tone="muted">
              per year
            </Text>
          </View>
        </View>
        <Text variant="small" tone="muted">
          {card.reason}
        </Text>
        <Text variant="small">{fee}</Text>
        <Flags card={card} />
      </Pressable>
      <HeldSwitch card={card} onToggleHeld={onToggleHeld} />
    </Card>
  );
}

function HeldSwitch({ card, onToggleHeld }: { card: ScoredCardV2; onToggleHeld: (held: boolean) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: t.colors.border, paddingTop: t.spacing[3] }}>
      <Text variant="small">I have this card</Text>
      <Switch
        accessibilityLabel={`I have the ${card.name}`}
        value={card.flags.held}
        onValueChange={onToggleHeld}
        trackColor={{ true: t.colors.primary, false: t.colors.surface2 }}
      />
    </View>
  );
}

const FEE_RANGES: { value: FeeRange; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "free", label: "₹0" },
  { value: "upto_1000", label: "≤ ₹1,000" },
  { value: "upto_5000", label: "≤ ₹5,000" },
];

export function FiltersSheet({
  visible,
  filters,
  issuers,
  onChange,
  onClose,
}: {
  visible: boolean;
  filters: Filters;
  issuers: string[];
  onChange: (f: Filters) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const row = { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: t.spacing[2] };
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ backgroundColor: t.colors.bg }} contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[5] }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text variant="title">Filters</Text>
          <Pressable onPress={() => onChange(EMPTY_FILTERS)} hitSlop={10}>
            <Text tone="link">Reset</Text>
          </Pressable>
        </View>
        <View style={{ gap: t.spacing[2] }}>
          <Text variant="bodyStrong">Network</Text>
          <View style={row}>
            {["RuPay", "Visa", "Mastercard", "Amex"].map((n) => (
              <Pill key={n} label={n} selected={filters.networks.includes(n)} onPress={() => onChange({ ...filters, networks: toggle(filters.networks, n) })} />
            ))}
          </View>
        </View>
        <View style={{ gap: t.spacing[2] }}>
          <Text variant="bodyStrong">Yearly fee (incl. GST)</Text>
          <View style={row}>
            {FEE_RANGES.map((r) => (
              <Pill key={r.value} label={r.label} selected={filters.feeRange === r.value} onPress={() => onChange({ ...filters, feeRange: r.value })} />
            ))}
          </View>
        </View>
        <View style={{ gap: t.spacing[3] }}>
          {[
            { key: "lifetimeFreeOnly" as const, label: "Lifetime free only" },
            { key: "upiOnly" as const, label: "Works on UPI (RuPay)" },
          ].map((o) => (
            <View key={o.key} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text>{o.label}</Text>
              <Switch value={filters[o.key]} onValueChange={(v) => onChange({ ...filters, [o.key]: v })} trackColor={{ true: t.colors.primary, false: t.colors.surface2 }} />
            </View>
          ))}
        </View>
        <View style={{ gap: t.spacing[2] }}>
          <Text variant="bodyStrong">Issuer</Text>
          <View style={row}>
            {issuers.map((i) => (
              <Pill key={i} label={i} selected={filters.issuers.includes(i)} onPress={() => onChange({ ...filters, issuers: toggle(filters.issuers, i) })} />
            ))}
          </View>
        </View>
        <Button label="Show cards" onPress={onClose} />
      </ScrollView>
    </Modal>
  );
}
