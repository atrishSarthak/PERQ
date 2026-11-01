import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { formatInr } from "@perq/finance-engine";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Choice";
import { Screen } from "@/components/Screen";
import { ErrorState, Loading } from "@/components/StateViews";
import { Text } from "@/components/Text";
import { TextField } from "@/components/TextField";
import { categoryLabel, dueLine, shortDate, UtilisationBar } from "@/features/money/components";
import { TransactionList } from "@/features/money/TransactionList";
import { moneyApi } from "@/lib/moneyApi";
import { useCardAccount, useInvalidateMoney, useMarkPaid } from "@/lib/moneyQueries";
import { useCatalogue } from "@/lib/queries";
import { useTheme } from "@/theme/ThemeProvider";

// Card detail (handoff §10.4).
export default function CardDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useCardAccount(id!);
  const catalogue = useCatalogue();
  const invalidate = useInvalidateMoney();
  const markPaid = useMarkPaid();
  const [balance, setBalance] = useState("");
  const [picking, setPicking] = useState(false);

  if (detail.isLoading) return <Loading />;
  if (detail.error) return <ErrorState message={detail.error.message} onRetry={() => detail.refetch()} />;
  const { account, card: c, missedRewards, statements } = detail.data!;
  const s = c?.latestStatement;
  const sameIssuer = (catalogue.data?.cards ?? []).filter((x) => x.issuer.split(" ")[0]!.toLowerCase() === account.issuer.split(" ")[0]!.toLowerCase());

  const saveBalance = async () => {
    const n = Number(balance.replace(/[^\d]/g, ""));
    if (!balance.trim() || !Number.isFinite(n)) return;
    await moneyApi.patchCardAccount(account.id, { currentBalance: n });
    setBalance("");
    await invalidate();
  };

  return (
    <Screen edges={["bottom"]}>
      <Stack.Screen options={{ title: account.cardLabel }} />
      <Text variant="caption" tone="muted">
        {account.issuer} •••• {account.last4}
        {account.catalogueCardName ? ` · ${account.catalogueCardName}` : ""}
      </Text>

      {s ? (
        <Card>
          <Text variant="heading">Statement {shortDate(s.date)}</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View>
              <Text variant="caption" tone="muted">
                TOTAL DUE
              </Text>
              <Text variant="heading">{s.totalDue !== null ? formatInr(s.totalDue) : "—"}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text variant="caption" tone="muted">
                MINIMUM DUE
              </Text>
              <Text variant="heading">{s.minimumDue !== null ? formatInr(s.minimumDue) : "—"}</Text>
            </View>
          </View>
          <Text variant="small" tone="muted">
            {dueLine(c!)}
          </Text>
          {!s.reconciled ? (
            <Text variant="small" tone="danger">
              The totals on this statement didn't add up when it was read, so Ember is careful with it.
            </Text>
          ) : null}
          <Button
            label={c!.isPaidMarked ? "Marked as paid" : "Mark as paid"}
            kind="secondary"
            disabled={c!.isPaidMarked || markPaid.isPending}
            onPress={() => markPaid.mutate(account.id)}
          />
        </Card>
      ) : null}

      <Card>
        <Text variant="heading">Utilisation</Text>
        {c?.utilisationPct !== null && c?.utilisationPct !== undefined ? (
          <>
            <UtilisationBar pct={c.utilisationPct} />
            <Text variant="small" tone="muted">
              {formatInr(c.balanceForUtilisation ?? 0)} of {formatInr(c.creditLimit ?? 0)}
              {c.balanceSource === "override" ? ` · balance you entered ${shortDate(account.currentBalanceUpdatedAt?.slice(0, 10))}` : " · from the statement"}
            </Text>
          </>
        ) : (
          <Text tone="muted">Add the card's limit and balance to see utilisation.</Text>
        )}
        <TextField label="Update current balance (₹)" value={balance} onChangeText={setBalance} keyboardType="number-pad" placeholder="e.g. 12500" onSubmitEditing={saveBalance} />
        {balance.trim() ? <Button label="Save balance" onPress={saveBalance} /> : null}
      </Card>

      {c?.points ? (
        <Card>
          <Text variant="heading">Points</Text>
          <Text variant="bodyStrong">
            {c.points.closing.toLocaleString("en-IN")} points{c.points.valueRupees !== null ? ` · about ${formatInr(c.points.valueRupees)}` : ""}
          </Text>
          {c.points.expiring ? (
            <Text variant="small" tone="muted">
              {c.points.expiring.toLocaleString("en-IN")} expire{c.points.expiryDate ? ` on ${shortDate(c.points.expiryDate)}` : ""}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {c?.feeWaiver ? (
        <Card>
          <Text variant="heading">Annual fee waiver</Text>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: t.colors.surface2 }}>
            <View
              style={{
                width: `${Math.min(100, (c.feeWaiver.spentThisCardYear / c.feeWaiver.threshold) * 100)}%`,
                height: 8,
                borderRadius: 4,
                backgroundColor: c.feeWaiver.onPace ? t.colors.success : t.colors.warning,
              }}
            />
          </View>
          <Text variant="small" tone="muted">
            {formatInr(c.feeWaiver.spentThisCardYear)} of {formatInr(c.feeWaiver.threshold)} spent.{" "}
            {c.feeWaiver.remaining > 0
              ? `${formatInr(c.feeWaiver.remaining)} more in ${c.feeWaiver.monthsLeft} month${c.feeWaiver.monthsLeft === 1 ? "" : "s"} waives the ${formatInr(c.feeWaiver.annualFee)} fee.`
              : `The ${formatInr(c.feeWaiver.annualFee)} fee is waived this year.`}
          </Text>
        </Card>
      ) : null}

      {c && c.feesLastCycle.total > 0 ? (
        <Card>
          <Text variant="heading">Fees last cycle: {formatInr(c.feesLastCycle.total)}</Text>
          {c.feesLastCycle.lines.map((l, i) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", gap: t.spacing[3] }}>
              <Text variant="small" tone="muted" style={{ flex: 1 }}>
                {l.description}
              </Text>
              <Text variant="small">{formatInr(l.amount)}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {missedRewards.length ? (
        <Card>
          <Text variant="heading">Best card in hindsight</Text>
          <Text variant="small" tone="muted">
            About {formatInr(missedRewards.reduce((a, m) => a + m.extra, 0))} more was possible on your other cards last cycle.
          </Text>
          {missedRewards.slice(0, 5).map((m) => (
            <Text key={m.txnId} variant="small">
              {m.merchant} ({categoryLabel(m.category)}, {formatInr(m.amount)}): {m.betterCard} would have earned {formatInr(m.extra)} more
            </Text>
          ))}
        </Card>
      ) : null}

      <Card>
        <Text variant="heading">Which card is this?</Text>
        <Text variant="small" tone="muted">
          {account.catalogueCardName ? `Linked to ${account.catalogueCardName}, which is used for rewards and fee rules.` : "Link it to a card so Ember knows its reward and fee rules."}
        </Text>
        {picking ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing[2] }}>
            {sameIssuer.map((x) => (
              <Pill
                key={x.id}
                label={x.name}
                selected={account.catalogueCardId === x.id}
                onPress={async () => {
                  setPicking(false);
                  await moneyApi.patchCardAccount(account.id, { catalogueCardId: x.id });
                  await invalidate();
                }}
              />
            ))}
            {!sameIssuer.length ? <Text tone="muted">No {account.issuer} cards in the catalogue yet.</Text> : null}
          </View>
        ) : (
          <Pressable onPress={() => setPicking(true)} accessibilityRole="button">
            <Text tone="link" variant="small">
              {account.catalogueCardName ? "Change" : "Choose the card"}
            </Text>
          </Pressable>
        )}
      </Card>

      <Button label="Ask Ember about this card" kind="secondary" onPress={() => router.push(`/chat/${encodeURIComponent(`card:${account.id}`)}`)} />

      <Card>
        <Text variant="heading">Transactions</Text>
        <TransactionList cardAccountId={account.id} />
      </Card>

      <Card>
        <Text variant="heading">Statements</Text>
        {statements.map((st) => (
          <View key={st.id} style={{ flexDirection: "row", alignItems: "center", gap: t.spacing[3] }}>
            <View style={{ flex: 1 }}>
              <Text variant="small">{shortDate(st.statementDate)}</Text>
              <Text variant="caption" tone="muted">
                {st.totalDue !== null ? formatInr(st.totalDue) : "—"} due{st.reconciled ? "" : " · totals didn't add up"}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete statement dated ${shortDate(st.statementDate)}`}
              onPress={() =>
                Alert.alert("Delete this statement?", "Its transactions are deleted too. This can't be undone.", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                      await moneyApi.deleteStatement(st.id);
                      await invalidate();
                    },
                  },
                ])
              }
            >
              <Text tone="danger" variant="small">
                Delete
              </Text>
            </Pressable>
          </View>
        ))}
        <Button label="Upload new statement" onPress={() => router.push("/upload")} />
      </Card>
    </Screen>
  );
}
