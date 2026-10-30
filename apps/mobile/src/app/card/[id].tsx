import { Linking, Pressable, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { formatInr } from "@perq/finance-engine";
import { CATEGORY_LABELS } from "@perq/shared";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { Loading } from "@/components/StateViews";
import { Text } from "@/components/Text";
import { useResults } from "@/lib/queries";
import { useTheme } from "@/theme/ThemeProvider";

// "See the math" (handoff §1.6 screen 5): every number behind a card's ₹/yr.
export default function CardMath() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const results = useResults();
  const data = results.data;
  const card = data?.result.ranked.find((c) => c.cardId === id);
  if (!data) return <Loading />;
  if (!card) {
    const why = data.result.ineligible.find((c) => c.cardId === id);
    return (
      <Screen edges={["bottom"]}>
        <Stack.Screen options={{ title: why?.name ?? "Card" }} />
        <Text variant="heading">{why?.name ?? "This card"} isn't in your ranking</Text>
        <Text tone="muted">{why?.reason ?? "It isn't one of the cards PERQ has verified."}</Text>
      </Screen>
    );
  }

  const lines = card.breakdown.filter((b) => b.monthlySpend > 0 || b.annualReward > 0);
  const cell = { flex: 1 } as const;
  const num = { textAlign: "right" as const };
  const a = data.result.assumptions;

  return (
    <Screen edges={["bottom"]}>
      <Stack.Screen options={{ title: card.name }} />
      <View style={{ gap: t.spacing[1] }}>
        <Text variant="caption" tone="muted">
          {card.issuer} · {card.networks.join(", ")}
        </Text>
        <Text variant="title">{formatInr(card.ongoingValue)} a year</Text>
        <Text tone="muted">
          Year 1: {formatInr(card.year1Value)} (joining fee {formatInr(card.fee.joiningFee)}
          {card.welcomeBenefit ? `, welcome benefit ${formatInr(card.welcomeBenefit)}` : ""})
        </Text>
      </View>

      <Card>
        <Text variant="heading">Rewards from your spending</Text>
        <View style={{ flexDirection: "row" }}>
          {["Category", "You spend /mo", "Rate", "₹ / year"].map((h, i) => (
            <Text key={h} variant="caption" tone="muted" style={[cell, i ? num : null, i === 0 ? { flex: 1.4 } : null]}>
              {h}
            </Text>
          ))}
        </View>
        {lines.length === 0 ? <Text tone="muted">No rewards on your current spending.</Text> : null}
        {lines.map((b) => (
          <View key={b.category} style={{ gap: 2 }}>
            <View style={{ flexDirection: "row" }}>
              <Text variant="small" style={[cell, { flex: 1.4 }]}>
                {b.label}
              </Text>
              <Text variant="small" style={[cell, num]}>
                {formatInr(b.monthlySpend)}
              </Text>
              <Text variant="small" style={[cell, num]}>
                {b.ratePct}%
              </Text>
              <Text variant="bodyStrong" style={[cell, num]}>
                {formatInr(b.annualReward)}
              </Text>
            </View>
            {b.capApplied ? (
              <Text variant="caption" tone="muted">
                Capped{b.monthlyCap !== null ? ` at ${formatInr(b.monthlyCap)} a month` : " by a shared monthly limit"}
              </Text>
            ) : null}
          </View>
        ))}
        {card.milestoneValue ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text variant="small">Milestone benefits</Text>
            <Text variant="bodyStrong">{formatInr(card.milestoneValue)}</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: t.colors.border, paddingTop: t.spacing[2] }}>
          <Text variant="bodyStrong">Total rewards</Text>
          <Text variant="bodyStrong">{formatInr(card.rewards)}</Text>
        </View>
      </Card>

      <Card>
        <Text variant="heading">Fee</Text>
        {card.flags.lifetimeFree ? (
          <Text>No joining or annual fee, ever.</Text>
        ) : (
          <>
            <Text>
              Renewal fee {formatInr(card.fee.annualFee)} a year (incl. 18% GST).
              {card.fee.waiverSpend !== null
                ? ` Waived if you spend ${formatInr(card.fee.waiverSpend)} in a year; your answers add up to ${formatInr(card.fee.qualifyingSpend)}, so it's ${card.fee.waived ? "waived" : "not waived"}.`
                : " No spend-based waiver."}
            </Text>
            <Text tone="muted">You pay {formatInr(card.fee.payable)} a year from year 2.</Text>
          </>
        )}
        <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: t.colors.border, paddingTop: t.spacing[2] }}>
          <Text variant="bodyStrong">Ongoing value</Text>
          <Text variant="bodyStrong">
            {formatInr(card.rewards)} − {formatInr(card.fee.payable)} = {formatInr(card.ongoingValue)}
          </Text>
        </View>
      </Card>

      <Card>
        <Text variant="heading">Eligibility</Text>
        <Text>{card.eligibilityReason}</Text>
        {card.fdMinAmount ? <Text tone="muted">Fixed deposit from {formatInr(card.fdMinAmount)}.</Text> : null}
      </Card>

      <Card>
        <Text variant="heading">Card terms</Text>
        <Text variant="small">{card.rewardNotes}</Text>
        <Pressable onPress={() => Linking.openURL(card.sourceUrl)} accessibilityRole="link">
          <Text variant="small" tone="link">
            Bank's page · terms checked on {card.sourceUpdatedAt}
          </Text>
        </Pressable>
      </Card>

      <Text variant="caption" tone="muted">
        What PERQ assumed from your answers:{" "}
        {Object.entries(a.monthlySpend)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${CATEGORY_LABELS[k as keyof typeof CATEGORY_LABELS]} ${formatInr(v)}/mo`)
          .join(", ")}
        . Travel: {a.travelTripsPerYear} trips × {formatInr(a.avgTripSpend)}. Fees include {a.gstRatePct}% GST.
      </Text>
    </Screen>
  );
}
